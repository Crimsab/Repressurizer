use crate::app_data_dir;
use crate::hltb::HltbData;
use crate::http_policy::{
    client_builder_for_scope, configure_http_policy, HttpProxyScope, ProxySettings,
};
use crate::steam::{api, collections};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

mod snapshot;
use snapshot::build_snapshot;

const SNAPSHOT_SCHEMA_VERSION: &str = "repressurizer.library-snapshot.v1";
const STARTUP_DELAY: Duration = Duration::from_secs(10);
const POLL_DELAY: Duration = Duration::from_secs(60);
static AUTOMATION_PUBLISH_RUNNING: AtomicBool = AtomicBool::new(false);

struct AutomationPublishGuard;

impl AutomationPublishGuard {
    fn acquire() -> Option<Self> {
        AUTOMATION_PUBLISH_RUNNING
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .ok()
            .map(|_| Self)
    }
}

impl Drop for AutomationPublishGuard {
    fn drop(&mut self) {
        AUTOMATION_PUBLISH_RUNNING.store(false, Ordering::Release);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AutomationSettings {
    setup_complete: bool,
    steam_path: String,
    steam_id3: String,
    steam_id64: String,
    steam_persona_name: String,
    api_key: String,
    automation_publish_enabled: bool,
    automation_publish_url: String,
    automation_publish_bearer_token: String,
    automation_publish_interval_hours: u64,
    automation_publish_last_checksum: String,
    automation_publish_last_published_at: String,
    automation_publish_last_attempted_at: String,
    #[serde(default)]
    automation_publish_payload: AutomationPublishPayloadSettings,
    #[serde(default)]
    category_colors: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationPublishPayloadSettings {
    #[serde(default = "default_category_mode")]
    category_mode: String,
    #[serde(default)]
    category_keys: Vec<String>,
    #[serde(default = "default_true")]
    include_collection_only_games: bool,
    #[serde(default)]
    require_details: bool,
    #[serde(default)]
    require_hltb: bool,
    #[serde(default)]
    min_steam_hours: Option<f64>,
    #[serde(default)]
    max_steam_hours: Option<f64>,
    #[serde(default)]
    skip_empty_collections: bool,
    #[serde(default = "default_true")]
    include_details: bool,
    #[serde(default = "default_true")]
    include_hltb: bool,
    #[serde(default = "default_true")]
    include_achievements: bool,
    #[serde(default = "default_true")]
    include_wishlist: bool,
    #[serde(default = "default_true")]
    include_ownership: bool,
}

impl Default for AutomationPublishPayloadSettings {
    fn default() -> Self {
        Self {
            category_mode: default_category_mode(),
            category_keys: Vec::new(),
            include_collection_only_games: true,
            require_details: false,
            require_hltb: false,
            min_steam_hours: None,
            max_steam_hours: None,
            skip_empty_collections: false,
            include_details: true,
            include_hltb: true,
            include_achievements: true,
            include_wishlist: true,
            include_ownership: true,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_category_mode() -> String {
    "all".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationLogEntry {
    id: String,
    timestamp: String,
    status: String,
    message: String,
    http_status: u16,
}

#[derive(Debug, Clone)]
struct SnapshotGameInput {
    appid: u64,
    name: String,
    playtime_forever: u64,
    rtime_last_played: u64,
    is_collection_only: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CachedAchievementSummary {
    total: u32,
    achieved: u32,
    #[serde(default)]
    achievements: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WishlistCache {
    #[serde(default)]
    items: Vec<api::WishlistItem>,
    last_fetched: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FamilyCache {
    #[serde(default)]
    apps: Vec<api::FamilyLibraryApp>,
    auth_used: Option<String>,
    owner_steam_id: Option<String>,
    last_fetched: Option<u64>,
}

struct SnapshotData {
    games: Vec<SnapshotGameInput>,
    collections: Vec<collections::SteamCollection>,
    details: HashMap<String, api::GameDetails>,
    hltb_data: HashMap<String, HltbData>,
    achievements: HashMap<String, CachedAchievementSummary>,
    wishlist: WishlistCache,
    family: FamilyCache,
}

pub fn start_worker(_app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;
        loop {
            if let Err(error) = publish_once(false).await {
                log::warn!("Automation export worker failed: {}", error);
            }
            tokio::time::sleep(POLL_DELAY).await;
        }
    });
}

pub fn trigger_publish_now() {
    tauri::async_runtime::spawn(async {
        if let Err(error) = publish_once(true).await {
            log::warn!("Manual automation export failed: {}", error);
        }
    });
}

pub async fn build_snapshot_from_settings() -> Result<Value, String> {
    let settings_value = read_settings_value()?;
    configure_http_policy_from_settings_value(&settings_value)?;
    let settings = parse_settings(&settings_value)?;
    build_snapshot(&settings).await
}

pub async fn publish_now_for_cli() -> Result<Value, String> {
    publish_once(true).await?;
    automation_status_from_settings()
}

pub fn automation_status_from_settings() -> Result<Value, String> {
    let settings_value = match read_settings_value() {
        Ok(value) => value,
        Err(error) => {
            return Ok(json!({
                "settingsAvailable": false,
                "setupComplete": false,
                "publishEnabled": false,
                "publishUrlConfigured": false,
                "error": error,
            }));
        }
    };
    let settings = parse_settings(&settings_value)?;
    Ok(json!({
        "settingsAvailable": true,
        "setupComplete": settings.setup_complete,
        "publishEnabled": settings.automation_publish_enabled,
        "publishUrlConfigured": !settings.automation_publish_url.trim().is_empty(),
        "intervalHours": settings.automation_publish_interval_hours,
        "lastChecksum": string_or_null(&settings.automation_publish_last_checksum),
        "lastPublishedAt": string_or_null(&settings.automation_publish_last_published_at),
        "lastAttemptedAt": string_or_null(&settings.automation_publish_last_attempted_at),
        "lastStatus": settings_value.get("automationPublishLastStatus").cloned().unwrap_or(Value::Null),
        "lastMessage": settings_value.get("automationPublishLastMessage").cloned().unwrap_or(Value::Null),
        "lastHttpStatus": settings_value.get("automationPublishLastHttpStatus").cloned().unwrap_or(Value::Null),
    }))
}

async fn publish_once(force: bool) -> Result<(), String> {
    let Some(_publish_guard) = AutomationPublishGuard::acquire() else {
        log::debug!("Ignoring automation export while another publish is running");
        return if force {
            Err("An automation export is already running".to_string())
        } else {
            Ok(())
        };
    };

    let settings_value = read_settings_value()?;
    configure_http_policy_from_settings_value(&settings_value)?;
    let settings = parse_settings(&settings_value)?;
    if !settings.setup_complete || !settings.automation_publish_enabled {
        return Ok(());
    }

    if settings.automation_publish_url.trim().is_empty() {
        return Ok(());
    }

    if !force && !publish_due(&settings) {
        return Ok(());
    }

    let snapshot = match build_snapshot(&settings).await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            save_status(
                "failed",
                &format!("Automation export failed: {}", error),
                0,
                None,
            )?;
            return Err(error);
        }
    };

    let game_count = snapshot
        .get("summary")
        .and_then(|summary| summary.get("gameCount"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let collection_count = snapshot
        .get("summary")
        .and_then(|summary| summary.get("collectionCount"))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    if game_count == 0 || collection_count == 0 {
        save_status(
            "skipped",
            "Automation export skipped: no library data.",
            0,
            None,
        )?;
        return Ok(());
    }

    let checksum = snapshot
        .get("checksum")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if !force && checksum == settings.automation_publish_last_checksum {
        save_status(
            "skipped",
            "Automation export skipped: snapshot checksum has not changed.",
            0,
            None,
        )?;
        return Ok(());
    }

    let body = serde_json::to_string(&snapshot)
        .map_err(|error| format!("Failed to serialize automation snapshot: {}", error))?;
    match post_json(
        &settings.automation_publish_url,
        &body,
        Some(settings.automation_publish_bearer_token.as_str()),
    )
    .await
    {
        Ok(status) => {
            save_status(
                "success",
                &format!("Automation export published with HTTP {}.", status),
                status,
                Some(checksum),
            )?;
            Ok(())
        }
        Err(error) => {
            save_status(
                "failed",
                &format!("Automation export failed: {}", error),
                0,
                None,
            )?;
            Err(error)
        }
    }
}

async fn post_json(url: &str, body: &str, bearer_token: Option<&str>) -> Result<u16, String> {
    let url = reqwest::Url::parse(url.trim())
        .map_err(|error| format!("Invalid export target URL: {}", error))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Export target URL must use http or https".to_string());
    }

    let client = client_builder_for_scope(HttpProxyScope::Automation)?
        .user_agent(format!("Repressurizer/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .body(body.to_string());
    if let Some(token) = bearer_token
        .map(str::trim)
        .filter(|token| !token.is_empty())
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
    let response_preview = crate::read_response_preview(response).await;
    if !status.is_success() {
        return Err(format!(
            "Automation export returned HTTP {}: {}",
            status.as_u16(),
            response_preview
        ));
    }
    Ok(status.as_u16())
}

fn publish_due(settings: &AutomationSettings) -> bool {
    let base = parse_timestamp(&settings.automation_publish_last_published_at)
        .or_else(|| parse_timestamp(&settings.automation_publish_last_attempted_at));
    let Some(base) = base else {
        return true;
    };
    let interval_hours = settings.automation_publish_interval_hours.max(1) as i64;
    Utc::now() - base >= chrono::Duration::hours(interval_hours)
}

fn parse_timestamp(value: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
}

fn read_settings_value() -> Result<Value, String> {
    crate::read_settings_json()
}

fn parse_settings(value: &Value) -> Result<AutomationSettings, String> {
    serde_json::from_value(value.clone())
        .map_err(|error| format!("Failed to parse automation settings: {}", error))
}

fn configure_http_policy_from_settings_value(value: &Value) -> Result<(), String> {
    let settings = value
        .get("proxySettings")
        .cloned()
        .map(serde_json::from_value::<ProxySettings>)
        .transpose()
        .map_err(|error| format!("Failed to parse proxy settings: {}", error))?
        .unwrap_or_default();
    configure_http_policy(settings)
}

fn save_status(
    status: &str,
    message: &str,
    http_status: u16,
    checksum: Option<String>,
) -> Result<(), String> {
    let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    crate::update_settings_json(move |settings| {
        apply_status_update(settings, status, message, http_status, checksum, &timestamp)
    })
}

fn apply_status_update(
    settings: &mut Value,
    status: &str,
    message: &str,
    http_status: u16,
    checksum: Option<String>,
    timestamp: &str,
) -> Result<(), String> {
    let entry = AutomationLogEntry {
        id: format!("{}-{}-rust", timestamp, status),
        timestamp: timestamp.to_string(),
        status: status.to_string(),
        message: message.to_string(),
        http_status,
    };

    if !settings.is_object() {
        return Err("Settings file must contain a JSON object".to_string());
    }

    settings["automationPublishLastAttemptedAt"] = json!(timestamp);
    settings["automationPublishLastStatus"] = json!(status);
    settings["automationPublishLastMessage"] = json!(message);
    settings["automationPublishLastHttpStatus"] = json!(http_status);
    if let Some(checksum) = checksum {
        settings["automationPublishLastChecksum"] = json!(checksum);
        settings["automationPublishLastPublishedAt"] =
            settings["automationPublishLastAttemptedAt"].clone();
    }

    let mut logs = settings
        .get("automationPublishLogs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    logs.insert(0, serde_json::to_value(entry).unwrap_or(Value::Null));
    logs.truncate(100);
    settings["automationPublishLogs"] = Value::Array(logs);

    Ok(())
}

fn load_cache<T>(name: &str) -> HashMap<String, T>
where
    T: for<'de> Deserialize<'de>,
{
    let Some(path) = app_data_dir().map(|dir| dir.join(name)) else {
        return HashMap::new();
    };
    let Ok(data) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str::<HashMap<String, T>>(&data).unwrap_or_default()
}

fn load_json_file<T>(name: &str) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    let path = app_data_dir()?.join(name);
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<T>(&data).ok()
}

fn round_hours(minutes: u64) -> f64 {
    ((minutes as f64 / 60.0) * 10.0).round() / 10.0
}

fn round_percent(achieved: u32, total: u32) -> f64 {
    ((achieved.min(total) as f64 / total as f64) * 1000.0).round() / 10.0
}

fn iso_from_steam_timestamp(timestamp: u64) -> Option<String> {
    if timestamp == 0 {
        return None;
    }
    chrono::DateTime::<Utc>::from_timestamp(timestamp as i64, 0)
        .map(|date| date.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn iso_from_millis(timestamp: u64) -> Option<String> {
    if timestamp == 0 {
        return None;
    }
    chrono::DateTime::<Utc>::from_timestamp_millis(timestamp as i64)
        .map(|date| date.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn steam_tail(steam_id64: &str) -> Option<String> {
    let trimmed = steam_id64.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars = trimmed.chars().collect::<Vec<_>>();
    let start = chars.len().saturating_sub(4);
    Some(chars[start..].iter().collect())
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_start_matches('#');
    if trimmed.len() == 3 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let expanded = trimmed
            .chars()
            .flat_map(|c| [c, c])
            .collect::<String>()
            .to_uppercase();
        return Some(format!("#{expanded}"));
    }
    if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(format!("#{}", trimmed.to_uppercase()));
    }
    None
}

fn is_favorite_collection(collection: &collections::SteamCollection) -> bool {
    let id = collection.id.to_lowercase();
    let key = collection.key.to_lowercase();
    let name = collection.name.trim().to_lowercase();
    id == "favorite"
        || id == "favorites"
        || key == "favorite"
        || key == "favorites"
        || key.ends_with(".favorite")
        || key.ends_with(".favorites")
        || name == "favorite"
        || name == "favorites"
        || name == "preferiti"
}

fn category_color(
    collection: &collections::SteamCollection,
    colors: &HashMap<String, String>,
) -> Option<String> {
    colors
        .get(&collection.key)
        .and_then(|value| normalize_hex_color(value))
        .or_else(|| {
            colors
                .get(&collection.id)
                .and_then(|value| normalize_hex_color(value))
        })
        .or_else(|| {
            if is_favorite_collection(collection) {
                Some("#D6A43A".to_string())
            } else {
                None
            }
        })
}

fn string_or_null(value: &str) -> Value {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Value::Null
    } else {
        json!(trimmed)
    }
}

fn value_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn stable_stringify(value: &Value) -> String {
    match value {
        Value::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(stable_stringify)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(map) => {
            let mut entries = map.iter().collect::<Vec<_>>();
            entries.sort_by_key(|(key, _)| *key);
            format!(
                "{{{}}}",
                entries
                    .into_iter()
                    .map(|(key, item)| format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_default(),
                        stable_stringify(item)
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        _ => serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()),
    }
}

fn fnv1a32(input: &str) -> u32 {
    let mut hash = 0x811c9dc5u32;
    for code_unit in input.encode_utf16() {
        hash ^= u32::from(code_unit);
        hash = hash.wrapping_mul(0x01000193);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv_matches_typescript_snapshot_hash() {
        assert_eq!(format!("{:08x}", fnv1a32("hello")), "4f9f2cab");
    }

    #[test]
    fn stable_stringify_sorts_object_keys() {
        let value = json!({ "b": 2, "a": { "d": 4, "c": 3 } });
        assert_eq!(stable_stringify(&value), r#"{"a":{"c":3,"d":4},"b":2}"#);
    }

    #[test]
    fn status_updates_preserve_concurrent_settings_changes() {
        let mut settings = json!({
            "theme": "light",
            "automationPublishLogs": [],
        });

        apply_status_update(
            &mut settings,
            "success",
            "Published",
            200,
            Some("checksum".to_string()),
            "2026-07-09T12:00:00.000Z",
        )
        .unwrap();

        assert_eq!(settings["theme"], "light");
        assert_eq!(settings["automationPublishLastStatus"], "success");
        assert_eq!(settings["automationPublishLastChecksum"], "checksum");
    }
}
