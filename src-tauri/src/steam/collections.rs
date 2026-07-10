use base64::Engine;
use chrono::Utc;
#[cfg(test)]
use rusty_leveldb::{Options, DB};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

mod leveldb;
use leveldb::{
    encode_leveldb_catalog, get_collections_path, get_leveldb_backup_name,
    leveldb_backup_for_json_backup, open_leveldb, read_json_catalog, read_leveldb_catalog,
    write_leveldb_catalog,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamCollection {
    pub id: String,
    pub key: String,
    pub name: String,
    pub added: Vec<u64>,
    pub removed: Vec<u64>,
    pub timestamp: u64,
    pub is_deleted: bool,
    pub is_dynamic: bool,
}

#[derive(Debug, Deserialize)]
struct CollectionValue {
    id: String,
    name: String,
    #[serde(default)]
    added: Vec<u64>,
    #[serde(default)]
    removed: Vec<u64>,
    #[serde(rename = "filterSpec")]
    filter_spec: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct CatalogEntry {
    key: String,
    #[serde(default)]
    timestamp: u64,
    value: Option<String>,
    #[serde(default)]
    is_deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupInfo {
    pub filename: String,
    pub timestamp: String,
    pub size: u64,
    pub description: String,
    pub is_pre_restore: bool,
}

#[derive(Debug, Clone, Copy)]
enum CatalogEncoding {
    Utf8,
    Utf16Le,
}

#[derive(Debug)]
struct LevelDbCatalog {
    path: PathBuf,
    key: Vec<u8>,
    raw_value: Vec<u8>,
    encoding: CatalogEncoding,
    catalog: Vec<serde_json::Value>,
}

fn extract_collection_data(
    catalog: &[serde_json::Value],
) -> Vec<(String, std::collections::HashSet<u64>)> {
    catalog
        .iter()
        .filter_map(|item| item.as_array())
        .filter(|arr| {
            arr.first()
                .and_then(|k| k.as_str())
                .is_some_and(|k| k.starts_with("user-collections"))
        })
        .filter_map(|arr| arr.get(1))
        .filter(|e| {
            !e.get("is_deleted")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .filter_map(|e| e.get("value").and_then(|v| v.as_str()))
        .filter_map(|v| serde_json::from_str::<serde_json::Value>(v).ok())
        .filter(|v| v.get("filterSpec").is_none())
        .filter_map(|v| {
            let name = v.get("name").and_then(|n| n.as_str())?.to_string();
            let added: std::collections::HashSet<u64> = v
                .get("added")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_u64()).collect())
                .unwrap_or_default();
            Some((name, added))
        })
        .collect()
}

fn parse_collections_from_catalog(
    catalog: &[serde_json::Value],
) -> Result<Vec<SteamCollection>, String> {
    let mut collections = Vec::new();

    for item in catalog {
        let arr = item.as_array().ok_or("Expected inner array")?;
        if arr.len() < 2 {
            continue;
        }

        let key = arr[0].as_str().unwrap_or_default();
        if !key.starts_with("user-collections") {
            continue;
        }

        let entry: CatalogEntry = serde_json::from_value(arr[1].clone())
            .map_err(|e| format!("Failed to parse entry: {}", e))?;

        if entry.is_deleted {
            continue;
        }

        if let Some(value_str) = &entry.value {
            if let Ok(value) = serde_json::from_str::<CollectionValue>(value_str) {
                let is_dynamic = value.filter_spec.is_some();
                collections.push(SteamCollection {
                    id: value.id,
                    key: entry.key,
                    name: value.name,
                    added: value.added,
                    removed: value.removed,
                    timestamp: entry.timestamp,
                    is_deleted: false,
                    is_dynamic,
                });
            }
        }
    }

    ensure_special_collections(&mut collections);
    Ok(collections)
}

fn ensure_special_collections(collections: &mut Vec<SteamCollection>) {
    let timestamp = Utc::now().timestamp() as u64;

    if !collections
        .iter()
        .any(|c| c.id == "hidden" || c.key == "user-collections.hidden")
    {
        collections.push(SteamCollection {
            id: "hidden".to_string(),
            key: "user-collections.hidden".to_string(),
            name: "Hidden".to_string(),
            added: Vec::new(),
            removed: Vec::new(),
            timestamp,
            is_deleted: false,
            is_dynamic: false,
        });
    }

    if !collections
        .iter()
        .any(|c| c.id == "favorite" || c.key == "user-collections.favorite")
    {
        collections.push(SteamCollection {
            id: "favorite".to_string(),
            key: "user-collections.favorite".to_string(),
            name: "Favorites".to_string(),
            added: Vec::new(),
            removed: Vec::new(),
            timestamp,
            is_deleted: false,
            is_dynamic: false,
        });
    }
}

fn build_catalog_with_collections(
    mut catalog: Vec<serde_json::Value>,
    collections: &[SteamCollection],
) -> Vec<serde_json::Value> {
    let timestamp = Utc::now().timestamp() as u64;
    let version = Utc::now().format("%Y%m%d").to_string();

    let mut updates: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();

    for collection in collections {
        if collection.is_dynamic {
            continue;
        }

        let id = if !collection.id.is_empty() {
            collection.id.clone()
        } else {
            format!("uc-{}", deterministic_id(&collection.name))
        };

        let key = format!("user-collections.{}", id);

        let value = serde_json::json!({
            "id": id,
            "name": collection.name,
            "added": collection.added,
            "removed": collection.removed,
        });

        let entry = serde_json::json!({
            "key": key,
            "timestamp": timestamp,
            "value": serde_json::to_string(&value).unwrap(),
            "version": version,
            "conflictResolutionMethod": "custom",
            "strMethodId": "union-collections",
        });

        updates.insert(key.clone(), serde_json::json!([key, entry]));
    }

    let mut updated_keys: std::collections::HashSet<String> = std::collections::HashSet::new();

    for item in catalog.iter_mut() {
        let key = item
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|k| k.as_str())
            .map(|s| s.to_string());

        if let Some(key) = key {
            if let Some(new_entry) = updates.get(&key) {
                *item = new_entry.clone();
                updated_keys.insert(key);
            }
        }
    }

    for (key, entry) in &updates {
        if !updated_keys.contains(key) {
            catalog.push(entry.clone());
        }
    }

    let managed_keys: std::collections::HashSet<String> = updates.keys().cloned().collect();
    catalog.retain(|item| {
        if let Some(arr) = item.as_array() {
            if let Some(key) = arr.first().and_then(|k| k.as_str()) {
                if key.starts_with("user-collections") {
                    if let Some(entry_val) = arr.get(1) {
                        if entry_val
                            .get("is_deleted")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                        {
                            return true;
                        }
                        if let Some(val_str) = entry_val.get("value").and_then(|v| v.as_str()) {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(val_str) {
                                if val.get("filterSpec").is_some() {
                                    return true;
                                }
                            }
                        }
                    }
                    return managed_keys.contains(key);
                }
            }
        }
        true
    });

    catalog
}

fn create_catalog_backup(
    collections_path: &Path,
    timestamp: &str,
    catalog: &[serde_json::Value],
    leveldb: Option<&LevelDbCatalog>,
    description: &str,
    prefix: &str,
) -> Result<String, String> {
    let dir = collections_path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let catalog_json = serde_json::to_string(catalog)
        .map_err(|e| format!("Failed to serialize backup catalog: {}", e))?;

    for attempt in 0..10_000_u32 {
        let unique_timestamp = if attempt == 0 {
            timestamp.to_string()
        } else {
            format!("{timestamp}-{attempt}")
        };
        let backup_name = format!(
            "cloud-storage-namespace-1.{}-{}.json",
            prefix, unique_timestamp
        );
        let backup_path = dir.join(&backup_name);
        let mut backup_file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create backup: {error}")),
        };

        if let Err(error) = backup_file.write_all(catalog_json.as_bytes()) {
            let _ = fs::remove_file(&backup_path);
            return Err(format!("Failed to create backup: {error}"));
        }

        if let Some(leveldb) = leveldb {
            let leveldb_backup_path = dir.join(get_leveldb_backup_name(&unique_timestamp));
            if let Err(error) = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&leveldb_backup_path)
                .and_then(|mut file| file.write_all(&leveldb.raw_value))
            {
                let _ = fs::remove_file(&backup_path);
                let _ = fs::remove_file(&leveldb_backup_path);
                return Err(format!("Failed to create Steam LevelDB backup: {error}"));
            }
        }

        let desc_path = dir.join(format!("{}.desc", backup_name));
        let _ = fs::write(&desc_path, description);
        return Ok(backup_name);
    }

    Err("Failed to allocate a unique backup filename".to_string())
}

fn validated_backup_path(dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let timestamp = filename
        .strip_prefix("cloud-storage-namespace-1.backup-")
        .or_else(|| filename.strip_prefix("cloud-storage-namespace-1.pre-restore-"))
        .and_then(|value| value.strip_suffix(".json"))
        .filter(|value| {
            !value.is_empty()
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || byte == b'_' || byte == b'-')
        })
        .ok_or_else(|| "Invalid backup filename".to_string())?;

    if timestamp.is_empty()
        || Path::new(filename)
            .file_name()
            .and_then(|name| name.to_str())
            != Some(filename)
    {
        return Err("Invalid backup filename".to_string());
    }

    Ok(dir.join(filename))
}

fn deterministic_id(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.to_lowercase().as_bytes());
    let hash = hasher.finalize();
    let encoded = base64::engine::general_purpose::STANDARD.encode(hash);
    encoded
        .replace(['+', '/', '='], "")
        .chars()
        .take(12)
        .collect()
}

#[tauri::command]
pub fn load_collections(
    steam_path: String,
    steam_id3: String,
) -> Result<Vec<SteamCollection>, String> {
    let path = get_collections_path(&steam_path, &steam_id3);
    let catalog = match read_leveldb_catalog(&steam_path, &steam_id3).ok().flatten() {
        Some(leveldb) => leveldb.catalog,
        None => read_json_catalog(&path)?,
    };

    parse_collections_from_catalog(&catalog)
}

#[tauri::command]
pub fn save_collections(
    steam_path: String,
    steam_id3: String,
    collections: Vec<SteamCollection>,
) -> Result<(), String> {
    if super::sam::is_steam_running() {
        return Err(
            "Steam appears to be running. Close Steam before saving collections to avoid corrupting the library cache."
                .to_string(),
        );
    }

    let path = get_collections_path(&steam_path, &steam_id3);
    let dir = path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create collections directory: {}", e))?;

    let leveldb = read_leveldb_catalog(&steam_path, &steam_id3)?;
    let old_catalog = match &leveldb {
        Some(source) => source.catalog.clone(),
        None => read_json_catalog(&path)?,
    };

    let old_data = extract_collection_data(&old_catalog);
    let new_data: Vec<(String, std::collections::HashSet<u64>)> = collections
        .iter()
        .filter(|c| !c.is_dynamic)
        .map(|c| (c.name.clone(), c.added.iter().copied().collect()))
        .collect();

    let old_map: std::collections::HashMap<&str, &std::collections::HashSet<u64>> =
        old_data.iter().map(|(n, a)| (n.as_str(), a)).collect();
    let new_map: std::collections::HashMap<&str, &std::collections::HashSet<u64>> =
        new_data.iter().map(|(n, a)| (n.as_str(), a)).collect();

    let added_cols: Vec<&str> = new_map
        .keys()
        .filter(|k| !old_map.contains_key(*k))
        .copied()
        .collect();
    let removed_cols: Vec<&str> = old_map
        .keys()
        .filter(|k| !new_map.contains_key(*k))
        .copied()
        .collect();

    let mut game_changes = Vec::new();
    for (name, new_games) in &new_map {
        if let Some(old_games) = old_map.get(name) {
            let added: Vec<u64> = new_games.difference(old_games).copied().collect();
            let removed: Vec<u64> = old_games.difference(new_games).copied().collect();
            if !added.is_empty() || !removed.is_empty() {
                game_changes.push(serde_json::json!({
                    "collection": name,
                    "added": added,
                    "removed": removed,
                }));
            }
        }
    }

    let description = serde_json::to_string(&serde_json::json!({
        "added_collections": added_cols,
        "removed_collections": removed_cols,
        "game_changes": game_changes,
        "steam_leveldb": leveldb.is_some(),
    }))
    .unwrap_or_default();

    let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    create_catalog_backup(
        &path,
        &ts,
        &old_catalog,
        leveldb.as_ref(),
        &description,
        "backup",
    )?;

    let catalog = build_catalog_with_collections(old_catalog, &collections);
    let output =
        serde_json::to_string(&catalog).map_err(|e| format!("Failed to serialize: {}", e))?;

    let tmp_path = path.with_extension("tmp");

    fs::write(&tmp_path, &output).map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    if let Some(leveldb) = &leveldb {
        write_leveldb_catalog(leveldb, &output)?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_backups(steam_path: String, steam_id3: String) -> Result<Vec<BackupInfo>, String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;

    let mut backups = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_backup =
                name.starts_with("cloud-storage-namespace-1.backup-") && name.ends_with(".json");
            let is_pre_restore = name.starts_with("cloud-storage-namespace-1.pre-restore-")
                && name.ends_with(".json");

            if is_backup || is_pre_restore {
                let prefix = if is_pre_restore {
                    "cloud-storage-namespace-1.pre-restore-"
                } else {
                    "cloud-storage-namespace-1.backup-"
                };
                let ts = name
                    .strip_prefix(prefix)
                    .and_then(|s| s.strip_suffix(".json"))
                    .unwrap_or("")
                    .to_string();

                let mut size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if let Some(leveldb_name) = leveldb_backup_for_json_backup(&name) {
                    size += fs::metadata(dir.join(leveldb_name))
                        .map(|m| m.len())
                        .unwrap_or(0);
                }

                // Read description from sidecar file
                let desc_path = dir.join(format!("{}.desc", name));
                let description = fs::read_to_string(&desc_path).unwrap_or_else(|_| {
                    if is_pre_restore {
                        "Pre-restore snapshot".to_string()
                    } else {
                        String::new()
                    }
                });

                backups.push(BackupInfo {
                    filename: name,
                    timestamp: ts,
                    size,
                    description,
                    is_pre_restore,
                });
            }
        }
    }

    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(backups)
}

#[tauri::command]
pub fn restore_backup(
    steam_path: String,
    steam_id3: String,
    backup_filename: String,
) -> Result<(), String> {
    if super::sam::is_steam_running() {
        return Err(
            "Steam appears to be running. Close Steam before restoring a backup to avoid corrupting the library cache."
                .to_string(),
        );
    }

    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let backup_path = validated_backup_path(dir, &backup_filename)?;

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    // Backup current before restoring
    let leveldb = read_leveldb_catalog(&steam_path, &steam_id3)?;
    let current_catalog = match &leveldb {
        Some(source) => source.catalog.clone(),
        None => read_json_catalog(&collections_path)?,
    };
    let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    create_catalog_backup(
        &collections_path,
        &ts,
        &current_catalog,
        leveldb.as_ref(),
        "Pre-restore snapshot",
        "pre-restore",
    )?;

    fs::copy(&backup_path, &collections_path)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    if let Some(leveldb) = &leveldb {
        let restored_json = fs::read_to_string(&backup_path)
            .map_err(|e| format!("Failed to read restored backup: {}", e))?;
        let raw = leveldb_backup_for_json_backup(&backup_filename)
            .and_then(|name| fs::read(dir.join(name)).ok())
            .unwrap_or_else(|| encode_leveldb_catalog(&restored_json, leveldb.encoding));
        let mut db = open_leveldb(&leveldb.path)?;
        db.put(&leveldb.key, &raw)
            .map_err(|e| format!("Failed to restore Steam LevelDB backup: {}", e))?;
        db.flush()
            .map_err(|e| format!("Failed to flush restored Steam LevelDB backup: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn create_manual_backup(
    steam_path: String,
    steam_id3: String,
    description: String,
) -> Result<(), String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let desc = if description.is_empty() {
        "Manual backup".to_string()
    } else {
        description
    };
    let leveldb = read_leveldb_catalog(&steam_path, &steam_id3)?;
    let catalog = match &leveldb {
        Some(source) => source.catalog.clone(),
        None => read_json_catalog(&collections_path)?,
    };

    if catalog.is_empty() && !collections_path.exists() && leveldb.is_none() {
        return Err("Collections file not found".to_string());
    }

    create_catalog_backup(
        &collections_path,
        &ts,
        &catalog,
        leveldb.as_ref(),
        &desc,
        "backup",
    )?;

    Ok(())
}

#[tauri::command]
pub fn delete_backup(
    steam_path: String,
    steam_id3: String,
    backup_filename: String,
) -> Result<(), String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let backup_path = validated_backup_path(dir, &backup_filename)?;

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    fs::remove_file(&backup_path).map_err(|e| format!("Failed to delete backup: {}", e))?;

    let desc_path = dir.join(format!("{}.desc", backup_filename));
    let _ = fs::remove_file(&desc_path);

    if let Some(leveldb_name) = leveldb_backup_for_json_backup(&backup_filename) {
        let _ = fs::remove_file(dir.join(leveldb_name));
    }

    Ok(())
}

#[cfg(test)]
mod tests;
