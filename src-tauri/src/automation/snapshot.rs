use super::*;

pub(super) async fn build_snapshot(settings: &AutomationSettings) -> Result<Value, String> {
    if settings.api_key.trim().is_empty() || settings.steam_id64.trim().is_empty() {
        return Err("Steam Web API key and Steam ID are required.".to_string());
    }

    let (owned_games, collections) = tokio::try_join!(
        api::fetch_library(settings.api_key.clone(), settings.steam_id64.clone()),
        async {
            collections::load_collections(settings.steam_path.clone(), settings.steam_id3.clone())
        }
    )?;

    let details: HashMap<String, api::GameDetails> = load_cache("details_cache.json");
    let hltb_data: HashMap<String, HltbData> = load_cache("hltb_cache.json");
    let achievements: HashMap<String, CachedAchievementSummary> = load_cache("achievements.json");
    let wishlist: WishlistCache = load_json_file("wishlist.json").unwrap_or_default();
    let family: FamilyCache = load_json_file("steam_family.json").unwrap_or_default();
    let games = merge_collection_only_games(owned_games, &collections, &details);

    Ok(build_library_snapshot(
        SnapshotData {
            games,
            collections,
            details,
            hltb_data,
            achievements,
            wishlist,
            family,
        },
        settings,
    ))
}

fn merge_collection_only_games(
    owned_games: Vec<api::OwnedGame>,
    collections: &[collections::SteamCollection],
    details: &HashMap<String, api::GameDetails>,
) -> Vec<SnapshotGameInput> {
    let mut games: BTreeMap<u64, SnapshotGameInput> = owned_games
        .into_iter()
        .map(|game| {
            (
                game.appid,
                SnapshotGameInput {
                    appid: game.appid,
                    name: game.name,
                    playtime_forever: game.playtime_forever,
                    rtime_last_played: game.rtime_last_played,
                    is_collection_only: false,
                },
            )
        })
        .collect();

    for appid in collections
        .iter()
        .filter(|collection| !collection.is_deleted)
        .flat_map(|collection| collection.added.iter().copied())
    {
        games.entry(appid).or_insert_with(|| {
            let name = details
                .get(&appid.to_string())
                .map(|details| details.name.clone())
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| format!("#{}", appid));
            SnapshotGameInput {
                appid,
                name,
                playtime_forever: 0,
                rtime_last_played: 0,
                is_collection_only: true,
            }
        });
    }

    games.into_values().collect()
}

fn build_library_snapshot(data: SnapshotData, settings: &AutomationSettings) -> Value {
    let SnapshotData {
        mut games,
        collections,
        details,
        hltb_data,
        achievements,
        wishlist,
        family,
    } = data;
    let payload_settings = &settings.automation_publish_payload;
    let selected_category_keys: HashSet<String> = payload_settings
        .category_keys
        .iter()
        .map(|key| key.trim())
        .filter(|key| !key.is_empty())
        .map(ToString::to_string)
        .collect();
    let category_filter_active = payload_settings.category_mode == "custom";
    let selected_collections: Vec<&collections::SteamCollection> = collections
        .iter()
        .filter(|collection| {
            !collection.is_deleted
                && (!category_filter_active || selected_category_keys.contains(&collection.key))
        })
        .collect();

    let selected_collection_app_ids: HashSet<u64> = selected_collections
        .iter()
        .flat_map(|collection| collection.added.iter().copied())
        .collect();

    games.retain(|game| {
        if category_filter_active && !selected_collection_app_ids.contains(&game.appid) {
            return false;
        }
        if !payload_settings.include_collection_only_games && game.is_collection_only {
            return false;
        }
        let steam_hours = round_hours(game.playtime_forever);
        if payload_settings
            .min_steam_hours
            .is_some_and(|min| steam_hours < min)
        {
            return false;
        }
        if payload_settings
            .max_steam_hours
            .is_some_and(|max| steam_hours > max)
        {
            return false;
        }
        let appid = game.appid.to_string();
        if payload_settings.require_details && !details.contains_key(&appid) {
            return false;
        }
        if payload_settings.require_hltb && hltb_data.get(&appid).and_then(hltb_export).is_none() {
            return false;
        }
        true
    });

    let included_game_ids: HashSet<u64> = games.iter().map(|game| game.appid).collect();
    let mut exported_collections: Vec<Value> = selected_collections
        .iter()
        .filter_map(|collection| {
            let mut app_ids = collection
                .added
                .iter()
                .copied()
                .filter(|appid| included_game_ids.contains(appid))
                .collect::<Vec<_>>();
            app_ids.sort_unstable();
            if payload_settings.skip_empty_collections && app_ids.is_empty() {
                return None;
            }
            Some(json!({
                "key": collection.key,
                "name": collection.name,
                "isDynamic": collection.is_dynamic,
                "color": category_color(collection, &settings.category_colors),
                "gameCount": app_ids.len(),
                "appIds": app_ids,
            }))
        })
        .collect();
    exported_collections.sort_by(|a, b| {
        let an = value_str(a, "name");
        let bn = value_str(b, "name");
        an.cmp(&bn)
            .then_with(|| value_str(a, "key").cmp(&value_str(b, "key")))
    });

    let mut collection_refs: HashMap<u64, Vec<Value>> = HashMap::new();
    for collection in &exported_collections {
        let key = value_str(collection, "key");
        let name = value_str(collection, "name");
        let is_dynamic = collection
            .get("isDynamic")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        for appid in collection
            .get("appIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_u64)
        {
            collection_refs.entry(appid).or_default().push(json!({
                "key": key,
                "name": name,
                "isDynamic": is_dynamic,
                "color": collection.get("color").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    let wishlist_fetched_at = wishlist.last_fetched.and_then(iso_from_millis);
    let wishlist_by_appid = wishlist
        .items
        .into_iter()
        .map(|item| (item.appid, item))
        .collect::<HashMap<_, _>>();
    let family_fetched_at = family.last_fetched.and_then(iso_from_millis);
    let family_auth_used = family.auth_used.clone();
    let family_owner_tail = family.owner_steam_id.as_deref().and_then(steam_tail);
    let family_by_appid = family
        .apps
        .into_iter()
        .map(|app| (app.appid, app))
        .collect::<HashMap<_, _>>();

    games.sort_by_key(|game| game.appid);
    let exported_games: Vec<Value> = games
        .into_iter()
        .map(|game| {
            let mut refs = collection_refs.remove(&game.appid).unwrap_or_default();
            refs.sort_by(|a, b| {
                let an = value_str(a, "name");
                let bn = value_str(b, "name");
                an.cmp(&bn)
                    .then_with(|| value_str(a, "key").cmp(&value_str(b, "key")))
            });
            let details = details.get(&game.appid.to_string());
            let hltb = hltb_data.get(&game.appid.to_string());
            let details_exported = if payload_settings.include_details {
                details.map(details_export)
            } else {
                None
            };
            let hltb_exported = if payload_settings.include_hltb {
                hltb.and_then(hltb_export)
            } else {
                None
            };
            let achievement_exported = if payload_settings.include_achievements {
                achievements
                    .get(&game.appid.to_string())
                    .map(achievement_export)
            } else {
                None
            };
            let wishlist_exported = if payload_settings.include_wishlist {
                wishlist_by_appid
                    .get(&game.appid)
                    .map(|item| wishlist_export(item, wishlist_fetched_at.as_deref()))
            } else {
                None
            };
            let ownership_exported = if payload_settings.include_ownership {
                family_by_appid.get(&game.appid).map(|app| {
                    ownership_export(
                        app,
                        family_auth_used.as_deref(),
                        family_owner_tail.as_deref(),
                        family_fetched_at.as_deref(),
                    )
                })
            } else {
                None
            };
            let flags = flags_export(
                game.is_collection_only,
                details_exported.is_some(),
                hltb_exported.is_some(),
                achievement_exported.as_ref(),
                wishlist_exported.as_ref(),
                ownership_exported.as_ref(),
            );
            json!({
                "appId": game.appid,
                "name": game.name,
                "playtimeForeverMinutes": game.playtime_forever,
                "playtimeForeverHours": round_hours(game.playtime_forever),
                "rtimeLastPlayed": game.rtime_last_played,
                "lastPlayedAt": iso_from_steam_timestamp(game.rtime_last_played),
                "isCollectionOnly": game.is_collection_only,
                "collections": refs,
                "details": details_exported.unwrap_or(Value::Null),
                "hltb": hltb_exported.unwrap_or(Value::Null),
                "achievements": achievement_exported.unwrap_or(Value::Null),
                "wishlist": wishlist_exported.unwrap_or(Value::Null),
                "ownership": ownership_exported.unwrap_or(Value::Null),
                "flags": flags,
            })
        })
        .collect();

    let hltb_count = exported_games
        .iter()
        .filter(|game| !game.get("hltb").unwrap_or(&Value::Null).is_null())
        .count();
    let achievement_count = exported_games
        .iter()
        .filter(|game| !game.get("achievements").unwrap_or(&Value::Null).is_null())
        .count();
    let wishlist_count = exported_games
        .iter()
        .filter(|game| !game.get("wishlist").unwrap_or(&Value::Null).is_null())
        .count();
    let family_shared_count = exported_games
        .iter()
        .filter(|game| {
            game.get("ownership")
                .and_then(|ownership| ownership.get("familyShared"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .count();
    let payload = json!({
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "source": {
            "app": "Repressurizer",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "steam": {
            "steamId64Tail": steam_tail(&settings.steam_id64),
            "personaName": string_or_null(&settings.steam_persona_name),
        },
        "summary": {
            "gameCount": exported_games.len(),
            "collectionCount": exported_collections.len(),
            "hltbCount": hltb_count,
            "achievementCount": achievement_count,
            "wishlistCount": wishlist_count,
            "familySharedCount": family_shared_count,
        },
        "collections": exported_collections,
        "games": exported_games,
    });
    let checksum = format!("fnv1a32:{:08x}", fnv1a32(&stable_stringify(&payload)));

    json!({
        "generatedAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "schemaVersion": payload["schemaVersion"],
        "source": payload["source"],
        "steam": payload["steam"],
        "summary": payload["summary"],
        "collections": payload["collections"],
        "games": payload["games"],
        "checksum": checksum,
    })
}

fn details_export(details: &api::GameDetails) -> Value {
    let mut genres = details.genres.clone();
    let mut categories = details.categories.clone();
    let mut developers = details.developers.clone();
    let mut publishers = details.publishers.clone();
    genres.sort();
    categories.sort();
    developers.sort();
    publishers.sort();
    json!({
        "releaseDate": details.release_date,
        "genres": genres,
        "categories": categories,
        "metacriticScore": details.metacritic_score,
        "developers": developers,
        "publishers": publishers,
        "platforms": {
            "windows": details.platforms.windows,
            "mac": details.platforms.mac,
            "linux": details.platforms.linux,
        },
        "isFree": details.is_free,
        "priceFinal": details.price_final,
        "priceCurrency": details.price_currency,
    })
}

fn hltb_export(hltb: &HltbData) -> Option<Value> {
    if hltb.main_story.is_none() && hltb.main_extra.is_none() && hltb.completionist.is_none() {
        return None;
    }
    Some(json!({
        "source": "howlongtobeat",
        "mainStory": hltb.main_story,
        "mainExtra": hltb.main_extra,
        "completionist": hltb.completionist,
        "hltbGameId": hltb.game_id,
        "matchedName": hltb.game_name,
        "confidence": hltb.confidence,
    }))
}

fn achievement_export(summary: &CachedAchievementSummary) -> Value {
    let percent = if summary.total == 0 {
        Value::Null
    } else {
        json!(round_percent(summary.achieved, summary.total))
    };
    json!({
        "source": "steam_web_api",
        "total": summary.total,
        "achieved": summary.achieved.min(summary.total),
        "percent": percent,
        "complete": summary.total > 0 && summary.achieved >= summary.total,
        "hasDetails": !summary.achievements.is_empty(),
    })
}

fn wishlist_export(item: &api::WishlistItem, fetched_at: Option<&str>) -> Value {
    json!({
        "source": "steam_wishlist",
        "priority": item.priority,
        "dateAdded": item.date_added,
        "dateAddedAt": iso_from_steam_timestamp(item.date_added),
        "fetchedAt": fetched_at,
    })
}

fn ownership_export(
    app: &api::FamilyLibraryApp,
    auth_used: Option<&str>,
    owner_tail: Option<&str>,
    fetched_at: Option<&str>,
) -> Value {
    let mut owner_tails = app
        .owner_steamids
        .iter()
        .filter_map(|owner| steam_tail(owner))
        .collect::<Vec<_>>();
    owner_tails.sort();
    owner_tails.dedup();
    json!({
        "source": "steam_family",
        "authUsed": auth_used,
        "ownerSteamIdTail": owner_tail,
        "ownerSteamIdTails": owner_tails,
        "ownerCount": app.owner_steamids.len(),
        "ownedByCurrentUser": app.is_owned_by_current_user,
        "familyShared": app.is_family_shared && app.exclude_reason == 0,
        "excluded": app.exclude_reason != 0,
        "excludeReason": app.exclude_reason,
        "nonGame": app.is_non_game,
        "appType": app.app_type,
        "fetchedAt": fetched_at,
    })
}

fn flags_export(
    is_collection_only: bool,
    has_details: bool,
    has_hltb: bool,
    achievements: Option<&Value>,
    wishlist: Option<&Value>,
    ownership: Option<&Value>,
) -> Value {
    let family_shared = ownership
        .and_then(|value| value.get("familyShared"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let owned_by_current_user = ownership
        .and_then(|value| value.get("ownedByCurrentUser"))
        .and_then(Value::as_bool)
        .unwrap_or(!family_shared);
    let non_game = ownership
        .and_then(|value| value.get("nonGame"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    json!({
        "collectionOnly": is_collection_only,
        "hasDetails": has_details,
        "missingDetails": !has_details,
        "hasHltb": has_hltb,
        "hasAchievements": achievements.is_some(),
        "wishlist": wishlist.is_some(),
        "familyShared": family_shared,
        "ownedByCurrentUser": owned_by_current_user,
        "nonGame": non_game,
    })
}
