use crate::app_data::{
    app_data_file_path, read_optional_text_file, steam_collections_path, write_text_file_atomic,
};
use crate::app_data_dir;
use crate::{app_channel, steam::sam};
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct CacheInfo {
    path: String,
    details_bytes: u64,
    hltb_bytes: u64,
    failed_bytes: u64,
}

fn redact_tail(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let tail: String = value
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("***{}", tail)
}

#[tauri::command]
pub(crate) fn get_cache_info(_app: tauri::AppHandle) -> Option<CacheInfo> {
    let dir = app_data_dir()?;
    let file_size = |name: &str| -> u64 {
        std::fs::metadata(dir.join(name))
            .map(|m| m.len())
            .unwrap_or(0)
    };
    Some(CacheInfo {
        path: dir.to_str()?.to_string(),
        details_bytes: file_size("details_cache.json"),
        hltb_bytes: file_size("hltb_cache.json"),
        failed_bytes: file_size("failed_games.json"),
    })
}

#[tauri::command]
pub(crate) fn export_diagnostics(
    _app: tauri::AppHandle,
    steam_path: String,
    steam_id3: String,
    steam_id64: String,
) -> Result<String, String> {
    let data_dir = app_data_dir();
    let collections_path = steam_collections_path(&steam_path, &steam_id3);
    let collections_size = std::fs::metadata(&collections_path).map(|m| m.len()).ok();
    let backup_count = collections_path
        .parent()
        .and_then(|dir| std::fs::read_dir(dir).ok())
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    (name.starts_with("cloud-storage-namespace-1.backup-")
                        || name.starts_with("cloud-storage-namespace-1.pre-restore-"))
                        && name.ends_with(".json")
                })
                .count()
        })
        .unwrap_or(0);

    let cache_size = |name: &str| -> u64 {
        data_dir
            .as_ref()
            .and_then(|dir| std::fs::metadata(dir.join(name)).ok())
            .map(|m| m.len())
            .unwrap_or(0)
    };

    let payload = serde_json::json!({
        "generated_at": chrono::Utc::now().to_rfc3339(),
        "app": {
            "name": app_channel::app_display_name(),
            "version": app_channel::app_version(),
        },
        "system": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "steam": {
            "path": steam_path,
            "steam_id3": redact_tail(&steam_id3),
            "steam_id64": redact_tail(&steam_id64),
            "collections_file_exists": collections_path.exists(),
            "collections_file_size": collections_size,
            "backup_count": backup_count,
        },
        "app_data": {
            "path": data_dir.as_ref().and_then(|p| p.to_str()).unwrap_or("").to_string(),
            "details_cache_bytes": cache_size("details_cache.json"),
            "hltb_cache_bytes": cache_size("hltb_cache.json"),
            "failed_games_bytes": cache_size("failed_games.json"),
            "achievements_bytes": cache_size("achievements.json"),
            "friends_bytes": cache_size("friends.json"),
            "wishlist_bytes": cache_size("wishlist.json"),
            "settings_bytes": cache_size("settings.json"),
        },
        "privacy": {
            "api_key_included": false,
            "proxy_credentials_included": false,
            "steam_ids_redacted": true,
        }
    });

    serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize diagnostics: {}", e))
}

#[tauri::command]
pub(crate) fn load_details_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("details_cache.json")
}

#[tauri::command]
pub(crate) fn save_details_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("details_cache.json", data)
}

#[tauri::command]
pub(crate) fn load_hltb_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("hltb_cache.json")
}

#[tauri::command]
pub(crate) fn save_hltb_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("hltb_cache.json", data)
}

#[tauri::command]
pub(crate) fn load_failed_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("failed_games.json")
}

#[tauri::command]
pub(crate) fn save_failed_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("failed_games.json", data)
}

#[tauri::command]
pub(crate) fn load_achievements_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("achievements.json")
}

#[tauri::command]
pub(crate) fn save_achievements_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("achievements.json", data)
}

#[tauri::command]
pub(crate) fn load_friends_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("friends.json")
}

#[tauri::command]
pub(crate) fn save_friends_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("friends.json", data)
}

#[tauri::command]
pub(crate) fn load_wishlist_cache(_app: tauri::AppHandle) -> Option<String> {
    load_named_cache("wishlist.json")
}

#[tauri::command]
pub(crate) fn save_wishlist_cache(_app: tauri::AppHandle, data: String) -> Result<(), String> {
    save_named_cache("wishlist.json", data)
}

#[tauri::command]
pub(crate) fn is_steam_running() -> bool {
    sam::is_steam_running()
}

pub(crate) fn load_named_cache(name: &str) -> Option<String> {
    let path = app_data_file_path(name).ok()?;
    match read_optional_text_file(&path, "cache file") {
        Ok(data) => data,
        Err(error) => {
            log::debug!("{}", error);
            None
        }
    }
}

pub(crate) fn save_named_cache(name: &str, data: String) -> Result<(), String> {
    let path = app_data_file_path(name)?;
    write_text_file_atomic(&path, &data, "cache file", false)
}
