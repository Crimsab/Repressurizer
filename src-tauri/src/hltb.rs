use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HltbData {
    pub main_story: Option<f32>,
    pub main_extra: Option<f32>,
    pub completionist: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct HltbTokenResponse {
    token: String,
}

#[derive(Debug, Deserialize)]
struct HltbResponse {
    data: Option<Vec<HltbGame>>,
}

#[derive(Debug, Deserialize)]
struct HltbGame {
    comp_main: Option<serde_json::Value>,
    comp_plus: Option<serde_json::Value>,
    comp_100: Option<serde_json::Value>,
}

struct TokenCache {
    token: String,
    fetched_at: std::time::Instant,
}

static HLTB_TOKEN: OnceLock<Mutex<Option<TokenCache>>> = OnceLock::new();

fn hltb_token_cache() -> &'static Mutex<Option<TokenCache>> {
    HLTB_TOKEN.get_or_init(|| Mutex::new(None))
}

fn seconds_to_hours(v: &serde_json::Value) -> Option<f32> {
    let secs = v.as_f64()?;
    if secs <= 0.0 {
        return None;
    }
    Some(((secs / 3600.0 * 10.0).round() / 10.0) as f32)
}

/// Fetch a fresh search token from HLTB's /api/finder/init endpoint.
/// The token is IP-bound and valid for several minutes.
async fn fetch_fresh_token(client: &reqwest::Client) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let url = format!("https://howlongtobeat.com/api/finder/init?t={}", ts);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://howlongtobeat.com/")
        .header("Origin", "https://howlongtobeat.com")
        .send()
        .await
        .map_err(|e| format!("HLTB token request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("HLTB token endpoint returned {}: {}", status, &text[..text.len().min(200)]));
    }

    let token_resp: HltbTokenResponse =
        serde_json::from_str(&text).map_err(|e| format!("HLTB token parse error: {} (body: {})", e, &text[..text.len().min(200)]))?;

    Ok(token_resp.token)
}

/// Return a cached token (valid ≤ 5 min) or fetch a new one.
/// Avoids one extra HTTP round-trip per game search.
async fn get_token(client: &reqwest::Client) -> Result<String, String> {
    // Check cache under lock, release before any await
    {
        let cache = hltb_token_cache().lock().unwrap();
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < std::time::Duration::from_secs(300) {
                return Ok(cached.token.clone());
            }
        }
    }

    let token = fetch_fresh_token(client).await?;

    {
        let mut cache = hltb_token_cache().lock().unwrap();
        *cache = Some(TokenCache { token: token.clone(), fetched_at: std::time::Instant::now() });
    }

    Ok(token)
}

/// Strip common edition/variant suffixes so HLTB search returns better matches.
/// e.g. "Portal 2 GOTY Edition" → "Portal 2", "Hades (2019)" → "Hades"
fn normalize_game_name(name: &str) -> String {
    let mut s = name.trim().to_string();

    // Strip trademark / registered / copyright symbols
    s = s.replace('™', "").replace('®', "").replace('©', "");

    // Strip emojis and non-ASCII symbols (keep basic Latin + extended Latin letters)
    s = s.chars().filter(|c| c.is_ascii() || c.is_alphabetic()).collect();

    // Normalize multiple spaces
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");

    // Remove trailing "(YYYY)" year annotations and other trailing parenthesized text
    loop {
        let lower = s.to_lowercase();
        if let Some(start) = lower.rfind('(') {
            if let Some(end_rel) = lower[start..].find(')') {
                let inside = lower[start + 1..start + end_rel].trim().to_string();
                // Remove (YYYY), (Classic), (Retired), etc.
                if inside.len() == 4 && inside.chars().all(|c| c.is_ascii_digit())
                    || inside == "classic"
                    || inside == "retired"
                {
                    s = s[..start].trim_end().to_string();
                    continue;
                }
            }
        }
        break;
    }

    // Suffixes to strip, tried longest-first (loop until stable)
    let suffixes: &[&str] = &[
        "game of the year edition",
        "game of the year",
        "goty edition",
        "goty",
        "definitive edition",
        "enhanced edition",
        "deluxe edition",
        "complete edition",
        "gold edition",
        "ultimate edition",
        "premium edition",
        "standard edition",
        "anniversary edition",
        "special edition",
        "collector's edition",
        "collectors edition",
        "director's cut",
        "directors cut",
        "reloaded edition",
        "remastered",
        "remake",
        "classic",
        "hd",
    ];

    loop {
        let lower = s.to_lowercase();
        let trimmed_lower = lower
            .trim_end_matches(|c: char| matches!(c, ' ' | '-' | ':' | ','));
        let mut found = false;
        for suffix in suffixes {
            if trimmed_lower.ends_with(suffix) {
                let new_len = trimmed_lower.len() - suffix.len();
                s = s[..new_len]
                    .trim_end_matches(|c: char| matches!(c, ' ' | '-' | ':' | ','))
                    .to_string();
                found = true;
                break;
            }
        }
        if !found {
            break;
        }
    }

    s.trim().to_string()
}

async fn search_hltb_name(
    client: &reqwest::Client,
    token: &str,
    search_name: &str,
) -> Result<Option<HltbData>, String> {
    let search_terms: Vec<&str> = search_name.split_whitespace().collect();

    let body = serde_json::json!({
        "searchType": "games",
        "searchTerms": search_terms,
        "searchPage": 1,
        "size": 5,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": "",
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": { "min": 0, "max": 0 },
                "gameplay": { "perspective": "", "flow": "", "genre": "", "difficulty": "" },
                "rangeYear": { "min": "", "max": "" },
                "modifier": ""
            },
            "users": { "sortCategory": "postcount" },
            "lists": { "sortCategory": "follows" },
            "filter": "",
            "sort": 0,
            "randomizer": 0
        },
        "useCache": true
    });

    let resp = client
        .post("https://howlongtobeat.com/api/finder")
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Referer", "https://howlongtobeat.com/")
        .header("Origin", "https://howlongtobeat.com")
        .header("x-auth-token", token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HLTB request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read HLTB response: {}", e))?;

    if !status.is_success() {
        return Err(format!("HLTB search returned {}: {}", status, &text[..text.len().min(200)]));
    }

    let data: HltbResponse =
        serde_json::from_str(&text).map_err(|e| format!("HLTB parse error: {} (body: {})", e, &text[..text.len().min(200)]))?;

    let first = match data.data.and_then(|d| d.into_iter().next()) {
        Some(g) => g,
        None => return Ok(None),
    };

    Ok(Some(HltbData {
        main_story: first.comp_main.as_ref().and_then(seconds_to_hours),
        main_extra: first.comp_plus.as_ref().and_then(seconds_to_hours),
        completionist: first.comp_100.as_ref().and_then(seconds_to_hours),
    }))
}

#[tauri::command]
pub async fn fetch_hltb(game_name: String) -> Result<Option<HltbData>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let token = get_token(&client).await?;

    let normalized = normalize_game_name(&game_name);

    // Try normalized name first (strips "GOTY", "Definitive Edition", year suffixes, etc.)
    let search_name = if normalized.is_empty() { game_name.as_str() } else { normalized.as_str() };
    if let Some(data) = search_hltb_name(&client, &token, search_name).await? {
        return Ok(Some(data));
    }

    // If normalization changed the name and we got no results, try the original
    if normalized != game_name && !normalized.is_empty() {
        return search_hltb_name(&client, &token, &game_name).await;
    }

    Ok(None)
}
