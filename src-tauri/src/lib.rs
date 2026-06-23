pub mod automation;
pub mod categorizer;
pub mod hltb;
pub mod steam;

use categorizer::commands;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use steam::api;
use steam::collections;
use steam::detector;
use steam::sam;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

static TRAY_BACKUP_RUNNING: AtomicBool = AtomicBool::new(false);

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupContext {
    launched_from_autostart: bool,
    main_window_created: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayBackupSettings {
    setup_complete: bool,
    steam_path: String,
    steam_id3: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrayBackupResult {
    success: bool,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrayMessage {
    level: String,
    message: String,
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

fn settings_file_path() -> Result<PathBuf, String> {
    app_data_dir()
        .map(|dir| dir.join("settings.json"))
        .ok_or("Could not resolve Repressurizer app data directory".to_string())
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

fn read_settings_json() -> Result<serde_json::Value, String> {
    let settings_path = settings_file_path()?;
    let data = std::fs::read_to_string(&settings_path)
        .map_err(|error| format!("Failed to read settings file {}: {}", settings_path.display(), error))?;
    serde_json::from_str::<serde_json::Value>(&data)
        .map_err(|error| format!("Failed to parse settings file {}: {}", settings_path.display(), error))
}

fn write_settings_json(value: &serde_json::Value) -> Result<(), String> {
    let settings_path = settings_file_path()?;
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create settings directory: {}", error))?;
    }
    let data = serde_json::to_string(value)
        .map_err(|error| format!("Failed to serialize settings: {}", error))?;
    std::fs::write(&settings_path, data)
        .map_err(|error| format!("Failed to write settings file {}: {}", settings_path.display(), error))
}

fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == "--repressurizer-autostart")
}

fn ensure_main_window(app: &tauri::AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window);
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .or_else(|| app.config().app.windows.first())
        .expect("main window config missing");

    tauri::WebviewWindowBuilder::from_config(app, window_config)?.build()
}

fn set_webview_memory_target(window: &tauri::WebviewWindow, low: bool) {
    #[cfg(target_os = "windows")]
    {
        let target_name = if low { "low" } else { "normal" };
        let target_level = if low {
            webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };

        if let Err(error) = window.with_webview(move |webview| {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_19;
            use windows_core::Interface;

            let result = unsafe {
                webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_19>())
                    .and_then(|core| core.SetMemoryUsageTargetLevel(target_level))
            };

            if let Err(error) = result {
                log::debug!(
                    "Failed to set WebView2 memory target to {}: {}",
                    target_name,
                    error
                );
            }
        }) {
            log::debug!(
                "Failed to access WebView2 for memory target {}: {}",
                target_name,
                error
            );
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, low);
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    match ensure_main_window(app) {
        Ok(window) => {
            set_webview_memory_target(&window, false);
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            let _ = app.emit("repressurizer-window-shown", ());
        }
        Err(error) => {
            log::error!("Failed to create/show main window: {}", error);
        }
    }
}

fn hide_main_window_handle(app: &tauri::AppHandle) {
    let _ = app.emit("repressurizer-window-hidden", ());
    if let Some(window) = app.get_webview_window("main") {
        set_webview_memory_target(&window, true);
        let _ = window.hide();
    }
}

fn read_tray_backup_settings() -> Result<TrayBackupSettings, String> {
    serde_json::from_value(read_settings_json()?)
        .map_err(|error| format!("Failed to parse tray backup settings: {}", error))
}

fn create_backup_from_saved_settings() -> Result<(), String> {
    let settings = read_tray_backup_settings()?;
    if !settings.setup_complete {
        return Err("Complete setup before creating a backup.".to_string());
    }
    if settings.steam_path.trim().is_empty() || settings.steam_id3.trim().is_empty() {
        return Err("Steam path and Steam user ID are required to create a backup.".to_string());
    }

    collections::create_manual_backup(
        settings.steam_path,
        settings.steam_id3,
        "Manual backup from tray".to_string(),
    )
}

fn is_main_window_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn notify_tray_message(app: &tauri::AppHandle, level: &str, message: &str, ui_visible: bool) {
    if ui_visible {
        let _ = app.emit(
            "repressurizer-tray-message",
            TrayMessage {
                level: level.to_string(),
                message: message.to_string(),
            },
        );
        return;
    }

    if let Err(error) = app
        .notification()
        .builder()
        .title("Repressurizer")
        .body(message)
        .show()
    {
        log::debug!("Failed to send tray notification: {}", error);
    }
}

fn create_tray_backup(app: tauri::AppHandle) {
    if TRAY_BACKUP_RUNNING.swap(true, Ordering::SeqCst) {
        log::debug!("Ignoring tray backup request while another backup is running");
        return;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let result = match create_backup_from_saved_settings() {
            Ok(()) => {
                log::info!("Manual backup created from tray");
                TrayBackupResult {
                    success: true,
                    message: "Manual backup created.".to_string(),
                }
            }
            Err(error) => {
                log::error!("Manual backup from tray failed: {}", error);
                TrayBackupResult {
                    success: false,
                    message: format!("Backup failed: {}", error),
                }
            }
        };

        let ui_visible = is_main_window_visible(&app);
        notify_tray_message(
            &app,
            if result.success { "success" } else { "error" },
            &result.message,
            ui_visible,
        );
        TRAY_BACKUP_RUNNING.store(false, Ordering::SeqCst);
    });
}

fn set_automation_enabled(enabled: bool) -> Result<(), String> {
    let mut settings = read_settings_json()?;
    settings["automationPublishEnabled"] = serde_json::Value::Bool(enabled);
    write_settings_json(&settings)
}

fn automation_status_message() -> Result<String, String> {
    let settings = read_settings_json()?;
    let enabled = settings
        .get("automationPublishEnabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let url_configured = settings
        .get("automationPublishUrl")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .is_some_and(|url| !url.is_empty());
    let status = settings
        .get("automationPublishLastStatus")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let message = settings
        .get("automationPublishLastMessage")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let http_status = settings
        .get("automationPublishLastHttpStatus")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);

    if !enabled {
        return Ok("Automation is paused.".to_string());
    }
    if !url_configured {
        return Ok("Automation is enabled, but the export URL is not configured.".to_string());
    }
    if status.is_empty() {
        return Ok("Automation is enabled. No publish has run yet.".to_string());
    }

    let http = if http_status > 0 {
        format!(" HTTP {}.", http_status)
    } else {
        String::new()
    };
    let detail = if message.trim().is_empty() {
        String::new()
    } else {
        format!(" {}", message.trim())
    };
    Ok(format!("Automation {}.{}{}", status, http, detail))
}

#[allow(deprecated)]
fn open_path(app: &tauri::AppHandle, path: PathBuf) -> Result<(), String> {
    app.shell()
        .open(path.to_string_lossy().to_string(), None)
        .map_err(|error| format!("Failed to open {}: {}", path.display(), error))
}

fn open_app_data_folder(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app_data_dir().ok_or("Could not resolve Repressurizer app data directory")?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create data folder {}: {}", dir.display(), error))?;
    open_path(app, dir)
}

fn open_logs_folder(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Could not resolve Repressurizer log folder: {}", error))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create log folder {}: {}", dir.display(), error))?;
    open_path(app, dir)
}

fn open_backups_folder(app: &tauri::AppHandle) -> Result<(), String> {
    let settings = read_tray_backup_settings()?;
    if settings.steam_path.trim().is_empty() || settings.steam_id3.trim().is_empty() {
        return Err("Steam path and Steam user ID are required to open backups.".to_string());
    }
    let collections_path = steam_collections_path(&settings.steam_path, &settings.steam_id3);
    let dir = collections_path
        .parent()
        .ok_or("Could not resolve Steam collections folder")?
        .to_path_buf();
    if !dir.exists() {
        return Err(format!("Steam collections folder does not exist: {}", dir.display()));
    }
    open_path(app, dir)
}

fn notify_result(app: &tauri::AppHandle, result: Result<String, String>) {
    let ui_visible = is_main_window_visible(app);
    match result {
        Ok(message) => notify_tray_message(app, "success", &message, ui_visible),
        Err(error) => notify_tray_message(app, "error", &error, ui_visible),
    }
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
    hide_main_window_handle(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_startup_context(app: tauri::AppHandle) -> StartupContext {
    StartupContext {
        launched_from_autostart: launched_from_autostart(),
        main_window_created: app.get_webview_window("main").is_some(),
    }
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
            show_main_window(app);
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
            let settings = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
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
            let automation_toggle = MenuItem::with_id(
                app,
                "toggle_automation",
                "Pause/Resume Automation",
                true,
                None::<&str>,
            )?;
            let automation_status = MenuItem::with_id(
                app,
                "automation_status",
                "Last Publish Status",
                true,
                None::<&str>,
            )?;
            let open_backups = MenuItem::with_id(
                app,
                "open_backups_folder",
                "Open Backups Folder",
                true,
                None::<&str>,
            )?;
            let open_logs =
                MenuItem::with_id(app, "open_logs_folder", "Open Logs Folder", true, None::<&str>)?;
            let open_data =
                MenuItem::with_id(app, "open_data_folder", "Open Data Folder", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Minimize to Tray", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;
            let separator_three = PredefinedMenuItem::separator(app)?;
            let separator_four = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Repressurizer", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &settings,
                    &separator,
                    &refresh,
                    &backup,
                    &publish,
                    &separator_two,
                    &automation_toggle,
                    &automation_status,
                    &separator_three,
                    &open_backups,
                    &open_logs,
                    &open_data,
                    &separator_four,
                    &hide,
                    &quit,
                ],
            )?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("Repressurizer - Steam Library Manager")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "refresh_library" => {
                        show_main_window(app);
                        let _ = app.emit("repressurizer-refresh-library-requested", ());
                    }
                    "settings" => {
                        show_main_window(app);
                        let _ = app.emit("repressurizer-open-settings-requested", ());
                    }
                    "publish_snapshot" => {
                        automation::trigger_publish_now();
                        notify_tray_message(
                            app,
                            "info",
                            "Automation publish queued. Check status again shortly.",
                            is_main_window_visible(app),
                        );
                    }
                    "create_backup" => {
                        create_tray_backup(app.clone());
                    }
                    "toggle_automation" => {
                        let next_enabled =
                            !read_app_setting_bool("automationPublishEnabled").unwrap_or(false);
                        let result = set_automation_enabled(next_enabled).map(|()| {
                            let _ = app.emit("repressurizer-settings-updated", ());
                            if next_enabled {
                                "Automation resumed.".to_string()
                            } else {
                                "Automation paused.".to_string()
                            }
                        });
                        notify_result(app, result);
                    }
                    "automation_status" => {
                        notify_result(app, automation_status_message());
                    }
                    "open_backups_folder" => {
                        notify_result(
                            app,
                            open_backups_folder(app)
                                .map(|()| "Backups folder opened.".to_string()),
                        );
                    }
                    "open_logs_folder" => {
                        notify_result(
                            app,
                            open_logs_folder(app).map(|()| "Logs folder opened.".to_string()),
                        );
                    }
                    "open_data_folder" => {
                        notify_result(
                            app,
                            open_app_data_folder(app)
                                .map(|()| "Data folder opened.".to_string()),
                        );
                    }
                    "hide" => {
                        hide_main_window_handle(app);
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
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            let tray_only_startup = launched_from_autostart()
                && read_app_setting_bool("startOnLogin").unwrap_or(false)
                && read_app_setting_string("startOnLoginMode").as_deref() != Some("window");

            if tray_only_startup {
                hide_main_window_handle(app.handle());
            } else {
                show_main_window(app.handle());
            }

            automation::start_worker(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if read_app_setting_bool("minimizeToTray").unwrap_or(false) {
                    api.prevent_close();
                    if let Some(webview_window) =
                        window.app_handle().get_webview_window(window.label())
                    {
                        set_webview_memory_target(&webview_window, true);
                    }
                    let _ = window.emit("repressurizer-window-hidden", ());
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
            get_startup_context,
            post_json_export,
            load_app_data,
            save_app_data,
            hltb::fetch_hltb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Repressurizer");
}
