use chrono::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fmt;

pub const LIBRARY_SNAPSHOT_SCHEMA_VERSION: &str = "repressurizer.library-snapshot.v1";
pub const LIBRARY_SNAPSHOT_CHECKSUM_ALGORITHM: &str = "fnv1a32";
pub const LIBRARY_SNAPSHOT_SCHEMA_JSON: &str =
    include_str!("../schema/repressurizer.library-snapshot.v1.schema.json");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub schema_version: String,
    pub generated_at: String,
    pub source: LibrarySnapshotSource,
    pub steam: LibrarySnapshotSteam,
    pub summary: LibrarySnapshotSummary,
    pub collections: Vec<LibrarySnapshotCollection>,
    pub games: Vec<LibrarySnapshotGame>,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotSource {
    pub app: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotSteam {
    pub steam_id64_tail: Option<String>,
    pub persona_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotSummary {
    pub game_count: usize,
    pub collection_count: usize,
    pub hltb_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotCollection {
    pub key: String,
    pub name: String,
    pub is_dynamic: bool,
    pub game_count: usize,
    pub app_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotCollectionRef {
    pub key: String,
    pub name: String,
    pub is_dynamic: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotGameDetails {
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub categories: Vec<String>,
    pub metacritic_score: Option<f64>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub platforms: LibrarySnapshotPlatforms,
    pub is_free: bool,
    pub price_final: Option<f64>,
    pub price_currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotPlatforms {
    pub windows: bool,
    pub mac: bool,
    pub linux: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotHltb {
    pub source: String,
    pub main_story: Option<f64>,
    pub main_extra: Option<f64>,
    pub completionist: Option<f64>,
    pub hltb_game_id: Option<u32>,
    pub matched_name: Option<String>,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotGame {
    pub app_id: u32,
    pub name: String,
    pub playtime_forever_minutes: u64,
    pub playtime_forever_hours: f64,
    pub rtime_last_played: u64,
    pub last_played_at: Option<String>,
    pub is_collection_only: bool,
    pub collections: Vec<LibrarySnapshotCollectionRef>,
    pub details: Option<LibrarySnapshotGameDetails>,
    pub hltb: Option<LibrarySnapshotHltb>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotValidationIssue {
    pub path: String,
    pub message: String,
}

#[derive(Debug)]
pub enum SnapshotError {
    Json(serde_json::Error),
    Validation(Vec<SnapshotValidationIssue>),
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SnapshotError::Json(error) => write!(formatter, "invalid JSON: {error}"),
            SnapshotError::Validation(issues) => {
                let message = issues
                    .iter()
                    .map(|issue| format!("{}: {}", issue.path, issue.message))
                    .collect::<Vec<_>>()
                    .join("; ");
                write!(
                    formatter,
                    "invalid Repressurizer library snapshot: {message}"
                )
            }
        }
    }
}

impl Error for SnapshotError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            SnapshotError::Json(error) => Some(error),
            SnapshotError::Validation(_) => None,
        }
    }
}

impl From<serde_json::Error> for SnapshotError {
    fn from(error: serde_json::Error) -> Self {
        SnapshotError::Json(error)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LibrarySnapshotChange {
    pub before: LibrarySnapshotGame,
    pub after: LibrarySnapshotGame,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LibrarySnapshotDiff {
    pub added: Vec<LibrarySnapshotGame>,
    pub removed: Vec<LibrarySnapshotGame>,
    pub changed: Vec<LibrarySnapshotChange>,
    pub unchanged: Vec<LibrarySnapshotGame>,
}

pub fn parse_library_snapshot_str(input: &str) -> Result<LibrarySnapshot, SnapshotError> {
    let snapshot: LibrarySnapshot = serde_json::from_str(input)?;
    validate_library_snapshot(&snapshot, true).map_err(SnapshotError::Validation)?;
    Ok(snapshot)
}

pub fn validate_library_snapshot(
    snapshot: &LibrarySnapshot,
    verify_checksum: bool,
) -> Result<(), Vec<SnapshotValidationIssue>> {
    let mut issues = Vec::new();

    if snapshot.schema_version != LIBRARY_SNAPSHOT_SCHEMA_VERSION {
        push_issue(
            &mut issues,
            "$.schemaVersion",
            format!("must be {LIBRARY_SNAPSHOT_SCHEMA_VERSION}"),
        );
    }

    if !is_rfc3339(&snapshot.generated_at) {
        push_issue(
            &mut issues,
            "$.generatedAt",
            "must be a valid date-time string",
        );
    }

    if snapshot.source.app != "Repressurizer" {
        push_issue(&mut issues, "$.source.app", "must be Repressurizer");
    }
    if snapshot.source.version.trim().is_empty() {
        push_issue(
            &mut issues,
            "$.source.version",
            "must be a non-empty string",
        );
    }

    if let Some(tail) = &snapshot.steam.steam_id64_tail {
        if tail.len() > 4 {
            push_issue(
                &mut issues,
                "$.steam.steamId64Tail",
                "must be at most four characters",
            );
        }
    }

    if snapshot.summary.game_count != snapshot.games.len() {
        push_issue(
            &mut issues,
            "$.summary.gameCount",
            "must match games length",
        );
    }
    if snapshot.summary.collection_count != snapshot.collections.len() {
        push_issue(
            &mut issues,
            "$.summary.collectionCount",
            "must match collections length",
        );
    }
    let hltb_count = snapshot
        .games
        .iter()
        .filter(|game| game.hltb.is_some())
        .count();
    if snapshot.summary.hltb_count != hltb_count {
        push_issue(
            &mut issues,
            "$.summary.hltbCount",
            "must match games with HLTB data",
        );
    }

    for (index, collection) in snapshot.collections.iter().enumerate() {
        let path = format!("$.collections[{index}]");
        if collection.key.trim().is_empty() {
            push_issue(
                &mut issues,
                format!("{path}.key"),
                "must be a non-empty string",
            );
        }
        if collection.game_count != collection.app_ids.len() {
            push_issue(
                &mut issues,
                format!("{path}.gameCount"),
                "must match appIds length",
            );
        }
    }

    let mut seen_app_ids = HashSet::new();
    for (index, game) in snapshot.games.iter().enumerate() {
        let path = format!("$.games[{index}]");
        if !seen_app_ids.insert(game.app_id) {
            push_issue(&mut issues, format!("{path}.appId"), "must be unique");
        }
        if game.playtime_forever_hours < 0.0 {
            push_issue(
                &mut issues,
                format!("{path}.playtimeForeverHours"),
                "must be a non-negative number",
            );
        }
        if let Some(last_played_at) = &game.last_played_at {
            if !is_rfc3339(last_played_at) {
                push_issue(
                    &mut issues,
                    format!("{path}.lastPlayedAt"),
                    "must be a valid date-time",
                );
            }
        }
        for (collection_index, collection) in game.collections.iter().enumerate() {
            if collection.key.trim().is_empty() {
                push_issue(
                    &mut issues,
                    format!("{path}.collections[{collection_index}].key"),
                    "must be a non-empty string",
                );
            }
        }
        if let Some(hltb) = &game.hltb {
            if hltb.source != "howlongtobeat" {
                push_issue(
                    &mut issues,
                    format!("{path}.hltb.source"),
                    "must be howlongtobeat",
                );
            }
            check_optional_non_negative(
                &mut issues,
                &hltb.main_story,
                format!("{path}.hltb.mainStory"),
            );
            check_optional_non_negative(
                &mut issues,
                &hltb.main_extra,
                format!("{path}.hltb.mainExtra"),
            );
            check_optional_non_negative(
                &mut issues,
                &hltb.completionist,
                format!("{path}.hltb.completionist"),
            );
            check_optional_non_negative(
                &mut issues,
                &hltb.confidence,
                format!("{path}.hltb.confidence"),
            );
        }
    }

    if !snapshot.checksum.starts_with("fnv1a32:")
        || snapshot.checksum.len() != "fnv1a32:00000000".len()
    {
        push_issue(
            &mut issues,
            "$.checksum",
            "must match fnv1a32 checksum format",
        );
    }

    if issues.is_empty() && verify_checksum && !verify_library_snapshot_checksum(snapshot) {
        push_issue(&mut issues, "$.checksum", "does not match snapshot content");
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues)
    }
}

pub fn index_snapshot_by_app_id(snapshot: &LibrarySnapshot) -> HashMap<u32, &LibrarySnapshotGame> {
    snapshot
        .games
        .iter()
        .map(|game| (game.app_id, game))
        .collect()
}

pub fn get_snapshot_game(snapshot: &LibrarySnapshot, app_id: u32) -> Option<&LibrarySnapshotGame> {
    snapshot.games.iter().find(|game| game.app_id == app_id)
}

pub fn get_snapshot_hltb(snapshot: &LibrarySnapshot, app_id: u32) -> Option<&LibrarySnapshotHltb> {
    get_snapshot_game(snapshot, app_id).and_then(|game| game.hltb.as_ref())
}

pub fn list_snapshot_collections(snapshot: &LibrarySnapshot) -> Vec<LibrarySnapshotCollection> {
    let mut collections = snapshot.collections.clone();
    collections.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.key.cmp(&b.key)));
    collections
}

pub fn compute_library_snapshot_checksum(snapshot: &LibrarySnapshot) -> String {
    let payload = snapshot_checksum_payload(snapshot);
    format!(
        "{LIBRARY_SNAPSHOT_CHECKSUM_ALGORITHM}:{}",
        fnv1a32(&stable_snapshot_stringify(&payload))
    )
}

pub fn verify_library_snapshot_checksum(snapshot: &LibrarySnapshot) -> bool {
    snapshot.checksum == compute_library_snapshot_checksum(snapshot)
}

pub fn snapshot_checksum_payload(snapshot: &LibrarySnapshot) -> Value {
    let mut value = serde_json::to_value(snapshot).expect("LibrarySnapshot should serialize");
    if let Value::Object(map) = &mut value {
        map.remove("generatedAt");
        map.remove("checksum");
    }
    value
}

pub fn stable_snapshot_stringify(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(item) => item.to_string(),
        Value::Number(item) => stable_number_string(item),
        Value::String(item) => {
            serde_json::to_string(item).expect("string serialization should not fail")
        }
        Value::Array(items) => {
            let inner = items
                .iter()
                .map(stable_snapshot_stringify)
                .collect::<Vec<_>>()
                .join(",");
            format!("[{inner}]")
        }
        Value::Object(map) => {
            let mut entries = map.iter().collect::<Vec<_>>();
            entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            let inner = entries
                .into_iter()
                .map(|(key, item)| {
                    let key = serde_json::to_string(key)
                        .expect("object key serialization should not fail");
                    format!("{key}:{}", stable_snapshot_stringify(item))
                })
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{inner}}}")
        }
    }
}

pub fn fnv1a32(input: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for unit in input.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

pub fn diff_library_snapshots(
    previous: &LibrarySnapshot,
    next: &LibrarySnapshot,
) -> LibrarySnapshotDiff {
    let previous_by_app_id = index_snapshot_by_app_id(previous);
    let next_by_app_id = index_snapshot_by_app_id(next);
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut changed = Vec::new();
    let mut unchanged = Vec::new();

    for game in &next.games {
        match previous_by_app_id.get(&game.app_id) {
            None => added.push(game.clone()),
            Some(before) if *before == game => unchanged.push(game.clone()),
            Some(before) => changed.push(LibrarySnapshotChange {
                before: (*before).clone(),
                after: game.clone(),
            }),
        }
    }

    for game in &previous.games {
        if !next_by_app_id.contains_key(&game.app_id) {
            removed.push(game.clone());
        }
    }

    sort_games(&mut added);
    sort_games(&mut removed);
    sort_games(&mut unchanged);
    changed.sort_by(|a, b| {
        a.after
            .name
            .cmp(&b.after.name)
            .then_with(|| a.after.app_id.cmp(&b.after.app_id))
    });

    LibrarySnapshotDiff {
        added,
        removed,
        changed,
        unchanged,
    }
}

fn push_issue(
    issues: &mut Vec<SnapshotValidationIssue>,
    path: impl Into<String>,
    message: impl Into<String>,
) {
    issues.push(SnapshotValidationIssue {
        path: path.into(),
        message: message.into(),
    });
}

fn is_rfc3339(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
}

fn check_optional_non_negative(
    issues: &mut Vec<SnapshotValidationIssue>,
    value: &Option<f64>,
    path: String,
) {
    if let Some(value) = value {
        if !value.is_finite() || *value < 0.0 {
            push_issue(issues, path, "must be a non-negative number or null");
        }
    }
}

fn stable_number_string(number: &serde_json::Number) -> String {
    if let Some(value) = number.as_i64() {
        return value.to_string();
    }
    if let Some(value) = number.as_u64() {
        return value.to_string();
    }
    if let Some(value) = number.as_f64() {
        if value.is_finite() && value.fract() == 0.0 {
            return format!("{value:.0}");
        }
        return serde_json::to_string(&value).expect("number serialization should not fail");
    }
    number.to_string()
}

fn sort_games(games: &mut [LibrarySnapshotGame]) {
    games.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.app_id.cmp(&b.app_id)));
}
