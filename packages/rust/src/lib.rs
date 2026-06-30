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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub achievement_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wishlist_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family_shared_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotCollection {
    pub key: String,
    pub name: String,
    pub is_dynamic: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub game_count: usize,
    pub app_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotCollectionRef {
    pub key: String,
    pub name: String,
    pub is_dynamic: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub achievements: Option<LibrarySnapshotAchievements>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wishlist: Option<LibrarySnapshotWishlist>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ownership: Option<LibrarySnapshotOwnership>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flags: Option<LibrarySnapshotGameFlags>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotAchievements {
    pub source: String,
    pub total: u32,
    pub achieved: u32,
    pub percent: Option<f64>,
    pub complete: bool,
    pub has_details: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotWishlist {
    pub source: String,
    pub priority: u32,
    pub date_added: u64,
    pub date_added_at: Option<String>,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotOwnership {
    pub source: String,
    pub auth_used: Option<String>,
    pub owner_steam_id_tail: Option<String>,
    pub owner_steam_id_tails: Vec<String>,
    pub owner_count: usize,
    pub owned_by_current_user: bool,
    pub family_shared: bool,
    pub excluded: bool,
    pub exclude_reason: u32,
    pub non_game: bool,
    pub app_type: u32,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotGameFlags {
    pub collection_only: bool,
    pub has_details: bool,
    pub missing_details: bool,
    pub has_hltb: bool,
    pub has_achievements: bool,
    pub wishlist: bool,
    pub family_shared: bool,
    pub owned_by_current_user: bool,
    pub non_game: bool,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibrarySnapshotSummaryStats {
    pub games: usize,
    pub collections: usize,
    pub hltb: usize,
    pub achievements: usize,
    pub wishlist: usize,
    pub family_shared: usize,
    pub collection_only: usize,
    pub missing_details: usize,
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
    let achievement_count = snapshot
        .games
        .iter()
        .filter(|game| game.achievements.is_some())
        .count();
    if snapshot
        .summary
        .achievement_count
        .is_some_and(|count| count != achievement_count)
    {
        push_issue(
            &mut issues,
            "$.summary.achievementCount",
            "must match games with achievements data",
        );
    }
    let wishlist_count = snapshot
        .games
        .iter()
        .filter(|game| game.wishlist.is_some())
        .count();
    if snapshot
        .summary
        .wishlist_count
        .is_some_and(|count| count != wishlist_count)
    {
        push_issue(
            &mut issues,
            "$.summary.wishlistCount",
            "must match games with wishlist data",
        );
    }
    let family_shared_count = snapshot
        .games
        .iter()
        .filter(|game| {
            game.ownership
                .as_ref()
                .is_some_and(|ownership| ownership.family_shared)
        })
        .count();
    if snapshot
        .summary
        .family_shared_count
        .is_some_and(|count| count != family_shared_count)
    {
        push_issue(
            &mut issues,
            "$.summary.familySharedCount",
            "must match family-shared games",
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
        if let Some(achievements) = &game.achievements {
            if achievements.source != "steam_web_api" {
                push_issue(
                    &mut issues,
                    format!("{path}.achievements.source"),
                    "must be steam_web_api",
                );
            }
            if achievements.achieved > achievements.total {
                push_issue(
                    &mut issues,
                    format!("{path}.achievements.achieved"),
                    "must be less than or equal to total",
                );
            }
            check_optional_non_negative(
                &mut issues,
                &achievements.percent,
                format!("{path}.achievements.percent"),
            );
            if achievements.percent.is_some_and(|percent| percent > 100.0) {
                push_issue(
                    &mut issues,
                    format!("{path}.achievements.percent"),
                    "must be less than or equal to 100",
                );
            }
        }
        if let Some(wishlist) = &game.wishlist {
            if wishlist.source != "steam_wishlist" {
                push_issue(
                    &mut issues,
                    format!("{path}.wishlist.source"),
                    "must be steam_wishlist",
                );
            }
            if let Some(date_added_at) = &wishlist.date_added_at {
                if !is_rfc3339(date_added_at) {
                    push_issue(
                        &mut issues,
                        format!("{path}.wishlist.dateAddedAt"),
                        "must be a valid date-time",
                    );
                }
            }
            if let Some(fetched_at) = &wishlist.fetched_at {
                if !is_rfc3339(fetched_at) {
                    push_issue(
                        &mut issues,
                        format!("{path}.wishlist.fetchedAt"),
                        "must be a valid date-time",
                    );
                }
            }
        }
        if let Some(ownership) = &game.ownership {
            if ownership.source != "steam_family" {
                push_issue(
                    &mut issues,
                    format!("{path}.ownership.source"),
                    "must be steam_family",
                );
            }
            if ownership
                .owner_steam_id_tail
                .as_ref()
                .is_some_and(|tail| tail.len() > 4)
            {
                push_issue(
                    &mut issues,
                    format!("{path}.ownership.ownerSteamIdTail"),
                    "must be at most four characters",
                );
            }
            for (tail_index, tail) in ownership.owner_steam_id_tails.iter().enumerate() {
                if tail.len() > 4 {
                    push_issue(
                        &mut issues,
                        format!("{path}.ownership.ownerSteamIdTails[{tail_index}]"),
                        "must be at most four characters",
                    );
                }
            }
            if let Some(fetched_at) = &ownership.fetched_at {
                if !is_rfc3339(fetched_at) {
                    push_issue(
                        &mut issues,
                        format!("{path}.ownership.fetchedAt"),
                        "must be a valid date-time",
                    );
                }
            }
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

pub fn get_snapshot_achievements(
    snapshot: &LibrarySnapshot,
    app_id: u32,
) -> Option<&LibrarySnapshotAchievements> {
    get_snapshot_game(snapshot, app_id).and_then(|game| game.achievements.as_ref())
}

pub fn get_snapshot_wishlist(
    snapshot: &LibrarySnapshot,
    app_id: u32,
) -> Option<&LibrarySnapshotWishlist> {
    get_snapshot_game(snapshot, app_id).and_then(|game| game.wishlist.as_ref())
}

pub fn get_snapshot_ownership(
    snapshot: &LibrarySnapshot,
    app_id: u32,
) -> Option<&LibrarySnapshotOwnership> {
    get_snapshot_game(snapshot, app_id).and_then(|game| game.ownership.as_ref())
}

pub fn get_snapshot_flags(
    snapshot: &LibrarySnapshot,
    app_id: u32,
) -> Option<&LibrarySnapshotGameFlags> {
    get_snapshot_game(snapshot, app_id).and_then(|game| game.flags.as_ref())
}

pub fn list_snapshot_collections(snapshot: &LibrarySnapshot) -> Vec<LibrarySnapshotCollection> {
    let mut collections = snapshot.collections.clone();
    collections.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.key.cmp(&b.key)));
    collections
}

pub fn group_snapshot_games_by_collection(
    snapshot: &LibrarySnapshot,
) -> HashMap<String, Vec<&LibrarySnapshotGame>> {
    let mut grouped = HashMap::new();
    for collection in &snapshot.collections {
        grouped.insert(collection.key.clone(), Vec::new());
    }
    for game in &snapshot.games {
        for collection in &game.collections {
            grouped
                .entry(collection.key.clone())
                .or_insert_with(Vec::new)
                .push(game);
        }
    }
    for games in grouped.values_mut() {
        games.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.app_id.cmp(&b.app_id)));
    }
    grouped
}

pub fn summarize_snapshot(snapshot: &LibrarySnapshot) -> LibrarySnapshotSummaryStats {
    LibrarySnapshotSummaryStats {
        games: snapshot.games.len(),
        collections: snapshot.collections.len(),
        hltb: snapshot
            .games
            .iter()
            .filter(|game| game.hltb.is_some())
            .count(),
        achievements: snapshot
            .games
            .iter()
            .filter(|game| game.achievements.is_some())
            .count(),
        wishlist: snapshot
            .games
            .iter()
            .filter(|game| game.wishlist.is_some())
            .count(),
        family_shared: snapshot
            .games
            .iter()
            .filter(|game| {
                game.ownership
                    .as_ref()
                    .is_some_and(|ownership| ownership.family_shared)
            })
            .count(),
        collection_only: snapshot
            .games
            .iter()
            .filter(|game| {
                game.flags
                    .as_ref()
                    .map(|flags| flags.collection_only)
                    .unwrap_or(game.is_collection_only)
            })
            .count(),
        missing_details: snapshot
            .games
            .iter()
            .filter(|game| {
                game.flags
                    .as_ref()
                    .map(|flags| flags.missing_details)
                    .unwrap_or(game.details.is_none())
            })
            .count(),
    }
}

pub fn filter_snapshot_games<F>(
    snapshot: &LibrarySnapshot,
    mut predicate: F,
) -> Vec<LibrarySnapshotGame>
where
    F: FnMut(&LibrarySnapshotGame) -> bool,
{
    let mut games = snapshot
        .games
        .iter()
        .filter(|game| predicate(game))
        .cloned()
        .collect::<Vec<_>>();
    sort_games(&mut games);
    games
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
