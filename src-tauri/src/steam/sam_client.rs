//! SAM client used by the main Repressurizer process.
//!
//! The implementation that loads Steamworks and enumerates Windows processes
//! lives in the `repressurizer-sam` sidecar. Keeping this process boundary is
//! deliberate: the normal app remains useful without loading the SAM bridge,
//! while the explicit Steam Tools flow keeps the same JSON/Tauri API.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const SAM_SOURCE: &str = "Repressurizer SAM integration (sidecar)";
const SAM_REFERENCE_SOURCE: &str =
    "Steam Achievement Manager by Rick (gibbed): https://github.com/gibbed/SteamAchievementManager";
const SAM_LICENSE: &str =
    "Original Steam Achievement Manager project: zlib license; Repressurizer implementation: independent Rust integration";
const EMBEDDED_BRIDGE_ARG: &str = "--repressurizer-sam-bridge";
const SIDECAR_NAME: &str = "repressurizer-sam";
const SAM_SCHEMA_RUNNER_TIMEOUT: Duration = Duration::from_secs(10);
const SAM_ACTION_RUNNER_TIMEOUT: Duration = Duration::from_secs(45);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
const EMBEDDED_SAM_PAYLOAD: &[u8] = include_bytes!(env!("REPRESSURIZER_SAM_EMBEDDED_PAYLOAD"));

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementActionInput {
    pub steam_path: String,
    pub app_id: u64,
    pub action: String,
    #[serde(default)]
    pub achievement_ids: Vec<String>,
    pub backup_path: Option<String>,
    #[serde(default)]
    pub allow_unverified_permissions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementSchemaItem {
    pub api_name: String,
    pub permission: i32,
    pub protected_achievement: bool,
    pub permission_verified: bool,
    pub source: String,
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementState {
    pub api_name: String,
    pub achieved: bool,
    pub unlock_time: u64,
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementBackup {
    pub version: u32,
    pub app_id: u64,
    pub action: String,
    pub phase: String,
    pub captured_at: String,
    pub can_restore_unlock_times: bool,
    pub note: String,
    pub achievements: Vec<SamAchievementState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamBackupInfo {
    pub filename: String,
    pub path: String,
    pub app_id: u64,
    pub action: String,
    pub phase: String,
    pub captured_at: String,
    pub achievement_count: usize,
    pub unlocked_count: usize,
    pub can_restore_unlock_times: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementActionResult {
    pub app_id: u64,
    pub action: String,
    pub changed: usize,
    pub failed: Vec<String>,
    pub diagnostics: Vec<String>,
    pub before_backup_path: Option<String>,
    pub after_backup_path: Option<String>,
    pub before: SamAchievementBackup,
    pub after: SamAchievementBackup,
    pub store_stats: bool,
    pub unlock_times_restorable: bool,
    pub message: String,
}

#[tauri::command]
pub fn probe_sam_bridge(steam_path: String, app_id: u64) -> SamBridgeProbe {
    match run_sidecar_probe(&steam_path, app_id) {
        Ok(probe) => probe,
        Err(error) => unavailable_probe(steam_path, app_id, error),
    }
}

pub fn probe_sam_bridge_for_cli(steam_path: String, app_id: u64) -> SamBridgeProbe {
    probe_sam_bridge(steam_path, app_id)
}

#[tauri::command]
pub fn sam_achievement_action(
    input: SamAchievementActionInput,
) -> Result<SamAchievementActionResult, String> {
    if !crate::read_app_setting_bool("steamToolsEnabled").unwrap_or(false) {
        return Err("Steam Tools are disabled.".to_string());
    }
    if !crate::read_app_setting_bool("steamToolsAchievementWritesEnabled").unwrap_or(false) {
        return Err("Achievement write actions are disabled in Settings.".to_string());
    }
    validate_achievement_action_input(&input)?;

    let payload = serde_json::to_vec(&input).map_err(|error| error.to_string())?;
    run_sidecar_json(
        &[EMBEDDED_BRIDGE_ARG, "achievement-action"],
        Some(&payload),
        SAM_ACTION_RUNNER_TIMEOUT,
        "SAM action runner",
    )
}

#[tauri::command]
pub fn sam_backup_dir(app_id: u64) -> Result<String, String> {
    validate_app_id(app_id)?;
    let path = sam_backup_base_dir(app_id)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create SAM backup directory: {error}"))?;
    Ok(path_to_string(path))
}

#[tauri::command]
pub fn list_sam_backups(app_id: u64) -> Result<Vec<SamBackupInfo>, String> {
    validate_app_id(app_id)?;
    let base = sam_backup_base_dir(app_id)?;
    fs::create_dir_all(&base)
        .map_err(|error| format!("Failed to create SAM backup directory: {error}"))?;

    let mut backups = Vec::new();
    for entry in fs::read_dir(&base)
        .map_err(|error| format!("Failed to list SAM backup directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read SAM backup entry: {error}"))?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| !extension.eq_ignore_ascii_case("json"))
            .unwrap_or(true)
        {
            continue;
        }

        let backup = match load_achievement_backup(&path_to_string(path.clone())) {
            Ok(backup) if backup.app_id == app_id => backup,
            _ => continue,
        };
        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string();
        backups.push(SamBackupInfo {
            filename,
            path: path_to_string(path),
            app_id: backup.app_id,
            action: backup.action,
            phase: backup.phase,
            captured_at: backup.captured_at,
            achievement_count: backup.achievements.len(),
            unlocked_count: backup
                .achievements
                .iter()
                .filter(|achievement| achievement.valid && achievement.achieved)
                .count(),
            can_restore_unlock_times: backup.can_restore_unlock_times,
        });
    }

    backups.sort_by(|a, b| {
        b.captured_at
            .cmp(&a.captured_at)
            .then_with(|| b.filename.cmp(&a.filename))
    });
    Ok(backups)
}

#[tauri::command]
pub fn open_sam_backup_dir(app_id: u64) -> Result<(), String> {
    validate_app_id(app_id)?;
    let path = sam_backup_base_dir(app_id)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create SAM backup directory: {error}"))?;
    open_directory(&path)
}

#[tauri::command]
pub fn load_sam_achievement_schema(
    steam_path: String,
    app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    validate_app_id(app_id)?;
    let args = [
        EMBEDDED_BRIDGE_ARG,
        "achievement-schema",
        "--steam-path",
        steam_path.as_str(),
        "--app-id",
    ];
    let mut owned_args = args
        .iter()
        .map(|arg| (*arg).to_string())
        .collect::<Vec<_>>();
    owned_args.push(app_id.to_string());
    run_sidecar_json(
        &owned_args.iter().map(String::as_str).collect::<Vec<_>>(),
        None,
        SAM_SCHEMA_RUNNER_TIMEOUT,
        "SAM schema runner",
    )
}

#[tauri::command]
pub fn refresh_sam_achievement_schema(
    steam_path: String,
    app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    load_sam_achievement_schema(steam_path, app_id)
}

pub fn run_embedded_bridge_from_env() -> Option<i32> {
    None
}

pub fn is_steam_running() -> bool {
    #[cfg(windows)]
    {
        let steam_path = crate::read_app_setting_string("steamPath").unwrap_or_default();
        return run_sidecar_probe(&steam_path, 0)
            .map(|probe| probe.steam_running)
            .unwrap_or_else(|_| fallback_windows_steam_running());
    }

    #[cfg(not(windows))]
    {
        Command::new("pgrep")
            .args(["-x", "steam"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

#[cfg(windows)]
fn fallback_windows_steam_running() -> bool {
    let mut command = Command::new("tasklist");
    command.args(["/FI", "IMAGENAME eq steam.exe", "/NH"]);
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .output()
        .map(|output| {
            output.status.success()
                && String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .any(|line| line.to_ascii_lowercase().contains("steam.exe"))
        })
        // If even the OS fallback cannot be queried, fail closed for file writes.
        .unwrap_or(true)
}

fn run_sidecar_probe(steam_path: &str, app_id: u64) -> Result<SamBridgeProbe, String> {
    let app_id = app_id.to_string();
    let args = [
        EMBEDDED_BRIDGE_ARG,
        "probe",
        "--steam-path",
        steam_path,
        "--app-id",
        app_id.as_str(),
    ];
    run_sidecar_json(&args, None, SAM_SCHEMA_RUNNER_TIMEOUT, "SAM probe runner")
}

fn run_sidecar_json<T: DeserializeOwned>(
    args: &[&str],
    input: Option<&[u8]>,
    timeout: Duration,
    runner_name: &str,
) -> Result<T, String> {
    let sidecar = resolve_sidecar_path()?;
    let mut command = Command::new(&sidecar);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .args(args)
        .env_remove("SteamAppId")
        .env_remove("SteamGameId")
        .env_remove("SteamOverlayGameId")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if input.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start {runner_name}: {error}"))?;
    if let Some(input) = input {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("Failed to open {runner_name} input"))?;
        stdin
            .write_all(input)
            .map_err(|error| format!("Failed to write {runner_name} input: {error}"))?;
    }

    let output = wait_for_child_output(child, timeout, runner_name)?;
    serde_json::from_slice(&output)
        .map_err(|error| format!("Failed to parse {runner_name} output: {error}"))
}

fn wait_for_child_output(
    mut child: std::process::Child,
    timeout: Duration,
    runner_name: &str,
) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let output = child.wait_with_output().map_err(|error| {
                    format!("{runner_name} timed out and could not be collected: {error}")
                })?;
                return Err(format_child_failure(
                    output.stderr.as_slice(),
                    format!("{runner_name} timed out after {}s.", timeout.as_secs()),
                ));
            }
            Err(error) => return Err(format!("Failed to poll {runner_name}: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for {runner_name}: {error}"))?;
    if !output.status.success() {
        return Err(format_child_failure(
            output.stderr.as_slice(),
            format!("{runner_name} exited with {}", output.status),
        ));
    }
    Ok(output.stdout)
}

fn format_child_failure(stderr: &[u8], fallback: String) -> String {
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    if stderr.is_empty() {
        fallback
    } else {
        stderr
    }
}

fn resolve_sidecar_path() -> Result<PathBuf, String> {
    if let Some(configured) = std::env::var_os("REPRESSURIZER_SAM_PATH") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "Configured REPRESSURIZER_SAM_PATH does not point to a file: {}",
            path.display()
        ));
    }

    let exe = std::env::current_exe()
        .map_err(|error| format!("Could not resolve Repressurizer executable path: {error}"))?;
    let base = exe
        .parent()
        .ok_or("Repressurizer executable has no parent directory.")?;
    let target = option_env!("TAURI_ENV_TARGET_TRIPLE");
    let mut names = vec![sidecar_filename(SIDECAR_NAME)];
    if let Some(target) = target {
        names.push(sidecar_filename(&format!("{SIDECAR_NAME}-{target}")));
    }

    let mut candidates = Vec::new();
    for directory in [base.to_path_buf(), base.join("resources")] {
        for name in &names {
            let candidate = directory.join(name);
            if !candidates.contains(&candidate) {
                candidates.push(candidate);
            }
        }
    }
    if let Some(candidate) = candidates.into_iter().find(|candidate| candidate.is_file()) {
        return Ok(candidate);
    }

    #[cfg(windows)]
    if !EMBEDDED_SAM_PAYLOAD.is_empty() {
        return materialize_embedded_sidecar();
    }

    Err(format!(
        "SAM sidecar '{}' was not found next to Repressurizer and no embedded payload is available. Steam Tools are unavailable until it is installed.",
        SIDECAR_NAME
    ))
}

fn sidecar_filename(stem: &str) -> String {
    if cfg!(windows) {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    }
}

#[cfg(windows)]
fn materialize_embedded_sidecar() -> Result<PathBuf, String> {
    let digest = Sha256::digest(EMBEDDED_SAM_PAYLOAD);
    let digest_hex = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let cache_dir = std::env::temp_dir()
        .join("Repressurizer")
        .join("sam-sidecar")
        .join(&digest_hex[..16]);
    let sidecar = cache_dir.join(sidecar_filename(SIDECAR_NAME));

    fs::create_dir_all(&cache_dir).map_err(|error| {
        format!("Failed to create the temporary SAM sidecar directory: {error}")
    })?;

    if !embedded_sidecar_matches(&sidecar) {
        let temporary = cache_dir.join(format!(".{SIDECAR_NAME}-{}.tmp", std::process::id()));
        let _ = fs::remove_file(&temporary);
        fs::write(&temporary, EMBEDDED_SAM_PAYLOAD)
            .map_err(|error| format!("Failed to materialize the embedded SAM sidecar: {error}"))?;
        if let Err(error) = fs::rename(&temporary, &sidecar) {
            if embedded_sidecar_matches(&sidecar) {
                let _ = fs::remove_file(&temporary);
            } else {
                let replace_result =
                    fs::remove_file(&sidecar).and_then(|_| fs::rename(&temporary, &sidecar));
                if let Err(replace_error) = replace_result {
                    let _ = fs::remove_file(&temporary);
                    return Err(format!(
                        "Failed to activate the embedded SAM sidecar: {error}; replacement failed: {replace_error}"
                    ));
                }
            }
        }
    }

    if embedded_sidecar_matches(&sidecar) {
        Ok(sidecar)
    } else {
        Err("The embedded SAM sidecar failed its integrity check after extraction.".to_string())
    }
}

#[cfg(windows)]
fn embedded_sidecar_matches(path: &Path) -> bool {
    fs::read(path)
        .map(|bytes| bytes == EMBEDDED_SAM_PAYLOAD)
        .unwrap_or(false)
}

fn unavailable_probe(steam_path: String, app_id: u64, error: String) -> SamBridgeProbe {
    let steam_path_exists = !steam_path.trim().is_empty() && Path::new(steam_path.trim()).exists();
    let supported_platform = cfg!(target_os = "windows");
    let readiness = if !supported_platform {
        "unsupportedPlatform"
    } else {
        // Reuse the existing localized "Missing bridge" label. The note
        // below contains the precise sidecar installation error.
        "missingLocalBridge"
    };
    SamBridgeProbe {
        app_id,
        platform: std::env::consts::OS.to_string(),
        source: SAM_SOURCE.to_string(),
        reference_source: SAM_REFERENCE_SOURCE.to_string(),
        source_license: SAM_LICENSE.to_string(),
        data_source: "samSidecar".to_string(),
        available: false,
        readiness: readiness.to_string(),
        bridge_invoked: false,
        steam_path_exists,
        steam_running: false,
        steam_client_library_found: false,
        steam_client_library_path: None,
        local_bridge_found: false,
        local_bridge_path: None,
        writes_steam: false,
        capabilities: fallback_capabilities(),
        notes: vec![error],
    }
}

fn fallback_capabilities() -> Vec<SamBridgeCapability> {
    vec![
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
            "blocked",
            false,
            "The optional SAM sidecar could not be started.",
        ),
        capability(
            "samReadAchievements",
            "SAM local achievement read",
            "blocked",
            false,
            "Install the matching Repressurizer SAM sidecar to enable local reads.",
        ),
        capability(
            "samWriteAchievements",
            "SAM unlock / lock",
            "blocked",
            true,
            "Install the matching Repressurizer SAM sidecar; writes remain opt-in.",
        ),
        capability(
            "samStatsEdit",
            "SAM stats edit / reset",
            "locked",
            true,
            "Stats editing is not exposed.",
        ),
    ]
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

fn validate_achievement_action_input(input: &SamAchievementActionInput) -> Result<(), String> {
    validate_app_id(input.app_id)?;
    match input.action.as_str() {
        "unlock" | "lock" => {
            let ids = normalized_achievement_ids(&input.achievement_ids);
            if ids.is_empty() {
                return Err("At least one achievement API name is required.".to_string());
            }
            if ids.len() != 1 {
                return Err(
                    "Single achievement actions must target exactly one achievement.".to_string(),
                );
            }
        }
        "unlock_selected" | "lock_selected" => {
            if normalized_achievement_ids(&input.achievement_ids).is_empty() {
                return Err("At least one achievement API name is required.".to_string());
            }
        }
        "unlock_all" | "lock_all" | "restore_backup" => {}
        other => return Err(format!("Unsupported SAM achievement action: {other}")),
    }
    if input.action == "restore_backup"
        && input
            .backup_path
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
    {
        return Err("A backup path is required to restore achievement state.".to_string());
    }
    Ok(())
}

fn validate_app_id(app_id: u64) -> Result<(), String> {
    if app_id == 0 || app_id > u32::MAX as u64 {
        return Err("A valid Steam appId is required.".to_string());
    }
    Ok(())
}

fn sam_backup_base_dir(app_id: u64) -> Result<PathBuf, String> {
    Ok(crate::app_data_dir()
        .ok_or("Could not resolve Repressurizer app data directory.")?
        .join("sam_backups")
        .join(app_id.to_string()))
}

fn load_achievement_backup(path: &str) -> Result<SamAchievementBackup, String> {
    let raw =
        fs::read_to_string(path).map_err(|error| format!("Failed to read backup: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse backup: {error}"))
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn open_directory(path: &Path) -> Result<(), String> {
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

fn normalized_achievement_ids(ids: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    ids.iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
        .filter(|id| seen.insert((*id).to_string()))
        .map(ToString::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_probe_never_reports_writable_sidecar() {
        let probe = unavailable_probe("/missing/steam".to_string(), 730, "missing".to_string());
        assert!(!probe.available);
        assert!(!probe.writes_steam);
        assert_eq!(probe.readiness, "unsupportedPlatform");
        assert!(probe.capabilities.iter().all(
            |capability| capability.id == "webApiAchievements" || capability.status != "ready"
        ));
    }

    #[test]
    fn action_validation_rejects_empty_or_invalid_targets() {
        let input = SamAchievementActionInput {
            steam_path: String::new(),
            app_id: 0,
            action: "unlock_selected".to_string(),
            achievement_ids: Vec::new(),
            backup_path: None,
            allow_unverified_permissions: false,
        };
        assert!(validate_achievement_action_input(&input).is_err());
    }
}
