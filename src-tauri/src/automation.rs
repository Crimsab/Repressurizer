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
    #[serde(default)]
    automation_publish_payload: AutomationPublishPayloadSettings,
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
    let mut settings_value = read_settings_value()?;
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
    let achievements: HashMap<String, CachedAchievementSummary> = load_cache("achievements.json");
    let wishlist: WishlistCache = load_json_file("wishlist.json").unwrap_or_default();
    let family: FamilyCache = load_json_file("steam_family.json").unwrap_or_default();
    let games = merge_collection_only_games(owned_games, &collections, &details);

    Ok(build_library_snapshot(
        games,
        collections,
        details,
        hltb_data,
        achievements,
        wishlist,
        family,
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
    achievements: HashMap<String, CachedAchievementSummary>,
    wishlist: WishlistCache,
    family: FamilyCache,
    settings: &AutomationSettings,
) -> Value {
    let payload_settings = &settings.automation_publish_payload;
    let selected_category_keys: HashSet<String> = payload_settings
        .category_keys
        .iter()
        .map(|key| key.trim())
        .filter(|key| !key.is_empty())
        .map(ToString::to_string)
        .collect();
    let category_filter_active = payload_settings.category_mode == "custom";
    let selected_collections: Vec<&collections::SteamCollection> = collections
        .iter()
        .filter(|collection| {
            !collection.is_deleted
                && (!category_filter_active || selected_category_keys.contains(&collection.key))
        })
        .collect();

    let selected_collection_app_ids: HashSet<u64> = selected_collections
        .iter()
        .flat_map(|collection| collection.added.iter().copied())
        .collect();

    games.retain(|game| {
        if category_filter_active && !selected_collection_app_ids.contains(&game.appid) {
            return false;
        }
        if !payload_settings.include_collection_only_games && game.is_collection_only {
            return false;
        }
        let steam_hours = round_hours(game.playtime_forever);
        if payload_settings
            .min_steam_hours
            .is_some_and(|min| steam_hours < min)
        {
            return false;
        }
        if payload_settings
            .max_steam_hours
            .is_some_and(|max| steam_hours > max)
        {
            return false;
        }
        let appid = game.appid.to_string();
        if payload_settings.require_details && !details.contains_key(&appid) {
            return false;
        }
        if payload_settings.require_hltb && hltb_data.get(&appid).and_then(hltb_export).is_none() {
            return false;
        }
        true
    });

    let included_game_ids: HashSet<u64> = games.iter().map(|game| game.appid).collect();
    let mut exported_collections: Vec<Value> = selected_collections
        .iter()
        .filter_map(|collection| {
            let mut app_ids = collection
                .added
                .iter()
                .copied()
                .filter(|appid| included_game_ids.contains(appid))
                .collect::<Vec<_>>();
            app_ids.sort_unstable();
            if payload_settings.skip_empty_collections && app_ids.is_empty() {
                return None;
            }
            Some(json!({
                "key": collection.key,
                "name": collection.name,
                "isDynamic": collection.is_dynamic,
                "gameCount": app_ids.len(),
                "appIds": app_ids,
            }))
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

    let wishlist_fetched_at = wishlist.last_fetched.and_then(iso_from_millis);
    let wishlist_by_appid = wishlist
        .items
        .into_iter()
        .map(|item| (item.appid, item))
        .collect::<HashMap<_, _>>();
    let family_fetched_at = family.last_fetched.and_then(iso_from_millis);
    let family_auth_used = family.auth_used.clone();
    let family_owner_tail = family.owner_steam_id.as_deref().and_then(steam_tail);
    let family_by_appid = family
        .apps
        .into_iter()
        .map(|app| (app.appid, app))
        .collect::<HashMap<_, _>>();

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
            let details_exported = if payload_settings.include_details {
                details.map(details_export)
            } else {
                None
            };
            let hltb_exported = if payload_settings.include_hltb {
                hltb.and_then(hltb_export)
            } else {
                None
            };
            let achievement_exported = if payload_settings.include_achievements {
                achievements
                    .get(&game.appid.to_string())
                    .map(achievement_export)
            } else {
                None
            };
            let wishlist_exported = if payload_settings.include_wishlist {
                wishlist_by_appid
                    .get(&game.appid)
                    .map(|item| wishlist_export(item, wishlist_fetched_at.as_deref()))
            } else {
                None
            };
            let ownership_exported = if payload_settings.include_ownership {
                family_by_appid.get(&game.appid).map(|app| {
                    ownership_export(
                        app,
                        family_auth_used.as_deref(),
                        family_owner_tail.as_deref(),
                        family_fetched_at.as_deref(),
                    )
                })
            } else {
                None
            };
            let flags = flags_export(
                game.is_collection_only,
                details_exported.is_some(),
                hltb_exported.is_some(),
                achievement_exported.as_ref(),
                wishlist_exported.as_ref(),
                ownership_exported.as_ref(),
            );
            json!({
                "appId": game.appid,
                "name": game.name,
                "playtimeForeverMinutes": game.playtime_forever,
                "playtimeForeverHours": round_hours(game.playtime_forever),
                "rtimeLastPlayed": game.rtime_last_played,
                "lastPlayedAt": iso_from_steam_timestamp(game.rtime_last_played),
                "isCollectionOnly": game.is_collection_only,
                "collections": refs,
                "details": details_exported.unwrap_or(Value::Null),
                "hltb": hltb_exported.unwrap_or(Value::Null),
                "achievements": achievement_exported.unwrap_or(Value::Null),
                "wishlist": wishlist_exported.unwrap_or(Value::Null),
                "ownership": ownership_exported.unwrap_or(Value::Null),
                "flags": flags,
            })
        })
        .collect();

    let hltb_count = exported_games
        .iter()
        .filter(|game| !game.get("hltb").unwrap_or(&Value::Null).is_null())
        .count();
    let achievement_count = exported_games
        .iter()
        .filter(|game| !game.get("achievements").unwrap_or(&Value::Null).is_null())
        .count();
    let wishlist_count = exported_games
        .iter()
        .filter(|game| !game.get("wishlist").unwrap_or(&Value::Null).is_null())
        .count();
    let family_shared_count = exported_games
        .iter()
        .filter(|game| {
            game.get("ownership")
                .and_then(|ownership| ownership.get("familyShared"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
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
            "achievementCount": achievement_count,
            "wishlistCount": wishlist_count,
            "familySharedCount": family_shared_count,
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

fn achievement_export(summary: &CachedAchievementSummary) -> Value {
    let percent = if summary.total == 0 {
        Value::Null
    } else {
        json!(round_percent(summary.achieved, summary.total))
    };
    json!({
        "source": "steam_web_api",
        "total": summary.total,
        "achieved": summary.achieved.min(summary.total),
        "percent": percent,
        "complete": summary.total > 0 && summary.achieved >= summary.total,
        "hasDetails": !summary.achievements.is_empty(),
    })
}

fn wishlist_export(item: &api::WishlistItem, fetched_at: Option<&str>) -> Value {
    json!({
        "source": "steam_wishlist",
        "priority": item.priority,
        "dateAdded": item.date_added,
        "dateAddedAt": iso_from_steam_timestamp(item.date_added),
        "fetchedAt": fetched_at,
    })
}

fn ownership_export(
    app: &api::FamilyLibraryApp,
    auth_used: Option<&str>,
    owner_tail: Option<&str>,
    fetched_at: Option<&str>,
) -> Value {
    let mut owner_tails = app
        .owner_steamids
        .iter()
        .filter_map(|owner| steam_tail(owner))
        .collect::<Vec<_>>();
    owner_tails.sort();
    owner_tails.dedup();
    json!({
        "source": "steam_family",
        "authUsed": auth_used,
        "ownerSteamIdTail": owner_tail,
        "ownerSteamIdTails": owner_tails,
        "ownerCount": app.owner_steamids.len(),
        "ownedByCurrentUser": app.is_owned_by_current_user,
        "familyShared": app.is_family_shared && app.exclude_reason == 0,
        "excluded": app.exclude_reason != 0,
        "excludeReason": app.exclude_reason,
        "nonGame": app.is_non_game,
        "appType": app.app_type,
        "fetchedAt": fetched_at,
    })
}

fn flags_export(
    is_collection_only: bool,
    has_details: bool,
    has_hltb: bool,
    achievements: Option<&Value>,
    wishlist: Option<&Value>,
    ownership: Option<&Value>,
) -> Value {
    let family_shared = ownership
        .and_then(|value| value.get("familyShared"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let owned_by_current_user = ownership
        .and_then(|value| value.get("ownedByCurrentUser"))
        .and_then(Value::as_bool)
        .unwrap_or(!family_shared);
    let non_game = ownership
        .and_then(|value| value.get("nonGame"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    json!({
        "collectionOnly": is_collection_only,
        "hasDetails": has_details,
        "missingDetails": !has_details,
        "hasHltb": has_hltb,
        "hasAchievements": achievements.is_some(),
        "wishlist": wishlist.is_some(),
        "familyShared": family_shared,
        "ownedByCurrentUser": owned_by_current_user,
        "nonGame": non_game,
    })
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
