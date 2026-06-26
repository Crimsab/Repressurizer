use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LegacySharedConfigGame {
    pub appid: u64,
    pub hidden: bool,
    pub last_played: u64,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
enum VdfValue {
    String(String),
    Object(BTreeMap<String, VdfValue>),
}

#[tauri::command]
pub fn load_legacy_sharedconfig(
    steam_path: String,
    steam_id3: String,
) -> Result<Vec<LegacySharedConfigGame>, String> {
    let path = sharedconfig_path(&steam_path, &steam_id3);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read sharedconfig {}: {}", path.display(), error))?;
    parse_sharedconfig(&data)
}

fn sharedconfig_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("7")
        .join("remote")
        .join("sharedconfig.vdf")
}

pub fn parse_sharedconfig(data: &str) -> Result<Vec<LegacySharedConfigGame>, String> {
    let tokens = tokenize(data)?;
    let mut pos = 0;
    let root = parse_root(&tokens, &mut pos)?;
    let root_value = VdfValue::Object(root);
    let apps = get_object_path(
        &root_value,
        &[
            "UserRoamingConfigStore",
            "Software",
            "Valve",
            "Steam",
            "apps",
        ],
    )
    .or_else(|_| get_object_path(&root_value, &["Software", "Valve", "Steam", "apps"]))
    .map_err(|_| "sharedconfig.vdf does not contain Software/Valve/Steam/apps".to_string())?;

    let mut games = Vec::new();
    for (key, value) in apps {
        let Ok(appid) = key.parse::<u64>() else {
            continue;
        };
        let VdfValue::Object(game) = value else {
            continue;
        };
        let hidden = get_string(game, "hidden")
            .and_then(|value| value.parse::<i32>().ok())
            .unwrap_or(0)
            != 0;
        let last_played = get_string(game, "LastPlayed")
            .or_else(|| get_string(game, "lastplayed"))
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let tags = match game.get("tags") {
            Some(VdfValue::Object(tags)) => tags
                .values()
                .filter_map(|value| match value {
                    VdfValue::String(tag) if !tag.trim().is_empty() => Some(tag.trim().to_string()),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        };
        games.push(LegacySharedConfigGame {
            appid,
            hidden,
            last_played,
            tags,
        });
    }
    Ok(games)
}

fn get_object_path<'a>(
    value: &'a VdfValue,
    path: &[&str],
) -> Result<&'a BTreeMap<String, VdfValue>, String> {
    let mut current = value;
    for segment in path {
        let VdfValue::Object(map) = current else {
            return Err(format!("Expected object at {}", segment));
        };
        current = map
            .get(*segment)
            .ok_or_else(|| format!("Missing sharedconfig path segment {}", segment))?;
    }
    match current {
        VdfValue::Object(map) => Ok(map),
        VdfValue::String(_) => Err("Expected sharedconfig apps object".to_string()),
    }
}

fn get_string<'a>(map: &'a BTreeMap<String, VdfValue>, key: &str) -> Option<&'a str> {
    match map.get(key) {
        Some(VdfValue::String(value)) => Some(value),
        _ => None,
    }
}

fn parse_root(tokens: &[String], pos: &mut usize) -> Result<BTreeMap<String, VdfValue>, String> {
    let mut map = BTreeMap::new();
    while *pos < tokens.len() {
        if tokens[*pos] == "}" {
            *pos += 1;
            break;
        }
        let key = tokens[*pos].clone();
        *pos += 1;
        let value = parse_value(tokens, pos)?;
        map.insert(key, value);
    }
    Ok(map)
}

fn parse_value(tokens: &[String], pos: &mut usize) -> Result<VdfValue, String> {
    let token = tokens
        .get(*pos)
        .ok_or("Unexpected end of sharedconfig.vdf".to_string())?;
    if token == "{" {
        *pos += 1;
        return Ok(VdfValue::Object(parse_root(tokens, pos)?));
    }
    *pos += 1;
    Ok(VdfValue::String(token.clone()))
}

fn tokenize(data: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut chars = data.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch.is_whitespace() {
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'/') {
            for comment_ch in chars.by_ref() {
                if comment_ch == '\n' {
                    break;
                }
            }
            continue;
        }
        if ch == '{' || ch == '}' {
            tokens.push(ch.to_string());
            continue;
        }
        if ch == '"' {
            let mut value = String::new();
            let mut escaped = false;
            for string_ch in chars.by_ref() {
                if escaped {
                    value.push(string_ch);
                    escaped = false;
                } else if string_ch == '\\' {
                    escaped = true;
                } else if string_ch == '"' {
                    break;
                } else {
                    value.push(string_ch);
                }
            }
            tokens.push(value);
            continue;
        }
        let mut value = String::from(ch);
        while let Some(next) = chars.peek().copied() {
            if next.is_whitespace() || next == '{' || next == '}' {
                break;
            }
            value.push(next);
            chars.next();
        }
        tokens.push(value);
    }
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    #[test]
    fn parses_sharedconfig_apps_tags_and_hidden() {
        let data = r#"
        "UserRoamingConfigStore"
        {
          "Software"
          {
            "Valve"
            {
              "Steam"
              {
                "apps"
                {
                  "10"
                  {
                    "hidden" "1"
                    "LastPlayed" "1700000000"
                    "tags"
                    {
                      "0" "Action"
                      "1" "Backlog"
                    }
                  }
                }
              }
            }
          }
        }
        "#;

        let games = parse_sharedconfig(data).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].appid, 10);
        assert!(games[0].hidden);
        assert_eq!(games[0].last_played, 1_700_000_000);
        assert_eq!(games[0].tags, vec!["Action", "Backlog"]);
    }

    #[test]
    fn loads_sharedconfig_from_steam_directory_fixture() {
        let steam_id3 = "12345";
        let steam_path = temp_steam_dir("sharedconfig");
        let sharedconfig_dir = steam_path
            .join("userdata")
            .join(steam_id3)
            .join("7")
            .join("remote");
        fs::create_dir_all(&sharedconfig_dir).unwrap();
        fs::write(
            sharedconfig_dir.join("sharedconfig.vdf"),
            r#"
            "UserRoamingConfigStore"
            {
              "Software"
              {
                "Valve"
                {
                  "Steam"
                  {
                    "apps"
                    {
                      "620"
                      {
                        "hidden" "0"
                        "LastPlayed" "1701000000"
                        "tags"
                        {
                          "0" "Puzzle"
                          "1" "Co-op"
                        }
                      }
                      "400"
                      {
                        "hidden" "1"
                        "lastplayed" "1700000000"
                      }
                    }
                  }
                }
              }
            }
            "#,
        )
        .unwrap();

        let games = load_legacy_sharedconfig(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
        )
        .unwrap();

        assert_eq!(games.len(), 2);
        assert_eq!(games[0].appid, 400);
        assert!(games[0].hidden);
        assert_eq!(games[0].last_played, 1_700_000_000);
        assert_eq!(games[1].appid, 620);
        assert!(!games[1].hidden);
        assert_eq!(games[1].last_played, 1_701_000_000);
        assert_eq!(games[1].tags, vec!["Puzzle", "Co-op"]);

        fs::remove_dir_all(steam_path).unwrap();
    }

    fn temp_steam_dir(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "repressurizer-{name}-{}-{unique}",
            std::process::id()
        ))
    }
}
