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

pub fn categorize_by_year(
    games: &[GameDetails],
    config: &YearConfig,
) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let year = game.release_date.as_deref().and_then(extract_year);

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
