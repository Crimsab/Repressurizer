pub mod categorizer;
pub mod hltb;
pub mod steam;

use categorizer::commands;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use steam::api;
use steam::collections;
use steam::detector;
use steam::sam;
use tauri::{Emitter, Manager};

#[derive(Serialize)]
struct CacheInfo {
    path: String,
    details_bytes: u64,
    hltb_bytes: u64,
    failed_bytes: u64,
}

#[derive(Serialize)]
struct HttpPublishResult {
    status: u16,
    response_preview: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostJsonExportInput {
    url: String,
    body: String,
    bearer_token: Option<String>,
}

pub(crate) fn app_data_dir() -> Option<PathBuf> {
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

pub(crate) fn read_app_setting_bool(key: &str) -> Option<bool> {
    let settings_path = app_data_dir()?.join("settings.json");
    let data = std::fs::read_to_string(settings_path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    value.get(key).and_then(|v| v.as_bool())
}

fn read_app_setting_string(key: &str) -> Option<String> {
    let settings_path = app_data_dir()?.join("settings.json");
    let data = std::fs::read_to_string(settings_path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == "--repressurizer-autostart")
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
fn hide_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn post_json_export(input: PostJsonExportInput) -> Result<HttpPublishResult, String> {
    let url = reqwest::Url::parse(input.url.trim())
        .map_err(|e| format!("Invalid export target URL: {}", e))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Export target URL must use http or https".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent(format!("Repressurizer/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .body(input.body);

    if let Some(token) = input
        .bearer_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        request = request.bearer_auth(token);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to publish automation export: {}", e))?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    let response_preview = text.chars().take(500).collect::<String>();

    if !status.is_success() {
        return Err(format!(
            "Automation export returned HTTP {}: {}",
            status.as_u16(),
            response_preview
        ));
    }

    Ok(HttpPublishResult {
        status: status.as_u16(),
        response_preview,
    })
}

#[tauri::command]
fn get_cache_info(_app: tauri::AppHandle) -> Option<CacheInfo> {
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
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("repressurizer.log".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            log::info!(
                "Second Repressurizer instance requested: argv={:?}, cwd={}",
                argv,
                cwd
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit("repressurizer-second-instance-requested", ());
        }));
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec!["--repressurizer-autostart"]),
                ))?;
            }

            // System tray setup
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show = MenuItem::with_id(app, "show", "Open Repressurizer", true, None::<&str>)?;
            let refresh = MenuItem::with_id(
                app,
                "refresh_library",
                "Refresh Steam Library",
                true,
                None::<&str>,
            )?;
            let publish = MenuItem::with_id(
                app,
                "publish_snapshot",
                "Publish Snapshot Now",
                true,
                None::<&str>,
            )?;
            let backup =
                MenuItem::with_id(app, "create_backup", "Create Backup", true, None::<&str>)?;
            let settings =
                MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Minimize to Tray", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Repressurizer", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &refresh,
                    &publish,
                    &backup,
                    &separator,
                    &settings,
                    &hide,
                    &separator_two,
                    &quit,
                ],
            )?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("Repressurizer - Steam Library Manager")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "refresh_library" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("repressurizer-refresh-library-requested", ());
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("repressurizer-open-settings-requested", ());
                    }
                    "publish_snapshot" => {
                        let _ = app.emit("repressurizer-publish-automation-requested", ());
                    }
                    "create_backup" => {
                        let _ = app.emit("repressurizer-create-backup-requested", ());
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
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            if launched_from_autostart()
                && read_app_setting_bool("startOnLogin").unwrap_or(false)
                && read_app_setting_string("startOnLoginMode").as_deref() != Some("window")
            {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if read_app_setting_bool("minimizeToTray").unwrap_or(false) {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }

                if !read_app_setting_bool("trayCloseChoiceMade").unwrap_or(false) {
                    api.prevent_close();
                    let _ = window.emit("repressurizer-close-requested", ());
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
            api::fetch_steam_app_list,
            api::fetch_game_details,
            api::fetch_achievements,
            api::fetch_achievements_summary,
            sam::load_sam_achievement_schema,
            sam::probe_sam_bridge,
            sam::sam_achievement_action,
            sam::list_sam_backups,
            sam::sam_backup_dir,
            sam::open_sam_backup_dir,
            api::fetch_wishlist,
            api::fetch_family_library,
            api::resolve_vanity_url,
            api::fetch_player_summary,
            api::fetch_friend_list,
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
            hide_main_window,
            quit_app,
            post_json_export,
            load_app_data,
            save_app_data,
            hltb::fetch_hltb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Repressurizer");
}
