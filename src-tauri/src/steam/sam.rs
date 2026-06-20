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
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
    if app_id == 0 || app_id > u32::MAX as u64 {
        return Err("A valid Steam appId is required.".to_string());
    }
    let path = sam_backup_base_dir(app_id)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create SAM backup directory: {error}"))?;
    Ok(path_to_string(path))
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
    if input.app_id == 0 || input.app_id > u32::MAX as u64 {
        return Err("A valid Steam appId is required.".to_string());
    }

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

    let available_names = bridge.achievement_names().unwrap_or_default();
    if ids.is_empty() {
        ids = available_names.clone();
    }
    ids = dedupe_strings(ids);

    let backup_names = if available_names.is_empty() {
        ids.clone()
    } else {
        available_names.clone()
    };
    let before_states = bridge.capture_states(&backup_names);
    let before_backup =
        build_achievement_backup(input.app_id, &input.action, "before", before_states);
    let before_backup_path = save_achievement_backup(&before_backup).ok();

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

    match input.action.as_str() {
        "unlock" => {
            for id in &ids {
                desired_states.insert(id.clone(), true);
                if bridge.set_achievement(id, true) {
                    attempted += 1;
                } else {
                    failed.push(id.clone());
                }
            }
        }
        "lock" => {
            for id in &ids {
                desired_states.insert(id.clone(), false);
                if bridge.set_achievement(id, false) {
                    attempted += 1;
                } else {
                    failed.push(id.clone());
                }
            }
        }
        "unlock_selected" | "unlock_all" => {
            for id in &ids {
                desired_states.insert(id.clone(), true);
                if bridge.set_achievement(id, true) {
                    attempted += 1;
                } else {
                    failed.push(id.clone());
                }
            }
        }
        "lock_selected" | "lock_all" => {
            for id in &ids {
                desired_states.insert(id.clone(), false);
                if bridge.set_achievement(id, false) {
                    attempted += 1;
                } else {
                    failed.push(id.clone());
                }
            }
        }
        "restore_backup" => {
            let backup = restore_backup
                .as_ref()
                .ok_or("A backup path is required to restore achievement state.")?;
            for state in backup.achievements.iter().filter(|state| state.valid) {
                desired_states.insert(state.api_name.clone(), state.achieved);
                if bridge.set_achievement(&state.api_name, state.achieved) {
                    attempted += 1;
                } else {
                    failed.push(state.api_name.clone());
                }
            }
        }
        other => return Err(format!("Unsupported SAM achievement action: {other}")),
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
    bridge.run_callbacks_for(std::time::Duration::from_millis(1600));
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
        bridge.run_callbacks_for(std::time::Duration::from_millis(1600));
        after_states = bridge.capture_states(&backup_names);
    }

    let after_backup = build_achievement_backup(input.app_id, &input.action, "after", after_states);
    let after_backup_path = save_achievement_backup(&after_backup).ok();
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
    let message = if !unapplied.is_empty() {
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

fn achievement_state_map(states: &[SamAchievementState]) -> HashMap<String, SamAchievementState> {
    states
        .iter()
        .filter(|state| state.valid)
        .map(|state| (state.api_name.clone(), state.clone()))
        .collect()
}

fn count_target_achievement_changes(
    before: &[SamAchievementState],
    after: &[SamAchievementState],
    target_set: &HashSet<String>,
) -> usize {
    let before_map = achievement_state_map(before);
    after
        .iter()
        .filter(|state| state.valid && target_set.contains(&state.api_name))
        .filter(|state| {
            before_map
                .get(&state.api_name)
                .map(|before_state| before_state.achieved != state.achieved)
                .unwrap_or(false)
        })
        .count()
}

fn changed_non_target_states(
    before: &[SamAchievementState],
    after: &[SamAchievementState],
    target_set: &HashSet<String>,
) -> Vec<SamAchievementState> {
    let after_map = achievement_state_map(after);
    before
        .iter()
        .filter(|state| state.valid && !target_set.contains(&state.api_name))
        .filter(|state| {
            after_map
                .get(&state.api_name)
                .map(|after_state| after_state.achieved != state.achieved)
                .unwrap_or(false)
        })
        .cloned()
        .collect()
}

fn unapplied_target_states(
    after: &[SamAchievementState],
    desired_states: &HashMap<String, bool>,
) -> Vec<String> {
    let after_map = achievement_state_map(after);
    desired_states
        .iter()
        .filter_map(|(id, desired)| {
            let Some(state) = after_map.get(id) else {
                return Some(id.clone());
            };
            (state.achieved != *desired).then(|| id.clone())
        })
        .collect()
}

fn unapplied_target_state_details(
    after: &[SamAchievementState],
    desired_states: &HashMap<String, bool>,
) -> Vec<String> {
    let after_map = achievement_state_map(after);
    desired_states
        .iter()
        .filter_map(|(id, desired)| match after_map.get(id) {
            Some(state) if state.achieved != *desired => Some(format!(
                "{}:actual={},desired={}",
                id, state.achieved, desired
            )),
            None => Some(format!("{id}:actual=missing,desired={desired}")),
            _ => None,
        })
        .collect()
}

fn normalized_achievement_ids(ids: &[String]) -> Vec<String> {
    dedupe_strings(
        ids.iter()
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(ToString::to_string)
            .collect(),
    )
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value);
        }
    }
    deduped
}

fn build_achievement_backup(
    app_id: u64,
    action: &str,
    phase: &str,
    achievements: Vec<SamAchievementState>,
) -> SamAchievementBackup {
    SamAchievementBackup {
        version: 1,
        app_id,
        action: action.to_string(),
        phase: phase.to_string(),
        captured_at: chrono::Utc::now().to_rfc3339(),
        can_restore_unlock_times: false,
        note: "Steamworks exposes unlock timestamps for backup/reference, but does not expose a public API to set or restore original unlock timestamps.".to_string(),
        achievements,
    }
}

fn save_achievement_backup(backup: &SamAchievementBackup) -> Result<String, String> {
    let base = sam_backup_base_dir(backup.app_id)?;
    fs::create_dir_all(&base)
        .map_err(|error| format!("Failed to create SAM backup directory: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let filename = format!(
        "{}-{}-{}.json",
        timestamp,
        sanitize_filename_part(&backup.action),
        sanitize_filename_part(&backup.phase)
    );
    let path = base.join(filename);
    let json = serde_json::to_string_pretty(backup).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| format!("Failed to write SAM backup: {error}"))?;
    Ok(path_to_string(path))
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

fn sanitize_filename_part(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "action".to_string()
    } else {
        trimmed.to_string()
    }
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
    fn run_callbacks_for(&self, _duration: std::time::Duration) {}
}

#[cfg(windows)]
use windows_steam::SamSteamBridge;

#[cfg(windows)]
mod windows_steam {
    use super::{find_steam_client_library, SamAchievementState};
    use libloading::Library;
    use std::ffi::OsString;
    use std::ffi::{c_char, c_int, c_void, CStr, CString};
    use std::mem;
    use std::path::{Path, PathBuf};
    use std::thread;
    use std::time::{Duration, Instant};

    const STEAM_CLIENT_VERSION: &[u8] = b"SteamClient018\0";
    const STEAM_UTILS_VERSION: &[u8] = b"SteamUtils005\0";
    const STEAM_USER_VERSION: &[u8] = b"SteamUser012\0";
    const STEAM_USER_STATS_VERSION: &[u8] = b"STEAMUSERSTATS_INTERFACE_VERSION013\0";

    type CreateInterface =
        unsafe extern "C" fn(version: *const c_char, return_code: *mut c_int) -> *mut c_void;
    type SteamBGetCallback =
        unsafe extern "C" fn(pipe: c_int, message: *mut CallbackMessage, call: *mut c_int) -> bool;
    type SteamFreeLastCallback = unsafe extern "C" fn(pipe: c_int) -> bool;

    type CreateSteamPipe = unsafe extern "system" fn(this: *mut c_void) -> c_int;
    type ReleaseSteamPipe = unsafe extern "system" fn(this: *mut c_void, pipe: c_int) -> bool;
    type ConnectToGlobalUser = unsafe extern "system" fn(this: *mut c_void, pipe: c_int) -> c_int;
    type ReleaseUser = unsafe extern "system" fn(this: *mut c_void, pipe: c_int, user: c_int);
    type GetSteamUser =
        unsafe extern "system" fn(*mut c_void, c_int, c_int, *const c_char) -> *mut c_void;
    type GetSteamUtils =
        unsafe extern "system" fn(*mut c_void, c_int, *const c_char) -> *mut c_void;
    type GetSteamUserStats =
        unsafe extern "system" fn(*mut c_void, c_int, c_int, *const c_char) -> *mut c_void;
    type ShutdownIfAllPipesClosed = unsafe extern "system" fn(*mut c_void) -> bool;

    type GetAppId = unsafe extern "system" fn(*mut c_void) -> u32;
    type GetSteamId = unsafe extern "system" fn(*mut c_void, *mut u64);
    type RequestUserStats = unsafe extern "system" fn(*mut c_void, u64) -> u64;
    type GetNumAchievements = unsafe extern "system" fn(*mut c_void) -> u32;
    type GetAchievementName = unsafe extern "system" fn(*mut c_void, u32) -> *const c_char;
    type GetAchievementAndUnlockTime =
        unsafe extern "system" fn(*mut c_void, *const c_char, *mut bool, *mut u32) -> bool;
    type SetAchievement = unsafe extern "system" fn(*mut c_void, *const c_char) -> bool;
    type ClearAchievement = unsafe extern "system" fn(*mut c_void, *const c_char) -> bool;
    type StoreStats = unsafe extern "system" fn(*mut c_void) -> bool;

    #[repr(C)]
    struct CallbackMessage {
        user: c_int,
        id: c_int,
        param_pointer: *mut c_void,
        param_size: c_int,
    }

    pub struct SamSteamBridge {
        _library: Library,
        steam_client: *mut c_void,
        steam_user: *mut c_void,
        steam_user_stats: *mut c_void,
        pipe: c_int,
        user: c_int,
        steam_b_get_callback: SteamBGetCallback,
        steam_free_last_callback: SteamFreeLastCallback,
        release_user: ReleaseUser,
        release_steam_pipe: ReleaseSteamPipe,
        shutdown_if_all_pipes_closed: ShutdownIfAllPipesClosed,
        active_app_id: u32,
        _steam_app_id_env: ScopedEnvVar,
        _steam_game_id_env: ScopedEnvVar,
        _steam_overlay_game_id_env: ScopedEnvVar,
    }

    impl SamSteamBridge {
        pub fn connect(steam_path: &str, app_id: u64) -> Result<Self, String> {
            if app_id == 0 || app_id > u32::MAX as u64 {
                return Err("A valid Steam appId is required.".to_string());
            }

            let steam_root = PathBuf::from(steam_path.trim());
            let steam_client_path = find_steam_client_library(&steam_root)
                .ok_or("Steam client library was not found under the configured Steam path.")?;
            prepend_dll_search_path(&steam_root);
            let steam_app_id_env = ScopedEnvVar::set("SteamAppId", app_id.to_string());
            let steam_game_id_env = ScopedEnvVar::remove("SteamGameId");
            let steam_overlay_game_id_env = ScopedEnvVar::remove("SteamOverlayGameId");

            let library = unsafe { Library::new(&steam_client_path) }
                .map_err(|error| format!("Failed to load steamclient: {error}"))?;
            let create_interface = unsafe {
                *library
                    .get::<CreateInterface>(b"CreateInterface")
                    .map_err(|error| format!("CreateInterface not found: {error}"))?
            };
            let steam_b_get_callback = unsafe {
                *library
                    .get::<SteamBGetCallback>(b"Steam_BGetCallback")
                    .map_err(|error| format!("Steam_BGetCallback not found: {error}"))?
            };
            let steam_free_last_callback = unsafe {
                *library
                    .get::<SteamFreeLastCallback>(b"Steam_FreeLastCallback")
                    .map_err(|error| format!("Steam_FreeLastCallback not found: {error}"))?
            };

            let steam_client = unsafe {
                create_interface(STEAM_CLIENT_VERSION.as_ptr().cast(), std::ptr::null_mut())
            };
            if steam_client.is_null() {
                return Err("Failed to create ISteamClient018.".to_string());
            }

            let create_steam_pipe = unsafe {
                vfunc::<CreateSteamPipe>(steam_client, SteamClientFn::CreateSteamPipe as usize)
            };
            let release_steam_pipe = unsafe {
                vfunc::<ReleaseSteamPipe>(steam_client, SteamClientFn::ReleaseSteamPipe as usize)
            };
            let shutdown_if_all_pipes_closed = unsafe {
                vfunc::<ShutdownIfAllPipesClosed>(
                    steam_client,
                    SteamClientFn::ShutdownIfAllPipesClosed as usize,
                )
            };
            let connect_to_global_user = unsafe {
                vfunc::<ConnectToGlobalUser>(
                    steam_client,
                    SteamClientFn::ConnectToGlobalUser as usize,
                )
            };
            let release_user =
                unsafe { vfunc::<ReleaseUser>(steam_client, SteamClientFn::ReleaseUser as usize) };
            let get_steam_user = unsafe {
                vfunc::<GetSteamUser>(steam_client, SteamClientFn::GetISteamUser as usize)
            };
            let get_steam_utils = unsafe {
                vfunc::<GetSteamUtils>(steam_client, SteamClientFn::GetISteamUtils as usize)
            };
            let get_steam_user_stats = unsafe {
                vfunc::<GetSteamUserStats>(steam_client, SteamClientFn::GetISteamUserStats as usize)
            };

            let pipe = unsafe { create_steam_pipe(steam_client) };
            if pipe == 0 {
                return Err("Failed to create Steam pipe.".to_string());
            }
            let user = unsafe { connect_to_global_user(steam_client, pipe) };
            if user == 0 {
                unsafe {
                    release_steam_pipe(steam_client, pipe);
                }
                return Err("Failed to connect to the logged-in Steam user.".to_string());
            }

            let steam_utils =
                unsafe { get_steam_utils(steam_client, pipe, STEAM_UTILS_VERSION.as_ptr().cast()) };
            if steam_utils.is_null() {
                unsafe {
                    release_user(steam_client, pipe, user);
                    release_steam_pipe(steam_client, pipe);
                }
                return Err("Failed to get ISteamUtils.".to_string());
            }
            let get_app_id =
                unsafe { vfunc::<GetAppId>(steam_utils, SteamUtilsFn::GetAppId as usize) };
            let active_app_id = unsafe { get_app_id(steam_utils) };
            if active_app_id != app_id as u32 {
                unsafe {
                    release_user(steam_client, pipe, user);
                    release_steam_pipe(steam_client, pipe);
                }
                return Err(format!(
                    "Steam initialized appId {active_app_id}, expected {app_id}."
                ));
            }

            let steam_user = unsafe {
                get_steam_user(steam_client, user, pipe, STEAM_USER_VERSION.as_ptr().cast())
            };
            if steam_user.is_null() {
                unsafe {
                    release_user(steam_client, pipe, user);
                    release_steam_pipe(steam_client, pipe);
                }
                return Err("Failed to get ISteamUser.".to_string());
            }

            let steam_user_stats = unsafe {
                get_steam_user_stats(
                    steam_client,
                    user,
                    pipe,
                    STEAM_USER_STATS_VERSION.as_ptr().cast(),
                )
            };
            if steam_user_stats.is_null() {
                unsafe {
                    release_user(steam_client, pipe, user);
                    release_steam_pipe(steam_client, pipe);
                }
                return Err("Failed to get ISteamUserStats.".to_string());
            }

            Ok(Self {
                _library: library,
                steam_client,
                steam_user,
                steam_user_stats,
                pipe,
                user,
                steam_b_get_callback,
                steam_free_last_callback,
                release_user,
                release_steam_pipe,
                shutdown_if_all_pipes_closed,
                active_app_id,
                _steam_app_id_env: steam_app_id_env,
                _steam_game_id_env: steam_game_id_env,
                _steam_overlay_game_id_env: steam_overlay_game_id_env,
            })
        }

        pub fn active_app_id(&self) -> u32 {
            self.active_app_id
        }

        pub fn prepare_user_stats(&mut self) -> bool {
            let get_steam_id =
                unsafe { vfunc::<GetSteamId>(self.steam_user, SteamUserFn::GetSteamId as usize) };
            let request_user_stats = unsafe {
                vfunc::<RequestUserStats>(
                    self.steam_user_stats,
                    SteamUserStatsFn::RequestUserStats as usize,
                )
            };
            let mut steam_id = 0u64;
            unsafe {
                get_steam_id(self.steam_user, &mut steam_id);
            }
            if steam_id == 0 {
                return false;
            }

            let request = unsafe { request_user_stats(self.steam_user_stats, steam_id) };
            self.run_callbacks_for(Duration::from_millis(1500));
            request != 0
        }

        pub fn achievement_names(&self) -> Result<Vec<String>, String> {
            let get_num = unsafe {
                vfunc::<GetNumAchievements>(
                    self.steam_user_stats,
                    SteamUserStatsFn::GetNumAchievements as usize,
                )
            };
            let get_name = unsafe {
                vfunc::<GetAchievementName>(
                    self.steam_user_stats,
                    SteamUserStatsFn::GetAchievementName as usize,
                )
            };

            let count = unsafe { get_num(self.steam_user_stats) };
            let mut names = Vec::new();
            for index in 0..count {
                let ptr = unsafe { get_name(self.steam_user_stats, index) };
                if ptr.is_null() {
                    continue;
                }
                let name = unsafe { CStr::from_ptr(ptr) }
                    .to_string_lossy()
                    .into_owned();
                if !name.trim().is_empty() {
                    names.push(name);
                }
            }
            Ok(names)
        }

        pub fn capture_states(&self, ids: &[String]) -> Vec<SamAchievementState> {
            ids.iter()
                .map(|id| {
                    let (achieved, unlock_time, valid) = self.achievement_state(id);
                    SamAchievementState {
                        api_name: id.clone(),
                        achieved,
                        unlock_time: unlock_time as u64,
                        valid,
                    }
                })
                .collect()
        }

        pub fn set_achievement(&self, name: &str, achieved: bool) -> bool {
            let Ok(name) = CString::new(name) else {
                return false;
            };
            if achieved {
                let set = unsafe {
                    vfunc::<SetAchievement>(
                        self.steam_user_stats,
                        SteamUserStatsFn::SetAchievement as usize,
                    )
                };
                unsafe { set(self.steam_user_stats, name.as_ptr()) }
            } else {
                let clear = unsafe {
                    vfunc::<ClearAchievement>(
                        self.steam_user_stats,
                        SteamUserStatsFn::ClearAchievement as usize,
                    )
                };
                unsafe { clear(self.steam_user_stats, name.as_ptr()) }
            }
        }

        pub fn store_stats(&self) -> bool {
            let store = unsafe {
                vfunc::<StoreStats>(self.steam_user_stats, SteamUserStatsFn::StoreStats as usize)
            };
            unsafe { store(self.steam_user_stats) }
        }

        pub fn run_callbacks_for(&self, duration: Duration) {
            let end = Instant::now() + duration;
            while Instant::now() < end {
                self.run_callbacks_once();
                thread::sleep(Duration::from_millis(50));
            }
        }

        fn run_callbacks_once(&self) {
            loop {
                let mut message = CallbackMessage {
                    user: 0,
                    id: 0,
                    param_pointer: std::ptr::null_mut(),
                    param_size: 0,
                };
                let mut call = 0;
                let has_callback =
                    unsafe { (self.steam_b_get_callback)(self.pipe, &mut message, &mut call) };
                if !has_callback {
                    break;
                }
                unsafe {
                    (self.steam_free_last_callback)(self.pipe);
                }
            }
        }

        fn achievement_state(&self, name: &str) -> (bool, u32, bool) {
            let Ok(name) = CString::new(name) else {
                return (false, 0, false);
            };
            let get = unsafe {
                vfunc::<GetAchievementAndUnlockTime>(
                    self.steam_user_stats,
                    SteamUserStatsFn::GetAchievementAndUnlockTime as usize,
                )
            };
            let mut achieved = false;
            let mut unlock_time = 0u32;
            let valid = unsafe {
                get(
                    self.steam_user_stats,
                    name.as_ptr(),
                    &mut achieved,
                    &mut unlock_time,
                )
            };
            (achieved, unlock_time, valid)
        }
    }

    struct ScopedEnvVar {
        key: &'static str,
        previous: Option<OsString>,
    }

    impl ScopedEnvVar {
        fn set(key: &'static str, value: String) -> Self {
            let previous = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, previous }
        }

        fn remove(key: &'static str) -> Self {
            let previous = std::env::var_os(key);
            std::env::remove_var(key);
            Self { key, previous }
        }
    }

    impl Drop for ScopedEnvVar {
        fn drop(&mut self) {
            if let Some(previous) = &self.previous {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    impl Drop for SamSteamBridge {
        fn drop(&mut self) {
            unsafe {
                if self.user != 0 {
                    (self.release_user)(self.steam_client, self.pipe, self.user);
                    self.user = 0;
                }
                if self.pipe != 0 {
                    (self.release_steam_pipe)(self.steam_client, self.pipe);
                    self.pipe = 0;
                }
                let _ = (self.shutdown_if_all_pipes_closed)(self.steam_client);
            }
        }
    }

    #[repr(usize)]
    enum SteamClientFn {
        CreateSteamPipe = 0,
        ReleaseSteamPipe = 1,
        ConnectToGlobalUser = 2,
        ReleaseUser = 4,
        GetISteamUser = 5,
        GetISteamUtils = 9,
        GetISteamUserStats = 13,
        ShutdownIfAllPipesClosed = 23,
    }

    #[repr(usize)]
    enum SteamUserFn {
        GetSteamId = 2,
    }

    #[repr(usize)]
    enum SteamUtilsFn {
        GetAppId = 9,
    }

    #[repr(usize)]
    enum SteamUserStatsFn {
        SetAchievement = 6,
        ClearAchievement = 7,
        GetAchievementAndUnlockTime = 8,
        StoreStats = 9,
        GetNumAchievements = 13,
        GetAchievementName = 14,
        RequestUserStats = 15,
    }

    unsafe fn vfunc<T: Copy>(object: *mut c_void, index: usize) -> T {
        let vtable = *(object as *const *const *const c_void);
        let function = *vtable.add(index);
        mem::transmute_copy(&function)
    }

    fn prepend_dll_search_path(steam_root: &Path) {
        let mut paths = vec![steam_root.to_path_buf(), steam_root.join("bin")];
        if let Some(current) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&current));
        }
        if let Ok(joined) = std::env::join_paths(paths) {
            std::env::set_var("PATH", joined);
        }
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

#[cfg(windows)]
fn is_steam_running() -> bool {
    windows_process::is_steam_running()
}

#[cfg(not(windows))]
fn is_steam_running() -> bool {
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

    #[test]
    fn single_actions_reject_multiple_achievement_ids() {
        let input = SamAchievementActionInput {
            steam_path: "C:\\Steam".to_string(),
            app_id: 1145360,
            action: "unlock".to_string(),
            achievement_ids: vec!["ACH_ONE".to_string(), "ACH_TWO".to_string()],
            backup_path: None,
        };

        let error = validate_achievement_action_input(&input).unwrap_err();
        assert!(error.contains("exactly one"));
    }

    #[test]
    fn selected_actions_allow_multiple_achievement_ids() {
        let input = SamAchievementActionInput {
            steam_path: "C:\\Steam".to_string(),
            app_id: 1145360,
            action: "unlock_selected".to_string(),
            achievement_ids: vec!["ACH_ONE".to_string(), "ACH_TWO".to_string()],
            backup_path: None,
        };

        validate_achievement_action_input(&input).unwrap();
    }

    #[test]
    fn state_diff_separates_target_from_non_target_changes() {
        let before = vec![
            SamAchievementState {
                api_name: "ACH_ONE".to_string(),
                achieved: false,
                unlock_time: 0,
                valid: true,
            },
            SamAchievementState {
                api_name: "ACH_TWO".to_string(),
                achieved: false,
                unlock_time: 0,
                valid: true,
            },
        ];
        let after = vec![
            SamAchievementState {
                api_name: "ACH_ONE".to_string(),
                achieved: true,
                unlock_time: 1,
                valid: true,
            },
            SamAchievementState {
                api_name: "ACH_TWO".to_string(),
                achieved: true,
                unlock_time: 1,
                valid: true,
            },
        ];
        let targets = HashSet::from(["ACH_ONE".to_string()]);

        assert_eq!(
            count_target_achievement_changes(&before, &after, &targets),
            1
        );
        let unexpected = changed_non_target_states(&before, &after, &targets);
        assert_eq!(unexpected.len(), 1);
        assert_eq!(unexpected[0].api_name, "ACH_TWO");
    }

    #[test]
    fn unapplied_target_states_report_ids_that_did_not_change() {
        let after = vec![SamAchievementState {
            api_name: "ACH_LOCK_ME".to_string(),
            achieved: true,
            unlock_time: 1,
            valid: true,
        }];
        let desired = HashMap::from([("ACH_LOCK_ME".to_string(), false)]);

        assert_eq!(
            unapplied_target_states(&after, &desired),
            vec!["ACH_LOCK_ME".to_string()]
        );
    }

    #[test]
    fn unapplied_target_states_report_missing_ids() {
        let after = vec![SamAchievementState {
            api_name: "ACH_OTHER".to_string(),
            achieved: false,
            unlock_time: 0,
            valid: true,
        }];
        let desired = HashMap::from([("ACH_MISSING".to_string(), false)]);

        assert_eq!(
            unapplied_target_states(&after, &desired),
            vec!["ACH_MISSING".to_string()]
        );
    }

    #[test]
    fn unapplied_target_state_details_include_actual_and_desired_values() {
        let after = vec![SamAchievementState {
            api_name: "ACH_LOCK_ME".to_string(),
            achieved: true,
            unlock_time: 1,
            valid: true,
        }];
        let desired = HashMap::from([
            ("ACH_LOCK_ME".to_string(), false),
            ("ACH_MISSING".to_string(), true),
        ]);

        let mut details = unapplied_target_state_details(&after, &desired);
        details.sort();

        assert_eq!(
            details,
            vec![
                "ACH_LOCK_ME:actual=true,desired=false".to_string(),
                "ACH_MISSING:actual=missing,desired=true".to_string(),
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn bridge_child_timeout_reports_hung_runner() {
        let child = Command::new("sh")
            .arg("-c")
            .arg("sleep 2")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();

        let error = wait_for_bridge_child(child, Duration::from_millis(10)).unwrap_err();
        assert!(error.contains("timed out"));
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("repressurizer_{name}_{nanos}"))
    }
}
