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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::steam::api::PlatformSupport;

    fn details(app_id: u64, genres: &[&str]) -> GameDetails {
        GameDetails {
            app_id,
            name: format!("Game {app_id}"),
            genres: genres.iter().map(|value| (*value).to_string()).collect(),
            tags: Vec::new(),
            categories: Vec::new(),
            release_date: None,
            store_release_date: None,
            store_release_date_fetched_at: None,
            metacritic_score: None,
            developers: Vec::new(),
            publishers: Vec::new(),
            supported_languages: Vec::new(),
            platforms: PlatformSupport::default(),
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
    fn respects_case_insensitive_ignored_genres_and_limit() {
        let result = categorize_by_genre(
            &[details(1, &["Action", "RPG", "Utilities"])],
            &GenreConfig {
                prefix: Some("(Genre) ".to_string()),
                max_categories: Some(1),
                ignored_genres: vec!["utilities".to_string()],
            },
        );

        assert_eq!(result.games_processed, 1);
        assert_eq!(result.games_categorized, 1);
        assert_eq!(result.assignments["(Genre) Action"], vec![1]);
        assert!(!result.assignments.contains_key("(Genre) RPG"));
        assert!(!result.assignments.contains_key("(Genre) Utilities"));
    }
}
