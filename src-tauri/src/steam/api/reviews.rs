use serde::Deserialize;

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

use super::types::SteamReviewSummary;

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
