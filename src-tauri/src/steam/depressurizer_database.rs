use crate::hltb::HltbData;
use crate::steam::api::{GameDetails, PlatformSupport, SteamReviewSummary};
use serde::de::{DeserializeSeed, IgnoredAny, MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerDatabaseImport {
    pub source_path: Option<String>,
    pub names: BTreeMap<u64, String>,
    pub details: Vec<GameDetails>,
    pub hltb: BTreeMap<u64, HltbData>,
    pub steam_reviews: Vec<SteamReviewSummary>,
    pub stats: DepressurizerDatabaseImportStats,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerDatabaseImportStats {
    pub database_entries: usize,
    pub requested_app_ids: usize,
    pub matched_entries: usize,
    pub names: usize,
    pub details: usize,
    pub hltb: usize,
    pub steam_reviews: usize,
    pub entries_with_tags: usize,
    pub entries_with_achievements: usize,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DepressurizerDatabaseEntry {
    #[serde(default)]
    app_id: u64,
    developers: Vec<String>,
    #[serde(default)]
    flags: Vec<String>,
    #[serde(default)]
    genres: Vec<String>,
    #[serde(default)]
    hltb_completionists: u32,
    #[serde(default)]
    hltb_extras: u32,
    #[serde(default)]
    hltb_main: u32,
    #[serde(default)]
    language_support: DepressurizerLanguageSupport,
    #[serde(default)]
    last_store_scrape: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    platforms: u32,
    #[serde(default)]
    publishers: Vec<String>,
    #[serde(default)]
    review_positive_percentage: u32,
    #[serde(default)]
    review_total: u32,
    #[serde(default)]
    steam_release_date: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    total_achievements: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DepressurizerLanguageSupport {
    #[serde(default)]
    full_audio: Vec<String>,
    #[serde(default)]
    interface: Vec<String>,
    #[serde(default)]
    subtitles: Vec<String>,
}

#[derive(Debug, Clone, Default)]
struct ScannedEntries {
    names: BTreeMap<u64, String>,
    details: Vec<GameDetails>,
    hltb: BTreeMap<u64, HltbData>,
    steam_reviews: Vec<SteamReviewSummary>,
    stats: DepressurizerDatabaseImportStats,
}

#[tauri::command]
pub fn import_depressurizer_database(
    path: String,
    app_ids: Vec<u64>,
) -> Result<DepressurizerDatabaseImport, String> {
    let requested = requested_app_id_set(app_ids)?;
    let source_path = Some(path.clone());
    let path_ref = Path::new(&path);

    if path_ref
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
    {
        import_depressurizer_database_zip(path_ref, &requested, source_path)
    } else {
        let file = File::open(path_ref).map_err(|error| {
            format!("Failed to read Depressurizer database {}: {}", path, error)
        })?;
        parse_depressurizer_database_reader(BufReader::new(file), &requested, source_path)
    }
}

pub fn parse_depressurizer_database_json(
    json: &str,
    app_ids: &[u64],
) -> Result<DepressurizerDatabaseImport, String> {
    let requested = requested_app_id_set(app_ids.to_vec())?;
    parse_depressurizer_database_reader(Cursor::new(json.as_bytes()), &requested, None)
}

fn requested_app_id_set(app_ids: Vec<u64>) -> Result<HashSet<u64>, String> {
    let requested = app_ids
        .into_iter()
        .filter(|app_id| *app_id > 0)
        .collect::<HashSet<_>>();
    if requested.is_empty() {
        return Err("Load a Steam library before importing a Depressurizer database.".to_string());
    }
    Ok(requested)
}

fn import_depressurizer_database_zip(
    path: &Path,
    requested: &HashSet<u64>,
    source_path: Option<String>,
) -> Result<DepressurizerDatabaseImport, String> {
    let file = File::open(path).map_err(|error| {
        format!(
            "Failed to read Depressurizer database zip {}: {}",
            path.display(),
            error
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        format!(
            "Failed to open Depressurizer database zip {}: {}",
            path.display(),
            error
        )
    })?;
    let database_index = (0..archive.len())
        .find(|index| {
            archive
                .by_index(*index)
                .ok()
                .map(|file| {
                    let normalized = file.name().replace('\\', "/");
                    normalized
                        .rsplit('/')
                        .next()
                        .is_some_and(|name| name.eq_ignore_ascii_case("database.json"))
                })
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            format!(
                "Depressurizer database zip {} does not contain database.json",
                path.display()
            )
        })?;

    let mut database_file = archive.by_index(database_index).map_err(|error| {
        format!(
            "Failed to read database.json from Depressurizer zip {}: {}",
            path.display(),
            error
        )
    })?;
    parse_depressurizer_database_reader(&mut database_file, requested, source_path)
}

fn parse_depressurizer_database_reader<R: Read>(
    reader: R,
    requested: &HashSet<u64>,
    source_path: Option<String>,
) -> Result<DepressurizerDatabaseImport, String> {
    let mut deserializer = serde_json::Deserializer::from_reader(reader);
    DatabaseSeed {
        requested,
        source_path,
    }
    .deserialize(&mut deserializer)
    .map_err(|error| format!("Failed to parse Depressurizer database JSON: {}", error))
}

struct DatabaseSeed<'a> {
    requested: &'a HashSet<u64>,
    source_path: Option<String>,
}

impl<'de> DeserializeSeed<'de> for DatabaseSeed<'_> {
    type Value = DepressurizerDatabaseImport;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(DatabaseVisitor {
            requested: self.requested,
            source_path: self.source_path,
        })
    }
}

struct DatabaseVisitor<'a> {
    requested: &'a HashSet<u64>,
    source_path: Option<String>,
}

impl<'de> Visitor<'de> for DatabaseVisitor<'_> {
    type Value = DepressurizerDatabaseImport;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a Depressurizer database object")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut scanned = ScannedEntries::default();

        while let Some(key) = map.next_key::<String>()? {
            if key == "DatabaseEntries" {
                scanned = map.next_value_seed(DatabaseEntriesSeed {
                    requested: self.requested,
                })?;
            } else {
                let _: IgnoredAny = map.next_value()?;
            }
        }

        scanned.stats.requested_app_ids = self.requested.len();
        Ok(DepressurizerDatabaseImport {
            source_path: self.source_path,
            names: scanned.names,
            details: scanned.details,
            hltb: scanned.hltb,
            steam_reviews: scanned.steam_reviews,
            stats: scanned.stats,
        })
    }
}

struct DatabaseEntriesSeed<'a> {
    requested: &'a HashSet<u64>,
}

impl<'de> DeserializeSeed<'de> for DatabaseEntriesSeed<'_> {
    type Value = ScannedEntries;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(DatabaseEntriesVisitor {
            requested: self.requested,
        })
    }
}

struct DatabaseEntriesVisitor<'a> {
    requested: &'a HashSet<u64>,
}

impl<'de> Visitor<'de> for DatabaseEntriesVisitor<'_> {
    type Value = ScannedEntries;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Depressurizer DatabaseEntries map")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut scanned = ScannedEntries::default();

        while let Some(key) = map.next_key::<String>()? {
            scanned.stats.database_entries += 1;
            let Some(app_id) = key.parse::<u64>().ok() else {
                let _: IgnoredAny = map.next_value()?;
                continue;
            };

            if !self.requested.contains(&app_id) {
                let _: IgnoredAny = map.next_value()?;
                continue;
            }

            let mut entry = map.next_value::<DepressurizerDatabaseEntry>()?;
            if entry.app_id == 0 {
                entry.app_id = app_id;
            }
            scanned.stats.matched_entries += 1;
            import_entry(entry, &mut scanned);
        }

        Ok(scanned)
    }
}

fn import_entry(entry: DepressurizerDatabaseEntry, scanned: &mut ScannedEntries) {
    let app_id = entry.app_id;
    if let Some(name) = clean_optional_string(&entry.name) {
        scanned.names.insert(app_id, name);
        scanned.stats.names += 1;
    }

    if let Some(details) = entry_to_details(&entry) {
        if !details.tags.is_empty() {
            scanned.stats.entries_with_tags += 1;
        }
        scanned.details.push(details);
        scanned.stats.details += 1;
    }

    if let Some(hltb) = entry_to_hltb(&entry) {
        scanned.hltb.insert(app_id, hltb);
        scanned.stats.hltb += 1;
    }

    if let Some(review) = entry_to_review(&entry) {
        scanned.steam_reviews.push(review);
        scanned.stats.steam_reviews += 1;
    }

    if entry.total_achievements > 0 {
        scanned.stats.entries_with_achievements += 1;
    }
}

fn entry_to_details(entry: &DepressurizerDatabaseEntry) -> Option<GameDetails> {
    let mut categories = clean_strings(&entry.flags);
    if entry.total_achievements > 0
        && !categories
            .iter()
            .any(|value| value.eq_ignore_ascii_case("Steam Achievements"))
    {
        categories.push("Steam Achievements".to_string());
    }

    let details = GameDetails {
        app_id: entry.app_id,
        name: clean_optional_string(&entry.name).unwrap_or_else(|| format!("App {}", entry.app_id)),
        genres: clean_strings(&entry.genres),
        tags: clean_strings(&entry.tags),
        categories,
        release_date: entry
            .steam_release_date
            .as_deref()
            .and_then(clean_optional_string),
        metacritic_score: None,
        developers: clean_strings(&entry.developers),
        publishers: clean_strings(&entry.publishers),
        supported_languages: clean_language_support(&entry.language_support),
        platforms: platforms_from_bitmask(entry.platforms),
        header_image: None,
        capsule_image: None,
        price_initial: None,
        price_final: None,
        price_currency: None,
        price_country_code: None,
        is_free: false,
    };

    if has_importable_details(&details) {
        Some(details)
    } else {
        None
    }
}

fn entry_to_hltb(entry: &DepressurizerDatabaseEntry) -> Option<HltbData> {
    if entry.hltb_main == 0 && entry.hltb_extras == 0 && entry.hltb_completionists == 0 {
        return None;
    }

    Some(HltbData {
        main_story: minutes_to_hours(entry.hltb_main),
        main_extra: minutes_to_hours(entry.hltb_extras),
        completionist: minutes_to_hours(entry.hltb_completionists),
        game_id: None,
        game_name: clean_optional_string(&entry.name),
        confidence: None,
    })
}

fn entry_to_review(entry: &DepressurizerDatabaseEntry) -> Option<SteamReviewSummary> {
    if entry.review_total == 0 || entry.review_positive_percentage > 100 {
        return None;
    }

    let total_positive = ((entry.review_total as f64)
        * (entry.review_positive_percentage as f64 / 100.0))
        .round() as u32;
    let total_positive = total_positive.min(entry.review_total);
    let total_negative = entry.review_total.saturating_sub(total_positive);
    let (review_score, review_score_desc) =
        review_bucket(entry.review_positive_percentage, entry.review_total);

    Some(SteamReviewSummary {
        app_id: entry.app_id,
        review_score,
        review_score_desc: review_score_desc.to_string(),
        total_positive,
        total_negative,
        total_reviews: entry.review_total,
        positive_percentage: Some(entry.review_positive_percentage),
        fetched_at: entry.last_store_scrape.saturating_mul(1000),
    })
}

fn has_importable_details(details: &GameDetails) -> bool {
    !details.genres.is_empty()
        || !details.tags.is_empty()
        || !details.categories.is_empty()
        || !details.developers.is_empty()
        || !details.publishers.is_empty()
        || !details.supported_languages.is_empty()
        || details.release_date.is_some()
        || details.platforms.windows
        || details.platforms.mac
        || details.platforms.linux
}

fn clean_optional_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn clean_strings(values: &[String]) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut clean = Vec::new();
    for value in values {
        let Some(trimmed) = clean_optional_string(value) else {
            continue;
        };
        let key = trimmed.to_lowercase();
        if seen.insert(key) {
            clean.push(trimmed);
        }
    }
    clean
}

fn clean_language_support(language_support: &DepressurizerLanguageSupport) -> Vec<String> {
    let mut values = Vec::new();
    values.extend(language_support.interface.iter().cloned());
    values.extend(language_support.full_audio.iter().cloned());
    values.extend(language_support.subtitles.iter().cloned());
    clean_strings(&values)
}

fn platforms_from_bitmask(mask: u32) -> PlatformSupport {
    PlatformSupport {
        windows: mask & 1 != 0,
        mac: mask & 2 != 0,
        linux: mask & 4 != 0,
    }
}

fn minutes_to_hours(minutes: u32) -> Option<f32> {
    if minutes == 0 {
        None
    } else {
        Some(((minutes as f32 / 60.0) * 10.0).round() / 10.0)
    }
}

fn review_bucket(percentage: u32, total: u32) -> (u32, &'static str) {
    match percentage {
        95..=100 if total >= 500 => (9, "Overwhelmingly Positive"),
        80..=100 if total >= 50 => (8, "Very Positive"),
        80..=100 => (7, "Positive"),
        70..=79 => (6, "Mostly Positive"),
        40..=69 => (5, "Mixed"),
        20..=39 => (4, "Mostly Negative"),
        0..=19 if total >= 500 => (1, "Overwhelmingly Negative"),
        0..=19 if total >= 50 => (2, "Very Negative"),
        _ => (3, "Negative"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const FIXTURE: &str = include_str!("../fixtures/depressurizer-database-snapshot.json");

    #[test]
    fn imports_requested_database_entries_only() {
        let imported = parse_depressurizer_database_json(FIXTURE, &[10, 1946700]).unwrap();

        assert_eq!(imported.stats.database_entries, 3);
        assert_eq!(imported.stats.requested_app_ids, 2);
        assert_eq!(imported.stats.matched_entries, 2);
        assert_eq!(
            imported.names.get(&10).map(String::as_str),
            Some("Counter-Strike")
        );
        assert_eq!(imported.details.len(), 1);

        let counter_strike = &imported.details[0];
        assert_eq!(counter_strike.app_id, 10);
        assert_eq!(counter_strike.genres, vec!["Action"]);
        assert_eq!(counter_strike.tags[0], "Classic");
        assert_eq!(counter_strike.categories[0], "Family Sharing");
        assert_eq!(
            counter_strike.supported_languages,
            vec!["English", "Italian"]
        );
        assert!(counter_strike.platforms.windows);
        assert!(counter_strike.platforms.mac);
        assert!(counter_strike.platforms.linux);

        let hltb = imported.hltb.get(&10).expect("Counter-Strike HLTB");
        assert_eq!(hltb.main_story, Some(25.5));
        assert_eq!(hltb.main_extra, Some(91.3));
        assert_eq!(hltb.completionist, Some(774.8));

        let layers_hltb = imported.hltb.get(&1946700).expect("Layers of Fear HLTB");
        assert_eq!(layers_hltb.main_story, Some(9.6));

        assert_eq!(imported.steam_reviews.len(), 1);
        let review = &imported.steam_reviews[0];
        assert_eq!(review.total_reviews, 34_763);
        assert_eq!(review.total_positive, 33_720);
        assert_eq!(review.total_negative, 1_043);
        assert_eq!(review.review_score_desc, "Overwhelmingly Positive");
        assert_eq!(review.fetched_at, 1_780_631_889_000);
    }

    #[test]
    fn reads_database_json_from_zip() {
        let path = temp_path("database-file.zip");
        let file = fs::File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("nested/database.json", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(FIXTURE.as_bytes()).unwrap();
        writer.finish().unwrap();

        let imported =
            import_depressurizer_database(path.to_string_lossy().to_string(), vec![10]).unwrap();

        assert_eq!(imported.stats.matched_entries, 1);
        assert_eq!(imported.details[0].app_id, 10);

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_empty_requested_app_ids() {
        let error = parse_depressurizer_database_json(FIXTURE, &[]).unwrap_err();
        assert!(error.contains("Load a Steam library"));
    }

    #[test]
    fn imports_external_database_fixture_when_provided() {
        let Ok(path) = std::env::var("REPRESSURIZER_DEPRESSURIZER_DATABASE_FIXTURE") else {
            return;
        };

        let imported = import_depressurizer_database(path, vec![10, 1946700, 324400]).unwrap();

        assert!(imported.stats.database_entries > 1000);
        assert_eq!(imported.stats.requested_app_ids, 3);
        assert!(imported.stats.matched_entries >= 3);
        assert!(imported.hltb.contains_key(&10));
        assert!(imported.names.contains_key(&10));
    }

    fn temp_path(filename: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "repressurizer-{}-{unique}-{filename}",
            std::process::id()
        ))
    }
}
