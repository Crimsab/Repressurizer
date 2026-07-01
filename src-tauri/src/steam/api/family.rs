use serde::{de, Deserialize, Deserializer};
use std::collections::HashMap;

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

use super::types::{FamilyLibraryApp, FamilyLibraryResult, WishlistItem};
use super::utils::steam_api_url;

enum SteamFamilyAuth {
    WebApiKey(String),
    AccessToken(String),
}

impl SteamFamilyAuth {
    fn from_inputs(api_key: String, access_token: Option<String>) -> Result<Self, String> {
        let token = access_token.unwrap_or_default().trim().to_string();
        if !token.is_empty() {
            return Ok(Self::AccessToken(token));
        }

        let key = api_key.trim().to_string();
        if !key.is_empty() {
            return Ok(Self::WebApiKey(key));
        }

        Err("Missing Steam Web API key or Steam Store webapi_token".to_string())
    }

    fn auth_used(&self) -> &'static str {
        match self {
            Self::WebApiKey(_) => "web_api_key",
            Self::AccessToken(_) => "access_token",
        }
    }

    fn help_text(&self) -> &'static str {
        match self {
            Self::WebApiKey(_) => {
                "Steam Families usually needs the authenticated user's Steam Store webapi_token; a normal Steam Web API key may be rejected."
            }
            Self::AccessToken(_) => {
                "The Steam Store webapi_token may be expired or not tied to this Steam account."
            }
        }
    }

    fn apply(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self {
            Self::WebApiKey(key) => request.query(&[("key", key.as_str())]),
            Self::AccessToken(token) => request.query(&[("access_token", token.as_str())]),
        }
    }
}

#[derive(Debug, Deserialize)]
struct FamilyGroupResponse {
    response: Option<FamilyGroupInner>,
}

#[derive(Debug, Deserialize)]
struct FamilyGroupInner {
    #[serde(default)]
    is_not_member_of_any_group: bool,
    #[serde(default, deserialize_with = "deserialize_optional_stringish")]
    family_groupid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SharedLibraryResponse {
    response: Option<SharedLibraryInner>,
}

#[derive(Debug, Deserialize)]
struct SharedLibraryInner {
    owner_steamid: Option<String>,
    #[serde(default)]
    apps: Vec<FamilyAppRaw>,
}

#[derive(Debug, Deserialize)]
struct FamilyAppRaw {
    #[serde(deserialize_with = "deserialize_u64ish")]
    appid: u64,
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_string_vec")]
    owner_steamids: Vec<String>,
    #[serde(default)]
    exclude_reason: u32,
    #[serde(default, deserialize_with = "deserialize_u64ish_default")]
    rt_last_played: u64,
    #[serde(default, deserialize_with = "deserialize_u64ish_default")]
    rt_playtime: u64,
    #[serde(default)]
    img_icon_hash: Option<String>,
    #[serde(default)]
    app_type: u32,
}

#[derive(Debug, Deserialize)]
struct PlaytimeSummaryResponse {
    response: Option<PlaytimeSummaryInner>,
}

#[derive(Debug, Deserialize)]
struct PlaytimeSummaryInner {
    #[serde(default)]
    entries: Vec<PlaytimeEntryRaw>,
}

#[derive(Debug, Deserialize)]
struct PlaytimeEntryRaw {
    #[serde(default)]
    steamid: String,
    #[serde(deserialize_with = "deserialize_u64ish")]
    appid: u64,
    #[serde(default, deserialize_with = "deserialize_u64ish_default")]
    latest_played: u64,
    #[serde(default, deserialize_with = "deserialize_u64ish_default")]
    seconds_played: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct PlaytimeAggregate {
    seconds_played: u64,
    latest_played: u64,
}

fn deserialize_u64ish<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    match serde_json::Value::deserialize(deserializer)? {
        serde_json::Value::Number(n) => n
            .as_u64()
            .ok_or_else(|| de::Error::custom("expected unsigned integer")),
        serde_json::Value::String(s) => s
            .parse::<u64>()
            .map_err(|_| de::Error::custom("expected unsigned integer string")),
        other => Err(de::Error::custom(format!(
            "expected integer, got {}",
            other
        ))),
    }
}

fn deserialize_u64ish_default<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    match Option::<serde_json::Value>::deserialize(deserializer)? {
        Some(serde_json::Value::Number(n)) => Ok(n.as_u64().unwrap_or_default()),
        Some(serde_json::Value::String(s)) => Ok(s.parse::<u64>().unwrap_or_default()),
        _ => Ok(0),
    }
}

fn deserialize_optional_stringish<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::String(s) if !s.trim().is_empty() => Some(s),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }))
}

fn deserialize_string_vec<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let values = Vec::<serde_json::Value>::deserialize(deserializer)?;
    Ok(values
        .into_iter()
        .filter_map(|value| match value {
            serde_json::Value::String(s) => Some(s),
            serde_json::Value::Number(n) => Some(n.to_string()),
            _ => None,
        })
        .collect())
}

pub async fn fetch_wishlist(steam_id64: String) -> Result<Vec<WishlistItem>, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    // Try the Steam Web API endpoint (works for public wishlists, no key needed)
    let url = format!(
        "https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid={}",
        steam_id64
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Wishlist request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read wishlist response: {}", e))?;

    if text.trim_start().starts_with('<') {
        return Err("Wishlist API returned HTML (private wishlist or Steam issue). Make sure your wishlist is set to Public in Steam privacy settings.".to_string());
    }

    if !status.is_success() {
        return Err(format!(
            "Wishlist API returned status {}: {}",
            status,
            &text[..text.len().min(200)]
        ));
    }

    // Response: { "response": { "items": [...] } } (new) or { "response": { "wishlist": [...] } } (old)
    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse wishlist: {}", e))?;

    let wishlist_arr = parsed
        .get("response")
        .and_then(|r| r.get("items").or_else(|| r.get("wishlist")))
        .and_then(|w| w.as_array())
        .ok_or_else(|| {
            if parsed.get("response").map(|r| r.as_object().map(|o| o.is_empty()).unwrap_or(false)).unwrap_or(false) {
                "Wishlist is empty or private. Make sure your wishlist is set to Public in Steam privacy settings.".to_string()
            } else {
                format!("Unexpected wishlist response format: {}", &text[..text.len().min(300)])
            }
        })?;

    let mut items: Vec<WishlistItem> = wishlist_arr
        .iter()
        .filter_map(|entry| {
            let appid = entry.get("appid")?.as_u64()?;
            let priority = entry.get("priority").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let date_added = entry
                .get("date_added")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            Some(WishlistItem {
                appid,
                priority,
                date_added,
            })
        })
        .collect();

    items.sort_by_key(|i| i.priority);
    Ok(items)
}

pub async fn fetch_family_library(
    api_key: String,
    access_token: Option<String>,
    steam_id64: Option<String>,
    include_non_games: Option<bool>,
) -> Result<FamilyLibraryResult, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .user_agent("Repressurizer/0.1")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    fetch_family_library_from_base(
        &client,
        "https://api.steampowered.com",
        api_key,
        access_token,
        steam_id64,
        include_non_games.unwrap_or(false),
    )
    .await
}

pub(super) async fn fetch_family_library_from_base(
    client: &reqwest::Client,
    base_url: &str,
    api_key: String,
    access_token: Option<String>,
    steam_id64: Option<String>,
    include_non_games: bool,
) -> Result<FamilyLibraryResult, String> {
    let auth = SteamFamilyAuth::from_inputs(api_key, access_token)?;
    let steam_id64 = steam_id64.unwrap_or_default().trim().to_string();
    let family_groupid = fetch_family_groupid(client, base_url, &auth, &steam_id64).await?;
    let shared = fetch_shared_family_apps(
        client,
        base_url,
        &auth,
        &family_groupid,
        &steam_id64,
        include_non_games,
    )
    .await?;
    let (playtime_by_app, playtime_unavailable_reason) =
        match fetch_family_playtime_summary(client, base_url, &auth, &family_groupid, &steam_id64)
            .await
        {
            Ok(playtimes) => (playtimes, None),
            Err(error) => (
                HashMap::new(),
                Some(error.chars().take(240).collect::<String>()),
            ),
        };

    let mut owned_apps = 0usize;
    let mut shared_apps = 0usize;
    let mut excluded_apps = 0usize;
    let mut non_game_apps = 0usize;

    let apps = shared
        .apps
        .into_iter()
        .filter_map(|app| {
            let is_non_game = app.app_type != 0 && app.app_type != 1;
            if is_non_game {
                non_game_apps += 1;
            }
            if is_non_game && !include_non_games {
                return None;
            }

            let is_owned_by_current_user =
                !steam_id64.is_empty() && app.owner_steamids.iter().any(|id| id == &steam_id64);
            let has_family_owner = app.owner_steamids.iter().any(|id| id != &steam_id64);
            let is_family_shared =
                app.exclude_reason == 0 && !is_owned_by_current_user && has_family_owner;
            let summary = playtime_by_app.get(&app.appid).copied().unwrap_or_default();
            let playtime_forever = if summary.seconds_played > 0 {
                summary.seconds_played / 60
            } else {
                app.rt_playtime
            };
            let rtime_last_played = summary.latest_played.max(app.rt_last_played);

            if is_owned_by_current_user {
                owned_apps += 1;
            }
            if is_family_shared {
                shared_apps += 1;
            }
            if app.exclude_reason != 0 {
                excluded_apps += 1;
            }

            Some(FamilyLibraryApp {
                appid: app.appid,
                name: app.name,
                owner_steamids: app.owner_steamids,
                exclude_reason: app.exclude_reason,
                playtime_forever,
                rtime_last_played,
                img_icon_hash: app.img_icon_hash,
                app_type: app.app_type,
                is_non_game,
                is_owned_by_current_user,
                is_family_shared,
            })
        })
        .collect::<Vec<_>>();

    Ok(FamilyLibraryResult {
        auth_used: auth.auth_used().to_string(),
        family_groupid: Some(family_groupid),
        owner_steamid: if steam_id64.is_empty() {
            shared.owner_steamid
        } else {
            Some(steam_id64)
        },
        total_apps: apps.len(),
        owned_apps,
        shared_apps,
        excluded_apps,
        non_game_apps,
        playtime_entries: playtime_by_app.len(),
        playtime_unavailable_reason,
        apps,
    })
}

async fn fetch_family_groupid(
    client: &reqwest::Client,
    base_url: &str,
    auth: &SteamFamilyAuth,
    steam_id64: &str,
) -> Result<String, String> {
    let url = steam_api_url(base_url, "IFamilyGroupsService/GetFamilyGroupForUser/v1/");
    let mut request = auth.apply(client.get(url)).query(&[
        ("include_family_group_response", "false"),
        ("format", "json"),
    ]);

    if !steam_id64.is_empty() {
        request = request.query(&[("steamid", steam_id64)]);
    }

    let text = send_family_request(request, "Steam Family group", auth).await?;
    let parsed: FamilyGroupResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Steam Family group response: {}", e))?;
    let inner = parsed.response.ok_or_else(|| {
        "Steam Family group response did not include a response object".to_string()
    })?;

    if inner.is_not_member_of_any_group {
        return Err("This Steam account is not a member of a Steam Family group.".to_string());
    }

    inner.family_groupid.filter(|id| id != "0").ok_or_else(|| {
        "Steam Family group response did not include a valid family_groupid.".to_string()
    })
}

async fn fetch_shared_family_apps(
    client: &reqwest::Client,
    base_url: &str,
    auth: &SteamFamilyAuth,
    family_groupid: &str,
    steam_id64: &str,
    include_non_games: bool,
) -> Result<SharedLibraryInner, String> {
    let url = steam_api_url(base_url, "IFamilyGroupsService/GetSharedLibraryApps/v1/");
    let include_non_games_value = if include_non_games { "true" } else { "false" };
    let mut request = auth.apply(client.get(url)).query(&[
        ("family_groupid", family_groupid),
        ("include_own", "true"),
        ("include_excluded", "true"),
        ("include_free", "true"),
        ("include_non_games", include_non_games_value),
        ("language", "english"),
        ("format", "json"),
    ]);

    if !steam_id64.is_empty() {
        request = request.query(&[("steamid", steam_id64)]);
    }

    let text = send_family_request(request, "Steam Family library", auth).await?;
    let parsed: SharedLibraryResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Steam Family library response: {}", e))?;

    parsed.response.ok_or_else(|| {
        "Steam Family library response did not include a response object".to_string()
    })
}

async fn fetch_family_playtime_summary(
    client: &reqwest::Client,
    base_url: &str,
    auth: &SteamFamilyAuth,
    family_groupid: &str,
    steam_id64: &str,
) -> Result<HashMap<u64, PlaytimeAggregate>, String> {
    let url = steam_api_url(base_url, "IFamilyGroupsService/GetPlaytimeSummary/v1/");
    let request = auth
        .apply(client.get(url))
        .query(&[("family_groupid", family_groupid), ("format", "json")]);

    let text = send_family_request(request, "Steam Family playtime", auth).await?;
    let parsed: PlaytimeSummaryResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Steam Family playtime response: {}", e))?;
    let entries = parsed.response.map(|r| r.entries).unwrap_or_default();
    let mut by_app: HashMap<u64, PlaytimeAggregate> = HashMap::new();

    for entry in entries {
        if !steam_id64.is_empty() && entry.steamid != steam_id64 {
            continue;
        }

        let current = by_app.entry(entry.appid).or_default();
        current.seconds_played = current.seconds_played.saturating_add(entry.seconds_played);
        current.latest_played = current.latest_played.max(entry.latest_played);
    }

    Ok(by_app)
}

async fn send_family_request(
    request: reqwest::RequestBuilder,
    context: &str,
    auth: &SteamFamilyAuth,
) -> Result<String, String> {
    let response = request
        .send()
        .await
        .map_err(|e| format!("{} request failed: {}", context, e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read {} response: {}", context, e))?;

    if !status.is_success() {
        return Err(format!(
            "{} API returned status {}: {} {}",
            context,
            status,
            text.chars().take(220).collect::<String>(),
            auth.help_text()
        ));
    }

    if text.trim_start().starts_with('<') {
        return Err(format!(
            "{} API returned HTML instead of JSON. {}",
            context,
            auth.help_text()
        ));
    }

    Ok(text)
}
