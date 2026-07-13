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

pub fn categorize_by_tags(games: &[GameDetails], config: &TagsConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let mut added = 0usize;
        for category in &game.tags {
            if !config.included_tags.is_empty()
                && !config
                    .included_tags
                    .iter()
                    .any(|t| t.eq_ignore_ascii_case(category))
            {
                continue;
            }

            if let Some(max) = config.max_tags.filter(|max| *max > 0) {
                if added >= max {
                    break;
                }
            }

            let cat_name = match &config.prefix {
                Some(p) => format!("{}{}", p, category),
                None => category.clone(),
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

    fn details(tags: &[&str], categories: &[&str]) -> GameDetails {
        GameDetails {
            app_id: 34330,
            name: "Total War: SHOGUN 2".to_string(),
            genres: Vec::new(),
            tags: tags.iter().map(|value| (*value).to_string()).collect(),
            categories: categories
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            release_date: None,
            store_release_date: None,
            store_release_date_fetched_at: None,
            metacritic_score: None,
            developers: Vec::new(),
            publishers: Vec::new(),
            supported_languages: Vec::new(),
            platforms: PlatformSupport {
                windows: true,
                mac: false,
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
    fn does_not_treat_store_flags_as_community_tags() {
        let result = categorize_by_tags(
            &[details(&[], &["Local Co-Op"])],
            &TagsConfig {
                prefix: Some("(TAGS) ".to_string()),
                max_tags: None,
                included_tags: vec!["Local Co-Op".to_string()],
            },
        );

        assert!(result.assignments.is_empty());
        assert_eq!(result.games_categorized, 0);
    }

    #[test]
    fn treats_zero_max_tags_as_unlimited_for_depressurizer_imports() {
        let result = categorize_by_tags(
            &[details(&["Local Co-Op", "Gamepad Recommended"], &[])],
            &TagsConfig {
                prefix: Some("(TAGS) ".to_string()),
                max_tags: Some(0),
                included_tags: Vec::new(),
            },
        );

        assert_eq!(result.assignments["(TAGS) Local Co-Op"], vec![34330]);
        assert_eq!(
            result.assignments["(TAGS) Gamepad Recommended"],
            vec![34330]
        );
    }
}
