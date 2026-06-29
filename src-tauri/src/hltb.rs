use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use crate::http_policy::{client_builder_for_scope, HttpProxyScope};

const UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TOKEN_TTL_SECS: u64 = 300;
const MIN_CONFIDENCE: f32 = 74.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HltbData {
    pub main_story: Option<f32>,
    pub main_extra: Option<f32>,
    pub completionist: Option<f32>,
    #[serde(default)]
    pub game_id: Option<u64>,
    #[serde(default)]
    pub game_name: Option<String>,
    #[serde(default)]
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
struct HltbTokenResponse {
    token: String,
    #[serde(rename = "hpKey")]
    hp_key: Option<String>,
    #[serde(rename = "hpVal")]
    hp_val: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HltbResponse {
    data: Option<Vec<HltbGame>>,
}

#[derive(Debug, Clone, Deserialize)]
struct HltbGame {
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    game_id: Option<u64>,
    #[serde(default)]
    game_name: Option<String>,
    #[serde(default)]
    game_alias: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    profile_steam: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u32")]
    release_world: Option<u32>,
    #[serde(default)]
    comp_main: Option<JsonValue>,
    #[serde(default)]
    comp_plus: Option<JsonValue>,
    #[serde(default)]
    comp_100: Option<JsonValue>,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    count_comp: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_optional_u64")]
    comp_all_count: Option<u64>,
}

#[derive(Debug, Clone)]
struct HltbEndpoint {
    name: &'static str,
    init_url: String,
    search_url: String,
}

#[derive(Debug, Clone)]
struct HltbToken {
    endpoint_key: String,
    token: String,
    hp_key: Option<String>,
    hp_val: Option<String>,
    fetched_at: std::time::Instant,
}

#[derive(Debug, Clone)]
struct CandidateMatch {
    data: HltbData,
    score: f32,
}

static HLTB_TOKEN: OnceLock<Mutex<Option<HltbToken>>> = OnceLock::new();

fn hltb_token_cache() -> &'static Mutex<Option<HltbToken>> {
    HLTB_TOKEN.get_or_init(|| Mutex::new(None))
}

fn default_endpoints() -> Vec<HltbEndpoint> {
    endpoint_set("https://howlongtobeat.com")
}

fn endpoint_set(base_url: &str) -> Vec<HltbEndpoint> {
    let base = base_url.trim_end_matches('/');
    vec![
        HltbEndpoint {
            name: "bleed",
            init_url: format!("{}/api/bleed/init", base),
            search_url: format!("{}/api/bleed", base),
        },
        HltbEndpoint {
            name: "find",
            init_url: format!("{}/api/find/init", base),
            search_url: format!("{}/api/find", base),
        },
        HltbEndpoint {
            name: "finder",
            init_url: format!("{}/api/finder/init", base),
            search_url: format!("{}/api/finder", base),
        },
    ]
}

fn value_to_seconds(v: &JsonValue) -> Option<f64> {
    match v {
        JsonValue::Number(n) => n.as_f64(),
        JsonValue::String(s) => s.parse::<f64>().ok(),
        _ => None,
    }
}

fn seconds_to_hours(v: &JsonValue) -> Option<f32> {
    let secs = value_to_seconds(v)?;
    if secs <= 0.0 {
        return None;
    }
    Some(((secs / 3600.0 * 10.0).round() / 10.0) as f32)
}

fn hltb_game_to_data(game: &HltbGame, confidence: f32) -> HltbData {
    HltbData {
        main_story: game.comp_main.as_ref().and_then(seconds_to_hours),
        main_extra: game.comp_plus.as_ref().and_then(seconds_to_hours),
        completionist: game.comp_100.as_ref().and_then(seconds_to_hours),
        game_id: game.game_id,
        game_name: game.game_name.clone(),
        confidence: Some((confidence * 10.0).round() / 10.0),
    }
}

fn collapse_dotted_acronyms(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;

    while i < chars.len() {
        if chars[i].is_ascii_alphabetic() && i + 1 < chars.len() && chars[i + 1] == '.' {
            let mut letters = String::new();
            let mut j = i;
            while j + 1 < chars.len() && chars[j].is_ascii_alphabetic() && chars[j + 1] == '.' {
                letters.push(chars[j]);
                j += 2;
            }

            if letters.len() >= 3 {
                out.push_str(&letters);
                i = j;
                continue;
            }
        }

        out.push(chars[i]);
        i += 1;
    }

    out
}

fn clean_title(value: &str) -> String {
    collapse_dotted_acronyms(value)
        .replace(['™', '®', '©'], "")
        .replace('&', " and ")
        .replace(
            [
                ':', ';', ',', '.', '!', '?', '/', '\\', '|', '[', ']', '{', '}',
            ],
            " ",
        )
        .replace(['(', ')'], " ")
        .replace(['-', '_'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn strip_parenthetical_years(value: &str) -> String {
    let mut out = value.trim().to_string();
    loop {
        let lower = out.to_ascii_lowercase();
        let Some(start) = lower.rfind('(') else {
            break;
        };
        let Some(end_rel) = lower[start..].find(')') else {
            break;
        };
        let inside = lower[start + 1..start + end_rel].trim();
        if (inside.len() == 4 && inside.chars().all(|c| c.is_ascii_digit()))
            || matches!(inside, "classic" | "retired")
        {
            out = out[..start].trim_end().to_string();
            continue;
        }
        break;
    }
    out
}

fn strip_edition_suffix(value: &str) -> String {
    let suffixes = [
        "game of the year edition",
        "game of the yorha edition",
        "game of the year",
        "goty edition",
        "goty",
        "the definitive edition",
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
        "yorha edition",
        "remastered",
        "hd edition",
        "hd",
    ];

    let mut out = value.trim().to_string();
    loop {
        let lower = out.to_ascii_lowercase();
        let trimmed_lower = lower.trim_end_matches(|c: char| matches!(c, ' ' | '-' | ':' | ','));
        let mut found = false;

        for suffix in suffixes {
            if trimmed_lower.ends_with(suffix) {
                let new_len = trimmed_lower.len().saturating_sub(suffix.len());
                out = out[..new_len]
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

    out
}

fn normalize_for_match(value: &str) -> String {
    clean_title(&strip_edition_suffix(&strip_parenthetical_years(value))).to_ascii_lowercase()
}

fn query_variants(game_name: &str) -> Vec<String> {
    let cleaned = clean_title(&strip_parenthetical_years(game_name));
    let stripped = clean_title(&strip_edition_suffix(&cleaned));
    let before_colon = game_name
        .split(':')
        .next()
        .map(clean_title)
        .unwrap_or_default();

    let mut seen = HashSet::new();
    [
        game_name.trim().to_string(),
        cleaned,
        stripped,
        before_colon,
    ]
    .into_iter()
    .filter(|item| !item.trim().is_empty())
    .filter(|item| seen.insert(item.to_ascii_lowercase()))
    .collect()
}

fn token_set(value: &str) -> HashSet<String> {
    normalize_for_match(value)
        .split_whitespace()
        .filter(|token| token.len() > 1)
        .map(str::to_string)
        .collect()
}

fn title_score(query: &str, candidate: &str) -> f32 {
    let q = normalize_for_match(query);
    let c = normalize_for_match(candidate);
    if q.is_empty() || c.is_empty() {
        return 0.0;
    }
    if q == c {
        return 100.0;
    }
    if strip_edition_suffix(&q) == strip_edition_suffix(&c) {
        return 94.0;
    }
    if c.contains(&q) || q.contains(&c) {
        return 82.0;
    }

    let q_tokens = token_set(&q);
    let c_tokens = token_set(&c);
    if q_tokens.is_empty() || c_tokens.is_empty() {
        return 0.0;
    }

    let overlap = q_tokens.intersection(&c_tokens).count() as f32;
    let union = q_tokens.union(&c_tokens).count() as f32;
    (overlap / union) * 76.0
}

fn candidate_score(
    query_name: &str,
    query_variants: &[String],
    game: &HltbGame,
    app_id: Option<u64>,
    release_year: Option<u32>,
) -> f32 {
    let name = game.game_name.as_deref().unwrap_or_default();
    let mut score = query_variants
        .iter()
        .map(|variant| title_score(variant, name))
        .fold(title_score(query_name, name), f32::max);

    if let Some(alias) = game.game_alias.as_deref() {
        for alias_part in alias.split(',') {
            let alias_score = query_variants
                .iter()
                .map(|variant| title_score(variant, alias_part))
                .fold(title_score(query_name, alias_part), f32::max);
            score = score.max(alias_score + 4.0);
        }
    }

    if let (Some(expected), Some(actual)) = (app_id, game.profile_steam) {
        if expected == actual {
            score += 18.0;
        }
    }

    if let (Some(expected), Some(actual)) = (release_year, game.release_world) {
        let delta = expected.abs_diff(actual);
        if delta == 0 {
            score += 8.0;
        } else if delta <= 1 {
            score += 3.0;
        } else if delta >= 8 {
            score -= 8.0;
        }
    }

    let sample_size = game.count_comp.or(game.comp_all_count).unwrap_or_default();
    if sample_size >= 100 {
        score += 3.0;
    } else if sample_size == 0 {
        score -= 2.0;
    }

    score.clamp(0.0, 125.0)
}

fn pick_best_match(
    query_name: &str,
    results: &[HltbGame],
    app_id: Option<u64>,
    release_year: Option<u32>,
) -> Option<CandidateMatch> {
    let variants = query_variants(query_name);
    results
        .iter()
        .filter_map(|game| {
            let score = candidate_score(query_name, &variants, game, app_id, release_year);
            let data = hltb_game_to_data(game, score);
            if data.main_story.is_none()
                && data.main_extra.is_none()
                && data.completionist.is_none()
            {
                return None;
            }
            Some(CandidateMatch { data, score })
        })
        .max_by(|a, b| a.score.total_cmp(&b.score))
        .filter(|m| m.score >= MIN_CONFIDENCE)
}

async fn fetch_fresh_token(
    client: &reqwest::Client,
    endpoint: &HltbEndpoint,
) -> Result<Option<HltbToken>, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let url = format!("{}?t={}", endpoint.init_url, ts);

    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://howlongtobeat.com/")
        .header("Origin", "https://howlongtobeat.com")
        .header("Sec-Fetch-Site", "same-origin")
        .send()
        .await
        .map_err(|e| format!("HLTB token request failed: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if status.as_u16() == 404 {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!(
            "HLTB token endpoint {} returned {}: {}",
            endpoint.name,
            status,
            text.chars().take(200).collect::<String>()
        ));
    }

    let token_resp: HltbTokenResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "HLTB token parse error on {}: {} (body: {})",
            endpoint.name,
            e,
            text.chars().take(200).collect::<String>()
        )
    })?;

    if token_resp.token.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(HltbToken {
        endpoint_key: endpoint.init_url.clone(),
        token: token_resp.token,
        hp_key: token_resp.hp_key,
        hp_val: token_resp.hp_val,
        fetched_at: std::time::Instant::now(),
    }))
}

async fn get_token(
    client: &reqwest::Client,
    endpoint: &HltbEndpoint,
    force_refresh: bool,
) -> Result<Option<HltbToken>, String> {
    if !force_refresh {
        let cache = hltb_token_cache().lock().unwrap();
        if let Some(ref cached) = *cache {
            if cached.endpoint_key == endpoint.init_url
                && cached.fetched_at.elapsed() < std::time::Duration::from_secs(TOKEN_TTL_SECS)
            {
                return Ok(Some(cached.clone()));
            }
        }
    }

    let token = fetch_fresh_token(client, endpoint).await?;
    if let Some(ref token) = token {
        let mut cache = hltb_token_cache().lock().unwrap();
        *cache = Some(token.clone());
    }
    Ok(token)
}

fn search_body(search_name: &str, token: &HltbToken) -> JsonValue {
    let cleaned = clean_title(search_name);
    let search_terms: Vec<&str> = cleaned.split_whitespace().collect();
    let mut body = serde_json::json!({
        "searchType": "games",
        "searchTerms": search_terms,
        "searchPage": 1,
        "size": 20,
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

    if let (Some(key), Some(value)) = (token.hp_key.as_ref(), token.hp_val.as_ref()) {
        body[key] = JsonValue::String(value.clone());
    }

    body
}

async fn send_search(
    client: &reqwest::Client,
    endpoint: &HltbEndpoint,
    token: &HltbToken,
    search_name: &str,
) -> Result<(reqwest::StatusCode, String), String> {
    let body = search_body(search_name, token);
    let mut request = client
        .post(&endpoint.search_url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Referer", "https://howlongtobeat.com/")
        .header("Origin", "https://howlongtobeat.com")
        .header("Sec-Fetch-Site", "same-origin")
        .header("x-auth-token", token.token.clone());

    if let (Some(key), Some(value)) = (token.hp_key.as_ref(), token.hp_val.as_ref()) {
        request = request.header("x-hp-key", key).header("x-hp-val", value);
    }

    let response = request
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HLTB request failed on {}: {}", endpoint.name, e))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read HLTB response: {}", e))?;

    Ok((status, text))
}

async fn search_endpoint(
    client: &reqwest::Client,
    endpoint: &HltbEndpoint,
    search_name: &str,
) -> Result<Vec<HltbGame>, String> {
    let Some(mut token) = get_token(client, endpoint, false).await? else {
        return Ok(Vec::new());
    };

    let (mut status, mut text) = send_search(client, endpoint, &token, search_name).await?;
    if status.as_u16() == 403 {
        let Some(refreshed) = get_token(client, endpoint, true).await? else {
            return Ok(Vec::new());
        };
        token = refreshed;
        (status, text) = send_search(client, endpoint, &token, search_name).await?;
    }

    if status.as_u16() == 404 {
        return Ok(Vec::new());
    }
    if !status.is_success() {
        return Err(format!(
            "HLTB search {} returned {}: {}",
            endpoint.name,
            status,
            text.chars().take(240).collect::<String>()
        ));
    }

    let data: HltbResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "HLTB parse error on {}: {} (body: {})",
            endpoint.name,
            e,
            text.chars().take(240).collect::<String>()
        )
    })?;

    Ok(data.data.unwrap_or_default())
}

async fn fetch_hltb_inner(
    client: &reqwest::Client,
    endpoints: &[HltbEndpoint],
    game_name: &str,
    app_id: Option<u64>,
    release_year: Option<u32>,
) -> Result<Option<HltbData>, String> {
    let variants = query_variants(game_name);
    let mut best: Option<CandidateMatch> = None;
    let mut last_error: Option<String> = None;

    for endpoint in endpoints {
        for variant in &variants {
            match search_endpoint(client, endpoint, variant).await {
                Ok(results) => {
                    if let Some(candidate) =
                        pick_best_match(game_name, &results, app_id, release_year)
                    {
                        if best
                            .as_ref()
                            .map(|current| candidate.score > current.score)
                            .unwrap_or(true)
                        {
                            best = Some(candidate);
                        }
                    }
                    if best.as_ref().map(|m| m.score >= 96.0).unwrap_or(false) {
                        return Ok(best.map(|m| m.data));
                    }
                }
                Err(error) => {
                    last_error = Some(error);
                    break;
                }
            }
        }

        if best.is_some() {
            break;
        }
    }

    if let Some(best) = best {
        return Ok(Some(best.data));
    }

    if let Some(error) = last_error {
        return Err(error);
    }

    Ok(None)
}

#[tauri::command]
pub async fn fetch_hltb(
    game_name: String,
    app_id: Option<u64>,
    release_year: Option<u32>,
) -> Result<Option<HltbData>, String> {
    let client = client_builder_for_scope(HttpProxyScope::Hltb)?
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())?;

    fetch_hltb_inner(
        &client,
        &default_endpoints(),
        &game_name,
        app_id,
        release_year,
    )
    .await
}

fn deserialize_optional_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Option::<JsonValue>::deserialize(deserializer)? {
        Some(JsonValue::Number(n)) => Ok(n.as_u64()),
        Some(JsonValue::String(s)) => Ok(s.parse::<u64>().ok()),
        _ => Ok(None),
    }
}

fn deserialize_optional_u32<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(deserialize_optional_u64(deserializer)?.and_then(|v| u32::try_from(v).ok()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn normalizes_awkward_titles_without_destroying_remakes() {
        assert_eq!(
            normalize_for_match("Grand Theft Auto III: The Definitive Edition"),
            "grand theft auto iii"
        );
        assert_eq!(
            normalize_for_match("FINAL FANTASY VII REMAKE INTERGRADE"),
            "final fantasy vii remake intergrade"
        );
        assert_eq!(
            normalize_for_match("Dragon Quest VII Reimagined (2026)"),
            "dragon quest vii reimagined"
        );
        assert_eq!(
            normalize_for_match("S.T.A.L.K.E.R.: Shadow of Chernobyl"),
            "stalker shadow of chernobyl"
        );
    }

    #[test]
    fn ranks_appid_and_title_matches_above_loose_matches() {
        let exact = HltbGame {
            game_id: Some(1),
            game_name: Some("FINAL FANTASY VII".to_string()),
            game_alias: Some("FF7".to_string()),
            profile_steam: Some(39140),
            release_world: Some(2013),
            comp_main: Some(json!(129600)),
            comp_plus: Some(json!(172800)),
            comp_100: Some(json!(288000)),
            count_comp: Some(200),
            comp_all_count: None,
        };
        let loose = HltbGame {
            game_id: Some(2),
            game_name: Some("Final Fantasy VIII".to_string()),
            game_alias: None,
            profile_steam: None,
            release_world: Some(2019),
            comp_main: Some(json!(144000)),
            comp_plus: None,
            comp_100: None,
            count_comp: Some(200),
            comp_all_count: None,
        };

        let best = pick_best_match(
            "FINAL FANTASY VII",
            &[loose, exact],
            Some(39140),
            Some(2013),
        )
        .expect("best match");

        assert_eq!(best.data.game_id, Some(1));
        assert_eq!(best.data.main_story, Some(36.0));
        assert!(best.score > 100.0);
    }

    #[test]
    fn rejects_low_confidence_results() {
        let wrong = HltbGame {
            game_id: Some(99),
            game_name: Some("Stardew Valley".to_string()),
            game_alias: None,
            profile_steam: None,
            release_world: Some(2016),
            comp_main: Some(json!(180000)),
            comp_plus: None,
            comp_100: None,
            count_comp: Some(1000),
            comp_all_count: None,
        };

        assert!(pick_best_match("Cyberpunk 2077", &[wrong], None, None).is_none());
    }

    #[test]
    fn includes_hp_fields_in_payload() {
        let token = HltbToken {
            endpoint_key: "https://howlongtobeat.com/api/bleed/init".to_string(),
            token: "token".to_string(),
            hp_key: Some("ign_key".to_string()),
            hp_val: Some("hp-value".to_string()),
            fetched_at: std::time::Instant::now(),
        };

        let body = search_body("Death Stranding 2: On The Beach", &token);

        assert_eq!(body["ign_key"], "hp-value");
        assert_eq!(body["searchTerms"][0], "Death");
    }

    #[test]
    fn query_variants_cover_long_titles_colons_and_editions() {
        let variants = query_variants("NieR:Automata Game of the YoRHa Edition");
        assert!(variants.iter().any(|v| v.contains("NieR Automata")));
        assert!(variants
            .iter()
            .any(|v| normalize_for_match(v) == "nier automata"));

        let long = query_variants("The Legend of Heroes: Trails in the Sky 1st Chapter");
        assert!(long
            .iter()
            .any(|v| normalize_for_match(v).contains("the legend of heroes")));
        assert!(long
            .iter()
            .any(|v| normalize_for_match(v) == "the legend of heroes"));

        let death = search_body(
            "Death Stranding 2: On The Beach",
            &HltbToken {
                endpoint_key: "test".to_string(),
                token: "token".to_string(),
                hp_key: None,
                hp_val: None,
                fetched_at: std::time::Instant::now(),
            },
        );
        assert_eq!(
            death["searchTerms"],
            json!(["Death", "Stranding", "2", "On", "The", "Beach"])
        );

        let stalker = query_variants("S.T.A.L.K.E.R. 2: Heart of Chornobyl");
        assert!(stalker
            .iter()
            .any(|v| normalize_for_match(v) == "stalker 2 heart of chornobyl"));
        assert!(stalker
            .iter()
            .any(|v| normalize_for_match(v) == "stalker 2"));
    }

    #[tokio::test]
    async fn fetches_from_bleed_with_hp_token() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/api/bleed/init"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "token": "search-token",
                "hpKey": "ign_test",
                "hpVal": "hp-value"
            })))
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/api/bleed"))
            .and(header("x-auth-token", "search-token"))
            .and(header("x-hp-key", "ign_test"))
            .and(header("x-hp-val", "hp-value"))
            .and(body_json(json!({
                "searchType": "games",
                "searchTerms": ["Death", "Stranding", "2", "On", "The", "Beach"],
                "searchPage": 1,
                "size": 20,
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
                "useCache": true,
                "ign_test": "hp-value"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": [{
                    "game_id": 123,
                    "game_name": "Death Stranding 2: On The Beach",
                    "profile_steam": 3280350,
                    "release_world": 2025,
                    "comp_main": 144000,
                    "comp_plus": 216000,
                    "comp_100": 360000,
                    "count_comp": 200
                }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::builder()
            .user_agent(UA)
            .build()
            .expect("client");
        let endpoints = vec![endpoint_set(&server.uri()).remove(0)];
        let data = fetch_hltb_inner(
            &client,
            &endpoints,
            "Death Stranding 2: On The Beach",
            Some(3280350),
            Some(2025),
        )
        .await
        .expect("lookup")
        .expect("match");

        assert_eq!(data.main_story, Some(40.0));
        assert_eq!(data.main_extra, Some(60.0));
        assert_eq!(data.completionist, Some(100.0));
        assert_eq!(data.game_id, Some(123));
    }

    #[tokio::test]
    #[ignore]
    async fn live_hltb_smoke_varied_titles() {
        if std::env::var("REPRESSURIZER_HLTB_LIVE").ok().as_deref() != Some("1") {
            eprintln!("set REPRESSURIZER_HLTB_LIVE=1 to run the live HLTB smoke test");
            return;
        }

        let client = reqwest::Client::builder()
            .user_agent(UA)
            .build()
            .expect("client");
        let cases = [
            ("Cyberpunk 2077", Some(1091500), Some(2020)),
            ("Death Stranding 2: On The Beach", Some(3280350), Some(2025)),
            (
                "NieR:Automata Game of the YoRHa Edition",
                Some(524220),
                Some(2017),
            ),
            (
                "The Legend of Heroes: Trails in the Sky 1st Chapter",
                Some(3184460),
                Some(2025),
            ),
            ("FINAL FANTASY VII", Some(39140), Some(2013)),
        ];

        let mut found = 0;
        for (name, app_id, year) in cases {
            let result = fetch_hltb_inner(&client, &default_endpoints(), name, app_id, year)
                .await
                .expect("live lookup should not error");
            eprintln!("HLTB live: {name} -> {result:?}");
            if result.is_some() {
                found += 1;
            }
        }

        assert!(
            found >= 3,
            "expected at least 3 live HLTB matches, got {found}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn live_hltb_smoke_stalker_titles() {
        if std::env::var("REPRESSURIZER_HLTB_LIVE").ok().as_deref() != Some("1") {
            eprintln!("set REPRESSURIZER_HLTB_LIVE=1 to run the live HLTB smoke test");
            return;
        }

        let client = reqwest::Client::builder()
            .user_agent(UA)
            .build()
            .expect("client");
        let cases = [
            (
                "S.T.A.L.K.E.R.: Shadow of Chernobyl",
                Some(4500),
                Some(2007),
            ),
            ("S.T.A.L.K.E.R.: Clear Sky", Some(20510), Some(2008)),
            ("S.T.A.L.K.E.R.: Call of Pripyat", Some(41700), Some(2010)),
            (
                "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
                Some(1643320),
                Some(2024),
            ),
        ];

        let mut found = 0;
        for (name, app_id, year) in cases {
            let result = fetch_hltb_inner(&client, &default_endpoints(), name, app_id, year)
                .await
                .expect("live lookup should not error");
            eprintln!("HLTB live STALKER: {name} -> {result:?}");
            if result.is_some() {
                found += 1;
            }
        }

        assert!(
            found >= 3,
            "expected at least 3 live STALKER HLTB matches, got {found}"
        );
    }
}
