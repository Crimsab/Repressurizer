pub mod api;
pub mod app_channel;
pub mod automation;
pub mod categorizer;
mod gg_deals;
pub mod hltb;
pub mod http_policy;
pub mod integration_access;
mod integration_descriptor;
mod integration_runtime;
pub mod mcp;
pub mod steam;

mod app_data;
mod native_crash;
mod runtime_cache;
mod updater;
#[cfg(test)]
use app_data::validate_app_data_key;
pub(crate) use app_data::{
    app_data_dir, read_app_setting_bool, read_settings_json, update_settings_json,
};
use app_data::{
    app_data_file_path, read_app_setting_string, read_optional_text_file,
    read_settings_json_unlocked, settings_file_lock, should_sync_app_data, steam_collections_path,
    write_text_file_atomic,
};

use categorizer::commands;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use steam::api as steam_api;
use steam::collections;
use steam::depressurizer_database;
use steam::depressurizer_profile;
use steam::detector;
use steam::sam;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;

static TRAY_BACKUP_RUNNING: AtomicBool = AtomicBool::new(false);

const HTTP_RESPONSE_PREVIEW_BYTES: usize = 16 * 1024;
const HTTP_RESPONSE_PREVIEW_CHARS: usize = 500;

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
    updater_kind: updater::UpdaterKind,
    updater_can_install: bool,
    updater_target: Option<&'static str>,
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

struct AtomicFlagGuard(&'static AtomicBool);

impl Drop for AtomicFlagGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
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
        .title(app_channel::app_display_name())
        .body(message)
        .show()
    {
        log::debug!("Failed to send tray notification: {}", error);
    }
}

fn create_tray_backup(app: tauri::AppHandle) {
    if TRAY_BACKUP_RUNNING
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        log::debug!("Ignoring tray backup request while another backup is running");
        return;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AtomicFlagGuard(&TRAY_BACKUP_RUNNING);
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
    });
}

fn set_automation_enabled(enabled: bool) -> Result<(), String> {
    update_settings_json(|settings| {
        settings["automationPublishEnabled"] = serde_json::Value::Bool(enabled);
        Ok(())
    })
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
        return Err(format!(
            "Steam collections folder does not exist: {}",
            dir.display()
        ));
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

const AUTOMATION_STATUS_KEYS: &[&str] = &[
    "automationPublishLastAttemptedAt",
    "automationPublishLastStatus",
    "automationPublishLastMessage",
    "automationPublishLastHttpStatus",
    "automationPublishLastChecksum",
    "automationPublishLastPublishedAt",
    "automationPublishLogs",
];

fn preserve_newer_automation_status(incoming: &mut serde_json::Value, current: &serde_json::Value) {
    let incoming_timestamp = incoming
        .get("automationPublishLastAttemptedAt")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let current_timestamp = current
        .get("automationPublishLastAttemptedAt")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if current_timestamp <= incoming_timestamp {
        return;
    }

    for key in AUTOMATION_STATUS_KEYS {
        if let Some(value) = current.get(*key) {
            incoming[*key] = value.clone();
        }
    }
}

// Generic app data persistence — any store can save/load by key
#[tauri::command]
fn load_app_data(_app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = app_data_file_path(&key)?;
    read_optional_text_file(&path, "app data file")
}

#[tauri::command]
fn save_app_data(app: tauri::AppHandle, key: String, data: String) -> Result<(), String> {
    let path = app_data_file_path(&key)?;
    if key == "settings.json" {
        // Release the settings lock before reconciling the runtime. The
        // runtime reads settings through the same lock, so calling it while
        // this guard is alive would deadlock on every integration toggle.
        let result = {
            let _guard = settings_file_lock()
                .lock()
                .map_err(|_| "Settings file lock poisoned".to_string())?;
            let mut incoming = serde_json::from_str::<serde_json::Value>(&data)
                .map_err(|error| format!("Failed to parse settings data: {error}"))?;
            if !incoming.is_object() {
                return Err("Settings data must contain a JSON object".to_string());
            }
            if let Ok(current) = read_settings_json_unlocked() {
                preserve_newer_automation_status(&mut incoming, &current);
            }
            let merged = serde_json::to_string_pretty(&incoming)
                .map_err(|error| format!("Failed to serialize settings data: {error}"))?;
            write_text_file_atomic(&path, &merged, "app data file", true)
        };
        if result.is_ok() {
            if let Some(runtime) = app.try_state::<integration_runtime::IntegrationRuntime>() {
                if let Err(error) = runtime.sync_from_settings() {
                    log::error!("Failed to reconcile local integration runtime: {error}");
                }
            }
        }
        return result;
    }
    write_text_file_atomic(&path, &data, "app data file", should_sync_app_data(&key))
}

// Diary backups — folder snapshots of user-authored diary data.
const DIARY_BACKUP_KEYS: [&str; 8] = [
    "diary.json",
    "diary-templates.json",
    "diary-status-events.json",
    "diary-achievements.json",
    "diary-board.json",
    "reviews.json",
    "notes.json",
    "statuses.json",
];

#[derive(Serialize)]
struct DiaryBackupInfo {
    name: String,
    description: String,
    created_at_ms: u128,
    files: Vec<String>,
}

fn diary_backups_root() -> Result<PathBuf, String> {
    app_data::app_data_dir()
        .map(|dir| dir.join("diary-backups"))
        .ok_or("Could not resolve Repressurizer app data directory".to_string())
}

fn validate_diary_backup_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name.starts_with("diary-backup-")
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err("Invalid diary backup name".to_string());
    }
    Ok(())
}

#[tauri::command]
fn list_diary_backups() -> Result<Vec<DiaryBackupInfo>, String> {
    let root = diary_backups_root()?;
    let mut backups = Vec::new();
    let entries = match std::fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(backups),
        Err(error) => return Err(format!("Failed to read diary backups: {error}")),
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if validate_diary_backup_name(&name).is_err() {
            continue;
        }
        let folder = entry.path();
        if !folder.is_dir() {
            continue;
        }
        let description = std::fs::read_to_string(folder.join("description.txt"))
            .map(|text| text.trim().to_string())
            .unwrap_or_default();
        let created_at_ms = std::fs::metadata(&folder)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        let files = DIARY_BACKUP_KEYS
            .iter()
            .map(|key| key.to_string())
            .filter(|key| folder.join(key).is_file())
            .collect();
        backups.push(DiaryBackupInfo { name, description, created_at_ms, files });
    }
    backups.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(backups)
}

#[tauri::command]
fn create_diary_backup(description: String) -> Result<String, String> {
    let root = diary_backups_root()?;
    std::fs::create_dir_all(&root).map_err(|error| format!("Failed to create diary backups folder: {error}"))?;
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let mut name = format!("diary-backup-{timestamp}");
    let mut attempt = 1;
    while root.join(&name).exists() && attempt < 10_000 {
        name = format!("diary-backup-{timestamp}-{attempt}");
        attempt += 1;
    }
    let folder = root.join(&name);
    std::fs::create_dir_all(&folder).map_err(|error| format!("Failed to create diary backup folder: {error}"))?;
    let mut copied = 0;
    for key in DIARY_BACKUP_KEYS {
        let source = app_data::app_data_file_path(key)?;
        if !source.is_file() {
            continue;
        }
        let data = std::fs::read(&source).map_err(|error| format!("Failed to read {key}: {error}"))?;
        std::fs::write(folder.join(key), data).map_err(|error| format!("Failed to write {key} into backup: {error}"))?;
        copied += 1;
    }
    if copied == 0 {
        let _ = std::fs::remove_dir_all(&folder);
        return Err("No diary data files found to back up".to_string());
    }
    let trimmed = description.trim().chars().take(240).collect::<String>();
    if !trimmed.is_empty() {
        let _ = std::fs::write(folder.join("description.txt"), trimmed);
    }
    Ok(name)
}

#[tauri::command]
fn restore_diary_backup(name: String) -> Result<(), String> {
    validate_diary_backup_name(&name)?;
    let root = diary_backups_root()?;
    let folder = root.join(&name);
    if !folder.is_dir() {
        return Err("Diary backup not found".to_string());
    }
    let mut restored = 0;
    for key in DIARY_BACKUP_KEYS {
        let backup_file = folder.join(key);
        if !backup_file.is_file() {
            continue;
        }
        let data = std::fs::read(&backup_file).map_err(|error| format!("Failed to read {key} from backup: {error}"))?;
        let target = app_data::app_data_file_path(key)?;
        write_text_file_atomic(&target, &String::from_utf8_lossy(&data), "app data file", app_data::should_sync_app_data(key))?;
        restored += 1;
    }
    if restored == 0 {
        return Err("Diary backup contains no data files".to_string());
    }
    Ok(())
}

#[tauri::command]
fn delete_diary_backup(name: String) -> Result<(), String> {
    validate_diary_backup_name(&name)?;
    let folder = diary_backups_root()?.join(&name);
    if !folder.is_dir() {
        return Err("Diary backup not found".to_string());
    }
    std::fs::remove_dir_all(&folder).map_err(|error| format!("Failed to delete diary backup: {error}"))
}


// Export writes run through std::fs so user-picked paths outside the
// app-data scope are allowed (the fs plugin scope would forbid them).
#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    std::fs::write(&target, contents).map_err(|e| format!("Failed to write {path}: {e}"))
}

#[tauri::command]
fn write_export_bundle(root: String, files: std::collections::HashMap<String, String>) -> Result<(), String> {
    let root_path = std::path::PathBuf::from(&root);
    std::fs::create_dir_all(&root_path).map_err(|e| format!("Failed to create export folder: {e}"))?;
    for (relative, contents) in files {
        if std::path::Path::new(&relative).is_absolute() || relative.split('/').any(|seg| seg == "..") {
            return Err(format!("Invalid export path: {relative}"));
        }
        let dest = root_path.join(&relative);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
        }
        std::fs::write(&dest, contents).map_err(|e| format!("Failed to write {relative}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) {
    hide_main_window_handle(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    if let Some(runtime) = app.try_state::<integration_runtime::IntegrationRuntime>() {
        runtime.stop();
    }
    app.exit(0);
}

#[tauri::command]
fn local_integration_status(app: tauri::AppHandle) -> serde_json::Value {
    app.try_state::<integration_runtime::IntegrationRuntime>()
        .map(|runtime| runtime.status())
        .unwrap_or_else(|| serde_json::json!({ "state": "unavailable" }))
}

#[tauri::command]
fn get_startup_context(app: tauri::AppHandle) -> StartupContext {
    let updater = updater::current_capability();
    StartupContext {
        launched_from_autostart: launched_from_autostart(),
        main_window_created: app.get_webview_window("main").is_some(),
        updater_kind: updater.kind,
        updater_can_install: updater.can_install,
        updater_target: updater::current_manifest_target(),
    }
}

#[tauri::command]
async fn post_json_export(input: PostJsonExportInput) -> Result<HttpPublishResult, String> {
    let url = reqwest::Url::parse(input.url.trim())
        .map_err(|e| format!("Invalid export target URL: {}", e))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Export target URL must use http or https".to_string());
    }

    let client = http_policy::client_builder_for_scope(http_policy::HttpProxyScope::Automation)?
        .user_agent(format!(
            "{}/{}",
            app_channel::app_display_name(),
            app_channel::app_version()
        ))
        .timeout(std::time::Duration::from_secs(30))
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

    let response = request.send().await.map_err(|error| {
        format!(
            "Failed to publish automation export: {}",
            error.without_url()
        )
    })?;
    let status = response.status();
    let response_preview = read_response_preview(response).await;

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

pub(crate) async fn read_response_preview(mut response: reqwest::Response) -> String {
    let mut bytes = Vec::new();

    while bytes.len() < HTTP_RESPONSE_PREVIEW_BYTES {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                let remaining = HTTP_RESPONSE_PREVIEW_BYTES - bytes.len();
                bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
            }
            Ok(None) => break,
            Err(error) => {
                log::debug!(
                    "Failed to read automation export response preview: {}",
                    error
                );
                break;
            }
        }
    }

    String::from_utf8_lossy(&bytes)
        .chars()
        .take(HTTP_RESPONSE_PREVIEW_CHARS)
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    native_crash::install_panic_hook();
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
        .manage(integration_runtime::IntegrationRuntime::new())
        .setup(|app| {
            if !app_channel::claim_cross_channel_instance() {
                app.handle().exit(0);
                return Ok(());
            }

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

            let app_name = app_channel::app_display_name();
            let show =
                MenuItem::with_id(app, "show", format!("Open {app_name}"), true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
            let check_updates = MenuItem::with_id(
                app,
                "check_updates",
                "Check / Install Update",
                true,
                None::<&str>,
            )?;
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
            let open_logs = MenuItem::with_id(
                app,
                "open_logs_folder",
                "Open Logs Folder",
                true,
                None::<&str>,
            )?;
            let open_data = MenuItem::with_id(
                app,
                "open_data_folder",
                "Open Data Folder",
                true,
                None::<&str>,
            )?;
            let hide = MenuItem::with_id(app, "hide", "Minimize to Tray", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;
            let separator_three = PredefinedMenuItem::separator(app)?;
            let separator_four = PredefinedMenuItem::separator(app)?;
            let quit =
                MenuItem::with_id(app, "quit", format!("Quit {app_name}"), true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show,
                    &settings,
                    &check_updates,
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
                .tooltip(format!("{app_name} - Steam Library Manager"))
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
                    "check_updates" => {
                        let _ = app.emit("repressurizer-update-action-requested", ());
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
                            open_backups_folder(app).map(|()| "Backups folder opened.".to_string()),
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
                            open_app_data_folder(app).map(|()| "Data folder opened.".to_string()),
                        );
                    }
                    "hide" => {
                        hide_main_window_handle(app);
                    }
                    "quit" => {
                        if let Some(runtime) =
                            app.try_state::<integration_runtime::IntegrationRuntime>()
                        {
                            runtime.stop();
                        }
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
            if let Err(error) = app
                .state::<integration_runtime::IntegrationRuntime>()
                .sync_from_settings()
            {
                log::error!("Failed to start local integration runtime: {error}");
            }

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
                } else if let Some(runtime) = window
                    .app_handle()
                    .try_state::<integration_runtime::IntegrationRuntime>(
                ) {
                    runtime.stop();
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
            runtime_cache::is_steam_running,
            http_policy::configure_http_policy,
            http_policy::test_proxy_profile,
            depressurizer_database::import_depressurizer_database,
            depressurizer_profile::import_depressurizer_profile,
            steam_api::fetch_library,
            steam_api::fetch_steam_app_list,
            steam_api::fetch_game_details,
            steam_api::fetch_store_release_date,
            steam_api::fetch_store_release_dates,
            steam_api::fetch_game_price_overviews,
            gg_deals::fetch_gg_deals_price,
            steam_api::fetch_steam_review_summary,
            steam_api::fetch_achievements,
            steam_api::fetch_achievements_summary,
            sam::load_sam_achievement_schema,
            sam::refresh_sam_achievement_schema,
            sam::probe_sam_bridge,
            sam::sam_achievement_action,
            sam::list_sam_backups,
            sam::sam_backup_dir,
            sam::open_sam_backup_dir,
            steam::shortcuts::load_shortcuts,
            steam::shortcuts::save_shortcuts,
            steam::legacy_sharedconfig::load_legacy_sharedconfig,
            steam::local_library::load_local_license_library,
            steam::local_library::load_installed_library,
            steam_api::fetch_wishlist,
            steam_api::fetch_family_library,
            steam_api::resolve_vanity_url,
            steam_api::fetch_player_summary,
            steam_api::fetch_friend_list,
            commands::run_hours_categorizer,
            commands::run_genre_categorizer,
            commands::run_tags_categorizer,
            commands::run_year_categorizer,
            commands::run_score_categorizer,
            commands::run_devpub_categorizer,
            commands::run_flags_categorizer,
            commands::run_language_categorizer,
            commands::run_platform_categorizer,
            commands::run_name_categorizer,
            runtime_cache::load_details_cache,
            runtime_cache::save_details_cache,
            runtime_cache::load_hltb_cache,
            runtime_cache::save_hltb_cache,
            runtime_cache::load_failed_cache,
            runtime_cache::save_failed_cache,
            runtime_cache::load_achievements_cache,
            runtime_cache::save_achievements_cache,
            runtime_cache::load_friends_cache,
            runtime_cache::save_friends_cache,
            runtime_cache::load_wishlist_cache,
            runtime_cache::save_wishlist_cache,
            runtime_cache::get_cache_info,
            runtime_cache::export_diagnostics,
            hide_main_window,
            quit_app,
            get_startup_context,
            post_json_export,
            load_app_data,
            save_app_data,
            write_export_file,
            write_export_bundle,
            list_diary_backups,
            create_diary_backup,
            restore_diary_backup,
            delete_diary_backup,
            local_integration_status,
            hltb::fetch_hltb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Repressurizer");
}

#[cfg(test)]
mod tests;
