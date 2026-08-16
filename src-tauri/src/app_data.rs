use fs2::FileExt;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);
static SETTINGS_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static INTEGRATION_AUDIT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const INTEGRATION_WRITE_LOCK_TIMEOUT: Duration = Duration::from_secs(60);
const INTEGRATION_AUDIT_LOCK_TIMEOUT: Duration = Duration::from_secs(5);

pub(crate) fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join("Repressurizer"))
}

pub(crate) fn validate_app_data_key(key: &str) -> Result<(), String> {
    if key.is_empty()
        || key.starts_with('.')
        || key.ends_with('.')
        || key.ends_with(' ')
        || key.contains("..")
        || is_windows_reserved_app_data_key(key)
    {
        return Err("Invalid app data key".to_string());
    }

    if !key
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("Invalid app data key".to_string());
    }

    Ok(())
}

pub(crate) fn is_windows_reserved_app_data_key(key: &str) -> bool {
    let stem = key
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .and_then(|suffix| suffix.parse::<u8>().ok())
            .is_some_and(|number| (1..=9).contains(&number))
        || stem
            .strip_prefix("LPT")
            .and_then(|suffix| suffix.parse::<u8>().ok())
            .is_some_and(|number| (1..=9).contains(&number))
}

pub(crate) fn app_data_file_path(key: &str) -> Result<PathBuf, String> {
    validate_app_data_key(key)?;
    app_data_dir()
        .map(|dir| dir.join(key))
        .ok_or("Could not resolve Repressurizer app data directory".to_string())
}

pub(crate) fn should_sync_app_data(key: &str) -> bool {
    !matches!(
        key,
        "steam_apps_index.json"
            | "steam_ratings_cache.json"
            | "details_cache.json"
            | "hltb_cache.json"
            | "failed_games.json"
            | "achievements.json"
            | "friends.json"
            | "wishlist.json"
    )
}

pub(crate) fn settings_file_path() -> Result<PathBuf, String> {
    app_data_file_path("settings.json")
}

pub(crate) fn steam_collections_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json")
}

pub(crate) fn read_app_setting_bool(key: &str) -> Option<bool> {
    let settings_path = settings_file_path().ok()?;
    let data = std::fs::read_to_string(settings_path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    value.get(key).and_then(|v| v.as_bool())
}

pub(crate) fn read_app_setting_string(key: &str) -> Option<String> {
    let settings_path = settings_file_path().ok()?;
    let data = std::fs::read_to_string(settings_path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

pub(crate) fn settings_file_lock() -> &'static Mutex<()> {
    SETTINGS_FILE_LOCK.get_or_init(|| Mutex::new(()))
}

pub(crate) fn read_settings_json_unlocked() -> Result<serde_json::Value, String> {
    let settings_path = settings_file_path()?;
    let data = std::fs::read_to_string(&settings_path).map_err(|error| {
        format!(
            "Failed to read settings file {}: {}",
            settings_path.display(),
            error
        )
    })?;
    serde_json::from_str::<serde_json::Value>(&data).map_err(|error| {
        format!(
            "Failed to parse settings file {}: {}",
            settings_path.display(),
            error
        )
    })
}

pub(crate) fn read_settings_json() -> Result<serde_json::Value, String> {
    let _guard = settings_file_lock()
        .lock()
        .map_err(|_| "Settings file lock poisoned".to_string())?;
    read_settings_json_unlocked()
}

pub(crate) fn read_optional_text_file(
    path: &Path,
    description: &str,
) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(data) => Ok(Some(data)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Failed to read {} {}: {}",
            description,
            path.display(),
            error
        )),
    }
}

pub(crate) fn temporary_file_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or("Could not resolve target file parent directory".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Could not resolve target file name".to_string())?;
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(parent.join(format!(
        ".{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        counter
    )))
}

#[cfg(windows)]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(source, destination)
}

pub(crate) fn write_text_file_atomic(
    path: &Path,
    data: &str,
    description: &str,
    sync_to_disk: bool,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create {} directory {}: {}",
                description,
                parent.display(),
                error
            )
        })?;
    }

    let temporary_path = temporary_file_path(path)?;
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::File::create(&temporary_path).map_err(|error| {
            format!(
                "Failed to create temporary {} {}: {}",
                description,
                temporary_path.display(),
                error
            )
        })?;
        file.write_all(data.as_bytes()).map_err(|error| {
            format!(
                "Failed to write temporary {} {}: {}",
                description,
                temporary_path.display(),
                error
            )
        })?;
        if sync_to_disk {
            file.sync_all().map_err(|error| {
                format!(
                    "Failed to flush temporary {} {}: {}",
                    description,
                    temporary_path.display(),
                    error
                )
            })?;
        }
        drop(file);

        replace_file(&temporary_path, path).map_err(|error| {
            format!(
                "Failed to replace {} {}: {}",
                description,
                path.display(),
                error
            )
        })
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }

    result
}

pub(crate) fn write_settings_json_unlocked(value: &serde_json::Value) -> Result<(), String> {
    let settings_path = settings_file_path()?;
    let data = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize settings: {}", error))?;
    write_text_file_atomic(&settings_path, &data, "settings file", true)
}

pub(crate) fn update_settings_json<F>(update: F) -> Result<(), String>
where
    F: FnOnce(&mut serde_json::Value) -> Result<(), String>,
{
    let _guard = settings_file_lock()
        .lock()
        .map_err(|_| "Settings file lock poisoned".to_string())?;
    let mut settings = read_settings_json_unlocked()?;
    update(&mut settings)?;
    write_settings_json_unlocked(&settings)
}

/// Serialize integration mutations across processes, not only across threads
/// in one process. OS advisory locks are released automatically if a process
/// exits, so a crashed agent cannot leave a permanent stale lock behind.
pub(crate) fn with_integration_write_lock<T, F>(operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    with_process_file_lock(
        "integration_writes.lock",
        "integration write",
        INTEGRATION_WRITE_LOCK_TIMEOUT,
        operation,
    )
}

fn with_process_file_lock<T, F>(
    key: &str,
    description: &str,
    timeout: Duration,
    operation: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let path = app_data_file_path(key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create {description} lock directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|error| {
            format!(
                "Failed to open {description} lock {}: {error}",
                path.display()
            )
        })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }

    let deadline = Instant::now() + timeout;
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => break,
            Err(error) if error.kind() == ErrorKind::WouldBlock && Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(error) => {
                return Err(format!(
                    "Could not acquire {description} lock {}: {error}",
                    path.display()
                ));
            }
        }
    }

    let result = operation();
    if let Err(error) = file.unlock() {
        if result.is_ok() {
            return Err(format!(
                "Could not release {description} lock {}: {error}",
                path.display()
            ));
        }
    }
    result
}

/// Append a bounded, local-only audit record for MCP/API mutations. Values are
/// supplied by the integration seam after secret/path redaction; this helper
/// deliberately never logs bearer tokens or settings.
pub(crate) fn append_integration_audit(
    operation: &str,
    status: &str,
    details: &serde_json::Value,
) -> Result<(), String> {
    let lock = INTEGRATION_AUDIT_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock
        .lock()
        .map_err(|_| "Integration audit lock poisoned".to_string())?;
    with_process_file_lock(
        "integration_audit.lock",
        "integration audit",
        INTEGRATION_AUDIT_LOCK_TIMEOUT,
        || {
            let path = app_data_file_path("integration_audit.jsonl")?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Failed to create integration audit directory {}: {error}",
                        parent.display()
                    )
                })?;
            }
            if std::fs::metadata(&path)
                .map(|metadata| metadata.len() > 1_048_576)
                .unwrap_or(false)
            {
                let rotated = app_data_file_path("integration_audit.jsonl.1")?;
                let _ = std::fs::rename(&path, rotated);
            }
            let record = serde_json::json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "operation": operation,
                "status": status,
                "details": details,
            });
            let mut serialized = serde_json::to_vec(&record).map_err(|error| {
                format!("Failed to serialize integration audit record: {error}")
            })?;
            serialized.push(b'\n');
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .map_err(|error| format!("Failed to open integration audit log: {error}"))?;
            file.write_all(&serialized)
                .map_err(|error| format!("Failed to append integration audit record: {error}"))?;
            file.sync_data()
                .map_err(|error| format!("Failed to flush integration audit record: {error}"))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            Ok(())
        },
    )
}
