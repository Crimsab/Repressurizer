use serde::{de, Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

// === Achievement types ===

#[derive(Debug, Clone, Serialize)]
pub struct AchievementInfo {
    pub api_name: String,
    pub name: String,
    pub description: String,
    pub achieved: bool,
    pub unlock_time: u64,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AchievementSummary {
    pub total: u32,
    pub achieved: u32,
    pub achievements: Vec<AchievementInfo>,
}

#[derive(Debug, Deserialize)]
struct PlayerAchievementsResponse {
    playerstats: Option<PlayerAchievementsInner>,
}

#[derive(Debug, Deserialize)]
struct PlayerAchievementsInner {
    achievements: Option<Vec<PlayerAchievement>>,
}

#[derive(Debug, Deserialize)]
struct PlayerAchievement {
    apiname: String,
    achieved: u32,
    #[serde(default)]
    unlocktime: u64,
}

#[derive(Debug, Deserialize)]
struct SchemaResponse {
    game: Option<SchemaGame>,
}

#[derive(Debug, Deserialize)]
struct SchemaGame {
    #[serde(rename = "availableGameStats")]
    available_game_stats: Option<SchemaStats>,
}

#[derive(Debug, Deserialize)]
struct SchemaStats {
    achievements: Option<Vec<SchemaAchievement>>,
}

#[derive(Debug, Deserialize)]
struct SchemaAchievement {
    name: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    icongray: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnedGame {
    pub appid: u64,
    pub name: String,
    pub playtime_forever: u64,
    pub img_icon_url: Option<String>,
    #[serde(default)]
    pub rtime_last_played: u64,
}

#[derive(Debug, Deserialize)]
struct OwnedGamesResponse {
    response: OwnedGamesInner,
}

#[derive(Debug, Deserialize)]
struct OwnedGamesInner {
    #[allow(dead_code)]
    game_count: Option<u64>,
    games: Option<Vec<OwnedGame>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameDetails {
    pub app_id: u64,
    pub name: String,
    pub genres: Vec<String>,
    pub categories: Vec<String>,
    pub release_date: Option<String>,
    pub metacritic_score: Option<u32>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub platforms: PlatformSupport,
    pub header_image: Option<String>,
    #[serde(default)]
    pub price_initial: Option<u64>,
    #[serde(default)]
    pub price_final: Option<u64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlatformSupport {
    pub windows: bool,
    pub mac: bool,
    pub linux: bool,
}

#[derive(Debug, Deserialize)]
struct StoreAppResponse {
    success: bool,
    data: Option<StoreAppData>,
}

#[derive(Debug, Deserialize)]
struct StoreAppData {
    name: Option<String>,
    genres: Option<Vec<StoreGenre>>,
    categories: Option<Vec<StoreCategory>>,
    release_date: Option<StoreReleaseDate>,
    metacritic: Option<StoreMetacritic>,
    developers: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    platforms: Option<StorePlatforms>,
    header_image: Option<String>,
    price_overview: Option<StorePriceOverview>,
    #[serde(default)]
    is_free: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct StoreGenre {
    description: String,
}

#[derive(Debug, Deserialize)]
struct StoreCategory {
    description: String,
}

#[derive(Debug, Deserialize)]
struct StoreReleaseDate {
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StoreMetacritic {
    score: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct StorePriceOverview {
    currency: Option<String>,
    initial: Option<u64>,
    #[serde(rename = "final")]
    final_price: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct StorePlatforms {
    windows: Option<bool>,
    mac: Option<bool>,
    linux: Option<bool>,
}

#[tauri::command]
pub async fn fetch_library(api_key: String, steam_id64: String) -> Result<Vec<OwnedGame>, String> {
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={}&steamid={}&include_appinfo=1&include_played_free_games=1&format=json",
        api_key, steam_id64
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let data: OwnedGamesResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data.response.games.unwrap_or_default())
}

#[tauri::command]
pub async fn fetch_game_details(
    app_id: u64,
    country_code: Option<String>,
) -> Result<GameDetails, String> {
    let cc = country_code.unwrap_or_default();
    let url = if cc.is_empty() {
        format!(
            "https://store.steampowered.com/api/appdetails?appids={}",
            app_id
        )
    } else {
        format!(
            "https://store.steampowered.com/api/appdetails?appids={}&cc={}",
            app_id, cc
        )
    };

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
        )
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let parsed: HashMap<String, StoreAppResponse> = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse store response: {}", e))?;

    let app_data = parsed
        .get(&app_id.to_string())
        .ok_or("App not found in response")?;

    if !app_data.success {
        return Err(format!("Store API returned failure for app {}", app_id));
    }

    let data = app_data.data.as_ref().ok_or("No data in response")?;

    Ok(GameDetails {
        app_id,
        name: data.name.clone().unwrap_or_default(),
        genres: data
            .genres
            .as_ref()
            .map(|g| g.iter().map(|x| x.description.clone()).collect())
            .unwrap_or_default(),
        categories: data
            .categories
            .as_ref()
            .map(|c| c.iter().map(|x| x.description.clone()).collect())
            .unwrap_or_default(),
        release_date: data.release_date.as_ref().and_then(|r| r.date.clone()),
        metacritic_score: data.metacritic.as_ref().and_then(|m| m.score),
        developers: data.developers.clone().unwrap_or_default(),
        publishers: data.publishers.clone().unwrap_or_default(),
        platforms: data
            .platforms
            .as_ref()
            .map(|p| PlatformSupport {
                windows: p.windows.unwrap_or(false),
                mac: p.mac.unwrap_or(false),
                linux: p.linux.unwrap_or(false),
            })
            .unwrap_or_default(),
        header_image: data.header_image.clone(),
        price_initial: data.price_overview.as_ref().and_then(|p| p.initial),
        price_final: data.price_overview.as_ref().and_then(|p| p.final_price),
        price_currency: data
            .price_overview
            .as_ref()
            .and_then(|p| p.currency.clone()),
        is_free: data.is_free.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn fetch_achievements(
    api_key: String,
    steam_id64: String,
    app_id: u64,
) -> Result<AchievementSummary, String> {
    let client = reqwest::Client::new();

    // Fetch player achievements
    let player_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key={}&steamid={}&appid={}",
        api_key, steam_id64, app_id
    );

    let player_resp = client
        .get(&player_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch achievements: {}", e))?;

    let player_text = player_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read achievements response: {}", e))?;

    let player_data: PlayerAchievementsResponse = serde_json::from_str(&player_text)
        .map_err(|_| "No achievements for this game".to_string())?;

    let player_achievements = player_data
        .playerstats
        .and_then(|ps| ps.achievements)
        .unwrap_or_default();

    if player_achievements.is_empty() {
        return Ok(AchievementSummary {
            total: 0,
            achieved: 0,
            achievements: Vec::new(),
        });
    }

    // Fetch schema for names/descriptions/icons
    let schema_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}",
        api_key, app_id
    );

    let schema_resp = client
        .get(&schema_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch schema: {}", e))?;

    let schema_text = schema_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read schema response: {}", e))?;

    let schema_data: SchemaResponse =
        serde_json::from_str(&schema_text).unwrap_or(SchemaResponse { game: None });

    let schema_map: HashMap<String, &SchemaAchievement> = schema_data
        .game
        .as_ref()
        .and_then(|g| g.available_game_stats.as_ref())
        .and_then(|s| s.achievements.as_ref())
        .map(|achs| achs.iter().map(|a| (a.name.clone(), a)).collect())
        .unwrap_or_default();

    let total = player_achievements.len() as u32;
    let achieved = player_achievements
        .iter()
        .filter(|a| a.achieved == 1)
        .count() as u32;

    let mut achievements: Vec<AchievementInfo> = player_achievements
        .iter()
        .map(|pa| {
            let schema = schema_map.get(&pa.apiname);
            AchievementInfo {
                api_name: pa.apiname.clone(),
                name: schema
                    .and_then(|s| s.display_name.clone())
                    .unwrap_or_else(|| pa.apiname.clone()),
                description: schema
                    .and_then(|s| s.description.clone())
                    .unwrap_or_default(),
                achieved: pa.achieved == 1,
                unlock_time: pa.unlocktime,
                icon: schema.and_then(|s| s.icon.clone()),
                icon_gray: schema.and_then(|s| s.icongray.clone()),
            }
        })
        .collect();

    // Sort: achieved first (by unlock time desc), then unachieved alphabetically
    achievements.sort_by(|a, b| match (a.achieved, b.achieved) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        (true, true) => b.unlock_time.cmp(&a.unlock_time),
        (false, false) => a.name.cmp(&b.name),
    });

    Ok(AchievementSummary {
        total,
        achieved,
        achievements,
    })
}

/// Light version: only fetches counts (total/achieved), no schema lookup.
/// Used for bulk fetching in AchievementsPage — ~2x faster than full fetch.
#[tauri::command]
pub async fn fetch_achievements_summary(
    api_key: String,
    steam_id64: String,
    app_id: u64,
) -> Result<(u32, u32), String> {
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key={}&steamid={}&appid={}",
        api_key, steam_id64, app_id
    );

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch achievements: {}", e))?;

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let data: PlayerAchievementsResponse =
        serde_json::from_str(&text).map_err(|_| "No achievements for this game".to_string())?;

    let achievements = data
        .playerstats
        .and_then(|ps| ps.achievements)
        .unwrap_or_default();

    let total = achievements.len() as u32;
    let achieved = achievements.iter().filter(|a| a.achieved == 1).count() as u32;

    Ok((total, achieved))
}

// === Wishlist ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WishlistItem {
    pub appid: u64,
    pub priority: u32,
    pub date_added: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyLibraryApp {
    pub appid: u64,
    pub name: Option<String>,
    pub owner_steamids: Vec<String>,
    pub exclude_reason: u32,
    pub playtime_forever: u64,
    pub rtime_last_played: u64,
    pub img_icon_hash: Option<String>,
    pub app_type: u32,
    pub is_non_game: bool,
    pub is_owned_by_current_user: bool,
    pub is_family_shared: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyLibraryResult {
    pub auth_used: String,
    pub family_groupid: Option<String>,
    pub owner_steamid: Option<String>,
    pub total_apps: usize,
    pub owned_apps: usize,
    pub shared_apps: usize,
    pub excluded_apps: usize,
    pub non_game_apps: usize,
    pub playtime_entries: usize,
    pub playtime_unavailable_reason: Option<String>,
    pub apps: Vec<FamilyLibraryApp>,
}

#[derive(Debug, Deserialize)]
struct WishlistV1Response {
    wishlist: Option<Vec<WishlistV1Item>>,
}

#[derive(Debug, Deserialize)]
struct WishlistV1Item {
    appid: Option<serde_json::Value>, // sometimes "id" or "appid"
    id: Option<serde_json::Value>,
    #[serde(default)]
    priority: u32,
    #[serde(default)]
    added_date: u64,
    #[serde(default)]
    date_added: u64,
}

#[derive(Debug)]
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
            Self::AccessToken(_) => "The Steam Store webapi_token may be expired or not tied to this Steam account.",
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

#[tauri::command]
pub async fn fetch_wishlist(steam_id64: String) -> Result<Vec<WishlistItem>, String> {
    let client = reqwest::Client::builder()
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

#[tauri::command]
pub async fn fetch_family_library(
    api_key: String,
    access_token: Option<String>,
    steam_id64: Option<String>,
    include_non_games: Option<bool>,
) -> Result<FamilyLibraryResult, String> {
    let client = reqwest::Client::builder()
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

async fn fetch_family_library_from_base(
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

fn steam_api_url(base_url: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .user_agent("Repressurizer/test")
            .build()
            .expect("test client")
    }

    #[tokio::test]
    async fn family_library_resolves_group_before_fetching_apps() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("steamid", "765000"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "is_not_member_of_any_group": false,
                    "family_groupid": "123456"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetSharedLibraryApps/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("family_groupid", "123456"))
            .and(query_param("steamid", "765000"))
            .and(query_param("include_own", "true"))
            .and(query_param("include_excluded", "true"))
            .and(query_param("include_non_games", "false"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "apps": [
                        {
                            "appid": "620",
                            "name": "Portal 2",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 0,
                            "rt_playtime": 15,
                            "rt_last_played": 100,
                            "app_type": 1,
                            "img_icon_hash": "portal2-icon"
                        },
                        {
                            "appid": 70,
                            "name": "Half-Life",
                            "owner_steamids": ["765000"],
                            "exclude_reason": 0,
                            "rt_playtime": 30,
                            "rt_last_played": 200,
                            "app_type": 1
                        },
                        {
                            "appid": 400,
                            "name": "Portal",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 3,
                            "app_type": 1
                        },
                        {
                            "appid": 211,
                            "name": "Source SDK",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 0,
                            "app_type": 2
                        }
                    ]
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetPlaytimeSummary/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("family_groupid", "123456"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "entries": [
                        {
                            "steamid": "765000",
                            "appid": "620",
                            "latest_played": 500,
                            "seconds_played": 7200
                        },
                        {
                            "steamid": "765111",
                            "appid": "620",
                            "latest_played": 900,
                            "seconds_played": 999999
                        }
                    ]
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        let result = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            String::new(),
            Some("store-token".to_string()),
            Some("765000".to_string()),
            false,
        )
        .await
        .expect("family library");

        assert_eq!(result.auth_used, "access_token");
        assert_eq!(result.family_groupid.as_deref(), Some("123456"));
        assert_eq!(result.owner_steamid.as_deref(), Some("765000"));
        assert_eq!(result.total_apps, 3);
        assert_eq!(result.owned_apps, 1);
        assert_eq!(result.shared_apps, 1);
        assert_eq!(result.excluded_apps, 1);
        assert_eq!(result.non_game_apps, 1);
        assert_eq!(result.playtime_entries, 1);
        assert!(result
            .apps
            .iter()
            .any(|app| app.appid == 620 && app.is_family_shared));
        assert!(result.apps.iter().any(|app| {
            app.appid == 620
                && app.playtime_forever == 120
                && app.rtime_last_played == 500
                && app.img_icon_hash.as_deref() == Some("portal2-icon")
        }));
        assert!(result
            .apps
            .iter()
            .any(|app| app.appid == 70 && app.is_owned_by_current_user));
        assert!(!result.apps.iter().any(|app| app.appid == 211));
    }

    #[tokio::test]
    async fn family_library_reports_not_member() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "is_not_member_of_any_group": true,
                    "family_groupid": "0"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        let error = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            String::new(),
            Some("store-token".to_string()),
            Some("765000".to_string()),
            false,
        )
        .await
        .expect_err("not member");

        assert!(error.contains("not a member"));
    }

    #[tokio::test]
    async fn family_library_explains_web_api_key_rejections() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .and(query_param("key", "developer-key"))
            .respond_with(ResponseTemplate::new(403).set_body_string("Access is denied"))
            .expect(1)
            .mount(&server)
            .await;

        let error = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            "developer-key".to_string(),
            None,
            Some("765000".to_string()),
            false,
        )
        .await
        .expect_err("rejected key");

        assert!(error.contains("webapi_token"));
        assert!(error.contains("normal Steam Web API key"));
    }
}

// === Vanity URL resolver ===

#[tauri::command]
pub async fn resolve_vanity_url(api_key: String, vanity_url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key={}&vanityurl={}",
        api_key, vanity_url
    );

    let text = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    #[derive(Deserialize)]
    struct VanityOuter {
        response: VanityInner,
    }
    #[derive(Deserialize)]
    struct VanityInner {
        steamid: Option<String>,
        success: u32,
    }

    let resp: VanityOuter = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if resp.response.success == 1 {
        resp.response
            .steamid
            .ok_or_else(|| "No Steam ID returned".to_string())
    } else {
        Err("Profile not found or is private".to_string())
    }
}

// === Player summary (display name, avatar) ===

#[derive(Debug, Clone, Serialize)]
pub struct PlayerSummary {
    pub steamid: String,
    pub personaname: String,
    pub avatar: String,
    pub avatarmedium: String,
}

#[tauri::command]
pub async fn fetch_player_summary(
    api_key: String,
    steam_id64: String,
) -> Result<PlayerSummary, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}",
        api_key, steam_id64
    );

    let text = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    #[derive(Deserialize)]
    struct Outer {
        response: Inner,
    }
    #[derive(Deserialize)]
    struct Inner {
        players: Vec<PlayerData>,
    }
    #[derive(Deserialize)]
    struct PlayerData {
        steamid: String,
        personaname: String,
        #[serde(default)]
        avatar: String,
        #[serde(default)]
        avatarmedium: String,
    }

    let resp: Outer = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let player = resp
        .response
        .players
        .into_iter()
        .next()
        .ok_or("Player not found")?;

    Ok(PlayerSummary {
        steamid: player.steamid,
        personaname: player.personaname,
        avatar: player.avatar,
        avatarmedium: player.avatarmedium,
    })
}
