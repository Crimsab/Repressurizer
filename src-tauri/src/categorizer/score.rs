use super::CategorizeResult;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct ScoreRule {
    pub name: String,
    pub min_score: u32,
    pub max_score: u32,
    pub min_reviews: u32,
    /// 0 means unlimited
    pub max_reviews: u32,
}

#[derive(Debug, Deserialize)]
pub struct ScoreConfig {
    pub prefix: Option<String>,
    pub rules: Vec<ScoreRule>,
}

#[derive(Debug)]
pub struct GameScore {
    pub app_id: u64,
    pub review_score: u32, // 0-100
    pub review_count: u32,
}

impl ScoreConfig {
    /// Uses metacritic score only (no review count), suitable for the Steam API metacritic_score field
    pub fn steam_metacritic_default() -> Self {
        ScoreConfig {
            prefix: None,
            rules: vec![
                ScoreRule {
                    name: "Must-Play".into(),
                    min_score: 90,
                    max_score: 100,
                    min_reviews: 0,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Great".into(),
                    min_score: 75,
                    max_score: 89,
                    min_reviews: 0,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Good".into(),
                    min_score: 60,
                    max_score: 74,
                    min_reviews: 0,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Mixed".into(),
                    min_score: 40,
                    max_score: 59,
                    min_reviews: 0,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Poor".into(),
                    min_score: 0,
                    max_score: 39,
                    min_reviews: 0,
                    max_reviews: 0,
                },
            ],
        }
    }

    pub fn steam_default() -> Self {
        ScoreConfig {
            prefix: None,
            rules: vec![
                ScoreRule {
                    name: "Overwhelmingly Positive".into(),
                    min_score: 95,
                    max_score: 100,
                    min_reviews: 500,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Very Positive".into(),
                    min_score: 80,
                    max_score: 100,
                    min_reviews: 50,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Positive".into(),
                    min_score: 80,
                    max_score: 100,
                    min_reviews: 1,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Mixed".into(),
                    min_score: 40,
                    max_score: 79,
                    min_reviews: 1,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Negative".into(),
                    min_score: 20,
                    max_score: 39,
                    min_reviews: 1,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Very Negative".into(),
                    min_score: 0,
                    max_score: 19,
                    min_reviews: 50,
                    max_reviews: 0,
                },
                ScoreRule {
                    name: "Overwhelmingly Negative".into(),
                    min_score: 0,
                    max_score: 19,
                    min_reviews: 500,
                    max_reviews: 0,
                },
            ],
        }
    }
}

pub fn categorize_by_score(games: &[GameScore], config: &ScoreConfig) -> CategorizeResult {
    let mut assignments: HashMap<String, Vec<u64>> = HashMap::new();
    let mut games_categorized = 0u64;

    for game in games {
        let matched = config.rules.iter().find(|rule| {
            game.review_score >= rule.min_score
                && game.review_score <= rule.max_score
                && game.review_count >= rule.min_reviews
                && (rule.max_reviews == 0 || game.review_count <= rule.max_reviews)
        });

        if let Some(rule) = matched {
            let cat_name = match &config.prefix {
                Some(p) => format!("{}{}", p, rule.name),
                None => rule.name.clone(),
            };

            assignments.entry(cat_name).or_default().push(game.app_id);

            games_categorized += 1;
        }
    }

    CategorizeResult {
        games_processed: games.len() as u64,
        games_categorized,
        assignments,
    }
}
