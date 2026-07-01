use chrono::Datelike;
use serde::{de, Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

const STEAM_STORE_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";
const STEAM_STORE_AGE_COOKIE: &str =
    "birthtime=-473392799; mature_content=1; lastagecheckage=1-January-1955";
const STORE_BROWSE_BATCH_SIZE: usize = 50;
const STORE_BROWSE_GET_ITEMS_URL: &str =
    "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const STORE_RELEASE_MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
pub struct SteamAppListItem {
    pub appid: u64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct SteamAppListResponse {
    response: SteamAppListInner,
}

#[derive(Debug, Deserialize)]
struct SteamAppListInner {
    #[serde(default)]
    apps: Vec<SteamAppListItem>,
    #[serde(default)]
    have_more_results: bool,
    #[serde(default)]
    last_appid: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameDetails {
    pub app_id: u64,
    pub name: String,
    pub genres: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub release_date: Option<String>,
    #[serde(default)]
    pub store_release_date: Option<String>,
    #[serde(default)]
    pub store_release_date_fetched_at: Option<u64>,
    pub metacritic_score: Option<u32>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    #[serde(default)]
    pub supported_languages: Vec<String>,
    pub platforms: PlatformSupport,
    pub header_image: Option<String>,
    #[serde(default)]
    pub capsule_image: Option<String>,
    #[serde(default)]
    pub price_initial: Option<u64>,
    #[serde(default)]
    pub price_final: Option<u64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub price_country_code: Option<String>,
    #[serde(default)]
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamePriceOverview {
    pub app_id: u64,
    #[serde(default)]
    pub price_initial: Option<u64>,
    #[serde(default)]
    pub price_final: Option<u64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub price_country_code: Option<String>,
    #[serde(default)]
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoreReleaseDateResult {
    pub app_id: u64,
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamReviewSummary {
    pub app_id: u64,
    pub review_score: u32,
    pub review_score_desc: String,
    pub total_positive: u32,
    pub total_negative: u32,
    pub total_reviews: u32,
    pub positive_percentage: Option<u32>,
    pub fetched_at: u64,
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
struct StorePriceAppResponse {
    success: bool,
    data: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct StoreBrowseGetItemsResponse {
    response: StoreBrowseItemsResponse,
}

#[derive(Debug, Deserialize)]
struct StoreBrowseItemsResponse {
    #[serde(default)]
    store_items: Vec<StoreBrowseItem>,
}

#[derive(Debug, Deserialize)]
struct StoreBrowseItem {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    appid: Option<u64>,
    #[serde(default)]
    release: Option<StoreBrowseRelease>,
}

#[derive(Debug, Deserialize)]
struct StoreBrowseRelease {
    #[serde(default)]
    original_release_date: Option<u64>,
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
    supported_languages: Option<String>,
    platforms: Option<StorePlatforms>,
    header_image: Option<String>,
    capsule_image: Option<String>,
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

const MAX_PLAUSIBLE_STEAM_PRICE_CENTS: u64 = 500_000;
const STORE_PRICE_BATCH_SIZE: usize = 250;

fn plausible_price(price: Option<u64>) -> Option<u64> {
    price.filter(|value| *value <= MAX_PLAUSIBLE_STEAM_PRICE_CENTS)
}

#[derive(Debug, Deserialize)]
struct StorePlatforms {
    windows: Option<bool>,
    mac: Option<bool>,
    linux: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct AppReviewsResponse {
    success: Option<u32>,
    query_summary: Option<AppReviewsQuerySummary>,
}

#[derive(Debug, Deserialize)]
struct AppReviewsQuerySummary {
    #[serde(default)]
    review_score: u32,
    #[serde(default)]
    review_score_desc: String,
    #[serde(default)]
    total_positive: u32,
    #[serde(default)]
    total_negative: u32,
    total_reviews: Option<u32>,
}

#[tauri::command]
pub async fn fetch_library(api_key: String, steam_id64: String) -> Result<Vec<OwnedGame>, String> {
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={}&steamid={}&include_appinfo=1&include_played_free_games=1&format=json",
        api_key, steam_id64
    );

    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let data: OwnedGamesResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data
        .response
        .games
        .unwrap_or_default()
        .into_iter()
        .filter(|game| !is_transient_library_app(game))
        .collect())
}

#[tauri::command]
pub async fn fetch_steam_review_summary(app_id: u64) -> Result<SteamReviewSummary, String> {
    let url = format!(
        "https://store.steampowered.com/appreviews/{}?json=1&language=all&purchase_type=all&num_per_page=0",
        app_id
    );

    let client = client_builder_for_scope(HttpProxyScope::SteamStore)?
        .user_agent(format!("Repressurizer/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Steam reviews: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read Steam reviews response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Steam reviews returned HTTP {} for app {}",
            status.as_u16(),
            app_id
        ));
    }

    let parsed: AppReviewsResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Steam reviews response: {}", e))?;
    if parsed.success == Some(0) {
        return Err(format!("Steam reviews returned failure for app {}", app_id));
    }

    let summary = parsed
        .query_summary
        .ok_or_else(|| format!("Steam reviews response missing summary for app {}", app_id))?;
    let total_reviews = summary.total_reviews.unwrap_or_else(|| {
        summary
            .total_positive
            .saturating_add(summary.total_negative)
    });
    let positive_percentage = if total_reviews > 0 {
        Some(((summary.total_positive as f64 / total_reviews as f64) * 100.0).round() as u32)
    } else {
        None
    };
    let fetched_at = chrono::Utc::now().timestamp_millis().max(0) as u64;

    Ok(SteamReviewSummary {
        app_id,
        review_score: summary.review_score,
        review_score_desc: summary.review_score_desc,
        total_positive: summary.total_positive,
        total_negative: summary.total_negative,
        total_reviews,
        positive_percentage,
        fetched_at,
    })
}

#[tauri::command]
pub async fn fetch_steam_app_list(api_key: String) -> Result<Vec<SteamAppListItem>, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("Steam Web API key is required to refresh the Steam app index.".to_string());
    }

    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .user_agent("Repressurizer/0.1")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut apps = Vec::new();
    let mut last_appid = 0u64;

    loop {
        let response = client
            .get("https://api.steampowered.com/IStoreService/GetAppList/v1/")
            .query(&[
                ("key", key),
                ("include_games", "true"),
                ("include_dlc", "true"),
                ("include_software", "true"),
                ("include_videos", "false"),
                ("include_hardware", "false"),
                ("max_results", "50000"),
            ])
            .query(&[("last_appid", last_appid.to_string())])
            .send()
            .await
            .map_err(|e| format!("Steam app list request failed: {}", e))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read Steam app list response: {}", e))?;

        if !status.is_success() {
            return Err(format!(
                "Steam app list returned status {}: {}",
                status,
                text.chars().take(180).collect::<String>()
            ));
        }

        let page: SteamAppListResponse = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Steam app list: {}", e))?;
        apps.extend(page.response.apps);

        if !page.response.have_more_results || page.response.last_appid == 0 {
            break;
        }
        if page.response.last_appid <= last_appid {
            break;
        }
        last_appid = page.response.last_appid;
    }

    apps.retain(|app| !app.name.trim().is_empty());
    apps.sort_by_key(|app| app.appid);
    apps.dedup_by_key(|app| app.appid);
    Ok(apps)
}

fn is_transient_library_app(game: &OwnedGame) -> bool {
    let name = game.name.to_ascii_lowercase();
    let normalized = name.replace([':', '-', '_', '(', ')', '[', ']'], " ");
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    let has_phrase = |phrase: &[&str]| words.windows(phrase.len()).any(|window| window == phrase);

    has_phrase(&["open", "beta"])
        || has_phrase(&["closed", "beta"])
        || has_phrase(&["public", "beta"])
        || has_phrase(&["technical", "test"])
        || has_phrase(&["server", "test"])
        || has_phrase(&["network", "test"])
        || has_phrase(&["beta", "test"])
        || words.contains(&"playtest")
        || words.last() == Some(&"demo")
}

#[tauri::command]
pub async fn fetch_game_details(
    app_id: u64,
    country_code: Option<String>,
) -> Result<GameDetails, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamStore)?
        .user_agent(STEAM_STORE_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let requested_cc = country_code.unwrap_or_default().trim().to_ascii_lowercase();
    let mut attempts: Vec<Option<&str>> = Vec::new();
    if !requested_cc.is_empty() {
        attempts.push(Some(requested_cc.as_str()));
        if is_euro_country_code(&requested_cc) {
            for fallback in ["it", "fr", "es", "nl", "at", "be", "ie", "pt", "fi"] {
                if fallback != requested_cc {
                    attempts.push(Some(fallback));
                }
            }
        }
    } else {
        attempts.push(None);
    }
    if requested_cc != "us" {
        attempts.push(Some("us"));
    }

    let mut last_error = String::new();
    for cc in attempts {
        match fetch_game_details_with_country(&client, app_id, cc).await {
            Ok(details) => return Ok(details),
            Err(error) => {
                last_error = error;
            }
        }
    }

    Err(last_error)
}

#[tauri::command]
pub async fn fetch_store_release_date(app_id: u64) -> Result<StoreReleaseDateResult, String> {
    let mut results = fetch_store_release_dates(vec![app_id]).await?;
    Ok(results.pop().unwrap_or(StoreReleaseDateResult {
        app_id,
        release_date: None,
    }))
}

#[tauri::command]
pub async fn fetch_store_release_dates(
    app_ids: Vec<u64>,
) -> Result<Vec<StoreReleaseDateResult>, String> {
    if app_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut unique_ids = Vec::new();
    let mut seen = HashSet::new();
    for app_id in app_ids {
        if seen.insert(app_id) {
            unique_ids.push(app_id);
        }
    }

    let api_client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .user_agent(STEAM_STORE_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let store_client = client_builder_for_scope(HttpProxyScope::SteamStore)?
        .user_agent(STEAM_STORE_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut by_app_id = HashMap::new();
    let mut first_error: Option<String> = None;

    for chunk in unique_ids.chunks(STORE_BROWSE_BATCH_SIZE) {
        match fetch_store_browse_release_dates(&api_client, chunk).await {
            Ok(results) => {
                by_app_id.extend(results);
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }

    let mut output = Vec::with_capacity(unique_ids.len());
    for app_id in unique_ids {
        if let Some(release_date) = by_app_id.remove(&app_id) {
            output.push(StoreReleaseDateResult {
                app_id,
                release_date,
            });
            continue;
        }

        match fetch_store_page_release_date(&store_client, app_id).await {
            Ok(release_date) => output.push(StoreReleaseDateResult {
                app_id,
                release_date,
            }),
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }

    if output.is_empty() {
        Err(first_error.unwrap_or_else(|| "No Store release dates returned".to_string()))
    } else {
        Ok(output)
    }
}

async fn fetch_store_browse_release_dates(
    client: &reqwest::Client,
    app_ids: &[u64],
) -> Result<HashMap<u64, Option<String>>, String> {
    let ids = app_ids
        .iter()
        .map(|app_id| serde_json::json!({ "appid": app_id }))
        .collect::<Vec<_>>();
    let input_json = serde_json::json!({
        "ids": ids,
        "context": {
            "language": "english",
            "country_code": "US"
        },
        "data_request": {
            "include_release": true,
            "include_basic_info": true
        }
    })
    .to_string();

    let response = client
        .get(STORE_BROWSE_GET_ITEMS_URL)
        .query(&[("input_json", input_json)])
        .send()
        .await
        .map_err(|e| format!("StoreBrowse request failed: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read StoreBrowse response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "StoreBrowse returned HTTP {}: {}",
            status.as_u16(),
            text.chars().take(180).collect::<String>()
        ));
    }

    let parsed: StoreBrowseGetItemsResponse =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse StoreBrowse response: {}", e))?;
    let mut results = HashMap::new();
    for item in parsed.response.store_items {
        let Some(app_id) = item.appid.or(item.id) else {
            continue;
        };
        let release_date = item
            .release
            .and_then(|release| release.original_release_date)
            .and_then(format_store_release_timestamp);
        results.insert(app_id, release_date);
    }

    Ok(results)
}

async fn fetch_store_page_release_date(
    client: &reqwest::Client,
    app_id: u64,
) -> Result<Option<String>, String> {
    let response = client
        .get(format!("https://store.steampowered.com/app/{}/", app_id))
        .query(&[("l", "english")])
        .header(reqwest::header::COOKIE, STEAM_STORE_AGE_COOKIE)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read store page: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Steam store page returned HTTP {} for app {}: {}",
            status.as_u16(),
            app_id,
            text.chars().take(180).collect::<String>()
        ));
    }

    Ok(parse_store_page_release_date(&text))
}

#[tauri::command]
pub async fn fetch_game_price_overviews(
    app_ids: Vec<u64>,
    country_code: Option<String>,
) -> Result<Vec<GamePriceOverview>, String> {
    let mut unique_ids = Vec::new();
    let mut seen = HashSet::new();
    for id in app_ids {
        if id > 0 && seen.insert(id) {
            unique_ids.push(id);
        }
    }

    if unique_ids.is_empty() {
        return Ok(Vec::new());
    }

    let client = client_builder_for_scope(HttpProxyScope::SteamStore)?
        .user_agent(STEAM_STORE_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let requested_cc = country_code.unwrap_or_default().trim().to_ascii_lowercase();
    let attempts = price_country_attempts(&requested_cc);
    let mut prices = Vec::new();

    for chunk in unique_ids.chunks(STORE_PRICE_BATCH_SIZE) {
        let mut remaining = chunk.to_vec();

        for cc in &attempts {
            if remaining.is_empty() {
                break;
            }

            let fetched =
                fetch_game_price_overviews_with_country(&client, &remaining, cc.as_deref()).await?;
            if fetched.is_empty() {
                continue;
            }

            let fetched_ids: HashSet<u64> = fetched.iter().map(|price| price.app_id).collect();
            prices.extend(fetched);
            remaining.retain(|id| !fetched_ids.contains(id));
        }
    }

    Ok(prices)
}

fn price_country_attempts(requested_cc: &str) -> Vec<Option<String>> {
    let mut attempts = Vec::new();
    if requested_cc.is_empty() {
        attempts.push(None);
        return attempts;
    }

    attempts.push(Some(requested_cc.to_string()));
    if is_euro_country_code(requested_cc) {
        for fallback in ["it", "fr", "es", "nl", "at", "be", "ie", "pt", "fi"] {
            if fallback != requested_cc {
                attempts.push(Some(fallback.to_string()));
            }
        }
    }

    attempts
}

fn is_euro_country_code(country_code: &str) -> bool {
    matches!(
        country_code,
        "at" | "be"
            | "cy"
            | "de"
            | "ee"
            | "es"
            | "fi"
            | "fr"
            | "gr"
            | "hr"
            | "ie"
            | "it"
            | "lt"
            | "lu"
            | "lv"
            | "mt"
            | "nl"
            | "pt"
            | "si"
            | "sk"
    )
}

async fn fetch_game_price_overviews_with_country(
    client: &reqwest::Client,
    app_ids: &[u64],
    country_code: Option<&str>,
) -> Result<Vec<GamePriceOverview>, String> {
    let appids = app_ids
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(",");

    let mut request = client
        .get("https://store.steampowered.com/api/appdetails")
        .query(&[("appids", appids.as_str()), ("filters", "price_overview")]);

    if let Some(cc) = country_code.filter(|cc| !cc.is_empty()) {
        request = request.query(&[("cc", cc)]);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Steam price batch returned HTTP {}: {}",
            status.as_u16(),
            text.chars().take(180).collect::<String>()
        ));
    }

    parse_game_price_overviews_response(app_ids, &text, country_code)
}

fn parse_game_price_overviews_response(
    app_ids: &[u64],
    text: &str,
    country_code: Option<&str>,
) -> Result<Vec<GamePriceOverview>, String> {
    let parsed: HashMap<String, StorePriceAppResponse> = serde_json::from_str(text)
        .map_err(|e| format!("Failed to parse store price response: {}", e))?;

    let mut prices = Vec::new();
    for app_id in app_ids {
        let Some(app_data) = parsed.get(&app_id.to_string()) else {
            continue;
        };
        if !app_data.success {
            continue;
        }

        let Some(data) = app_data.data.as_ref().and_then(|value| value.as_object()) else {
            continue;
        };

        let is_free = data
            .get("is_free")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);

        let price = data
            .get("price_overview")
            .and_then(|value| serde_json::from_value::<StorePriceOverview>(value.clone()).ok());

        let initial = price.as_ref().and_then(|p| plausible_price(p.initial));
        let final_price = price.as_ref().and_then(|p| plausible_price(p.final_price));
        let currency = price.and_then(|p| p.currency);

        if !is_free && initial.is_none() && final_price.is_none() && currency.is_none() {
            continue;
        }

        prices.push(GamePriceOverview {
            app_id: *app_id,
            price_initial: initial,
            price_final: final_price,
            price_currency: currency,
            price_country_code: country_code.map(|cc| cc.to_ascii_uppercase()),
            is_free,
        });
    }

    Ok(prices)
}

async fn fetch_game_details_with_country(
    client: &reqwest::Client,
    app_id: u64,
    country_code: Option<&str>,
) -> Result<GameDetails, String> {
    let url = match country_code {
        Some(cc) if !cc.is_empty() => {
            format!(
                "https://store.steampowered.com/api/appdetails?appids={}&cc={}&l=english",
                app_id, cc
            )
        }
        _ => format!(
            "https://store.steampowered.com/api/appdetails?appids={}&l=english",
            app_id
        ),
    };

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    parse_game_details_response(app_id, &text, country_code)
}

fn parse_game_details_response(
    app_id: u64,
    text: &str,
    country_code: Option<&str>,
) -> Result<GameDetails, String> {
    let parsed: HashMap<String, StoreAppResponse> =
        serde_json::from_str(text).map_err(|e| format!("Failed to parse store response: {}", e))?;

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
        tags: Vec::new(),
        categories: data
            .categories
            .as_ref()
            .map(|c| c.iter().map(|x| x.description.clone()).collect())
            .unwrap_or_default(),
        release_date: data.release_date.as_ref().and_then(|r| r.date.clone()),
        store_release_date: None,
        store_release_date_fetched_at: None,
        metacritic_score: data.metacritic.as_ref().and_then(|m| m.score),
        developers: data.developers.clone().unwrap_or_default(),
        publishers: data.publishers.clone().unwrap_or_default(),
        supported_languages: data
            .supported_languages
            .as_deref()
            .map(parse_supported_languages)
            .unwrap_or_default(),
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
        capsule_image: data.capsule_image.clone(),
        price_initial: data
            .price_overview
            .as_ref()
            .and_then(|p| plausible_price(p.initial)),
        price_final: data
            .price_overview
            .as_ref()
            .and_then(|p| plausible_price(p.final_price)),
        price_currency: data
            .price_overview
            .as_ref()
            .and_then(|p| p.currency.clone()),
        price_country_code: country_code.map(|cc| cc.to_ascii_uppercase()),
        is_free: data.is_free.unwrap_or(false),
    })
}

fn parse_store_page_release_date(page: &str) -> Option<String> {
    let marker = "class=\"release_date\"";
    let marker_idx = page.find(marker)?;
    let after_marker = &page[marker_idx + marker.len()..];
    let date_marker = "class=\"date\"";
    let date_idx = after_marker.find(date_marker)?;
    let after_date_marker = &after_marker[date_idx + date_marker.len()..];
    let content_start = after_date_marker.find('>')? + 1;
    let after_content_start = &after_date_marker[content_start..];
    let content_end = after_content_start.find("</div>")?;
    clean_store_release_date(&after_content_start[..content_end])
}

fn format_store_release_timestamp(timestamp: u64) -> Option<String> {
    if timestamp == 0 {
        return None;
    }

    let date = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp as i64, 0)?;
    let month = STORE_RELEASE_MONTHS.get(date.month0() as usize)?;
    Some(format!("{} {}, {}", date.day(), month, date.year()))
}

fn clean_store_release_date(raw: &str) -> Option<String> {
    let decoded = decode_minimal_html(raw)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = decoded.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("coming soon") {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn decode_minimal_html(raw: &str) -> String {
    raw.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn parse_supported_languages(raw: &str) -> Vec<String> {
    let with_breaks = raw
        .replace("<br>", ",")
        .replace("<br/>", ",")
        .replace("<br />", ",");
    let mut text = String::new();
    let mut in_tag = false;
    for ch in with_breaks.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }

    text = text
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ");

    text.split(',')
        .filter_map(|part| {
            let cleaned = part
                .replace('*', "")
                .trim()
                .trim_matches('-')
                .trim()
                .to_string();
            if cleaned.is_empty()
                || cleaned
                    .to_ascii_lowercase()
                    .contains("languages with full audio support")
            {
                None
            } else {
                Some(cleaned)
            }
        })
        .collect()
}

#[tauri::command]
pub async fn fetch_achievements(
    api_key: String,
    steam_id64: String,
    app_id: u64,
) -> Result<AchievementSummary, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

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

    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
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

#[tauri::command]
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

#[tauri::command]
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

    fn owned_game(appid: u64, name: &str) -> OwnedGame {
        OwnedGame {
            appid,
            name: name.to_string(),
            playtime_forever: 0,
            img_icon_url: None,
            rtime_last_played: 0,
        }
    }

    #[test]
    fn transient_library_filter_hides_beta_apps() {
        assert!(is_transient_library_app(&owned_game(
            123,
            "Battlefield 6 Open Beta"
        )));
        assert!(is_transient_library_app(&owned_game(
            124,
            "Some Game Playtest"
        )));
        assert!(is_transient_library_app(&owned_game(125, "Some Game Demo")));
        assert!(!is_transient_library_app(&owned_game(
            126,
            "FINAL FANTASY VII"
        )));
    }

    #[test]
    fn euro_country_detection_includes_italy_and_germany() {
        assert!(is_euro_country_code("it"));
        assert!(is_euro_country_code("de"));
        assert!(!is_euro_country_code("us"));
    }

    #[test]
    fn store_app_response_parses_header_and_capsule_images() {
        let parsed: HashMap<String, StoreAppResponse> = serde_json::from_value(json!({
            "3280350": {
                "success": true,
                "data": {
                    "name": "DEATH STRANDING 2: ON THE BEACH",
                    "header_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/header.jpg",
                    "capsule_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/capsule_231x87.jpg"
                }
            }
        }))
        .expect("store appdetails json");

        let app = parsed.get("3280350").expect("appdetails entry");
        let data = app.data.as_ref().expect("appdetails data");

        assert_eq!(
            data.header_image.as_deref(),
            Some(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/header.jpg"
            )
        );
        assert_eq!(
            data.capsule_image.as_deref(),
            Some(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/capsule_231x87.jpg"
            )
        );
    }

    #[test]
    fn store_app_list_response_parses_paginated_apps() {
        let parsed: SteamAppListResponse = serde_json::from_value(json!({
            "response": {
                "apps": [
                    { "appid": 10, "name": "Counter-Strike" },
                    { "appid": 20, "name": "Team Fortress Classic" }
                ],
                "have_more_results": true,
                "last_appid": 20
            }
        }))
        .expect("store app list json");

        assert_eq!(parsed.response.apps.len(), 2);
        assert!(parsed.response.have_more_results);
        assert_eq!(parsed.response.last_appid, 20);
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

    #[test]
    fn parses_successful_store_details_with_images() {
        let raw = r#"{
          "3590": {
            "success": true,
            "data": {
              "name": "Plants vs. Zombies GOTY Edition",
              "genres": [{"description": "Strategy"}],
              "categories": [{"description": "Single-player"}],
              "release_date": {"date": "May 5, 2009"},
              "metacritic": {"score": 87},
              "developers": ["PopCap Games"],
              "publishers": ["PopCap Games"],
              "supported_languages": "English<strong>*</strong>, French, Italian<br><strong>*languages with full audio support</strong>",
              "platforms": {"windows": true, "mac": true, "linux": false},
              "header_image": "https://cdn.akamai.steamstatic.com/steam/apps/3590/header.jpg",
              "capsule_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3590/capsule_231x87.jpg",
              "is_free": false
            }
          }
        }"#;

        let details = parse_game_details_response(3590, raw, Some("it")).expect("details");

        assert_eq!(details.name, "Plants vs. Zombies GOTY Edition");
        assert_eq!(details.genres, vec!["Strategy"]);
        assert_eq!(details.metacritic_score, Some(87));
        assert_eq!(
            details.supported_languages,
            vec!["English", "French", "Italian"]
        );
        assert!(details.platforms.windows);
        assert_eq!(details.price_country_code.as_deref(), Some("IT"));
        assert!(details.header_image.unwrap().contains("/3590/header.jpg"));
        assert!(details
            .capsule_image
            .unwrap()
            .contains("/3590/capsule_231x87.jpg"));
    }

    #[test]
    fn parses_release_date_from_store_page_html() {
        let raw = r#"
            <div class="release_date">
                <div class="subtitle column">Release Date:</div>
                <div class="date">23 Jul, 2001</div>
            </div>
        "#;

        assert_eq!(
            parse_store_page_release_date(raw).as_deref(),
            Some("23 Jul, 2001")
        );
    }

    #[test]
    fn formats_original_release_timestamp_like_store_pages() {
        assert_eq!(
            format_store_release_timestamp(992934000).as_deref(),
            Some("19 Jun, 2001")
        );
        assert_eq!(
            format_store_release_timestamp(995861400).as_deref(),
            Some("23 Jul, 2001")
        );
        assert_eq!(format_store_release_timestamp(0), None);
    }

    #[test]
    fn parses_original_release_date_from_store_browse_response() {
        let raw = r#"{
            "response": {
                "store_items": [
                    {
                        "id": 294570,
                        "appid": 294570,
                        "success": 1,
                        "release": {
                            "steam_release_date": 1402084189,
                            "original_release_date": 992934000
                        }
                    },
                    {
                        "id": 260730,
                        "appid": 260730,
                        "success": 1,
                        "release": {
                            "steam_release_date": 1384941060,
                            "original_release_date": 995861400
                        }
                    }
                ]
            }
        }"#;

        let parsed: StoreBrowseGetItemsResponse = serde_json::from_str(raw).expect("store browse response");
        let dates = parsed
            .response
            .store_items
            .into_iter()
            .filter_map(|item| {
                let app_id = item.appid.or(item.id)?;
                let release_date = item
                    .release
                    .and_then(|release| release.original_release_date)
                    .and_then(format_store_release_timestamp);
                Some((app_id, release_date))
            })
            .collect::<HashMap<_, _>>();

        assert_eq!(dates[&294570].as_deref(), Some("19 Jun, 2001"));
        assert_eq!(dates[&260730].as_deref(), Some("23 Jul, 2001"));
    }

    #[test]
    fn returns_none_for_store_page_without_release_date_block() {
        let raw = r#"<html><body><div class="date">20 Nov, 2013</div></body></html>"#;

        assert_eq!(parse_store_page_release_date(raw), None);
    }

    #[test]
    fn treats_store_success_false_as_unavailable() {
        let raw = r#"{"43160":{"success":false}}"#;
        let error = parse_game_details_response(43160, raw, Some("it")).expect_err("unavailable");

        assert!(error.contains("Store API returned failure"));
    }

    #[test]
    fn parses_batch_price_overviews_and_skips_empty_data() {
        let raw = r#"{
          "508290": {
            "success": true,
            "data": {
              "price_overview": {
                "currency": "EUR",
                "initial": 199,
                "final": 99
              }
            }
          },
          "730": {
            "success": true,
            "data": []
          },
          "999999": {
            "success": false
          }
        }"#;

        let prices = parse_game_price_overviews_response(&[508290, 730, 999999], raw, Some("it"))
            .expect("price batch");

        assert_eq!(prices.len(), 1);
        assert_eq!(prices[0].app_id, 508290);
        assert_eq!(prices[0].price_currency.as_deref(), Some("EUR"));
        assert_eq!(prices[0].price_initial, Some(199));
        assert_eq!(prices[0].price_final, Some(99));
        assert_eq!(prices[0].price_country_code.as_deref(), Some("IT"));
    }
}

// === Vanity URL resolver ===

#[tauri::command]
pub async fn resolve_vanity_url(api_key: String, vanity_url: String) -> Result<String, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
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

#[derive(Debug, Clone, Serialize)]
pub struct FriendSummary {
    pub steamid: String,
    pub personaname: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub friend_since: u64,
}

#[tauri::command]
pub async fn fetch_player_summary(
    api_key: String,
    steam_id64: String,
) -> Result<PlayerSummary, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
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

#[tauri::command]
pub async fn fetch_friend_list(
    api_key: String,
    steam_id64: String,
) -> Result<Vec<FriendSummary>, String> {
    let client = client_builder_for_scope(HttpProxyScope::SteamApi)?
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key={}&steamid={}&relationship=friend",
        api_key, steam_id64
    );

    let text = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch friend list: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read friend list: {}", e))?;

    #[derive(Deserialize)]
    struct FriendsOuter {
        friendslist: Option<FriendsList>,
    }
    #[derive(Deserialize)]
    struct FriendsList {
        #[serde(default)]
        friends: Vec<FriendRaw>,
    }
    #[derive(Deserialize)]
    struct FriendRaw {
        steamid: String,
        #[serde(default)]
        friend_since: u64,
    }

    let parsed: FriendsOuter = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Failed to parse friend list: {}. The profile may be private or the API key may be invalid.",
            e
        )
    })?;
    let raw_friends = parsed.friendslist.map(|f| f.friends).unwrap_or_default();

    if raw_friends.is_empty() {
        return Ok(Vec::new());
    }

    let friend_since: HashMap<String, u64> = raw_friends
        .iter()
        .map(|f| (f.steamid.clone(), f.friend_since))
        .collect();
    let ids: Vec<String> = raw_friends.into_iter().map(|f| f.steamid).collect();
    let mut friends = Vec::new();

    for chunk in ids.chunks(100) {
        let summaries = fetch_player_summaries_chunk(&client, &api_key, chunk).await?;
        for summary in summaries {
            friends.push(FriendSummary {
                friend_since: friend_since
                    .get(&summary.steamid)
                    .copied()
                    .unwrap_or_default(),
                steamid: summary.steamid,
                personaname: summary.personaname,
                avatar: summary.avatar,
                avatarmedium: summary.avatarmedium,
            });
        }
    }

    friends.sort_by(|a, b| {
        a.personaname
            .to_lowercase()
            .cmp(&b.personaname.to_lowercase())
    });
    Ok(friends)
}

async fn fetch_player_summaries_chunk(
    client: &reqwest::Client,
    api_key: &str,
    steam_ids: &[String],
) -> Result<Vec<PlayerSummary>, String> {
    if steam_ids.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}",
        api_key,
        steam_ids.join(",")
    );
    let text = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch player summaries: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read player summaries: {}", e))?;

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
    Ok(resp
        .response
        .players
        .into_iter()
        .map(|player| PlayerSummary {
            steamid: player.steamid,
            personaname: player.personaname,
            avatar: player.avatar,
            avatarmedium: player.avatarmedium,
        })
        .collect())
}
