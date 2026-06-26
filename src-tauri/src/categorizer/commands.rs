use super::CategorizeResult;
use super::{genre, hours, metadata, score, tags, year};
use crate::steam::api::{GameDetails, OwnedGame};
use score::GameScore;

#[tauri::command]
pub fn run_hours_categorizer(
    games: Vec<OwnedGame>,
    config: hours::HoursConfig,
) -> CategorizeResult {
    hours::categorize_by_hours(&games, &config)
}

#[tauri::command]
pub fn run_genre_categorizer(
    game_details: Vec<GameDetails>,
    config: genre::GenreConfig,
) -> CategorizeResult {
    genre::categorize_by_genre(&game_details, &config)
}

#[tauri::command]
pub fn run_tags_categorizer(
    game_details: Vec<GameDetails>,
    config: tags::TagsConfig,
) -> CategorizeResult {
    tags::categorize_by_tags(&game_details, &config)
}

#[tauri::command]
pub fn run_year_categorizer(
    game_details: Vec<GameDetails>,
    config: year::YearConfig,
) -> CategorizeResult {
    year::categorize_by_year(&game_details, &config)
}

#[tauri::command]
pub fn run_score_categorizer(
    game_details: Vec<GameDetails>,
    use_default: bool,
    config: Option<score::ScoreConfig>,
) -> CategorizeResult {
    let game_scores: Vec<GameScore> = game_details
        .into_iter()
        .filter_map(|g| {
            g.metacritic_score.map(|s| GameScore {
                app_id: g.app_id,
                review_score: s,
                review_count: 0, // metacritic score only, no review count from Steam API
            })
        })
        .collect();

    let cfg = if use_default {
        score::ScoreConfig::steam_metacritic_default()
    } else {
        config.unwrap_or_else(score::ScoreConfig::steam_metacritic_default)
    };

    score::categorize_by_score(&game_scores, &cfg)
}

#[tauri::command]
pub fn run_devpub_categorizer(
    game_details: Vec<GameDetails>,
    config: metadata::DevPubConfig,
) -> CategorizeResult {
    metadata::categorize_by_devpub(&game_details, &config)
}

#[tauri::command]
pub fn run_flags_categorizer(
    game_details: Vec<GameDetails>,
    config: metadata::FlagsConfig,
) -> CategorizeResult {
    metadata::categorize_by_flags(&game_details, &config)
}

#[tauri::command]
pub fn run_platform_categorizer(
    game_details: Vec<GameDetails>,
    config: metadata::PlatformConfig,
) -> CategorizeResult {
    metadata::categorize_by_platform(&game_details, &config)
}

#[tauri::command]
pub fn run_name_categorizer(
    games: Vec<OwnedGame>,
    config: metadata::NameConfig,
) -> CategorizeResult {
    metadata::categorize_by_name(&games, &config)
}
