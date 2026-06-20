use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

const SAM_SOURCE: &str = "Repressurizer SAM bridge";
const SAM_REFERENCE_SOURCE: &str = "Steam Achievement Manager architecture";
const SAM_LICENSE: &str = "zlib-compatible architecture reference";
const EMBEDDED_BRIDGE_ARG: &str = "--repressurizer-sam-bridge";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamBridgeCapability {
    pub id: String,
    pub label: String,
    pub status: String,
    pub writes_steam: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamBridgeProbe {
    pub app_id: u64,
    pub platform: String,
    pub source: String,
    pub reference_source: String,
    pub source_license: String,
    pub data_source: String,
    pub available: bool,
    pub readiness: String,
    pub bridge_invoked: bool,
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
    let bridge_path = std::env::current_exe().ok();

    if let Some(bridge_path) = bridge_path.clone() {
        match run_bridge_probe(&bridge_path, &steam_path, app_id) {
            Ok(mut probe) => {
                probe.bridge_invoked = true;
                probe.local_bridge_found = true;
                probe.local_bridge_path = Some(path_to_string(bridge_path));
                return probe;
            }
            Err(error) => {
                return build_probe(
                    steam_path,
                    app_id,
                    Some(bridge_path),
                    true,
                    Some(format!("SAM bridge probe failed: {error}")),
                );
            }
        }
    }

    build_probe(steam_path, app_id, bridge_path, false, None)
}

pub fn run_embedded_bridge_from_env() -> Option<i32> {
    run_embedded_bridge(std::env::args())
}

pub fn run_embedded_bridge<I, S>(args: I) -> Option<i32>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut args = args.into_iter().map(Into::into);
    let _exe = args.next();
    if args.next().as_deref() != Some(EMBEDDED_BRIDGE_ARG) {
        return None;
    }

    match run_embedded_bridge_command(args.collect()) {
        Ok(output) => {
            println!("{output}");
            Some(0)
        }
        Err(error) => {
            eprintln!("{error}");
            Some(2)
        }
    }
}

pub fn probe_sam_bridge_for_cli(steam_path: String, app_id: u64) -> SamBridgeProbe {
    build_probe(steam_path, app_id, std::env::current_exe().ok(), true, None)
}

fn run_embedded_bridge_command(args: Vec<String>) -> Result<String, String> {
    let mut args = args.into_iter();
    let command = args.next().unwrap_or_else(|| "help".to_string());

    match command.as_str() {
        "probe" => run_embedded_bridge_probe(args.collect()),
        "help" | "--help" | "-h" => Ok(format!(
            "Repressurizer embedded SAM bridge\nusage: {EMBEDDED_BRIDGE_ARG} probe --steam-path <path> [--app-id <appid>]"
        )),
        other => Err(format!("unknown embedded SAM bridge command: {other}")),
    }
}

fn run_embedded_bridge_probe(args: Vec<String>) -> Result<String, String> {
    let mut steam_path = String::new();
    let mut app_id = 0_u64;
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--steam-path" => {
                steam_path = iter.next().ok_or("--steam-path needs a value")?;
            }
            "--app-id" => {
                let value = iter.next().ok_or("--app-id needs a value")?;
                app_id = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --app-id value: {value}"))?;
            }
            "--json" => {}
            other => return Err(format!("unknown probe argument: {other}")),
        }
    }

    serde_json::to_string(&probe_sam_bridge_for_cli(steam_path, app_id))
        .map_err(|error| error.to_string())
}

fn build_probe(
    steam_path: String,
    app_id: u64,
    local_bridge_path: Option<PathBuf>,
    bridge_invoked: bool,
    bridge_error: Option<String>,
) -> SamBridgeProbe {
    let platform = std::env::consts::OS.to_string();
    let steam_root = PathBuf::from(steam_path.trim());
    let steam_path_exists = !steam_path.trim().is_empty() && steam_root.exists();
    let steam_client_library_path = find_steam_client_library(&steam_root);
    let steam_client_library_found = steam_client_library_path.is_some();
    let local_bridge_found = local_bridge_path.is_some();
    let steam_running = is_steam_running();
    let supported_platform = cfg!(target_os = "windows");
    let bridge_failed = bridge_error.is_some();

    let readiness = if !supported_platform {
        "unsupportedPlatform"
    } else if !steam_path_exists {
        "missingSteamPath"
    } else if !steam_client_library_found {
        "missingSteamClientLibrary"
    } else if !local_bridge_found {
        "missingLocalBridge"
    } else if !steam_running {
        "steamNotRunning"
    } else if bridge_failed {
        "bridgeError"
    } else {
        "ready"
    };

    let preflight_ready =
        supported_platform && steam_path_exists && steam_client_library_found && steam_running;
    let bridge_ready = preflight_ready && local_bridge_found && !bridge_failed;

    SamBridgeProbe {
        app_id,
        platform,
        source: SAM_SOURCE.to_string(),
        reference_source: SAM_REFERENCE_SOURCE.to_string(),
        source_license: SAM_LICENSE.to_string(),
        data_source: "samLocalBridge".to_string(),
        available: bridge_ready,
        readiness: readiness.to_string(),
        bridge_invoked,
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
                "Checks Steam install, Steam client library, embedded bridge mode, and Steam process status.",
            ),
            capability(
                "samReadAchievements",
                "SAM local achievement read",
                if bridge_ready { "ready" } else { "blocked" },
                false,
                "Requires the embedded bridge mode and running Steam before Repressurizer can read via Steamworks.",
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
        notes: notes_for_probe(
            supported_platform,
            steam_path_exists,
            steam_client_library_found,
            local_bridge_found,
            steam_running,
            bridge_invoked,
            bridge_error,
        ),
    }
}

fn run_bridge_probe(
    bridge_path: &Path,
    steam_path: &str,
    app_id: u64,
) -> Result<SamBridgeProbe, String> {
    let output = Command::new(bridge_path)
        .arg(EMBEDDED_BRIDGE_ARG)
        .arg("probe")
        .arg("--steam-path")
        .arg(steam_path)
        .arg("--app-id")
        .arg(app_id.to_string())
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("bridge exited with {}", output.status)
        } else {
            stderr
        });
    }

    serde_json::from_slice::<SamBridgeProbe>(&output.stdout).map_err(|error| error.to_string())
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

fn find_steam_client_library(steam_root: &Path) -> Option<PathBuf> {
    if steam_root.as_os_str().is_empty() {
        return None;
    }

    steam_client_candidates(steam_root)
        .into_iter()
        .find(|candidate| candidate.exists())
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
        let probe = build_probe(String::new(), 39140, None, false, None);
        assert_eq!(probe.app_id, 39140);
        assert!(!probe.available);
        assert!(!probe.writes_steam);
        assert!(probe.capabilities.iter().any(|capability| {
            capability.id == "samWriteAchievements" && capability.writes_steam
        }));
    }

    #[test]
    fn ignores_normal_app_launch_args() {
        assert_eq!(run_embedded_bridge(["repressurizer"]), None);
    }

    #[test]
    fn embedded_probe_outputs_json() {
        let output = run_embedded_bridge_command(vec![
            "probe".to_string(),
            "--steam-path".to_string(),
            String::new(),
            "--app-id".to_string(),
            "39140".to_string(),
        ])
        .unwrap();
        let probe = serde_json::from_str::<SamBridgeProbe>(&output).unwrap();

        assert_eq!(probe.app_id, 39140);
        assert!(probe.bridge_invoked);
        assert!(probe.local_bridge_found);
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("repressurizer_{name}_{nanos}"))
    }
}
