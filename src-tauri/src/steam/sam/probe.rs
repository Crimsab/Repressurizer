use super::SamBridgeCapability;
#[cfg(windows)]
use super::CREATE_NO_WINDOW;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

pub(super) fn capability(
    id: &str,
    label: &str,
    status: &str,
    writes_steam: bool,
    reason: &str,
) -> SamBridgeCapability {
    SamBridgeCapability {
        id: id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        writes_steam,
        reason: reason.to_string(),
    }
}

pub(super) fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

pub(super) fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(path)
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(path).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(path).status();

    let status = status.map_err(|error| {
        format!(
            "Failed to open SAM backup directory {}: {error}",
            path.display()
        )
    })?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to open SAM backup directory {}: opener exited with {status}",
            path.display()
        ))
    }
}

pub(super) fn notes_for_probe(
    supported_platform: bool,
    steam_path_exists: bool,
    steam_client_library_found: bool,
    local_bridge_found: bool,
    steam_running: bool,
    bridge_invoked: bool,
    bridge_error: Option<String>,
) -> Vec<String> {
    let mut notes = Vec::new();
    if !supported_platform {
        notes.push("SAM's current app/source shape is Windows-first; Repressurizer blocks local SAM actions on this platform.".to_string());
    }
    if !steam_path_exists {
        notes.push("Steam path is missing or does not exist.".to_string());
    }
    if !steam_client_library_found {
        notes.push(
            "Steam client library was not found under the configured Steam path.".to_string(),
        );
    }
    if !local_bridge_found {
        notes.push(
            "Repressurizer could not resolve its embedded SAM bridge entrypoint.".to_string(),
        );
    }
    if !steam_running {
        notes.push("Steam does not appear to be running; SAM-style local reads require the Steam client and logged-in user.".to_string());
    }
    if bridge_invoked {
        notes.push("Embedded Repressurizer SAM bridge was invoked.".to_string());
    }
    if let Some(error) = bridge_error {
        notes.push(error);
    }
    if notes.is_empty() {
        notes.push(
            "SAM preflight is ready; write actions still require explicit user confirmation."
                .to_string(),
        );
    }
    notes
}

pub(super) fn find_steam_client_library(steam_root: &Path) -> Option<PathBuf> {
    if steam_root.as_os_str().is_empty() {
        return None;
    }

    steam_client_candidates(steam_root)
        .into_iter()
        .find(|candidate| candidate.exists())
}

pub(super) fn steam_client_candidates(steam_root: &Path) -> Vec<PathBuf> {
    if cfg!(target_os = "windows") {
        vec![
            steam_root.join("steamclient64.dll"),
            steam_root.join("steamclient.dll"),
            steam_root.join("bin").join("steamclient64.dll"),
            steam_root.join("bin").join("steamclient.dll"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            steam_root.join("steamclient.dylib"),
            steam_root.join("steam_osx").join("steamclient.dylib"),
        ]
    } else {
        vec![
            steam_root.join("steamclient.so"),
            steam_root.join("ubuntu12_32").join("steamclient.so"),
            steam_root.join("ubuntu12_64").join("steamclient.so"),
            steam_root.join("linux64").join("steamclient.so"),
        ]
    }
}

#[cfg(windows)]
pub(crate) fn is_steam_running() -> bool {
    windows_process::is_steam_running()
}

#[cfg(not(windows))]
pub(crate) fn is_steam_running() -> bool {
    Command::new("pgrep")
        .args(["-x", "steam"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
mod windows_process {
    use std::mem;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    pub fn is_steam_running() -> bool {
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return false;
            }

            let mut entry = mem::zeroed::<PROCESSENTRY32W>();
            entry.dwSize = mem::size_of::<PROCESSENTRY32W>() as u32;

            let mut has_process = Process32FirstW(snapshot, &mut entry) != 0;
            while has_process {
                if exe_name(&entry.szExeFile).eq_ignore_ascii_case("steam.exe") {
                    CloseHandle(snapshot);
                    return true;
                }
                has_process = Process32NextW(snapshot, &mut entry) != 0;
            }

            CloseHandle(snapshot);
            false
        }
    }

    fn exe_name(raw: &[u16]) -> String {
        let len = raw.iter().position(|ch| *ch == 0).unwrap_or(raw.len());
        String::from_utf16_lossy(&raw[..len])
    }
}
