use super::CategorizeResult;
use crate::steam::api::OwnedGame;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct HoursRule {
    pub name: String,
    pub min_hours: f64,
    /// 0 means unlimited (open-ended range)
    pub max_hours: f64,
}

#[derive(Debug, Deserialize)]
pub struct HoursConfig {
    pub prefix: Option<String>,
    pub rules: Vec<HoursRule>,
}

pub fn categorize_by_hours(games: &[OwnedGame], config: &HoursConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let hours = game.playtime_forever as f64 / 60.0;

        let matched = config.rules.iter().find(|rule| {
            if hours >= rule.min_hours {
                if rule.max_hours == 0.0 {
                    return true; // Open-ended
                }
                return hours < rule.max_hours;
            }
            false
        });

        if let Some(rule) = matched {
            let cat_name = match &config.prefix {
                Some(p) => format!("{}{}", p, rule.name),
                None => rule.name.clone(),
            };

            assignments.entry(cat_name).or_default().push(game.appid);

            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}
