pub fn app_channel() -> &'static str {
    match option_env!("REPRESSURIZER_CHANNEL") {
        Some("preview") => "preview",
        _ => "stable",
    }
}

pub fn app_display_name() -> &'static str {
    if app_channel() == "preview" {
        "Repressurizer Preview"
    } else {
        "Repressurizer"
    }
}

pub fn app_version() -> &'static str {
    option_env!("REPRESSURIZER_DISPLAY_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

pub fn delay_preview_autostart_if_needed() {
    if app_channel() != "preview" {
        return;
    }
    if !launched_from_autostart() {
        return;
    }

    // Let the stable build win Windows startup races when both channels are enabled.
    std::thread::sleep(std::time::Duration::from_secs(3));
}

pub fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == "--repressurizer-autostart")
}

#[cfg(target_os = "windows")]
pub fn claim_cross_channel_instance() -> bool {
    windows_channel_guard::claim_cross_channel_instance()
}

#[cfg(not(target_os = "windows"))]
pub fn claim_cross_channel_instance() -> bool {
    true
}

#[cfg(target_os = "windows")]
mod windows_channel_guard {
    use std::mem;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};

    static CROSS_CHANNEL_MUTEX: AtomicIsize = AtomicIsize::new(0);

    pub fn claim_cross_channel_instance() -> bool {
        if CROSS_CHANNEL_MUTEX.load(Ordering::Acquire) != 0 {
            return true;
        }

        if super::app_channel() == "preview" && has_existing_repressurizer_process() {
            show_blocked_message("another Repressurizer process is already running");
            return false;
        }

        let mutex_name = to_wide("Local\\RepressurizerCrossChannelGuard");
        let handle = unsafe { CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr()) };
        if handle.is_null() {
            return true;
        }

        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                CloseHandle(handle);
            }
            show_blocked_message("another Repressurizer channel is already running");
            return false;
        }

        CROSS_CHANNEL_MUTEX.store(handle as isize, Ordering::Release);
        true
    }

    fn has_existing_repressurizer_process() -> bool {
        let current_pid = std::process::id();
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return false;
            }

            let mut entry = mem::zeroed::<PROCESSENTRY32W>();
            entry.dwSize = mem::size_of::<PROCESSENTRY32W>() as u32;

            let mut has_process = Process32FirstW(snapshot, &mut entry) != 0;
            while has_process {
                if entry.th32ProcessID != current_pid
                    && is_repressurizer_process_name(&exe_name(&entry.szExeFile))
                {
                    CloseHandle(snapshot);
                    return true;
                }
                has_process = Process32NextW(snapshot, &mut entry) != 0;
            }

            CloseHandle(snapshot);
        }
        false
    }

    fn is_repressurizer_process_name(name: &str) -> bool {
        matches!(
            name.to_ascii_lowercase().as_str(),
            "repressurizer.exe" | "repressurizer preview.exe" | "repressurizer-preview.exe"
        )
    }

    fn exe_name(raw: &[u16]) -> String {
        let len = raw.iter().position(|ch| *ch == 0).unwrap_or(raw.len());
        String::from_utf16_lossy(&raw[..len])
    }

    fn show_blocked_message(reason: &str) {
        if super::launched_from_autostart() {
            return;
        }

        let title = to_wide(super::app_display_name());
        let body = to_wide(&format!(
            "{} cannot open because {}.\n\nClose the running stable or preview build first.",
            super::app_display_name(),
            reason
        ));
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                body.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONINFORMATION,
            );
        }
    }

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}
