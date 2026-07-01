mod achievements;
mod details;
mod family;
mod library;
mod profile;
mod reviews;
mod types;
mod utils;

pub use types::*;

#[tauri::command]
pub async fn fetch_library(api_key: String, steam_id64: String) -> Result<Vec<OwnedGame>, String> {
    library::fetch_library(api_key, steam_id64).await
}

#[tauri::command]
pub async fn fetch_steam_app_list(api_key: String) -> Result<Vec<SteamAppListItem>, String> {
    library::fetch_steam_app_list(api_key).await
}

#[tauri::command]
pub async fn fetch_game_details(
    app_id: u64,
    country_code: Option<String>,
) -> Result<GameDetails, String> {
    details::fetch_game_details(app_id, country_code).await
}

#[tauri::command]
pub async fn fetch_store_release_date(app_id: u64) -> Result<StoreReleaseDateResult, String> {
    details::fetch_store_release_date(app_id).await
}

#[tauri::command]
pub async fn fetch_store_release_dates(
    app_ids: Vec<u64>,
) -> Result<Vec<StoreReleaseDateResult>, String> {
    details::fetch_store_release_dates(app_ids).await
}

#[tauri::command]
pub async fn fetch_game_price_overviews(
    app_ids: Vec<u64>,
    country_code: Option<String>,
) -> Result<Vec<GamePriceOverview>, String> {
    details::fetch_game_price_overviews(app_ids, country_code).await
}

#[tauri::command]
pub async fn fetch_steam_review_summary(app_id: u64) -> Result<SteamReviewSummary, String> {
    reviews::fetch_steam_review_summary(app_id).await
}

#[tauri::command]
pub async fn fetch_achievements(
    api_key: String,
    steam_id64: String,
    app_id: u64,
) -> Result<AchievementSummary, String> {
    achievements::fetch_achievements(api_key, steam_id64, app_id).await
}

#[tauri::command]
pub async fn fetch_achievements_summary(
    api_key: String,
    steam_id64: String,
    app_id: u64,
) -> Result<(u32, u32), String> {
    achievements::fetch_achievements_summary(api_key, steam_id64, app_id).await
}

#[tauri::command]
pub async fn fetch_wishlist(steam_id64: String) -> Result<Vec<WishlistItem>, String> {
    family::fetch_wishlist(steam_id64).await
}

#[tauri::command]
pub async fn fetch_family_library(
    api_key: String,
    access_token: Option<String>,
    steam_id64: Option<String>,
    include_non_games: Option<bool>,
) -> Result<FamilyLibraryResult, String> {
    family::fetch_family_library(api_key, access_token, steam_id64, include_non_games).await
}

#[tauri::command]
pub async fn resolve_vanity_url(api_key: String, vanity_url: String) -> Result<String, String> {
    profile::resolve_vanity_url(api_key, vanity_url).await
}

#[tauri::command]
pub async fn fetch_player_summary(
    api_key: String,
    steam_id64: String,
) -> Result<PlayerSummary, String> {
    profile::fetch_player_summary(api_key, steam_id64).await
}

#[tauri::command]
pub async fn fetch_friend_list(
    api_key: String,
    steam_id64: String,
) -> Result<Vec<FriendSummary>, String> {
    profile::fetch_friend_list(api_key, steam_id64).await
}

#[cfg(test)]
use details::{
    format_store_release_timestamp, is_euro_country_code, parse_game_details_response,
    parse_game_price_overviews_response, parse_store_page_release_date, StoreAppResponse,
    StoreBrowseGetItemsResponse,
};
#[cfg(test)]
use family::fetch_family_library_from_base;
#[cfg(test)]
use library::{is_transient_library_app, SteamAppListResponse};

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .user_agent("Repressurizer/test")
            .build()
            .expect("test client")
    }

    fn owned_game(appid: u64, name: &str) -> OwnedGame {
        OwnedGame {
            appid,
            name: name.to_string(),
            playtime_forever: 0,
            img_icon_url: None,
            rtime_last_played: 0,
        }
    }

    #[test]
    fn transient_library_filter_hides_beta_apps() {
        assert!(is_transient_library_app(&owned_game(
            123,
            "Battlefield 6 Open Beta"
        )));
        assert!(is_transient_library_app(&owned_game(
            124,
            "Some Game Playtest"
        )));
        assert!(is_transient_library_app(&owned_game(125, "Some Game Demo")));
        assert!(!is_transient_library_app(&owned_game(
            126,
            "FINAL FANTASY VII"
        )));
    }

    #[test]
    fn euro_country_detection_includes_italy_and_germany() {
        assert!(is_euro_country_code("it"));
        assert!(is_euro_country_code("de"));
        assert!(!is_euro_country_code("us"));
    }

    #[test]
    fn store_app_response_parses_header_and_capsule_images() {
        let parsed: HashMap<String, StoreAppResponse> = serde_json::from_value(json!({
            "3280350": {
                "success": true,
                "data": {
                    "name": "DEATH STRANDING 2: ON THE BEACH",
                    "header_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/header.jpg",
                    "capsule_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/capsule_231x87.jpg"
                }
            }
        }))
        .expect("store appdetails json");

        let app = parsed.get("3280350").expect("appdetails entry");
        let data = app.data.as_ref().expect("appdetails data");

        assert_eq!(
            data.header_image.as_deref(),
            Some(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/header.jpg"
            )
        );
        assert_eq!(
            data.capsule_image.as_deref(),
            Some(
                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/hash/capsule_231x87.jpg"
            )
        );
    }

    #[test]
    fn store_app_list_response_parses_paginated_apps() {
        let parsed: SteamAppListResponse = serde_json::from_value(json!({
            "response": {
                "apps": [
                    { "appid": 10, "name": "Counter-Strike" },
                    { "appid": 20, "name": "Team Fortress Classic" }
                ],
                "have_more_results": true,
                "last_appid": 20
            }
        }))
        .expect("store app list json");

        assert_eq!(parsed.response.apps.len(), 2);
        assert!(parsed.response.have_more_results);
        assert_eq!(parsed.response.last_appid, 20);
    }

    #[tokio::test]
    async fn family_library_resolves_group_before_fetching_apps() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("steamid", "765000"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "is_not_member_of_any_group": false,
                    "family_groupid": "123456"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetSharedLibraryApps/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("family_groupid", "123456"))
            .and(query_param("steamid", "765000"))
            .and(query_param("include_own", "true"))
            .and(query_param("include_excluded", "true"))
            .and(query_param("include_non_games", "false"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "apps": [
                        {
                            "appid": "620",
                            "name": "Portal 2",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 0,
                            "rt_playtime": 15,
                            "rt_last_played": 100,
                            "app_type": 1,
                            "img_icon_hash": "portal2-icon"
                        },
                        {
                            "appid": 70,
                            "name": "Half-Life",
                            "owner_steamids": ["765000"],
                            "exclude_reason": 0,
                            "rt_playtime": 30,
                            "rt_last_played": 200,
                            "app_type": 1
                        },
                        {
                            "appid": 400,
                            "name": "Portal",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 3,
                            "app_type": 1
                        },
                        {
                            "appid": 211,
                            "name": "Source SDK",
                            "owner_steamids": ["765111"],
                            "exclude_reason": 0,
                            "app_type": 2
                        }
                    ]
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetPlaytimeSummary/v1/"))
            .and(query_param("access_token", "store-token"))
            .and(query_param("family_groupid", "123456"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "entries": [
                        {
                            "steamid": "765000",
                            "appid": "620",
                            "latest_played": 500,
                            "seconds_played": 7200
                        },
                        {
                            "steamid": "765111",
                            "appid": "620",
                            "latest_played": 900,
                            "seconds_played": 999999
                        }
                    ]
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        let result = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            String::new(),
            Some("store-token".to_string()),
            Some("765000".to_string()),
            false,
        )
        .await
        .expect("family library");

        assert_eq!(result.auth_used, "access_token");
        assert_eq!(result.family_groupid.as_deref(), Some("123456"));
        assert_eq!(result.owner_steamid.as_deref(), Some("765000"));
        assert_eq!(result.total_apps, 3);
        assert_eq!(result.owned_apps, 1);
        assert_eq!(result.shared_apps, 1);
        assert_eq!(result.excluded_apps, 1);
        assert_eq!(result.non_game_apps, 1);
        assert_eq!(result.playtime_entries, 1);
        assert!(result
            .apps
            .iter()
            .any(|app| app.appid == 620 && app.is_family_shared));
        assert!(result.apps.iter().any(|app| {
            app.appid == 620
                && app.playtime_forever == 120
                && app.rtime_last_played == 500
                && app.img_icon_hash.as_deref() == Some("portal2-icon")
        }));
        assert!(result
            .apps
            .iter()
            .any(|app| app.appid == 70 && app.is_owned_by_current_user));
        assert!(!result.apps.iter().any(|app| app.appid == 211));
    }

    #[tokio::test]
    async fn family_library_reports_not_member() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "response": {
                    "is_not_member_of_any_group": true,
                    "family_groupid": "0"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;

        let error = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            String::new(),
            Some("store-token".to_string()),
            Some("765000".to_string()),
            false,
        )
        .await
        .expect_err("not member");

        assert!(error.contains("not a member"));
    }

    #[tokio::test]
    async fn family_library_explains_web_api_key_rejections() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/IFamilyGroupsService/GetFamilyGroupForUser/v1/"))
            .and(query_param("key", "developer-key"))
            .respond_with(ResponseTemplate::new(403).set_body_string("Access is denied"))
            .expect(1)
            .mount(&server)
            .await;

        let error = fetch_family_library_from_base(
            &test_client(),
            &server.uri(),
            "developer-key".to_string(),
            None,
            Some("765000".to_string()),
            false,
        )
        .await
        .expect_err("rejected key");

        assert!(error.contains("webapi_token"));
        assert!(error.contains("normal Steam Web API key"));
    }

    #[test]
    fn parses_successful_store_details_with_images() {
        let raw = r#"{
          "3590": {
            "success": true,
            "data": {
              "name": "Plants vs. Zombies GOTY Edition",
              "genres": [{"description": "Strategy"}],
              "categories": [{"description": "Single-player"}],
              "release_date": {"date": "May 5, 2009"},
              "metacritic": {"score": 87},
              "developers": ["PopCap Games"],
              "publishers": ["PopCap Games"],
              "supported_languages": "English<strong>*</strong>, French, Italian<br><strong>*languages with full audio support</strong>",
              "platforms": {"windows": true, "mac": true, "linux": false},
              "header_image": "https://cdn.akamai.steamstatic.com/steam/apps/3590/header.jpg",
              "capsule_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3590/capsule_231x87.jpg",
              "is_free": false
            }
          }
        }"#;

        let details = parse_game_details_response(3590, raw, Some("it")).expect("details");

        assert_eq!(details.name, "Plants vs. Zombies GOTY Edition");
        assert_eq!(details.genres, vec!["Strategy"]);
        assert_eq!(details.metacritic_score, Some(87));
        assert_eq!(
            details.supported_languages,
            vec!["English", "French", "Italian"]
        );
        assert!(details.platforms.windows);
        assert_eq!(details.price_country_code.as_deref(), Some("IT"));
        assert!(details.header_image.unwrap().contains("/3590/header.jpg"));
        assert!(details
            .capsule_image
            .unwrap()
            .contains("/3590/capsule_231x87.jpg"));
    }

    #[test]
    fn parses_release_date_from_store_page_html() {
        let raw = r#"
            <div class="release_date">
                <div class="subtitle column">Release Date:</div>
                <div class="date">23 Jul, 2001</div>
            </div>
        "#;

        assert_eq!(
            parse_store_page_release_date(raw).as_deref(),
            Some("23 Jul, 2001")
        );
    }

    #[test]
    fn formats_original_release_timestamp_like_store_pages() {
        assert_eq!(
            format_store_release_timestamp(992934000).as_deref(),
            Some("19 Jun, 2001")
        );
        assert_eq!(
            format_store_release_timestamp(995861400).as_deref(),
            Some("23 Jul, 2001")
        );
        assert_eq!(format_store_release_timestamp(0), None);
    }

    #[test]
    fn parses_original_release_date_from_store_browse_response() {
        let raw = r#"{
            "response": {
                "store_items": [
                    {
                        "id": 294570,
                        "appid": 294570,
                        "success": 1,
                        "release": {
                            "steam_release_date": 1402084189,
                            "original_release_date": 992934000
                        }
                    },
                    {
                        "id": 260730,
                        "appid": 260730,
                        "success": 1,
                        "release": {
                            "steam_release_date": 1384941060,
                            "original_release_date": 995861400
                        }
                    }
                ]
            }
        }"#;

        let parsed: StoreBrowseGetItemsResponse =
            serde_json::from_str(raw).expect("store browse response");
        let dates = parsed
            .response
            .store_items
            .into_iter()
            .filter_map(|item| {
                let app_id = item.appid.or(item.id)?;
                let release_date = item
                    .release
                    .and_then(|release| release.original_release_date)
                    .and_then(format_store_release_timestamp);
                Some((app_id, release_date))
            })
            .collect::<HashMap<_, _>>();

        assert_eq!(dates[&294570].as_deref(), Some("19 Jun, 2001"));
        assert_eq!(dates[&260730].as_deref(), Some("23 Jul, 2001"));
    }

    #[test]
    fn returns_none_for_store_page_without_release_date_block() {
        let raw = r#"<html><body><div class="date">20 Nov, 2013</div></body></html>"#;

        assert_eq!(parse_store_page_release_date(raw), None);
    }

    #[test]
    fn treats_store_success_false_as_unavailable() {
        let raw = r#"{"43160":{"success":false}}"#;
        let error = parse_game_details_response(43160, raw, Some("it")).expect_err("unavailable");

        assert!(error.contains("Store API returned failure"));
    }

    #[test]
    fn parses_batch_price_overviews_and_skips_empty_data() {
        let raw = r#"{
          "508290": {
            "success": true,
            "data": {
              "price_overview": {
                "currency": "EUR",
                "initial": 199,
                "final": 99
              }
            }
          },
          "730": {
            "success": true,
            "data": []
          },
          "999999": {
            "success": false
          }
        }"#;

        let prices = parse_game_price_overviews_response(&[508290, 730, 999999], raw, Some("it"))
            .expect("price batch");

        assert_eq!(prices.len(), 1);
        assert_eq!(prices[0].app_id, 508290);
        assert_eq!(prices[0].price_currency.as_deref(), Some("EUR"));
        assert_eq!(prices[0].price_initial, Some(199));
        assert_eq!(prices[0].price_final, Some(99));
        assert_eq!(prices[0].price_country_code.as_deref(), Some("IT"));
    }
}

// === Vanity URL resolver ===
