mod steam;
mod categorizer;
mod hltb;

use steam::collections;
use steam::detector;
use steam::api;
use categorizer::commands;
use tauri::Manager;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
struct CacheInfo {
    path: String,
    details_bytes: u64,
    hltb_bytes: u64,
    failed_bytes: u64,
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join("Repressurizer"))
}

fn steam_collections_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json")
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

// Generic app data persistence — any store can save/load by key
#[tauri::command]
fn load_app_data(_app: tauri::AppHandle, key: String) -> Option<String> {
    let path = app_data_dir()?.join(&key);
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_app_data(_app: tauri::AppHandle, key: String, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(&key), data);
    }
}

#[tauri::command]
fn get_cache_info(_app: tauri::AppHandle) -> Option<CacheInfo> {
    let dir = app_data_dir()?;
    let file_size = |name: &str| -> u64 {
        std::fs::metadata(dir.join(name)).map(|m| m.len()).unwrap_or(0)
    };
    Some(CacheInfo {
        path: dir.to_str()?.to_string(),
        details_bytes: file_size("details_cache.json"),
        hltb_bytes: file_size("hltb_cache.json"),
        failed_bytes: file_size("failed_games.json"),
    })
}

#[tauri::command]
fn export_diagnostics(
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
            "name": "Repressurizer",
            "version": env!("CARGO_PKG_VERSION"),
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
            "steam_ids_redacted": true,
        }
    });

    serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize diagnostics: {}", e))
}

#[tauri::command]
fn load_details_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("details_cache.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_details_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("details_cache.json"), data);
    }
}

#[tauri::command]
fn load_hltb_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("hltb_cache.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_hltb_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("hltb_cache.json"), data);
    }
}

#[tauri::command]
fn load_failed_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("failed_games.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_failed_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("failed_games.json"), data);
    }
}

#[tauri::command]
fn load_achievements_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("achievements.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_achievements_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("achievements.json"), data);
    }
}

#[tauri::command]
fn load_friends_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("friends.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_friends_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("friends.json"), data);
    }
}

#[tauri::command]
fn load_wishlist_cache(_app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir()?.join("wishlist.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn save_wishlist_cache(_app: tauri::AppHandle, data: String) {
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("wishlist.json"), data);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // System tray setup
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};

            let show = MenuItem::with_id(app, "show", "Show Repressurizer", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("Repressurizer - Steam Library Manager")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Double-click (or single left-click) to toggle window visibility
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close if setting enabled
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Read minimize_to_tray setting from app data
                if let Some(dir) = app_data_dir() {
                    let settings_path = dir.join("settings.json");
                    if let Ok(data) = std::fs::read_to_string(&settings_path) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&data) {
                            if v.get("minimizeToTray").and_then(|v| v.as_bool()).unwrap_or(false) {
                                api.prevent_close();
                                let _ = window.hide();
                            }
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            detector::detect_steam,
            detector::detect_steam_at,
            collections::load_collections,
            collections::save_collections,
            collections::list_backups,
            collections::restore_backup,
            collections::delete_backup,
            collections::create_manual_backup,
            api::fetch_library,
            api::fetch_game_details,
            api::fetch_achievements,
            api::fetch_achievements_summary,
            api::fetch_wishlist,
            api::fetch_family_library,
            api::resolve_vanity_url,
            api::fetch_player_summary,
            commands::run_hours_categorizer,
            commands::run_genre_categorizer,
            commands::run_tags_categorizer,
            commands::run_year_categorizer,
            commands::run_score_categorizer,
            load_details_cache,
            save_details_cache,
            load_hltb_cache,
            save_hltb_cache,
            load_failed_cache,
            save_failed_cache,
            load_achievements_cache,
            save_achievements_cache,
            load_friends_cache,
            save_friends_cache,
            load_wishlist_cache,
            save_wishlist_cache,
            get_cache_info,
            export_diagnostics,
            load_app_data,
            save_app_data,
            hltb::fetch_hltb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Repressurizer");
}
