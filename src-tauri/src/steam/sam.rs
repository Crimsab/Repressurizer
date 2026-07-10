//! Local Steam Achievement Manager integration.
//!
//! Credits and reference:
//! - Steam Achievement Manager by Rick (gibbed)
//! - Repository: https://github.com/gibbed/SteamAchievementManager
//! - Original SAM license: zlib license
//!
//! Repressurizer's SAM support is an independent Rust implementation inspired by
//! SAM's Steamworks architecture. This file does not vendor SAM source code.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

mod backup;
mod probe;
mod schema;
mod state;
use backup::{
    build_achievement_backup, load_achievement_backup, record_post_change_backup,
    require_pre_change_backup, sam_backup_base_dir, save_achievement_backup,
};
pub(crate) use probe::is_steam_running;
use probe::{
    capability, find_steam_client_library, notes_for_probe, open_directory, path_to_string,
};
#[cfg(test)]
use schema::parse_sam_achievement_schema;
use schema::{
    ensure_verified_target_permissions, load_required_schema_permissions,
    load_sam_achievement_schema_items, local_write_permission, SamLocalWritePermission,
};
use state::{
    changed_non_target_states, count_target_achievement_changes, dedupe_strings,
    normalized_achievement_ids, unapplied_target_state_details, unapplied_target_states,
};

const SAM_SOURCE: &str = "Repressurizer SAM integration";
const SAM_REFERENCE_SOURCE: &str =
    "Steam Achievement Manager by Rick (gibbed): https://github.com/gibbed/SteamAchievementManager";
const SAM_LICENSE: &str =
    "Original Steam Achievement Manager project: zlib license; Repressurizer implementation: independent Rust integration";
const EMBEDDED_BRIDGE_ARG: &str = "--repressurizer-sam-bridge";
const SAM_ACTION_RUNNER_TIMEOUT: Duration = Duration::from_secs(45);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAchievementSchemaItem {
    pub api_name: String,
    pub permission: i32,
    pub protected_achievement: bool,
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
    let bridge_path = std::env::current_exe().ok();
    build_probe(steam_path, app_id, bridge_path, false, None)
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

    let bridge_path = std::env::current_exe()
        .map_err(|error| format!("Could not resolve Repressurizer SAM runner path: {error}"))?;
    run_bridge_achievement_action(&bridge_path, input)
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
    load_sam_achievement_schema_items(&steam_path, app_id)
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
        "achievement-action" => run_embedded_bridge_achievement_action(),
        "help" | "--help" | "-h" => Ok(format!(
            "Repressurizer embedded SAM bridge\nusage: {EMBEDDED_BRIDGE_ARG} probe --steam-path <path> [--app-id <appid>]\n       {EMBEDDED_BRIDGE_ARG} achievement-action < input.json"
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

fn run_embedded_bridge_achievement_action() -> Result<String, String> {
    let mut raw = String::new();
    std::io::stdin()
        .read_to_string(&mut raw)
        .map_err(|error| format!("Failed to read SAM action input: {error}"))?;
    let input = serde_json::from_str::<SamAchievementActionInput>(&raw)
        .map_err(|error| format!("Invalid SAM action input: {error}"))?;
    validate_achievement_action_input(&input)?;

    let result = perform_bridge_achievement_action(input)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
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
        writes_steam: bridge_ready,
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
                "Requires the local Rust SAM client and running Steam before Repressurizer can read via Steamworks.",
            ),
            capability(
                "samWriteAchievements",
                "SAM unlock / lock",
                if bridge_ready { "ready" } else { "blocked" },
                true,
                "Can unlock and lock achievements through the local Rust SAM client after explicit Settings opt-in and per-action confirmation.",
            ),
            capability(
                "samStatsEdit",
                "SAM stats edit / reset",
                "locked",
                true,
                "Stats editing is not exposed. Repressurizer only changes achievement state.",
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

fn run_bridge_achievement_action(
    bridge_path: &Path,
    input: SamAchievementActionInput,
) -> Result<SamAchievementActionResult, String> {
    let mut command = Command::new(bridge_path);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .arg(EMBEDDED_BRIDGE_ARG)
        .arg("achievement-action")
        .env_remove("SteamAppId")
        .env_remove("SteamGameId")
        .env_remove("SteamOverlayGameId")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start hidden SAM runner: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let payload = serde_json::to_vec(&input).map_err(|error| error.to_string())?;
        stdin
            .write_all(&payload)
            .map_err(|error| format!("Failed to write SAM action input: {error}"))?;
    }

    wait_for_bridge_child(child, SAM_ACTION_RUNNER_TIMEOUT)
}

fn wait_for_bridge_child(
    mut child: std::process::Child,
    timeout: Duration,
) -> Result<SamAchievementActionResult, String> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let output = child.wait_with_output().map_err(|error| {
                    format!("SAM action runner timed out and could not be collected: {error}")
                })?;
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if stderr.is_empty() {
                    format!("SAM action runner timed out after {}s.", timeout.as_secs())
                } else {
                    format!(
                        "SAM action runner timed out after {}s. {stderr}",
                        timeout.as_secs()
                    )
                });
            }
            Err(error) => return Err(format!("Failed to poll SAM action runner: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for SAM action runner: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("SAM action runner exited with {}", output.status)
        } else {
            stderr
        });
    }

    serde_json::from_slice::<SamAchievementActionResult>(&output.stdout)
        .map_err(|error| format!("Failed to parse SAM action output: {error}"))
}

fn perform_bridge_achievement_action(
    input: SamAchievementActionInput,
) -> Result<SamAchievementActionResult, String> {
    let mut ids = normalized_achievement_ids(&input.achievement_ids);
    let restore_backup = if input.action == "restore_backup" {
        let backup_path = input
            .backup_path
            .as_ref()
            .ok_or("A backup path is required to restore achievement state.")?;
        let backup = load_achievement_backup(backup_path)?;
        if backup.app_id != input.app_id {
            return Err(format!(
                "Backup appId {} does not match requested appId {}.",
                backup.app_id, input.app_id
            ));
        }
        Some(backup)
    } else {
        None
    };

    if let Some(backup) = &restore_backup {
        ids = backup
            .achievements
            .iter()
            .filter(|state| state.valid)
            .map(|state| state.api_name.clone())
            .collect();
    }

    let mut bridge = SamSteamBridge::connect(&input.steam_path, input.app_id)?;
    let active_app_id = bridge.active_app_id();
    let initial_stats_requested = bridge.prepare_user_stats();
    let schema_permissions = load_required_schema_permissions(&input.steam_path, input.app_id)?;

    let available_names = bridge.achievement_names().unwrap_or_default();
    if ids.is_empty() {
        ids = available_names.clone();
    }
    ids = dedupe_strings(ids);
    ensure_verified_target_permissions(&schema_permissions, &ids)?;

    let backup_names = if available_names.is_empty() {
        ids.clone()
    } else {
        available_names.clone()
    };
    let before_states = bridge.capture_states(&backup_names);
    let before_backup =
        build_achievement_backup(input.app_id, &input.action, "before", before_states);
    let before_backup_path = require_pre_change_backup(save_achievement_backup(&before_backup))?;

    let mut failed = Vec::new();
    let mut diagnostics = vec![
        format!("action={}", input.action),
        format!("target_count={}", ids.len()),
        format!("steam_initialized_app_id={active_app_id}"),
        format!("request_user_stats_before={initial_stats_requested}"),
        "Hidden SAM runner clears inherited SteamAppId, SteamGameId, and SteamOverlayGameId before setting the target SteamAppId.".to_string(),
    ];
    let mut attempted = 0usize;
    let target_set: HashSet<String> = ids.iter().cloned().collect();
    let mut desired_states: HashMap<String, bool> = HashMap::new();
    let mut protected_blocked = Vec::new();
    let mut unverified_blocked = Vec::new();

    let mut apply_achievement =
        |bridge: &SamSteamBridge, failed: &mut Vec<String>, id: &str, achieved: bool| -> bool {
            desired_states.insert(id.to_string(), achieved);
            match local_write_permission(&schema_permissions, id) {
                SamLocalWritePermission::Allowed => {}
                SamLocalWritePermission::Protected => {
                    protected_blocked.push(id.to_string());
                    failed.push(id.to_string());
                    return false;
                }
                SamLocalWritePermission::Unknown => {
                    unverified_blocked.push(id.to_string());
                    failed.push(id.to_string());
                    return false;
                }
            }
            if bridge.set_achievement(id, achieved) {
                true
            } else {
                failed.push(id.to_string());
                false
            }
        };

    match input.action.as_str() {
        "unlock" => {
            for id in &ids {
                if apply_achievement(&bridge, &mut failed, id, true) {
                    attempted += 1;
                }
            }
        }
        "lock" => {
            for id in &ids {
                if apply_achievement(&bridge, &mut failed, id, false) {
                    attempted += 1;
                }
            }
        }
        "unlock_selected" | "unlock_all" => {
            for id in &ids {
                if apply_achievement(&bridge, &mut failed, id, true) {
                    attempted += 1;
                }
            }
        }
        "lock_selected" | "lock_all" => {
            for id in &ids {
                if apply_achievement(&bridge, &mut failed, id, false) {
                    attempted += 1;
                }
            }
        }
        "restore_backup" => {
            let backup = restore_backup
                .as_ref()
                .ok_or("A backup path is required to restore achievement state.")?;
            for state in backup.achievements.iter().filter(|state| state.valid) {
                if apply_achievement(&bridge, &mut failed, &state.api_name, state.achieved) {
                    attempted += 1;
                }
            }
        }
        other => return Err(format!("Unsupported SAM achievement action: {other}")),
    }

    protected_blocked = dedupe_strings(protected_blocked);
    if !protected_blocked.is_empty() {
        diagnostics.push(format!(
            "sam_protected_achievements_skipped={}",
            protected_blocked.join(",")
        ));
        diagnostics.push(
            "SAM and SteamUtility mark achievements with permission & 3 != 0 as protected; Repressurizer does not send write requests for them."
                .to_string(),
        );
    }
    unverified_blocked = dedupe_strings(unverified_blocked);
    if !unverified_blocked.is_empty() {
        diagnostics.push(format!(
            "sam_unverified_achievements_skipped={}",
            unverified_blocked.join(",")
        ));
        diagnostics.push(
            "Repressurizer does not send achievement writes when the local Steam schema has no permission entry for the target."
                .to_string(),
        );
    }

    let post_set_states = bridge.capture_states(&backup_names);
    let post_set_unapplied = unapplied_target_states(&post_set_states, &desired_states);
    if post_set_unapplied.is_empty() {
        diagnostics.push("local_state_after_set=desired".to_string());
    } else {
        diagnostics.push(format!(
            "local_state_after_set_unapplied={}",
            post_set_unapplied.join(",")
        ));
    }

    let mut store_stats = if attempted > 0 {
        bridge.store_stats()
    } else {
        true
    };
    diagnostics.push(format!("attempted_writes={attempted}"));
    diagnostics.push(format!("store_stats={store_stats}"));
    let store_stats_callback = if attempted > 0 && store_stats {
        bridge.wait_for_stats_stored(std::time::Duration::from_millis(900))
    } else {
        false
    };
    diagnostics.push(format!("store_stats_callback={store_stats_callback}"));
    let post_store_stats_requested = if attempted > 0 && store_stats {
        bridge.prepare_user_stats()
    } else {
        false
    };
    diagnostics.push(format!(
        "request_user_stats_after_store={post_store_stats_requested}"
    ));

    let mut after_states = bridge.capture_states(&backup_names);
    let unexpected_changes =
        changed_non_target_states(&before_backup.achievements, &after_states, &target_set);
    if !unexpected_changes.is_empty() {
        for state in &unexpected_changes {
            if !bridge.set_achievement(&state.api_name, state.achieved) {
                failed.push(format!("restore_non_target:{}", state.api_name));
            }
        }
        store_stats = bridge.store_stats() && store_stats;
        diagnostics.push(format!(
            "restored_unexpected_non_target_changes={}",
            unexpected_changes.len()
        ));
        diagnostics.push(format!(
            "store_stats_after_non_target_restore={store_stats}"
        ));
        let restore_store_stats_callback =
            bridge.wait_for_stats_stored(std::time::Duration::from_millis(900));
        diagnostics.push(format!(
            "store_stats_after_non_target_restore_callback={restore_store_stats_callback}"
        ));
        after_states = bridge.capture_states(&backup_names);
    }

    let after_backup = build_achievement_backup(input.app_id, &input.action, "after", after_states);
    let after_backup_path =
        record_post_change_backup(save_achievement_backup(&after_backup), &mut diagnostics);
    let unapplied = unapplied_target_states(&after_backup.achievements, &desired_states);
    for id in &unapplied {
        if !failed.iter().any(|failed_id| failed_id == id) {
            failed.push(id.clone());
        }
    }
    if unapplied.is_empty() {
        diagnostics.push("post_store_target_state=desired".to_string());
    } else {
        diagnostics.push(format!("post_store_unapplied={}", unapplied.join(",")));
        diagnostics.push(format!(
            "post_store_unapplied_details={}",
            unapplied_target_state_details(&after_backup.achievements, &desired_states).join(",")
        ));
    }
    let changed = count_target_achievement_changes(
        &before_backup.achievements,
        &after_backup.achievements,
        &target_set,
    );

    if attempted > 0 && !store_stats {
        return Err(format!(
            "Steam rejected StoreStats after {attempted} achievement write request(s). Before backup: {}",
            before_backup_path
                .as_deref()
                .unwrap_or("backup path unavailable")
        ));
    }
    let mut message = if !unverified_blocked.is_empty() && attempted == 0 {
        format!(
            "Repressurizer blocked {} achievement change(s) because their write permissions could not be verified in the local Steam schema.",
            unverified_blocked.len()
        )
    } else if !protected_blocked.is_empty()
        && attempted == 0
        && unapplied
            .iter()
            .all(|id| protected_blocked.iter().any(|protected| protected == id))
    {
        format!(
            "Repressurizer blocked {} protected achievement change(s). SAM/SteamUtility treat these achievements as not locally manageable.",
            protected_blocked.len()
        )
    } else if !unapplied.is_empty() {
        let reason = if post_set_unapplied.is_empty() {
            "Steam accepted the local change, but reported the achievement as unchanged after StoreStats. Close the game and retry; stat-bound, protected, or server-side achievements can re-apply themselves unless their underlying stats are also changed."
        } else {
            "Steam did not accept the local achievement state before StoreStats. The achievement may be protected, server-side, invalid for this app, or controlled by a running game."
        };
        format!(
            "Steam did not apply {} achievement change(s). {reason}",
            unapplied.len()
        )
    } else if unexpected_changes.is_empty() {
        "Achievement state updated. Backup contains unlock times for reference, but Steamworks does not expose an API to restore original unlock timestamps.".to_string()
    } else {
        format!(
            "Achievement state updated, and {} unexpected non-target change(s) were restored. Backup contains unlock times for reference, but Steamworks does not expose an API to restore original unlock timestamps.",
            unexpected_changes.len()
        )
    };
    if after_backup_path.is_none() {
        message.push_str(" The achievement change completed, but the post-change diagnostic backup could not be saved; see diagnostics for details.");
    }

    Ok(SamAchievementActionResult {
        app_id: input.app_id,
        action: input.action,
        changed,
        failed,
        diagnostics,
        before_backup_path,
        after_backup_path,
        before: before_backup,
        after: after_backup,
        store_stats,
        unlock_times_restorable: false,
        message,
    })
}

#[cfg(not(windows))]
struct SamSteamBridge;

#[cfg(not(windows))]
impl SamSteamBridge {
    fn connect(_steam_path: &str, _app_id: u64) -> Result<Self, String> {
        Err("SAM achievement writes are currently Windows-only because they use Steam's local steamclient interface.".to_string())
    }

    fn prepare_user_stats(&mut self) -> bool {
        false
    }
    fn active_app_id(&self) -> u32 {
        0
    }
    fn achievement_names(&self) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
    fn capture_states(&self, _ids: &[String]) -> Vec<SamAchievementState> {
        Vec::new()
    }
    fn set_achievement(&self, _name: &str, _achieved: bool) -> bool {
        false
    }
    fn store_stats(&self) -> bool {
        false
    }
    fn wait_for_stats_stored(&self, _duration: std::time::Duration) -> bool {
        false
    }
}

#[cfg(windows)]
use windows_steam::SamSteamBridge;

#[cfg(windows)]
mod windows_steam;

#[cfg(test)]
mod tests;
