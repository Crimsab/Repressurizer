use chrono::Utc;
use roxmltree::{Document, Node};
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use super::collections::SteamCollection;

const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerProfileImport {
    pub source_path: Option<String>,
    pub steam_id64: Option<String>,
    pub steam_id3: Option<String>,
    pub steam_web_api_key: Option<String>,
    pub settings: DepressurizerProfileSettings,
    pub games: Vec<DepressurizerImportedGame>,
    pub collections: Vec<SteamCollection>,
    pub filters: Vec<DepressurizerImportedFilter>,
    pub auto_cats: Vec<DepressurizerImportedAutoCat>,
    pub ignored_app_ids: Vec<i64>,
    pub stats: DepressurizerImportStats,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerProfileSettings {
    pub auto_update: bool,
    pub auto_import: bool,
    pub local_update: bool,
    pub web_update: bool,
    pub export_discard: bool,
    pub auto_ignore: bool,
    pub include_unknown: bool,
    pub bypass_ignore_on_import: bool,
    pub overwrite_names: bool,
    pub include_shortcuts: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerImportedGame {
    pub appid: i64,
    pub name: Option<String>,
    pub hidden: bool,
    pub hours_played: f64,
    pub last_played: Option<i64>,
    pub executable: Option<String>,
    pub source: Option<String>,
    pub categories: Vec<String>,
    pub non_steam: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerImportedFilter {
    pub name: String,
    pub allow: Vec<String>,
    pub require: Vec<String>,
    pub exclude: Vec<String>,
    pub game: i32,
    pub mod_state: i32,
    pub software: i32,
    pub uncategorized: i32,
    pub hidden: i32,
    pub vr: i32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerImportedAutoCat {
    pub name: String,
    pub type_id: String,
    pub normalized_type: String,
    pub prefix: Option<String>,
    pub filter: Option<String>,
    pub supported: bool,
    pub raw_config: Value,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepressurizerImportStats {
    pub total_games: usize,
    pub steam_games: usize,
    pub non_steam_games: usize,
    pub hidden_games: usize,
    pub favorite_games: usize,
    pub categories: usize,
    pub filters: usize,
    pub auto_cats: usize,
    pub supported_auto_cats: usize,
}

#[tauri::command]
pub fn import_depressurizer_profile(path: String) -> Result<DepressurizerProfileImport, String> {
    let data = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read Depressurizer profile {}: {}", path, error))?;
    parse_depressurizer_profile_xml(&data, Some(Path::new(&path)))
}

pub fn parse_depressurizer_profile_xml(
    xml: &str,
    source_path: Option<&Path>,
) -> Result<DepressurizerProfileImport, String> {
    let document = Document::parse(xml)
        .map_err(|error| format!("Failed to parse Depressurizer profile XML: {}", error))?;
    let profile = document
        .descendants()
        .find(|node| node.is_element() && node.has_tag_name("profile"))
        .ok_or("Depressurizer profile XML must contain a <profile> root".to_string())?;

    let steam_id64 = child_text(profile, "steam_id_64").or_else(|| {
        child_text(profile, "account_id").and_then(|id| steam_id64_from_account_id(&id))
    });
    let steam_id3 = steam_id64
        .as_deref()
        .and_then(|id| id.parse::<u64>().ok())
        .and_then(|id| id.checked_sub(STEAM_ID64_BASE))
        .map(|id| id.to_string());

    let settings = DepressurizerProfileSettings {
        auto_update: child_bool(profile, "auto_update", true),
        auto_import: child_bool(profile, "auto_import", true),
        local_update: child_bool(profile, "local_update", true),
        web_update: child_bool(profile, "web_update", true),
        export_discard: child_bool(profile, "export_discard", true),
        auto_ignore: child_bool(profile, "auto_ignore", true),
        include_unknown: child_bool(profile, "include_unknown", false),
        bypass_ignore_on_import: child_bool(profile, "bypass_ignore_on_import", false),
        overwrite_names: child_bool(profile, "overwrite_names", false),
        include_shortcuts: child_bool(profile, "include_shortcuts", true),
    };

    let ignored_app_ids = direct_child(profile, "exclusions")
        .map(|node| {
            direct_children(node, "exclusion")
                .filter_map(|node| node.text().and_then(|text| text.trim().parse::<i64>().ok()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let games = parse_games(profile);
    let collections = build_collections(&games);
    let filters = parse_filters(profile);
    let auto_cats = parse_auto_cats(profile);

    let stats = DepressurizerImportStats {
        total_games: games.len(),
        steam_games: games.iter().filter(|game| !game.non_steam).count(),
        non_steam_games: games.iter().filter(|game| game.non_steam).count(),
        hidden_games: games.iter().filter(|game| game.hidden).count(),
        favorite_games: games
            .iter()
            .filter(|game| {
                game.categories
                    .iter()
                    .any(|category| is_favorite_category(category))
            })
            .count(),
        categories: collections
            .iter()
            .filter(|collection| !is_special_collection_key(&collection.key))
            .count(),
        filters: filters.len(),
        auto_cats: auto_cats.len(),
        supported_auto_cats: auto_cats
            .iter()
            .filter(|auto_cat| auto_cat.supported)
            .count(),
    };

    Ok(DepressurizerProfileImport {
        source_path: source_path.map(|path| path.to_string_lossy().to_string()),
        steam_id64,
        steam_id3,
        steam_web_api_key: child_text(profile, "web_key").filter(|key| !key.trim().is_empty()),
        settings,
        games,
        collections,
        filters,
        auto_cats,
        ignored_app_ids,
        stats,
    })
}

fn parse_games(profile: Node<'_, '_>) -> Vec<DepressurizerImportedGame> {
    direct_child(profile, "games")
        .map(|games_node| {
            direct_children(games_node, "game")
                .filter_map(|game_node| {
                    let appid = child_text(game_node, "id")?.parse::<i64>().ok()?;
                    let categories = direct_child(game_node, "categories")
                        .map(|node| {
                            direct_children(node, "category")
                                .filter_map(|category| clean_text(category.text()))
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();

                    Some(DepressurizerImportedGame {
                        appid,
                        name: child_text(game_node, "name"),
                        hidden: child_bool(game_node, "hidden", false),
                        hours_played: child_text(game_node, "hoursplayed")
                            .and_then(|value| value.parse::<f64>().ok())
                            .unwrap_or(0.0),
                        last_played: child_text(game_node, "lastplayed")
                            .and_then(|value| value.parse::<i64>().ok()),
                        executable: child_text(game_node, "executable"),
                        source: child_text(game_node, "source"),
                        categories,
                        non_steam: appid <= 0,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn build_collections(games: &[DepressurizerImportedGame]) -> Vec<SteamCollection> {
    let timestamp = Utc::now().timestamp().max(0) as u64;
    let mut category_games: BTreeMap<String, BTreeSet<u64>> = BTreeMap::new();
    let mut hidden = BTreeSet::new();
    let mut favorite = BTreeSet::new();

    for game in games.iter().filter(|game| !game.non_steam) {
        let appid = game.appid as u64;
        if game.hidden {
            hidden.insert(appid);
        }
        for category in &game.categories {
            if is_favorite_category(category) {
                favorite.insert(appid);
            } else if let Some(category) = clean_category_name(category) {
                category_games.entry(category).or_default().insert(appid);
            }
        }
    }

    let mut collections = vec![
        SteamCollection {
            id: "hidden".to_string(),
            key: "user-collections.hidden".to_string(),
            name: "Hidden".to_string(),
            added: hidden.into_iter().collect(),
            removed: Vec::new(),
            timestamp,
            is_deleted: false,
            is_dynamic: false,
        },
        SteamCollection {
            id: "favorite".to_string(),
            key: "user-collections.favorite".to_string(),
            name: "Favorites".to_string(),
            added: favorite.into_iter().collect(),
            removed: Vec::new(),
            timestamp,
            is_deleted: false,
            is_dynamic: false,
        },
    ];

    collections.extend(category_games.into_iter().map(|(name, ids)| {
        let id = collection_id_for_name(&name);
        SteamCollection {
            key: format!("user-collections.{}", id),
            id,
            name,
            added: ids.into_iter().collect(),
            removed: Vec::new(),
            timestamp,
            is_deleted: false,
            is_dynamic: false,
        }
    }));
    collections
}

fn parse_filters(profile: Node<'_, '_>) -> Vec<DepressurizerImportedFilter> {
    direct_child(profile, "Filters")
        .map(|filters_node| {
            direct_children(filters_node, "Filter")
                .filter_map(|filter_node| {
                    let name = child_text(filter_node, "Name")?;
                    Some(DepressurizerImportedFilter {
                        name,
                        allow: repeated_child_text(filter_node, "Allow"),
                        require: repeated_child_text(filter_node, "Require"),
                        exclude: repeated_child_text(filter_node, "Exclude"),
                        game: child_i32(filter_node, "Game", -1),
                        mod_state: child_i32(filter_node, "Mod", -1),
                        software: child_i32(filter_node, "Software", -1),
                        uncategorized: child_i32(filter_node, "Uncategorized", -1),
                        hidden: child_i32(filter_node, "Hidden", -1),
                        vr: child_i32(filter_node, "VR", -1),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_auto_cats(profile: Node<'_, '_>) -> Vec<DepressurizerImportedAutoCat> {
    direct_child(profile, "autocats")
        .map(|auto_cats_node| {
            auto_cats_node
                .children()
                .filter(|node| node.is_element())
                .map(|auto_cat_node| {
                    let type_id = auto_cat_node.tag_name().name().to_string();
                    let normalized_type = normalize_auto_cat_type(&type_id).to_string();
                    let name = child_text(auto_cat_node, "Name")
                        .or_else(|| child_text(auto_cat_node, "name"))
                        .unwrap_or_else(|| type_id.clone());
                    let prefix = child_text(auto_cat_node, "Prefix")
                        .or_else(|| child_text(auto_cat_node, "prefix"));
                    let filter = child_text(auto_cat_node, "Filter")
                        .or_else(|| child_text(auto_cat_node, "filter"));
                    let supported = matches!(
                        normalized_type.as_str(),
                        "genre"
                            | "tags"
                            | "year"
                            | "score"
                            | "hltb"
                            | "hours"
                            | "devpub"
                            | "flags"
                            | "platform"
                            | "name"
                    );

                    DepressurizerImportedAutoCat {
                        name,
                        type_id,
                        normalized_type,
                        prefix,
                        filter,
                        supported,
                        raw_config: node_to_json(auto_cat_node),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn direct_child<'a, 'input>(node: Node<'a, 'input>, tag: &str) -> Option<Node<'a, 'input>> {
    node.children()
        .find(|child| child.is_element() && child.has_tag_name(tag))
}

fn direct_children<'a, 'input>(
    node: Node<'a, 'input>,
    tag: &'a str,
) -> impl Iterator<Item = Node<'a, 'input>> + 'a {
    node.children()
        .filter(move |child| child.is_element() && child.has_tag_name(tag))
}

fn child_text(node: Node<'_, '_>, tag: &str) -> Option<String> {
    direct_child(node, tag).and_then(|child| clean_text(child.text()))
}

fn repeated_child_text(node: Node<'_, '_>, tag: &str) -> Vec<String> {
    direct_children(node, tag)
        .filter_map(|child| clean_text(child.text()))
        .collect()
}

fn child_bool(node: Node<'_, '_>, tag: &str, default: bool) -> bool {
    child_text(node, tag)
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(default)
}

fn child_i32(node: Node<'_, '_>, tag: &str, default: i32) -> i32 {
    child_text(node, tag)
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(default)
}

fn clean_text(text: Option<&str>) -> Option<String> {
    text.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn clean_category_name(category: &str) -> Option<String> {
    let trimmed = category.trim();
    if trimmed.is_empty() || is_favorite_category(trimmed) {
        return None;
    }
    Some(trimmed.to_string())
}

fn is_favorite_category(category: &str) -> bool {
    matches!(
        category.trim().to_ascii_lowercase().as_str(),
        "favorite" | "<favorite>" | "favorites"
    )
}

fn is_special_collection_key(key: &str) -> bool {
    matches!(key, "user-collections.hidden" | "user-collections.favorite")
}

fn collection_id_for_name(name: &str) -> String {
    let slug = slugify(name);
    format!("uc-dep-{}-{}", fnv1a32(name), slug)
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in name.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= 48 {
            break;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "category".to_string()
    } else {
        slug
    }
}

fn fnv1a32(value: &str) -> String {
    let mut hash = 0x811c9dc5_u32;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

fn steam_id64_from_account_id(account_id: &str) -> Option<String> {
    account_id
        .trim()
        .parse::<u64>()
        .ok()
        .map(|id| id + STEAM_ID64_BASE)
        .map(|id| id.to_string())
}

fn normalize_auto_cat_type(type_id: &str) -> &str {
    match type_id {
        "AutoCatGenre" => "genre",
        "AutoCatFlags" => "flags",
        "AutoCatTags" => "tags",
        "AutoCatYear" => "year",
        "AutoCatUserScore" => "score",
        "AutoCatHltb" => "hltb",
        "AutoCatManual" => "manual",
        "AutoCatDevPub" => "devpub",
        "AutoCatGroup" => "group",
        "AutoCatName" => "name",
        "AutoCatVrSupport" => "vr",
        "AutoCatLanguage" => "language",
        "AutoCatCurator" => "curator",
        "AutoCatPlatform" => "platform",
        "AutoCatHoursPlayed" => "hours",
        _ => "unknown",
    }
}

fn node_to_json(node: Node<'_, '_>) -> Value {
    let mut object = Map::new();
    if node.is_element() {
        object.insert(
            "_tag".to_string(),
            Value::String(node.tag_name().name().to_string()),
        );
    }
    if node.attributes().len() > 0 {
        let attrs = node
            .attributes()
            .map(|attr| {
                (
                    attr.name().to_string(),
                    Value::String(attr.value().to_string()),
                )
            })
            .collect::<Map<_, _>>();
        object.insert("_attributes".to_string(), Value::Object(attrs));
    }

    let mut grouped_children: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for child in node.children().filter(|child| child.is_element()) {
        grouped_children
            .entry(child.tag_name().name().to_string())
            .or_default()
            .push(node_to_json(child));
    }

    for (key, mut values) in grouped_children {
        let value = if values.len() == 1 {
            values.remove(0)
        } else {
            Value::Array(values)
        };
        object.insert(key, value);
    }

    if let Some(text) = clean_text(node.text()) {
        if object.len() <= 1 {
            object.insert("_text".to_string(), Value::String(text));
        }
    }

    Value::Object(object)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_games_categories_filters_and_autocats() {
        let xml = r#"
            <profile>
              <steam_id_64>76561198000000000</steam_id_64>
              <web_key>TESTKEY</web_key>
              <include_shortcuts>true</include_shortcuts>
              <games>
                <game>
                  <id>10</id>
                  <source>Steam</source>
                  <name>Counter-Strike</name>
                  <hidden>true</hidden>
                  <lastplayed>1700000000</lastplayed>
                  <hoursplayed>12.5</hoursplayed>
                  <categories>
                    <category>Action</category>
                    <category>favorite</category>
                  </categories>
                </game>
                <game>
                  <id>-42</id>
                  <name>Non Steam Tool</name>
                  <categories>
                    <category>Tools</category>
                  </categories>
                </game>
              </games>
              <Filters>
                <Filter>
                  <Name>Needs cleanup</Name>
                  <Allow>Action</Allow>
                  <Require>Backlog</Require>
                  <Exclude>Done</Exclude>
                  <Hidden>2</Hidden>
                </Filter>
              </Filters>
              <autocats>
                <AutoCatGenre>
                  <Name>By Genre</Name>
                  <Prefix>(Genre) </Prefix>
                  <Filter>Needs cleanup</Filter>
                </AutoCatGenre>
                <AutoCatDevPub>
                  <Name>By Studio</Name>
                </AutoCatDevPub>
              </autocats>
              <exclusions>
                <exclusion>20</exclusion>
              </exclusions>
            </profile>
        "#;

        let imported = parse_depressurizer_profile_xml(xml, None).unwrap();

        assert_eq!(imported.steam_id64.as_deref(), Some("76561198000000000"));
        assert_eq!(imported.steam_web_api_key.as_deref(), Some("TESTKEY"));
        assert_eq!(imported.games.len(), 2);
        assert!(imported
            .games
            .iter()
            .any(|game| game.non_steam && game.appid == -42));
        assert_eq!(imported.ignored_app_ids, vec![20]);

        let action = imported
            .collections
            .iter()
            .find(|collection| collection.name == "Action")
            .expect("Action category");
        assert_eq!(action.added, vec![10]);

        let hidden = imported
            .collections
            .iter()
            .find(|collection| collection.key == "user-collections.hidden")
            .expect("Hidden collection");
        assert_eq!(hidden.added, vec![10]);

        let favorite = imported
            .collections
            .iter()
            .find(|collection| collection.key == "user-collections.favorite")
            .expect("Favorites collection");
        assert_eq!(favorite.added, vec![10]);

        assert_eq!(imported.filters[0].name, "Needs cleanup");
        assert_eq!(imported.filters[0].hidden, 2);
        assert_eq!(imported.auto_cats.len(), 2);
        assert_eq!(imported.auto_cats[0].normalized_type, "genre");
        assert!(imported.auto_cats[0].supported);
        assert_eq!(imported.auto_cats[1].normalized_type, "devpub");
        assert!(imported.auto_cats[1].supported);
        assert_eq!(imported.stats.non_steam_games, 1);
        assert_eq!(imported.stats.supported_auto_cats, 2);
    }

    #[test]
    fn supports_legacy_account_id() {
        let xml = r#"<profile><account_id>1</account_id><games /></profile>"#;
        let imported = parse_depressurizer_profile_xml(xml, None).unwrap();
        assert_eq!(imported.steam_id64.as_deref(), Some("76561197960265729"));
        assert_eq!(imported.steam_id3.as_deref(), Some("1"));
    }
}
