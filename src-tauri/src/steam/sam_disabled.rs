//! Diagnostic SAM stub used by the `no-sam` feature.
//!
//! This keeps the Tauri command surface stable while compiling the embedded
//! SAM bridge and Windows process enumeration out of the binary. It is meant
//! for controlled A/B antivirus tests, not as the production Steam Tools
//! implementation.

use serde::{Deserialize, Serialize};

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
pub fn load_sam_achievement_schema(
    _steam_path: String,
    _app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    Err("SAM is disabled in this diagnostic build".to_string())
}

#[tauri::command]
pub fn refresh_sam_achievement_schema(
    _steam_path: String,
    _app_id: u64,
) -> Result<Vec<SamAchievementSchemaItem>, String> {
    Err("SAM is disabled in this diagnostic build".to_string())
}

#[tauri::command]
pub fn probe_sam_bridge(_steam_path: String, app_id: u64) -> SamBridgeProbe {
    SamBridgeProbe {
        app_id,
        platform: std::env::consts::OS.to_string(),
        source: "disabled".to_string(),
        reference_source: String::new(),
        source_license: String::new(),
        data_source: "disabled".to_string(),
        available: false,
        readiness: "disabled".to_string(),
        bridge_invoked: false,
        steam_path_exists: false,
        steam_running: false,
        steam_client_library_found: false,
        steam_client_library_path: None,
        local_bridge_found: false,
        local_bridge_path: None,
        writes_steam: false,
        capabilities: Vec::new(),
        notes: vec!["SAM disabled in this diagnostic build".to_string()],
    }
}

pub fn probe_sam_bridge_for_cli(steam_path: String, app_id: u64) -> SamBridgeProbe {
    probe_sam_bridge(steam_path, app_id)
}

#[tauri::command]
pub fn sam_achievement_action(
    _input: SamAchievementActionInput,
) -> Result<SamAchievementActionResult, String> {
    Err("SAM is disabled in this diagnostic build".to_string())
}

#[tauri::command]
pub fn list_sam_backups(_app_id: u64) -> Result<Vec<SamBackupInfo>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn sam_backup_dir(_app_id: u64) -> Result<String, String> {
    Err("SAM is disabled in this diagnostic build".to_string())
}

#[tauri::command]
pub fn open_sam_backup_dir(_app_id: u64) -> Result<(), String> {
    Err("SAM is disabled in this diagnostic build".to_string())
}

pub fn is_steam_running() -> bool {
    false
}

pub fn run_embedded_bridge_from_env() -> Option<i32> {
    None
}
