#![allow(dead_code)]

pub mod commands;
pub mod genre;
pub mod hours;
pub mod metadata;
pub mod score;
pub mod tags;
pub mod year;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizeResult {
    /// Map of category name -> list of app IDs assigned
    pub assignments: HashMap<String, Vec<u64>>,
    /// Number of games processed
    pub games_processed: u64,
    /// Number of games that got at least one category
    pub games_categorized: u64,
}
