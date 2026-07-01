use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct AchievementInfo {
    pub api_name: String,
    pub name: String,
    pub description: String,
    pub achieved: bool,
    pub unlock_time: u64,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AchievementSummary {
    pub total: u32,
    pub achieved: u32,
    pub achievements: Vec<AchievementInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnedGame {
    pub appid: u64,
    pub name: String,
    pub playtime_forever: u64,
    pub img_icon_url: Option<String>,
    #[serde(default)]
    pub rtime_last_played: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamAppListItem {
    pub appid: u64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameDetails {
    pub app_id: u64,
    pub name: String,
    pub genres: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub release_date: Option<String>,
    #[serde(default)]
    pub store_release_date: Option<String>,
    #[serde(default)]
    pub store_release_date_fetched_at: Option<u64>,
    pub metacritic_score: Option<u32>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    #[serde(default)]
    pub supported_languages: Vec<String>,
    pub platforms: PlatformSupport,
    pub header_image: Option<String>,
    #[serde(default)]
    pub capsule_image: Option<String>,
    #[serde(default)]
    pub price_initial: Option<u64>,
    #[serde(default)]
    pub price_final: Option<u64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub price_country_code: Option<String>,
    #[serde(default)]
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamePriceOverview {
    pub app_id: u64,
    #[serde(default)]
    pub price_initial: Option<u64>,
    #[serde(default)]
    pub price_final: Option<u64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub price_country_code: Option<String>,
    #[serde(default)]
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoreReleaseDateResult {
    pub app_id: u64,
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamReviewSummary {
    pub app_id: u64,
    pub review_score: u32,
    pub review_score_desc: String,
    pub total_positive: u32,
    pub total_negative: u32,
    pub total_reviews: u32,
    pub positive_percentage: Option<u32>,
    pub fetched_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlatformSupport {
    pub windows: bool,
    pub mac: bool,
    pub linux: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WishlistItem {
    pub appid: u64,
    pub priority: u32,
    pub date_added: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyLibraryApp {
    pub appid: u64,
    pub name: Option<String>,
    pub owner_steamids: Vec<String>,
    pub exclude_reason: u32,
    pub playtime_forever: u64,
    pub rtime_last_played: u64,
    pub img_icon_hash: Option<String>,
    pub app_type: u32,
    pub is_non_game: bool,
    pub is_owned_by_current_user: bool,
    pub is_family_shared: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyLibraryResult {
    pub auth_used: String,
    pub family_groupid: Option<String>,
    pub owner_steamid: Option<String>,
    pub total_apps: usize,
    pub owned_apps: usize,
    pub shared_apps: usize,
    pub excluded_apps: usize,
    pub non_game_apps: usize,
    pub playtime_entries: usize,
    pub playtime_unavailable_reason: Option<String>,
    pub apps: Vec<FamilyLibraryApp>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlayerSummary {
    pub steamid: String,
    pub personaname: String,
    pub avatar: String,
    pub avatarmedium: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FriendSummary {
    pub steamid: String,
    pub personaname: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub friend_since: u64,
}
