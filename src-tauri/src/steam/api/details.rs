use chrono::Datelike;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

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
const MAX_PLAUSIBLE_STEAM_PRICE_CENTS: u64 = 500_000;
const STORE_PRICE_BATCH_SIZE: usize = 250;

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
}

#[derive(Debug, Deserialize)]
pub(super) struct StoreBrowseRelease {
    #[serde(default)]
    pub(super) original_release_date: Option<u64>,
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

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    parse_game_details_response(app_id, &text, country_code)
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
