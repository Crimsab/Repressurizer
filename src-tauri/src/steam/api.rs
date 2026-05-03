use serde::{Deserialize, Serialize};
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
pub async fn fetch_game_details(app_id: u64, country_code: Option<String>) -> Result<GameDetails, String> {
    let cc = country_code.unwrap_or_default();
    let url = if cc.is_empty() {
        format!("https://store.steampowered.com/api/appdetails?appids={}", app_id)
    } else {
        format!("https://store.steampowered.com/api/appdetails?appids={}&cc={}", app_id, cc)
    };

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0")
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
        price_currency: data.price_overview.as_ref().and_then(|p| p.currency.clone()),
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

    let schema_data: SchemaResponse = serde_json::from_str(&schema_text).unwrap_or(SchemaResponse { game: None });

    let schema_map: HashMap<String, &SchemaAchievement> = schema_data
        .game
        .as_ref()
        .and_then(|g| g.available_game_stats.as_ref())
        .and_then(|s| s.achievements.as_ref())
        .map(|achs| achs.iter().map(|a| (a.name.clone(), a)).collect())
        .unwrap_or_default();

    let total = player_achievements.len() as u32;
    let achieved = player_achievements.iter().filter(|a| a.achieved == 1).count() as u32;

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
    achievements.sort_by(|a, b| {
        match (a.achieved, b.achieved) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            (true, true) => b.unlock_time.cmp(&a.unlock_time),
            (false, false) => a.name.cmp(&b.name),
        }
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

    let data: PlayerAchievementsResponse = serde_json::from_str(&text)
        .map_err(|_| "No achievements for this game".to_string())?;

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
        return Err(format!("Wishlist API returned status {}: {}", status, &text[..text.len().min(200)]));
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
            let date_added = entry.get("date_added").and_then(|v| v.as_u64()).unwrap_or(0);
            Some(WishlistItem { appid, priority, date_added })
        })
        .collect();

    items.sort_by_key(|i| i.priority);
    Ok(items)
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
    struct VanityOuter { response: VanityInner }
    #[derive(Deserialize)]
    struct VanityInner { steamid: Option<String>, success: u32 }

    let resp: VanityOuter = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if resp.response.success == 1 {
        resp.response.steamid.ok_or_else(|| "No Steam ID returned".to_string())
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
pub async fn fetch_player_summary(api_key: String, steam_id64: String) -> Result<PlayerSummary, String> {
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
    struct Outer { response: Inner }
    #[derive(Deserialize)]
    struct Inner { players: Vec<PlayerData> }
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
    let player = resp.response.players.into_iter().next()
        .ok_or("Player not found")?;

    Ok(PlayerSummary {
        steamid: player.steamid,
        personaname: player.personaname,
        avatar: player.avatar,
        avatarmedium: player.avatarmedium,
    })
}
