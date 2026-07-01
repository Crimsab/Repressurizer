use serde::Deserialize;

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

use super::types::{OwnedGame, SteamAppListItem};

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

#[derive(Debug, Deserialize)]
pub(super) struct SteamAppListResponse {
    pub(super) response: SteamAppListInner,
}

#[derive(Debug, Deserialize)]
pub(super) struct SteamAppListInner {
    #[serde(default)]
    pub(super) apps: Vec<SteamAppListItem>,
    #[serde(default)]
    pub(super) have_more_results: bool,
    #[serde(default)]
    pub(super) last_appid: u64,
}

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

pub(super) fn is_transient_library_app(game: &OwnedGame) -> bool {
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
