use crate::http_policy::{client_builder_for_scope, HttpProxyScope};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const GG_DEALS_API_URL: &str = "https://api.gg.deals/v1/prices/by-steam-app-id/";
const REQUEST_INTERVAL: Duration = Duration::from_secs(2);
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
const MAX_PRICE: f64 = 1_000_000.0;

static LAST_REQUEST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GgDealsPrice {
    app_id: u64,
    url: Option<String>,
    currency: String,
    current_retail: Option<f64>,
    current_keyshops: Option<f64>,
    historical_retail: Option<f64>,
    historical_keyshops: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    success: bool,
    #[serde(default)]
    data: HashMap<String, Option<ApiGame>>,
}

#[derive(Debug, Deserialize)]
struct ApiGame {
    #[serde(default)]
    url: Option<String>,
    prices: ApiPrices,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPrices {
    #[serde(default)]
    currency: String,
    #[serde(default)]
    current_retail: Option<f64>,
    #[serde(default)]
    current_keyshops: Option<f64>,
    #[serde(default)]
    historical_retail: Option<f64>,
    #[serde(default)]
    historical_keyshops: Option<f64>,
}

#[tauri::command]
pub(crate) async fn fetch_gg_deals_price(
    app_id: u64,
    api_key: String,
    region: String,
) -> Result<Option<GgDealsPrice>, String> {
    if app_id == 0 {
        return Err("A valid Steam App ID is required".to_string());
    }
    let api_key = api_key.trim();
    if api_key.is_empty() || api_key.len() > 512 {
        return Err("A valid GG.deals API key is required".to_string());
    }
    let region = normalize_region(&region)?;

    wait_for_request_slot().await;
    let client = client_builder_for_scope(HttpProxyScope::SteamStore)?
        .user_agent(format!("Repressurizer/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Could not initialize the GG.deals client".to_string())?;

    let response = client
        .get(GG_DEALS_API_URL)
        .query(&[
            ("ids", app_id.to_string()),
            ("key", api_key.to_string()),
            ("region", region),
        ])
        .send()
        .await
        .map_err(|_| "GG.deals is currently unavailable".to_string())?;
    let status = response.status();
    if status.as_u16() == 429 {
        return Err("GG.deals rate limit reached; try again later".to_string());
    }
    if status.as_u16() == 400 || status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("GG.deals rejected the API key or region".to_string());
    }
    if !status.is_success() {
        return Err(format!("GG.deals returned HTTP {}", status.as_u16()));
    }
    if response.content_length().unwrap_or(0) > MAX_RESPONSE_BYTES {
        return Err("GG.deals returned an unexpectedly large response".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Could not read the GG.deals response".to_string())?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("GG.deals returned an unexpectedly large response".to_string());
    }
    parse_api_response(&bytes, app_id)
}

async fn wait_for_request_slot() {
    let limiter = LAST_REQUEST.get_or_init(|| Mutex::new(None));
    let mut last_request = limiter.lock().await;
    if let Some(previous) = *last_request {
        let elapsed = previous.elapsed();
        if elapsed < REQUEST_INTERVAL {
            tokio::time::sleep(REQUEST_INTERVAL - elapsed).await;
        }
    }
    *last_request = Some(Instant::now());
}

fn normalize_region(region: &str) -> Result<String, String> {
    let normalized = region.trim().to_ascii_lowercase();
    if normalized.len() == 2
        && normalized
            .chars()
            .all(|character| character.is_ascii_lowercase())
    {
        Ok(normalized)
    } else {
        Err("GG.deals region must be a two-letter code".to_string())
    }
}

fn parse_api_response(bytes: &[u8], app_id: u64) -> Result<Option<GgDealsPrice>, String> {
    let response: ApiResponse = serde_json::from_slice(bytes)
        .map_err(|_| "GG.deals returned an invalid response".to_string())?;
    if !response.success {
        return Err("GG.deals could not complete the request".to_string());
    }

    let Some(game) = response
        .data
        .get(&app_id.to_string())
        .and_then(Option::as_ref)
    else {
        return Ok(None);
    };
    Ok(Some(GgDealsPrice {
        app_id,
        url: game.url.clone().and_then(valid_gg_deals_url),
        currency: game.prices.currency.chars().take(12).collect(),
        current_retail: clean_price(game.prices.current_retail),
        current_keyshops: clean_price(game.prices.current_keyshops),
        historical_retail: clean_price(game.prices.historical_retail),
        historical_keyshops: clean_price(game.prices.historical_keyshops),
    }))
}

fn clean_price(value: Option<f64>) -> Option<f64> {
    value.filter(|price| price.is_finite() && *price >= 0.0 && *price <= MAX_PRICE)
}

fn valid_gg_deals_url(value: String) -> Option<String> {
    let parsed = reqwest::Url::parse(&value).ok()?;
    if parsed.scheme() == "https" && parsed.host_str() == Some("gg.deals") {
        Some(value)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_region, parse_api_response, GgDealsPrice};

    #[test]
    fn parses_price_fixture_by_steam_app_id() {
        let fixture = r#"{
          "success": true,
          "data": {
            "620": {
              "url": "https://gg.deals/game/portal-2/",
              "prices": {
                "currency": "€",
                "currentRetail": 1.95,
                "currentKeyshops": 1.37,
                "historicalRetail": 0.97,
                "historicalKeyshops": 0.82
              }
            }
          }
        }"#;

        assert_eq!(
            parse_api_response(fixture.as_bytes(), 620).unwrap(),
            Some(GgDealsPrice {
                app_id: 620,
                url: Some("https://gg.deals/game/portal-2/".to_string()),
                currency: "€".to_string(),
                current_retail: Some(1.95),
                current_keyshops: Some(1.37),
                historical_retail: Some(0.97),
                historical_keyshops: Some(0.82),
            })
        );
    }

    #[test]
    fn treats_missing_games_as_unavailable_and_rejects_untrusted_links() {
        let missing = br#"{"success":true,"data":{"620":null}}"#;
        assert_eq!(parse_api_response(missing, 620).unwrap(), None);

        let untrusted = r#"{
          "success": true,
          "data": {
            "620": {
              "url": "https://example.com/key-in-query?key=secret",
              "prices": {"currency":"€","currentRetail":1.0}
            }
          }
        }"#;
        let parsed = parse_api_response(untrusted.as_bytes(), 620)
            .unwrap()
            .unwrap();
        assert_eq!(parsed.url, None);
    }

    #[test]
    fn normalizes_bounded_region_codes() {
        assert_eq!(normalize_region(" IT ").unwrap(), "it");
        assert!(normalize_region("italy").is_err());
        assert!(normalize_region("i1").is_err());
    }
}
