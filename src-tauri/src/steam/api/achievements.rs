use serde::Deserialize;
use std::collections::HashMap;

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

use super::types::{AchievementInfo, AchievementSummary};

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
