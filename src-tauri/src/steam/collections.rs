use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

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

fn extract_collection_data(catalog: &[serde_json::Value]) -> Vec<(String, std::collections::HashSet<u64>)> {
    catalog.iter()
        .filter_map(|item| item.as_array())
        .filter(|arr| arr.first().and_then(|k| k.as_str()).is_some_and(|k| k.starts_with("user-collections")))
        .filter_map(|arr| arr.get(1))
        .filter(|e| !e.get("is_deleted").and_then(|v| v.as_bool()).unwrap_or(false))
        .filter_map(|e| e.get("value").and_then(|v| v.as_str()))
        .filter_map(|v| serde_json::from_str::<serde_json::Value>(v).ok())
        .filter(|v| v.get("filterSpec").is_none())
        .filter_map(|v| {
            let name = v.get("name").and_then(|n| n.as_str())?.to_string();
            let added: std::collections::HashSet<u64> = v.get("added")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_u64()).collect())
                .unwrap_or_default();
            Some((name, added))
        })
        .collect()
}

fn get_collections_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json")
}

fn deterministic_id(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.to_lowercase().as_bytes());
    let hash = hasher.finalize();
    let encoded = base64::engine::general_purpose::STANDARD.encode(hash);
    encoded
        .replace('+', "")
        .replace('/', "")
        .replace('=', "")
        .chars()
        .take(12)
        .collect()
}

#[tauri::command]
pub fn load_collections(steam_path: String, steam_id3: String) -> Result<Vec<SteamCollection>, String> {
    let path = get_collections_path(&steam_path, &steam_id3);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read collections file: {}", e))?;

    let catalog: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let array = catalog
        .as_array()
        .ok_or("Expected JSON array")?;

    let mut collections = Vec::new();

    for item in array {
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

    Ok(collections)
}

#[tauri::command]
pub fn save_collections(
    steam_path: String,
    steam_id3: String,
    collections: Vec<SteamCollection>,
) -> Result<(), String> {
    let path = get_collections_path(&steam_path, &steam_id3);

    // Generate change description by comparing old vs new
    let mut description = String::new();
    if path.exists() {
        if let Ok(old_content) = fs::read_to_string(&path) {
            if let Ok(old_catalog) = serde_json::from_str::<Vec<serde_json::Value>>(&old_content) {
                let old_data = extract_collection_data(&old_catalog);
                let new_data: Vec<(String, std::collections::HashSet<u64>)> = collections.iter()
                    .filter(|c| !c.is_dynamic)
                    .map(|c| (c.name.clone(), c.added.iter().copied().collect()))
                    .collect();

                let old_map: std::collections::HashMap<&str, &std::collections::HashSet<u64>> =
                    old_data.iter().map(|(n, a)| (n.as_str(), a)).collect();
                let new_map: std::collections::HashMap<&str, &std::collections::HashSet<u64>> =
                    new_data.iter().map(|(n, a)| (n.as_str(), a)).collect();

                let added_cols: Vec<&str> = new_map.keys().filter(|k| !old_map.contains_key(*k)).copied().collect();
                let removed_cols: Vec<&str> = old_map.keys().filter(|k| !new_map.contains_key(*k)).copied().collect();

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

                let desc_json = serde_json::json!({
                    "added_collections": added_cols,
                    "removed_collections": removed_cols,
                    "game_changes": game_changes,
                });
                description = serde_json::to_string(&desc_json).unwrap_or_default();
            }
        }

        let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_name = format!("cloud-storage-namespace-1.backup-{}.json", ts);
        let backup_path = path.parent().unwrap().join(&backup_name);
        fs::copy(&path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {}", e))?;

        // Save description as sidecar
        let desc_path = path.parent().unwrap().join(format!("{}.desc", backup_name));
        let _ = fs::write(&desc_path, &description);
    }

    // Read existing catalog
    let content = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file: {}", e))?
    } else {
        "[]".to_string()
    };

    let mut catalog: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let timestamp = Utc::now().timestamp() as u64;
    let version = Utc::now().format("%Y%m%d").to_string();

    // Build a map of key -> new entry for static collections
    let mut updates: std::collections::HashMap<String, serde_json::Value> = std::collections::HashMap::new();

    for collection in &collections {
        if collection.is_dynamic {
            continue;
        }

        // Use the existing id if it's already set, otherwise generate one
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

    // Update existing entries in-place, preserving their position
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

    // Append truly new collections (ones that didn't exist in the catalog)
    for (key, entry) in &updates {
        if !updated_keys.contains(key) {
            catalog.push(entry.clone());
        }
    }

    // Remove only collections the user actively deleted:
    // i.e., ones we loaded (updated in-place) but are no longer in the update set
    // Keep everything else: dynamic, is_deleted tombstones, unknown entries
    let managed_keys: std::collections::HashSet<String> = updates.keys().cloned().collect();
    catalog.retain(|item| {
        if let Some(arr) = item.as_array() {
            if let Some(key) = arr.first().and_then(|k| k.as_str()) {
                if key.starts_with("user-collections") {
                    if let Some(entry_val) = arr.get(1) {
                        // Keep entries marked as deleted (tombstones)
                        if entry_val.get("is_deleted").and_then(|v| v.as_bool()).unwrap_or(false) {
                            return true;
                        }
                        // Keep dynamic collections
                        if let Some(val_str) = entry_val.get("value").and_then(|v| v.as_str()) {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(val_str) {
                                if val.get("filterSpec").is_some() {
                                    return true;
                                }
                            }
                        }
                    }
                    // Static, non-deleted collection: keep only if user still has it
                    return managed_keys.contains(key);
                }
            }
        }
        true
    });

    // Write atomically
    let tmp_path = path.with_extension("tmp");
    let output = serde_json::to_string(&catalog)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    fs::write(&tmp_path, &output)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

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
            let is_backup = name.starts_with("cloud-storage-namespace-1.backup-") && name.ends_with(".json");
            let is_pre_restore = name.starts_with("cloud-storage-namespace-1.pre-restore-") && name.ends_with(".json");

            if is_backup || is_pre_restore {
                let prefix = if is_pre_restore { "cloud-storage-namespace-1.pre-restore-" } else { "cloud-storage-namespace-1.backup-" };
                let ts = name
                    .strip_prefix(prefix)
                    .and_then(|s| s.strip_suffix(".json"))
                    .unwrap_or("")
                    .to_string();

                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                // Read description from sidecar file
                let desc_path = dir.join(format!("{}.desc", name));
                let description = fs::read_to_string(&desc_path).unwrap_or_else(|_| {
                    if is_pre_restore { "Pre-restore snapshot".to_string() } else { String::new() }
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
pub fn restore_backup(steam_path: String, steam_id3: String, backup_filename: String) -> Result<(), String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let backup_path = dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    // Backup current before restoring
    if collections_path.exists() {
        let pre_restore = format!(
            "cloud-storage-namespace-1.pre-restore-{}.json",
            Utc::now().format("%Y%m%d_%H%M%S")
        );
        fs::copy(&collections_path, dir.join(pre_restore))
            .map_err(|e| format!("Failed to backup current file: {}", e))?;
    }

    fs::copy(&backup_path, &collections_path)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn create_manual_backup(steam_path: String, steam_id3: String, description: String) -> Result<(), String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    if !collections_path.exists() {
        return Err("Collections file not found".to_string());
    }
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let ts = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_name = format!("cloud-storage-namespace-1.backup-{}.json", ts);
    let backup_path = dir.join(&backup_name);
    fs::copy(&collections_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    let desc = if description.is_empty() { "Manual backup".to_string() } else { description };
    let desc_path = dir.join(format!("{}.desc", backup_name));
    let _ = fs::write(&desc_path, &desc);

    Ok(())
}

#[tauri::command]
pub fn delete_backup(steam_path: String, steam_id3: String, backup_filename: String) -> Result<(), String> {
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let backup_path = dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    fs::remove_file(&backup_path)
        .map_err(|e| format!("Failed to delete backup: {}", e))?;

    // Also delete sidecar description if exists
    let desc_path = dir.join(format!("{}.desc", backup_filename));
    let _ = fs::remove_file(&desc_path);

    Ok(())
}
