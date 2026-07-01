use super::CategorizeResult;
use crate::steam::api::GameDetails;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub enum YearGrouping {
    None,
    HalfDecade,
    Decade,
}

#[derive(Debug, Deserialize)]
pub struct YearConfig {
    pub prefix: Option<String>,
    pub grouping: YearGrouping,
    pub include_unknown: bool,
    pub unknown_text: Option<String>,
}

fn extract_year(date_str: &str) -> Option<u32> {
    // Steam dates are like "Oct 25, 2023" or "25 Oct, 2023" or just "2023"
    date_str
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse::<u32>().ok())
        .find(|&y| y >= 1970 && y <= 2100)
}

fn release_date_for_year(game: &GameDetails) -> Option<&str> {
    game.store_release_date
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            if game.store_release_date_fetched_at.is_some() {
                game.release_date
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
            } else {
                None
            }
        })
}

pub fn categorize_by_year(
    games: &[GameDetails],
    config: &YearConfig,
) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let year = release_date_for_year(game).and_then(extract_year);

        let cat_name = match year {
            Some(y) => {
                let label = match config.grouping {
                    YearGrouping::None => y.to_string(),
                    YearGrouping::HalfDecade => {
                        let start = y - (y % 5);
                        format!("{}-{}", start, start + 4)
                    }
                    YearGrouping::Decade => {
                        let start = y - (y % 10);
                        format!("{}-{}", start, start + 9)
                    }
                };
                match &config.prefix {
                    Some(p) => format!("{}{}", p, label),
                    None => label,
                }
            }
            None => {
                if config.include_unknown {
                    let text = config
                        .unknown_text
                        .clone()
                        .unwrap_or_else(|| "Unknown".to_string());
                    match &config.prefix {
                        Some(p) => format!("{}{}", p, text),
                        None => text,
                    }
                } else {
                    continue;
                }
            }
        };

        assignments
            .entry(cat_name)
            .or_default()
            .push(game.app_id);

        games_categorized += 1;
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

    fn details(app_id: u64, release_date: Option<&str>, store_release_date: Option<&str>) -> GameDetails {
        GameDetails {
            app_id,
            name: format!("Game {app_id}"),
            genres: Vec::new(),
            tags: Vec::new(),
            categories: Vec::new(),
            release_date: release_date.map(str::to_string),
            store_release_date: store_release_date.map(str::to_string),
            store_release_date_fetched_at: store_release_date.map(|_| 1),
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
    fn prefers_store_release_date_over_api_release_date() {
        let result = categorize_by_year(
            &[details(260730, Some("20 Nov, 2013"), Some("23 Jul, 2001"))],
            &YearConfig {
                prefix: Some("Released - ".to_string()),
                grouping: YearGrouping::None,
                include_unknown: false,
                unknown_text: None,
            },
        );

        assert_eq!(result.assignments["Released - 2001"], vec![260730]);
    }

    #[test]
    fn skips_unchecked_api_release_date_to_preserve_existing_categories() {
        let result = categorize_by_year(
            &[details(260730, Some("20 Nov, 2013"), None)],
            &YearConfig {
                prefix: None,
                grouping: YearGrouping::None,
                include_unknown: false,
                unknown_text: None,
            },
        );

        assert!(result.assignments.is_empty());
        assert_eq!(result.games_categorized, 0);
    }

    #[test]
    fn falls_back_to_api_release_date_after_store_page_was_checked() {
        let mut checked = details(123, Some("5 Dec, 2020"), None);
        checked.store_release_date_fetched_at = Some(1);

        let result = categorize_by_year(
            &[checked],
            &YearConfig {
                prefix: None,
                grouping: YearGrouping::None,
                include_unknown: false,
                unknown_text: None,
            },
        );

        assert_eq!(result.assignments["2020"], vec![123]);
    }
}
