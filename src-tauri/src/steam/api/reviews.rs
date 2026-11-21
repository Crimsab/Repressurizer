use serde::Deserialize;

use crate::http_policy::{client_for_scope, HttpProxyScope};

use super::types::SteamReviewSummary;

/// Valve retired store.steampowered.com/appreviews on 2026-10-22 (it now redirects to the
/// store front page); review summaries come from the keyless Web API service instead.
const GET_APP_REVIEWS_URL: &str =
    "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";

#[derive(Debug, Deserialize)]
struct GetAppReviewsEnvelope {
    response: Option<GetAppReviewsResponse>,
}

#[derive(Debug, Default, Deserialize)]
struct GetAppReviewsResponse {
    query_summary: Option<ReviewsQuerySummary>,
}

#[derive(Debug, Default, Deserialize)]
struct ReviewsQuerySummary {
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

fn review_query(app_id: u64) -> String {
    // review_type 0 is required for query_summary; one review keeps the payload small.
    serde_json::json!({
        "appid": app_id,
        "num_per_page": 1,
        "review_type": 0,
        "filter": "all",
        "languages": ["all"],
        "purchase_type": "all",
    })
    .to_string()
}

pub async fn fetch_steam_review_summary(app_id: u64) -> Result<SteamReviewSummary, String> {
    let client = client_for_scope(
        HttpProxyScope::SteamApi,
        Some(&format!("Repressurizer/{}", env!("CARGO_PKG_VERSION"))),
    )?;
    let response = client
        .get(GET_APP_REVIEWS_URL)
        .query(&[("input_json", review_query(app_id))])
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

    let fetched_at = chrono::Utc::now().timestamp_millis().max(0) as u64;
    parse_review_summary(app_id, &text, fetched_at)
}

fn parse_review_summary(
    app_id: u64,
    body: &str,
    fetched_at: u64,
) -> Result<SteamReviewSummary, String> {
    let envelope: GetAppReviewsEnvelope = serde_json::from_str(body).map_err(|_| {
        let start: String = body.trim_start().chars().take(1).collect();
        if start == "<" {
            format!(
                "Steam reviews returned a web page instead of data for app {}",
                app_id
            )
        } else {
            format!("Failed to parse Steam reviews response for app {}", app_id)
        }
    })?;
    // Unknown apps and apps without reviews come back as an empty response object.
    let summary = envelope
        .response
        .unwrap_or_default()
        .query_summary
        .unwrap_or_default();
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

#[cfg(test)]
mod tests {
    use super::{fetch_steam_review_summary, parse_review_summary, review_query};

    #[test]
    fn reads_the_summary_from_the_web_api_envelope() {
        let body = r#"{"response":{"query_summary":{"num_reviews":1,"review_score":8,"review_score_desc":"Very Positive","total_positive":1366,"total_negative":244,"total_reviews":1610},"reviews":[],"cursor":"x"}}"#;
        let summary = parse_review_summary(2943650, body, 7).unwrap();
        assert_eq!(summary.review_score_desc, "Very Positive");
        assert_eq!(summary.review_score, 8);
        assert_eq!(summary.total_reviews, 1610);
        assert_eq!(summary.positive_percentage, Some(85));
        assert_eq!(summary.fetched_at, 7);
    }

    #[test]
    fn treats_an_empty_response_as_an_app_without_reviews() {
        let summary = parse_review_summary(1, r#"{"response":{}}"#, 7).unwrap();
        assert_eq!(summary.total_reviews, 0);
        assert_eq!(summary.positive_percentage, None);
    }

    #[test]
    fn names_an_html_page_instead_of_a_parse_failure() {
        let error = parse_review_summary(620, "<!DOCTYPE html><html>", 7).unwrap_err();
        assert!(error.contains("web page"), "{error}");
    }

    #[test]
    fn asks_for_the_all_language_summary() {
        let query: serde_json::Value = serde_json::from_str(&review_query(620)).unwrap();
        assert_eq!(query["appid"], 620);
        assert_eq!(query["review_type"], 0);
        assert_eq!(query["languages"][0], "all");
    }

    #[tokio::test]
    #[ignore]
    async fn live_steam_review_summary() {
        if std::env::var("REPRESSURIZER_STEAM_LIVE").ok().as_deref() != Some("1") {
            eprintln!("set REPRESSURIZER_STEAM_LIVE=1 to run the live Steam reviews test");
            return;
        }
        let summary = fetch_steam_review_summary(620)
            .await
            .expect("Portal 2 reviews");
        assert!(summary.total_reviews > 100_000, "{summary:?}");
        assert!(!summary.review_score_desc.is_empty());
    }
}
