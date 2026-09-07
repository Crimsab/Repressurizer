use chrono::Datelike;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::http_policy::{client_for_scope, HttpProxyScope};

use super::types::{GameDetails, GamePriceOverview, PlatformSupport, StoreReleaseDateResult};

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
// Keep minor units exactly representable across the Tauri/JavaScript boundary.
const MAX_PLAUSIBLE_STEAM_PRICE_CENTS: u64 = 9_007_199_254_740_991;
const STORE_PRICE_BATCH_SIZE: usize = 250;
const STORE_ENRICHMENT_TIMEOUT: Duration = Duration::from_secs(5);
const STORE_ENRICHMENT_CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const STORE_ENRICHMENT_CACHE_CAPACITY: usize = 512;

#[derive(Debug, Deserialize)]
pub(super) struct StoreAppResponse {
    success: bool,
    pub(super) data: Option<StoreAppData>,
}

#[derive(Debug, Deserialize)]
struct StorePriceAppResponse {
    success: bool,
    data: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowseGetItemsResponse {
    pub(super) response: StoreBrowseItemsResponse,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowseItemsResponse {
    #[serde(default)]
    pub(super) store_items: Vec<StoreBrowseItem>,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowseItem {
    #[serde(default)]
    pub(super) id: Option<u64>,
    #[serde(default)]
    pub(super) appid: Option<u64>,
    #[serde(default)]
    pub(super) release: Option<StoreBrowseRelease>,
    #[serde(default)]
    pub(super) platforms: Option<StoreBrowsePlatforms>,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowseRelease {
    #[serde(default)]
    pub(super) original_release_date: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowsePlatforms {
    #[serde(default)]
    pub(super) steam_deck_compat_category: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreAppData {
    name: Option<String>,
    genres: Option<Vec<StoreGenre>>,
    categories: Option<Vec<StoreCategory>>,
    release_date: Option<StoreReleaseDate>,
    metacritic: Option<StoreMetacritic>,
    developers: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    supported_languages: Option<String>,
    platforms: Option<StorePlatforms>,
    controller_support: Option<String>,
    pub(super) header_image: Option<String>,
    pub(super) capsule_image: Option<String>,
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

fn plausible_price(price: Option<u64>) -> Option<u64> {
    price.filter(|value| *value <= MAX_PLAUSIBLE_STEAM_PRICE_CENTS)
}

#[derive(Debug, Clone, Default)]
struct StorePageMetadata {
    tags: Vec<String>,
    deck_status: Option<String>,
}

#[derive(Debug, Clone)]
struct CachedStorePageMetadata {
    metadata: StorePageMetadata,
    fetched_at: Instant,
}

static STORE_ENRICHMENT_CACHE: OnceLock<Mutex<HashMap<u64, CachedStorePageMetadata>>> =
    OnceLock::new();

#[derive(Debug, Deserialize)]
struct StorePlatforms {
    windows: Option<bool>,
    mac: Option<bool>,
    linux: Option<bool>,
}

pub async fn fetch_game_details(
    app_id: u64,
    country_code: Option<String>,
) -> Result<GameDetails, String> {
    let client = client_for_scope(HttpProxyScope::SteamStore, Some(STEAM_STORE_USER_AGENT))?;

    let requested_cc = country_code.unwrap_or_default().trim().to_ascii_lowercase();
    let requested = (!requested_cc.is_empty()).then_some(requested_cc.as_str());
    match fetch_game_details_with_country(&client, app_id, requested).await {
        Ok(details) => Ok(details),
        Err(error) if requested.is_some() && regional_fallback_allowed(&error) => {
            // A product can be hidden in one country while its public metadata
            // remains available globally. Retrying without `cc` is safe only
            // after removing every regional price field from the result.
            let mut details = fetch_game_details_with_country(&client, app_id, None)
                .await
                .map_err(|_| error.clone())?;
            details.price_initial = None;
            details.price_final = None;
            details.price_currency = None;
            details.price_country_code = None;
            Ok(details)
        }
        Err(error) => Err(error),
    }
}

fn regional_fallback_allowed(error: &str) -> bool {
    error.starts_with("Store API returned failure for app ")
        || error == "App not found in response"
        || error == "No data in response"
}

pub async fn fetch_store_release_date(app_id: u64) -> Result<StoreReleaseDateResult, String> {
    let mut results = fetch_store_release_dates(vec![app_id]).await?;
    Ok(results.pop().unwrap_or(StoreReleaseDateResult {
        app_id,
        release_date: None,
    }))
}

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

    let api_client = client_for_scope(HttpProxyScope::SteamApi, Some(STEAM_STORE_USER_AGENT))?;
    let store_client = client_for_scope(HttpProxyScope::SteamStore, Some(STEAM_STORE_USER_AGENT))?;

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

    let parsed: StoreBrowseGetItemsResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse StoreBrowse response: {}", e))?;
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

    let client = client_for_scope(HttpProxyScope::SteamStore, Some(STEAM_STORE_USER_AGENT))?;

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
    if requested_cc.is_empty() {
        vec![None]
    } else {
        // A price response is market-specific. Never substitute another
        // country when the requested market has no listing.
        vec![Some(requested_cc.to_string())]
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub(super) fn is_euro_country_code(country_code: &str) -> bool {
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

pub(super) fn parse_game_price_overviews_response(
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

    let status = response.status();
    if !status.is_success() {
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown");
        return Err(format!(
            "Steam Store returned HTTP {} for app {}; Retry-After: {}",
            status.as_u16(),
            app_id,
            retry_after
        ));
    }
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut details = parse_game_details_response(app_id, &text, country_code)?;

    // Tags and Deck compatibility are published outside the appdetails
    // payload. Enrich opportunistically so a slow or blocked endpoint never
    // prevents basic metadata from loading. Both lightweight requests share a
    // bounded timeout and a one-hour in-memory cache.
    if let Ok(Ok(page_metadata)) = tokio::time::timeout(
        STORE_ENRICHMENT_TIMEOUT,
        fetch_store_enrichment(client, app_id, country_code),
    )
    .await
    {
        details.tags = page_metadata.tags;
        details.deck_status = page_metadata.deck_status;
    }

    Ok(details)
}

pub(super) fn parse_game_details_response(
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

    let categories: Vec<String> = data
        .categories
        .as_ref()
        .map(|items| items.iter().map(|item| item.description.clone()).collect())
        .unwrap_or_default();
    let full_controller_support = categories
        .iter()
        .any(|category| category.eq_ignore_ascii_case("Full controller support"));

    Ok(GameDetails {
        app_id,
        name: data.name.clone().unwrap_or_default(),
        genres: data
            .genres
            .as_ref()
            .map(|g| g.iter().map(|x| x.description.clone()).collect())
            .unwrap_or_default(),
        tags: Vec::new(),
        categories,
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
        full_controller_support: Some(
            full_controller_support
                || data
                    .controller_support
                    .as_deref()
                    .is_some_and(|support| support.eq_ignore_ascii_case("full")),
        ),
        // These values are not part of the public appdetails/store page
        // contract. Keep them unknown instead of guessing from DRM or system
        // requirements (which have different meanings).
        deck_status: None,
        external_launcher: None,
        offline_support: None,
        first_launch_online: None,
        estimated_install_bytes: None,
    })
}

async fn fetch_store_enrichment(
    client: &reqwest::Client,
    app_id: u64,
    country_code: Option<&str>,
) -> Result<StorePageMetadata, String> {
    if let Some(metadata) = cached_store_enrichment(app_id) {
        return Ok(metadata);
    }

    // apphover is a small storefront fragment containing the popular tags;
    // StoreBrowse carries the official Deck compatibility category. Fetch both
    // concurrently so metadata enrichment does not add serial latency.
    let (tags_result, deck_result) = tokio::join!(
        fetch_store_hover_tags(client, app_id),
        fetch_store_browse_deck_status(client, app_id, country_code),
    );
    if tags_result.is_err() && deck_result.is_err() {
        return Err(format!(
            "Steam optional metadata unavailable for app {}",
            app_id
        ));
    }
    let metadata = StorePageMetadata {
        tags: tags_result.unwrap_or_default(),
        deck_status: deck_result.unwrap_or(None),
    };
    cache_store_enrichment(app_id, metadata.clone());
    Ok(metadata)
}

fn cached_store_enrichment(app_id: u64) -> Option<StorePageMetadata> {
    let cache = STORE_ENRICHMENT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache.lock().ok()?;
    let entry = cache.get(&app_id)?;
    if entry.fetched_at.elapsed() <= STORE_ENRICHMENT_CACHE_TTL {
        return Some(entry.metadata.clone());
    }
    cache.remove(&app_id);
    None
}

fn cache_store_enrichment(app_id: u64, metadata: StorePageMetadata) {
    let cache = STORE_ENRICHMENT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut cache) = cache.lock() else {
        return;
    };
    if cache.len() >= STORE_ENRICHMENT_CACHE_CAPACITY && !cache.contains_key(&app_id) {
        if let Some(oldest_app_id) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.fetched_at)
            .map(|(key, _)| *key)
        {
            cache.remove(&oldest_app_id);
        }
    }
    cache.insert(
        app_id,
        CachedStorePageMetadata {
            metadata,
            fetched_at: Instant::now(),
        },
    );
}

async fn fetch_store_hover_tags(
    client: &reqwest::Client,
    app_id: u64,
) -> Result<Vec<String>, String> {
    let response = client
        .get(format!("https://store.steampowered.com/apphover/{app_id}"))
        .query(&[("l", "english")])
        .send()
        .await
        .map_err(|error| format!("Steam apphover request failed: {error}"))?;
    let status = response.status();
    let fragment = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Steam apphover response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Steam apphover returned HTTP {} for app {}",
            status.as_u16(),
            app_id
        ));
    }
    Ok(parse_store_page_tags(&fragment))
}

async fn fetch_store_browse_deck_status(
    client: &reqwest::Client,
    app_id: u64,
    country_code: Option<&str>,
) -> Result<Option<String>, String> {
    let input_json = serde_json::json!({
        "ids": [{ "appid": app_id }],
        "context": {
            "language": "english",
            "country_code": country_code.unwrap_or("US").to_ascii_uppercase()
        },
        "data_request": {
            "include_platforms": true
        }
    })
    .to_string();
    let response = client
        .get(STORE_BROWSE_GET_ITEMS_URL)
        .query(&[("input_json", input_json)])
        .send()
        .await
        .map_err(|error| format!("Steam StoreBrowse request failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read StoreBrowse response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "StoreBrowse returned HTTP {} for app {}",
            status.as_u16(),
            app_id
        ));
    }

    let parsed: StoreBrowseGetItemsResponse = serde_json::from_str(&text)
        .map_err(|error| format!("Failed to parse StoreBrowse response: {error}"))?;
    let item = parsed
        .response
        .store_items
        .into_iter()
        .find(|item| item.appid.or(item.id) == Some(app_id));
    let category = item
        .and_then(|item| item.platforms)
        .and_then(|platforms| platforms.steam_deck_compat_category);
    Ok(category.and_then(deck_status_from_category))
}

fn deck_status_from_category(category: u64) -> Option<String> {
    Some(
        match category {
            3 => "verified",
            2 => "playable",
            1 => "unsupported",
            0 => "unknown",
            _ => return None,
        }
        .to_string(),
    )
}

fn parse_store_page_tags(page: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut search_from = 0;
    let marker = "class=\"app_tag\"";

    while let Some(relative_start) = page[search_from..].find(marker) {
        let marker_start = search_from + relative_start;
        let Some(content_offset) = page[marker_start..].find('>') else {
            break;
        };
        let content_start = marker_start + content_offset + 1;
        let end_anchor = page[content_start..].find("</a>");
        let end_div = page[content_start..].find("</div>");
        let Some((relative_end, closing_len)) = (match (end_anchor, end_div) {
            (Some(anchor), Some(div)) if anchor < div => Some((anchor, 4)),
            (Some(anchor), None) => Some((anchor, 4)),
            (None, Some(div)) => Some((div, 6)),
            (Some(_), Some(div)) => Some((div, 6)),
            (None, None) => None,
        }) else {
            break;
        };
        let content_end = content_start + relative_end;
        if let Some(tag) = clean_store_page_text(&page[content_start..content_end]) {
            if !tags.iter().any(|existing| existing == &tag) {
                tags.push(tag);
            }
        }
        search_from = content_end + closing_len;
    }

    tags
}

fn clean_store_page_text(raw: &str) -> Option<String> {
    let mut text = String::new();
    let mut in_tag = false;
    for ch in decode_minimal_html(raw).chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }

    let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!cleaned.is_empty()).then_some(cleaned)
}

pub(super) fn parse_store_page_release_date(page: &str) -> Option<String> {
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

pub(super) fn format_store_release_timestamp(timestamp: u64) -> Option<String> {
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

#[cfg(test)]
mod fallback_policy_tests {
    use super::regional_fallback_allowed;
    #[test]
    fn only_regional_unavailability_uses_another_country() {
        assert!(regional_fallback_allowed(
            "Store API returned failure for app 10"
        ));
        assert!(regional_fallback_allowed("App not found in response"));
        for error in [
            "Steam Store returned HTTP 429 for app 10",
            "Steam Store returned HTTP 503 for app 10",
            "HTTP request failed: timed out",
            "Failed to parse store response",
        ] {
            assert!(!regional_fallback_allowed(error));
        }
    }
}
