use super::CategorizeResult;
use crate::steam::api::GameDetails;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct TagsConfig {
    pub prefix: Option<String>,
    pub max_tags: Option<usize>,
    pub included_tags: Vec<String>,
}

pub fn categorize_by_tags(
    games: &[GameDetails],
    config: &TagsConfig,
) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added = 0usize;

        for category in &game.categories {
            if !config.included_tags.is_empty()
                && !config.included_tags.iter().any(|t| t.eq_ignore_ascii_case(category))
            {
                continue;
            }

            if let Some(max) = config.max_tags {
                if added >= max {
                    break;
                }
            }

            let cat_name = match &config.prefix {
                Some(p) => format!("{}{}", p, category),
                None => category.clone(),
            };

            assignments
                .entry(cat_name)
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
