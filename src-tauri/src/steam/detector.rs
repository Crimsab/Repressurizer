use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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
    steam_path_candidates()
        .into_iter()
        .find(|path| is_steam_root(path))
}

fn steam_path_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return vec![
            PathBuf::from(r"C:\Program Files (x86)\Steam"),
            PathBuf::from(r"C:\Program Files\Steam"),
        ];
    }

    #[cfg(target_os = "linux")]
    {
        let Some(home) = dirs::home_dir() else {
            return Vec::new();
        };
        let xdg_data_home = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from);
        return linux_steam_path_candidates(&home, xdg_data_home.as_deref());
    }

    #[allow(unreachable_code)]
    Vec::new()
}

fn linux_steam_path_candidates(home: &Path, xdg_data_home: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(data_home) = xdg_data_home {
        candidates.push(data_home.join("Steam"));
    }
    candidates.extend([
        home.join(".steam/root"),
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".steam/debian-installation"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
        home.join("snap/steam/common/.local/share/Steam"),
    ]);
    candidates.dedup();
    candidates
}

fn is_steam_root(path: &Path) -> bool {
    path.is_dir()
        && (path.join("userdata").is_dir()
            || path.join("config/loginusers.vdf").is_file()
            || path.join("steam.sh").is_file()
            || path.join("steam.exe").is_file())
}

/// Parse loginusers.vdf to get persona names mapped by SteamID64
fn parse_login_users(steam_path: &Path) -> HashMap<String, String> {
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
        if trimmed.starts_with("7656")
            && trimmed.len() >= 17
            && trimmed.chars().all(|c| c.is_ascii_digit())
        {
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

fn get_users(steam_path: &Path) -> Vec<SteamUser> {
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

                    let persona_name = login_users.get(&id64).cloned().unwrap_or_default();

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
    if !is_steam_root(&steam_path) {
        return Err(format!(
            "Path is not a Steam installation directory: {}",
            path
        ));
    }

    let users = get_users(&steam_path);

    Ok(SteamInfo {
        steam_path: path,
        users,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn linux_candidates_cover_native_flatpak_snap_and_xdg_installs() {
        let home = Path::new("/home/tester");
        let xdg = Path::new("/data/tester");
        let candidates = linux_steam_path_candidates(home, Some(xdg));

        assert_eq!(candidates.first(), Some(&xdg.join("Steam")));
        assert!(candidates.contains(&home.join(".steam/root")));
        assert!(candidates.contains(&home.join(".local/share/Steam")));
        assert!(
            candidates.contains(&home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"))
        );
        assert!(candidates.contains(&home.join("snap/steam/common/.local/share/Steam")));
    }

    #[test]
    fn detects_users_and_collections_from_linux_shaped_fixture() {
        let steam_path = temp_steam_dir("linux-detect");
        let id3 = "12345";
        let id64 = (STEAM_ID64_BASE + 12_345).to_string();
        let config_dir = steam_path.join("config");
        let collections_dir = steam_path
            .join("userdata")
            .join(id3)
            .join("config/cloudstorage");
        fs::create_dir_all(&config_dir).unwrap();
        fs::create_dir_all(&collections_dir).unwrap();
        fs::write(
            config_dir.join("loginusers.vdf"),
            format!(
                "\"users\"\n{{\n  \"{id64}\"\n  {{\n    \"PersonaName\"  \"Linux Tester\"\n  }}\n}}\n"
            ),
        )
        .unwrap();
        fs::write(collections_dir.join("cloud-storage-namespace-1.json"), "[]").unwrap();

        let info = detect_steam_at(steam_path.to_string_lossy().into_owned()).unwrap();

        assert_eq!(info.users.len(), 1);
        assert_eq!(info.users[0].id3, id3);
        assert_eq!(info.users[0].id64, id64);
        assert_eq!(info.users[0].persona_name, "Linux Tester");
        assert!(info.users[0].has_collections);

        fs::remove_dir_all(steam_path).unwrap();
    }

    #[test]
    fn rejects_existing_directory_that_is_not_a_steam_root() {
        let path = temp_steam_dir("invalid-root");
        fs::create_dir_all(&path).unwrap();

        let error = detect_steam_at(path.to_string_lossy().into_owned()).unwrap_err();

        assert!(error.contains("not a Steam installation directory"));
        fs::remove_dir_all(path).unwrap();
    }

    fn temp_steam_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "repressurizer-detector-{name}-{}-{unique}",
            std::process::id()
        ))
    }
}
