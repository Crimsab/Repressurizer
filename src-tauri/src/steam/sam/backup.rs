use super::probe::path_to_string;
use super::{SamAchievementBackup, SamAchievementState};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn build_achievement_backup(
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

pub(super) fn save_achievement_backup(backup: &SamAchievementBackup) -> Result<String, String> {
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

pub(super) fn require_pre_change_backup(
    result: Result<String, String>,
) -> Result<Option<String>, String> {
    result.map(Some).map_err(|error| {
        format!(
            "Could not create the required pre-change SAM backup; no achievements were changed: {error}"
        )
    })
}

pub(super) fn record_post_change_backup(
    result: Result<String, String>,
    diagnostics: &mut Vec<String>,
) -> Option<String> {
    match result {
        Ok(path) => Some(path),
        Err(error) => {
            diagnostics.push(format!("after_backup_error={error}"));
            None
        }
    }
}

pub(super) fn sam_backup_base_dir(app_id: u64) -> Result<PathBuf, String> {
    Ok(crate::app_data_dir()
        .ok_or("Could not resolve Repressurizer app data directory.")?
        .join("sam_backups")
        .join(app_id.to_string()))
}

pub(super) fn load_achievement_backup(path: &str) -> Result<SamAchievementBackup, String> {
    let raw =
        fs::read_to_string(path).map_err(|error| format!("Failed to read backup: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Failed to parse backup: {error}"))
}

pub(super) fn sanitize_filename_part(value: &str) -> String {
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
