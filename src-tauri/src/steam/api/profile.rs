use serde::Deserialize;
use std::collections::HashMap;

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

use super::types::{FriendSummary, PlayerSummary};

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
