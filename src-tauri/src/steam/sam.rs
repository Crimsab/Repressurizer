use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

const SAM_SOURCE: &str = "Steam Achievement Manager architecture";
const SAM_LICENSE: &str = "zlib";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SamBridgeCapability {
    pub id: String,
    pub label: String,
    pub status: String,
    pub writes_steam: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SamBridgeProbe {
    pub app_id: u64,
    pub platform: String,
    pub source: String,
    pub source_license: String,
    pub data_source: String,
    pub available: bool,
    pub readiness: String,
    pub steam_path_exists: bool,
    pub steam_running: bool,
    pub steam_client_library_found: bool,
    pub steam_client_library_path: Option<String>,
    pub local_bridge_found: bool,
    pub local_bridge_path: Option<String>,
    pub writes_steam: bool,
    pub capabilities: Vec<SamBridgeCapability>,
    pub notes: Vec<String>,
}

#[tauri::command]
pub fn probe_sam_bridge(steam_path: String, app_id: u64) -> SamBridgeProbe {
    let platform = std::env::consts::OS.to_string();
    let steam_root = PathBuf::from(steam_path.trim());
    let steam_path_exists = !steam_path.trim().is_empty() && steam_root.exists();
    let steam_client_library_path = find_steam_client_library(&steam_root);
    let steam_client_library_found = steam_client_library_path.is_some();
    let local_bridge_path = find_local_bridge();
    let local_bridge_found = local_bridge_path.is_some();
    let steam_running = is_steam_running();
    let supported_platform = cfg!(target_os = "windows");

    let readiness = if !supported_platform {
        "unsupportedPlatform"
    } else if !steam_path_exists {
        "missingSteamPath"
    } else if !steam_client_library_found {
        "missingSteamClientLibrary"
    } else if !local_bridge_found {
        "missingLocalBridge"
    } else {
        "ready"
    };

    let preflight_ready = supported_platform && steam_path_exists && steam_client_library_found;
    let bridge_ready = preflight_ready && local_bridge_found;

    SamBridgeProbe {
        app_id,
        platform,
        source: SAM_SOURCE.to_string(),
        source_license: SAM_LICENSE.to_string(),
        data_source: "samLocalBridge".to_string(),
        available: bridge_ready,
        readiness: readiness.to_string(),
        steam_path_exists,
        steam_running,
        steam_client_library_found,
        steam_client_library_path: steam_client_library_path.map(path_to_string),
        local_bridge_found,
        local_bridge_path: local_bridge_path.map(path_to_string),
        writes_steam: false,
        capabilities: vec![
            capability(
                "webApiAchievements",
                "Steam Web API achievement summaries",
                "ready",
                false,
                "Already used by Repressurizer for read-only achievement progress.",
            ),
            capability(
                "samProbe",
                "SAM local preflight",
                if preflight_ready { "ready" } else { "blocked" },
                false,
                "Checks Steam install, Steam client library, local bridge package, and platform support.",
            ),
            capability(
                "samReadAchievements",
                "SAM local achievement read",
                if bridge_ready { "ready" } else { "blocked" },
                false,
                "Requires a packaged local bridge before Repressurizer can read via Steamworks.",
            ),
            capability(
                "samWriteAchievements",
                "SAM unlock / lock",
                "locked",
                true,
                "Requires the local bridge plus advanced write settings and per-action confirmation.",
            ),
            capability(
                "samStatsEdit",
                "SAM stats edit / reset",
                "locked",
                true,
                "Reserved for a later danger-zone workflow; never enabled by probe alone.",
            ),
        ],
        notes: notes_for_probe(supported_platform, steam_path_exists, steam_client_library_found, local_bridge_found, steam_running),
    }
}

fn capability(
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

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn notes_for_probe(
    supported_platform: bool,
    steam_path_exists: bool,
    steam_client_library_found: bool,
    local_bridge_found: bool,
    steam_running: bool,
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
        notes.push("No packaged Repressurizer SAM bridge executable was found.".to_string());
    }
    if !steam_running {
        notes.push("Steam does not appear to be running; SAM-style local reads require the Steam client and logged-in user.".to_string());
    }
    if notes.is_empty() {
        notes.push(
            "SAM preflight is ready; write actions still require explicit user confirmation."
                .to_string(),
        );
    }
    notes
}

fn find_steam_client_library(steam_root: &Path) -> Option<PathBuf> {
    if steam_root.as_os_str().is_empty() {
        return None;
    }

    let candidates = steam_client_candidates(steam_root);
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn steam_client_candidates(steam_root: &Path) -> Vec<PathBuf> {
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

fn find_local_bridge() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("REPRESSURIZER_SAM_BRIDGE") {
        let bridge = PathBuf::from(path);
        if bridge.exists() {
            return Some(bridge);
        }
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))?;

    local_bridge_names()
        .into_iter()
        .map(|name| exe_dir.join(name))
        .find(|candidate| candidate.exists())
}

fn local_bridge_names() -> Vec<&'static str> {
    if cfg!(target_os = "windows") {
        vec!["repressurizer-sam-bridge.exe", "sam-bridge.exe"]
    } else {
        vec!["repressurizer-sam-bridge", "sam-bridge"]
    }
}

fn is_steam_running() -> bool {
    if cfg!(target_os = "windows") {
        Command::new("tasklist")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|stdout| stdout.to_ascii_lowercase().contains("steam.exe"))
            .unwrap_or(false)
    } else {
        Command::new("pgrep")
            .args(["-x", "steam"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn finds_linux_steam_client_library_candidates() {
        let root = temp_dir("sam_probe_library");
        let library = root.join("ubuntu12_64").join("steamclient.so");
        fs::create_dir_all(library.parent().unwrap()).unwrap();
        fs::write(&library, b"mock").unwrap();

        let found = find_steam_client_library(&root);
        assert_eq!(found, Some(library));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reports_missing_steam_path_without_bridge() {
        let probe = probe_sam_bridge(String::new(), 39140);
        assert_eq!(probe.app_id, 39140);
        assert!(!probe.available);
        assert!(!probe.writes_steam);
        assert!(probe
            .capabilities
            .iter()
            .any(|capability| capability.id == "samWriteAchievements" && capability.writes_steam));
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("repressurizer_{name}_{nanos}"))
    }
}
