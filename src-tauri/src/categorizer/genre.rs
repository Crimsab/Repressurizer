use super::CategorizeResult;
use crate::steam::api::GameDetails;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct GenreConfig {
    pub prefix: Option<String>,
    pub max_categories: Option<usize>,
    pub ignored_genres: Vec<String>,
}

pub fn categorize_by_genre(games: &[GameDetails], config: &GenreConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added = 0usize;

        for genre in &game.genres {
            if config
                .ignored_genres
                .iter()
                .any(|ig| ig.eq_ignore_ascii_case(genre))
            {
                continue;
            }

            if let Some(max) = config.max_categories {
                if added >= max {
                    break;
                }
            }

            let cat_name = match &config.prefix {
                Some(p) => format!("{}{}", p, genre),
                None => genre.clone(),
            };

            assignments.entry(cat_name).or_default().push(game.app_id);

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
