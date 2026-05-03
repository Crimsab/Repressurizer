use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const STEAM_ID64_BASE: u64 = 76561197960265728;

#[derive(Debug, Serialize)]
pub struct SteamUser {
    pub id3: String,
    pub id64: String,
    pub persona_name: String,
    pub has_collections: bool,
}

#[derive(Debug, Serialize)]
pub struct SteamInfo {
    pub steam_path: String,
    pub users: Vec<SteamUser>,
}

fn find_steam_path() -> Option<PathBuf> {
    let windows_paths = vec![
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];

    let linux_paths = vec![
        dirs::home_dir().map(|h| h.join(".steam/steam")),
        dirs::home_dir().map(|h| h.join(".local/share/Steam")),
        dirs::home_dir().map(|h| h.join(".steam/debian-installation")),
    ];

    for path in &windows_paths {
        if path.exists() {
            return Some(path.clone());
        }
    }

    for path_opt in &linux_paths {
        if let Some(path) = path_opt {
            if path.exists() {
                return Some(path.clone());
            }
        }
    }

    None
}

/// Parse loginusers.vdf to get persona names mapped by SteamID64
fn parse_login_users(steam_path: &PathBuf) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let vdf_path = steam_path.join("config").join("loginusers.vdf");

    let content = match fs::read_to_string(&vdf_path) {
        Ok(c) => c,
        Err(_) => return map,
    };

    // Simple VDF parser: look for ID64 keys and their PersonaName values
    let mut current_id64 = String::new();
    for line in content.lines() {
        let trimmed = line.trim().trim_matches('"');

        // Lines like: "76561198..."
        if trimmed.starts_with("7656") && trimmed.len() >= 17 && trimmed.chars().all(|c| c.is_ascii_digit()) {
            current_id64 = trimmed.to_string();
        }

        // Lines like: "PersonaName"		"username"
        if !current_id64.is_empty() {
            let lower = line.to_lowercase();
            if lower.contains("\"personaname\"") {
                // Extract value after the second pair of quotes
                let parts: Vec<&str> = line.trim().split('"').collect();
                if parts.len() >= 4 {
                    map.insert(current_id64.clone(), parts[3].to_string());
                }
            }
            if trimmed == "}" {
                // End of this user block (but only reset if we had a persona)
                if map.contains_key(&current_id64) {
                    current_id64.clear();
                }
            }
        }
    }

    map
}

fn get_users(steam_path: &PathBuf) -> Vec<SteamUser> {
    let userdata_path = steam_path.join("userdata");
    let mut users = Vec::new();
    let login_users = parse_login_users(steam_path);

    if let Ok(entries) = fs::read_dir(&userdata_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(id3_str) = path.file_name().and_then(|n| n.to_str()) {
                    if !id3_str.chars().all(|c| c.is_ascii_digit()) {
                        continue;
                    }

                    let id3_num: u64 = match id3_str.parse() {
                        Ok(n) => n,
                        Err(_) => continue,
                    };

                    let id64 = (id3_num + STEAM_ID64_BASE).to_string();

                    let persona_name = login_users
                        .get(&id64)
                        .cloned()
                        .unwrap_or_default();

                    let collections_path = path
                        .join("config")
                        .join("cloudstorage")
                        .join("cloud-storage-namespace-1.json");

                    users.push(SteamUser {
                        id3: id3_str.to_string(),
                        id64,
                        persona_name,
                        has_collections: collections_path.exists(),
                    });
                }
            }
        }
    }

    users
}

#[tauri::command]
pub fn detect_steam() -> Result<SteamInfo, String> {
    let steam_path = find_steam_path().ok_or("Steam installation not found")?;
    let users = get_users(&steam_path);

    Ok(SteamInfo {
        steam_path: steam_path.to_string_lossy().to_string(),
        users,
    })
}

#[tauri::command]
pub fn detect_steam_at(path: String) -> Result<SteamInfo, String> {
    let steam_path = PathBuf::from(&path);
    if !steam_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let users = get_users(&steam_path);

    Ok(SteamInfo {
        steam_path: path,
        users,
    })
}
