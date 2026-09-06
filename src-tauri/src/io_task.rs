//! Bounded blocking I/O for commands invoked by the WebView.
use std::sync::{Arc, OnceLock};
use tokio::sync::Semaphore;

const MAX_IO_TASKS: usize = 4;
static IO_PERMITS: OnceLock<Arc<Semaphore>> = OnceLock::new();

pub(crate) async fn run<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let permit = IO_PERMITS
        .get_or_init(|| Arc::new(Semaphore::new(MAX_IO_TASKS)))
        .clone()
        .acquire_owned()
        .await
        .map_err(|error| format!("I/O worker is unavailable: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        operation()
    })
    .await
    .map_err(|error| format!("I/O worker failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn runs_work_off_the_calling_thread_and_returns_errors() {
        let calling_thread = std::thread::current().id();
        let worker_thread = run(|| Ok(std::thread::current().id())).await.unwrap();
        assert_ne!(calling_thread, worker_thread);
        assert_eq!(
            run::<(), _>(|| Err("disk is full".into())).await,
            Err("disk is full".into())
        );
    }

    #[tokio::test]
    async fn bounds_concurrent_blocking_operations() {
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for _ in 0..24 {
            let active = active.clone();
            let peak = peak.clone();
            tasks.push(tokio::spawn(run(move || {
                let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(count, Ordering::SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(2));
                active.fetch_sub(1, Ordering::SeqCst);
                Ok(())
            })));
        }
        for task in tasks {
            task.await.unwrap().unwrap();
        }
        assert_eq!(active.load(Ordering::SeqCst), 0);
        assert!(peak.load(Ordering::SeqCst) <= MAX_IO_TASKS);
    }
}
