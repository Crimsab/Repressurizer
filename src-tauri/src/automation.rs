use crate::app_data_dir;
use crate::hltb::HltbData;
use crate::steam::{api, collections};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::time::Duration;

const SNAPSHOT_SCHEMA_VERSION: &str = "repressurizer.library-snapshot.v1";
const STARTUP_DELAY: Duration = Duration::from_secs(10);
const POLL_DELAY: Duration = Duration::from_secs(60);

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

async fn publish_once(force: bool) -> Result<(), String> {
    let mut settings_value = read_settings_value()?;
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
                &mut settings_value,
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
            &mut settings_value,
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
            &mut settings_value,
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
                &mut settings_value,
                "success",
                &format!("Automation export published with HTTP {}.", status),
                status,
                Some(checksum),
            )?;
            Ok(())
        }
        Err(error) => {
            save_status(
                &mut settings_value,
                "failed",
                &format!("Automation export failed: {}", error),
                0,
                None,
            )?;
            Err(error)
        }
    }
}

async fn build_snapshot(settings: &AutomationSettings) -> Result<Value, String> {
    if settings.api_key.trim().is_empty() || settings.steam_id64.trim().is_empty() {
        return Err("Steam Web API key and Steam ID are required.".to_string());
    }

    let (owned_games, collections) = tokio::try_join!(
        api::fetch_library(settings.api_key.clone(), settings.steam_id64.clone()),
        async {
            collections::load_collections(settings.steam_path.clone(), settings.steam_id3.clone())
        }
    )?;

    let details: HashMap<String, api::GameDetails> = load_cache("details_cache.json");
    let hltb_data: HashMap<String, HltbData> = load_cache("hltb_cache.json");
    let games = merge_collection_only_games(owned_games, &collections, &details);

    Ok(build_library_snapshot(
        games,
        collections,
        details,
        hltb_data,
        settings,
    ))
}

fn merge_collection_only_games(
    owned_games: Vec<api::OwnedGame>,
    collections: &[collections::SteamCollection],
    details: &HashMap<String, api::GameDetails>,
) -> Vec<SnapshotGameInput> {
    let mut games: BTreeMap<u64, SnapshotGameInput> = owned_games
        .into_iter()
        .map(|game| {
            (
                game.appid,
                SnapshotGameInput {
                    appid: game.appid,
                    name: game.name,
                    playtime_forever: game.playtime_forever,
                    rtime_last_played: game.rtime_last_played,
                    is_collection_only: false,
                },
            )
        })
        .collect();

    for appid in collections
        .iter()
        .filter(|collection| !collection.is_deleted)
        .flat_map(|collection| collection.added.iter().copied())
    {
        games.entry(appid).or_insert_with(|| {
            let name = details
                .get(&appid.to_string())
                .map(|details| details.name.clone())
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| format!("#{}", appid));
            SnapshotGameInput {
                appid,
                name,
                playtime_forever: 0,
                rtime_last_played: 0,
                is_collection_only: true,
            }
        });
    }

    games.into_values().collect()
}

fn build_library_snapshot(
    mut games: Vec<SnapshotGameInput>,
    collections: Vec<collections::SteamCollection>,
    details: HashMap<String, api::GameDetails>,
    hltb_data: HashMap<String, HltbData>,
    settings: &AutomationSettings,
) -> Value {
    let mut exported_collections: Vec<Value> = collections
        .iter()
        .filter(|collection| !collection.is_deleted)
        .map(|collection| {
            let mut app_ids = collection.added.clone();
            app_ids.sort_unstable();
            json!({
                "key": collection.key,
                "name": collection.name,
                "isDynamic": collection.is_dynamic,
                "gameCount": collection.added.len(),
                "appIds": app_ids,
            })
        })
        .collect();
    exported_collections.sort_by(|a, b| {
        let an = value_str(a, "name");
        let bn = value_str(b, "name");
        an.cmp(&bn)
            .then_with(|| value_str(a, "key").cmp(&value_str(b, "key")))
    });

    let mut collection_refs: HashMap<u64, Vec<Value>> = HashMap::new();
    for collection in &exported_collections {
        let key = value_str(collection, "key");
        let name = value_str(collection, "name");
        let is_dynamic = collection
            .get("isDynamic")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        for appid in collection
            .get("appIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_u64)
        {
            collection_refs.entry(appid).or_default().push(json!({
                "key": key,
                "name": name,
                "isDynamic": is_dynamic,
            }));
        }
    }

    games.sort_by_key(|game| game.appid);
    let exported_games: Vec<Value> = games
        .into_iter()
        .map(|game| {
            let mut refs = collection_refs.remove(&game.appid).unwrap_or_default();
            refs.sort_by(|a, b| {
                let an = value_str(a, "name");
                let bn = value_str(b, "name");
                an.cmp(&bn)
                    .then_with(|| value_str(a, "key").cmp(&value_str(b, "key")))
            });
            let details = details.get(&game.appid.to_string());
            let hltb = hltb_data.get(&game.appid.to_string());
            json!({
                "appId": game.appid,
                "name": game.name,
                "playtimeForeverMinutes": game.playtime_forever,
                "playtimeForeverHours": round_hours(game.playtime_forever),
                "rtimeLastPlayed": game.rtime_last_played,
                "lastPlayedAt": iso_from_steam_timestamp(game.rtime_last_played),
                "isCollectionOnly": game.is_collection_only,
                "collections": refs,
                "details": details.map(details_export).unwrap_or(Value::Null),
                "hltb": hltb.and_then(hltb_export).unwrap_or(Value::Null),
            })
        })
        .collect();

    let hltb_count = exported_games
        .iter()
        .filter(|game| !game.get("hltb").unwrap_or(&Value::Null).is_null())
        .count();
    let payload = json!({
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "source": {
            "app": "Repressurizer",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "steam": {
            "steamId64Tail": steam_tail(&settings.steam_id64),
            "personaName": string_or_null(&settings.steam_persona_name),
        },
        "summary": {
            "gameCount": exported_games.len(),
            "collectionCount": exported_collections.len(),
            "hltbCount": hltb_count,
        },
        "collections": exported_collections,
        "games": exported_games,
    });
    let checksum = format!("fnv1a32:{:08x}", fnv1a32(&stable_stringify(&payload)));

    json!({
        "generatedAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "schemaVersion": payload["schemaVersion"],
        "source": payload["source"],
        "steam": payload["steam"],
        "summary": payload["summary"],
        "collections": payload["collections"],
        "games": payload["games"],
        "checksum": checksum,
    })
}

fn details_export(details: &api::GameDetails) -> Value {
    let mut genres = details.genres.clone();
    let mut categories = details.categories.clone();
    let mut developers = details.developers.clone();
    let mut publishers = details.publishers.clone();
    genres.sort();
    categories.sort();
    developers.sort();
    publishers.sort();
    json!({
        "releaseDate": details.release_date,
        "genres": genres,
        "categories": categories,
        "metacriticScore": details.metacritic_score,
        "developers": developers,
        "publishers": publishers,
        "platforms": {
            "windows": details.platforms.windows,
            "mac": details.platforms.mac,
            "linux": details.platforms.linux,
        },
        "isFree": details.is_free,
        "priceFinal": details.price_final,
        "priceCurrency": details.price_currency,
    })
}

fn hltb_export(hltb: &HltbData) -> Option<Value> {
    if hltb.main_story.is_none() && hltb.main_extra.is_none() && hltb.completionist.is_none() {
        return None;
    }
    Some(json!({
        "source": "howlongtobeat",
        "mainStory": hltb.main_story,
        "mainExtra": hltb.main_extra,
        "completionist": hltb.completionist,
        "hltbGameId": hltb.game_id,
        "matchedName": hltb.game_name,
        "confidence": hltb.confidence,
    }))
}

async fn post_json(url: &str, body: &str, bearer_token: Option<&str>) -> Result<u16, String> {
    let url = reqwest::Url::parse(url.trim())
        .map_err(|error| format!("Invalid export target URL: {}", error))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Export target URL must use http or https".to_string());
    }

    let client = reqwest::Client::builder()
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

    let response = request
        .send()
        .await
        .map_err(|error| format!("Failed to publish automation export: {}", error))?;
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
    let path = settings_path().ok_or("Could not resolve Repressurizer app data directory")?;
    let data = std::fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read settings file {}: {}", path.display(), error))?;
    serde_json::from_str::<Value>(&data).map_err(|error| {
        format!(
            "Failed to parse settings file {}: {}",
            path.display(),
            error
        )
    })
}

fn parse_settings(value: &Value) -> Result<AutomationSettings, String> {
    serde_json::from_value(value.clone())
        .map_err(|error| format!("Failed to parse automation settings: {}", error))
}

fn save_settings_value(value: &Value) -> Result<(), String> {
    let path = settings_path().ok_or("Could not resolve Repressurizer app data directory")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create app data directory: {}", error))?;
    }
    let data = serde_json::to_string(value)
        .map_err(|error| format!("Failed to serialize settings: {}", error))?;
    std::fs::write(&path, data).map_err(|error| {
        format!(
            "Failed to write settings file {}: {}",
            path.display(),
            error
        )
    })
}

fn settings_path() -> Option<PathBuf> {
    app_data_dir().map(|dir| dir.join("settings.json"))
}

fn save_status(
    settings: &mut Value,
    status: &str,
    message: &str,
    http_status: u16,
    checksum: Option<String>,
) -> Result<(), String> {
    let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let entry = AutomationLogEntry {
        id: format!("{}-{}-rust", timestamp, status),
        timestamp: timestamp.clone(),
        status: status.to_string(),
        message: message.to_string(),
        http_status,
    };

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

    save_settings_value(settings)
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

fn round_hours(minutes: u64) -> f64 {
    ((minutes as f64 / 60.0) * 10.0).round() / 10.0
}

fn iso_from_steam_timestamp(timestamp: u64) -> Option<String> {
    if timestamp == 0 {
        return None;
    }
    chrono::DateTime::<Utc>::from_timestamp(timestamp as i64, 0)
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
            entries.sort_by(|(a, _), (b, _)| a.cmp(b));
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
}
