use super::CategorizeResult;
use crate::steam::api::{GameDetails, OwnedGame};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Deserialize)]
pub struct DevPubConfig {
    pub prefix: Option<String>,
    #[serde(default = "default_true")]
    pub include_developers: bool,
    #[serde(default = "default_true")]
    pub include_publishers: bool,
    #[serde(default)]
    pub selected: Vec<String>,
    pub min_games: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct FlagsConfig {
    pub prefix: Option<String>,
    pub max_flags: Option<usize>,
    #[serde(default)]
    pub included_flags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct LanguageConfig {
    pub prefix: Option<String>,
    pub max_languages: Option<usize>,
    #[serde(default)]
    pub included_languages: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformConfig {
    pub prefix: Option<String>,
    #[serde(default = "default_true")]
    pub include_windows: bool,
    #[serde(default = "default_true")]
    pub include_mac: bool,
    #[serde(default = "default_true")]
    pub include_linux: bool,
}

#[derive(Debug, Deserialize)]
pub struct NameConfig {
    pub prefix: Option<String>,
    #[serde(default = "default_true")]
    pub skip_leading_the: bool,
    #[serde(default = "default_true")]
    pub group_numbers: bool,
    #[serde(default = "default_true")]
    pub group_other: bool,
}

fn default_true() -> bool {
    true
}

pub fn categorize_by_devpub(games: &[GameDetails], config: &DevPubConfig) -> CategorizeResult {
    let selected = normalized_filter(&config.selected);
    let counts = devpub_counts(games, config);
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added_for_game = false;
        for name in devpub_names(game, config) {
            if !selected.is_empty() && !selected.contains(&name.to_ascii_lowercase()) {
                continue;
            }
            if let Some(min_games) = config.min_games {
                if counts.get(&name).copied().unwrap_or(0) < min_games {
                    continue;
                }
            }
            assignments
                .entry(category_name(config.prefix.as_deref(), &name))
                .or_default()
                .push(game.app_id);
            added_for_game = true;
        }
        if added_for_game {
            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}

pub fn categorize_by_flags(games: &[GameDetails], config: &FlagsConfig) -> CategorizeResult {
    let included = normalized_filter(&config.included_flags);
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added = 0usize;
        for flag in &game.categories {
            if !included.is_empty() && !included.contains(&flag.to_ascii_lowercase()) {
                continue;
            }
            if let Some(max) = config.max_flags {
                if added >= max {
                    break;
                }
            }
            assignments
                .entry(category_name(config.prefix.as_deref(), flag))
                .or_default()
                .push(game.app_id);
            added += 1;
        }
        if added > 0 {
            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}

pub fn categorize_by_language(
    games: &[GameDetails],
    config: &LanguageConfig,
) -> CategorizeResult {
    let included = normalized_filter(&config.included_languages);
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added = 0usize;
        for language in &game.supported_languages {
            if !included.is_empty() && !included.contains(&language.to_ascii_lowercase()) {
                continue;
            }
            if let Some(max) = config.max_languages {
                if added >= max {
                    break;
                }
            }
            assignments
                .entry(category_name(config.prefix.as_deref(), language))
                .or_default()
                .push(game.app_id);
            added += 1;
        }
        if added > 0 {
            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}

pub fn categorize_by_platform(games: &[GameDetails], config: &PlatformConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added_for_game = false;
        let platforms = [
            ("Windows", config.include_windows && game.platforms.windows),
            ("macOS", config.include_mac && game.platforms.mac),
            ("Linux", config.include_linux && game.platforms.linux),
        ];
        for (name, supported) in platforms {
            if supported {
                assignments
                    .entry(category_name(config.prefix.as_deref(), name))
                    .or_default()
                    .push(game.app_id);
                added_for_game = true;
            }
        }
        if added_for_game {
            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}

pub fn categorize_by_name(games: &[OwnedGame], config: &NameConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let Some(bucket) = name_bucket(&game.name, config) else {
            continue;
        };
        assignments
            .entry(category_name(config.prefix.as_deref(), &bucket))
            .or_default()
            .push(game.appid);
        games_categorized += 1;
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}

fn devpub_names(game: &GameDetails, config: &DevPubConfig) -> Vec<String> {
    let mut names = Vec::new();
    if config.include_developers {
        names.extend(game.developers.iter().filter_map(|name| clean_name(name)));
    }
    if config.include_publishers {
        names.extend(game.publishers.iter().filter_map(|name| clean_name(name)));
    }
    dedupe_preserve_order(names)
}

fn devpub_counts(games: &[GameDetails], config: &DevPubConfig) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for game in games {
        for name in devpub_names(game, config) {
            *counts.entry(name).or_insert(0) += 1;
        }
    }
    counts
}

fn normalized_filter(values: &[String]) -> HashSet<String> {
    values
        .iter()
        .filter_map(|value| clean_name(value))
        .map(|value| value.to_ascii_lowercase())
        .collect()
}

fn clean_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn category_name(prefix: Option<&str>, name: &str) -> String {
    match prefix.filter(|prefix| !prefix.is_empty()) {
        Some(prefix) => format!("{prefix}{name}"),
        None => name.to_string(),
    }
}

fn dedupe_preserve_order(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for value in values {
        let key = value.to_ascii_lowercase();
        if seen.insert(key) {
            deduped.push(value);
        }
    }
    deduped
}

fn name_bucket(name: &str, config: &NameConfig) -> Option<String> {
    let mut title = name.trim();
    if config.skip_leading_the {
        title = title
            .strip_prefix("The ")
            .or_else(|| title.strip_prefix("the "))
            .unwrap_or(title)
            .trim_start();
    }
    let first = title.chars().find(|ch| !ch.is_whitespace())?;
    if first.is_ascii_alphabetic() {
        return Some(first.to_ascii_uppercase().to_string());
    }
    if first.is_ascii_digit() && config.group_numbers {
        return Some("#".to_string());
    }
    if config.group_other {
        return Some("Other".to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::steam::api::PlatformSupport;

    fn details(app_id: u64) -> GameDetails {
        GameDetails {
            app_id,
            name: format!("Game {app_id}"),
            genres: Vec::new(),
            tags: Vec::new(),
            categories: vec!["Single-player".to_string(), "Steam Cloud".to_string()],
            release_date: None,
            metacritic_score: None,
            developers: vec!["Valve".to_string()],
            publishers: vec!["Valve".to_string(), "Sierra".to_string()],
            supported_languages: vec!["English".to_string(), "French".to_string()],
            platforms: PlatformSupport {
                windows: true,
                mac: app_id == 10,
                linux: false,
            },
            header_image: None,
            capsule_image: None,
            price_initial: None,
            price_final: None,
            price_currency: None,
            price_country_code: None,
            is_free: false,
        }
    }

    #[test]
    fn categorizes_developers_publishers_once_per_game() {
        let result = categorize_by_devpub(
            &[details(10)],
            &DevPubConfig {
                prefix: Some("(Studio) ".to_string()),
                include_developers: true,
                include_publishers: true,
                selected: Vec::new(),
                min_games: None,
            },
        );

        assert_eq!(result.games_categorized, 1);
        assert_eq!(result.assignments["(Studio) Valve"], vec![10]);
        assert_eq!(result.assignments["(Studio) Sierra"], vec![10]);
    }

    #[test]
    fn categorizes_flags_platforms_and_names() {
        let flags = categorize_by_flags(
            &[details(10)],
            &FlagsConfig {
                prefix: None,
                max_flags: Some(1),
                included_flags: Vec::new(),
            },
        );
        assert_eq!(flags.assignments["Single-player"], vec![10]);
        assert!(!flags.assignments.contains_key("Steam Cloud"));

        let languages = categorize_by_language(
            &[details(10)],
            &LanguageConfig {
                prefix: Some("(Lang) ".to_string()),
                max_languages: Some(1),
                included_languages: Vec::new(),
            },
        );
        assert_eq!(languages.assignments["(Lang) English"], vec![10]);
        assert!(!languages.assignments.contains_key("(Lang) French"));

        let platforms = categorize_by_platform(
            &[details(10)],
            &PlatformConfig {
                prefix: Some("(Platform) ".to_string()),
                include_windows: true,
                include_mac: true,
                include_linux: true,
            },
        );
        assert_eq!(platforms.assignments["(Platform) Windows"], vec![10]);
        assert_eq!(platforms.assignments["(Platform) macOS"], vec![10]);

        let names = categorize_by_name(
            &[
                OwnedGame {
                    appid: 1,
                    name: "The Long Dark".to_string(),
                    playtime_forever: 0,
                    img_icon_url: None,
                    rtime_last_played: 0,
                },
                OwnedGame {
                    appid: 2,
                    name: "2064".to_string(),
                    playtime_forever: 0,
                    img_icon_url: None,
                    rtime_last_played: 0,
                },
            ],
            &NameConfig {
                prefix: None,
                skip_leading_the: true,
                group_numbers: true,
                group_other: true,
            },
        );
        assert_eq!(names.assignments["L"], vec![1]);
        assert_eq!(names.assignments["#"], vec![2]);
    }
}
