use base64::Engine;
use chrono::Utc;
use rusty_leveldb::{Options, DB};
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

fn get_collections_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json")
}

fn get_leveldb_key(steam_id3: &str) -> Vec<u8> {
    format!(
        "_https://steamloopback.host\u{0}\u{1}U{}-cloud-storage-namespace-1",
        steam_id3
    )
    .into_bytes()
}

fn get_leveldb_backup_name(timestamp: &str) -> String {
    format!("cloud-storage-namespace-1.leveldb-backup-{}.bin", timestamp)
}

fn leveldb_backup_for_json_backup(filename: &str) -> Option<String> {
    filename
        .strip_prefix("cloud-storage-namespace-1.backup-")
        .or_else(|| filename.strip_prefix("cloud-storage-namespace-1.pre-restore-"))
        .and_then(|s| s.strip_suffix(".json"))
        .map(get_leveldb_backup_name)
}

fn steam_leveldb_candidates(steam_path: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(local_data) = dirs::data_local_dir() {
        candidates.push(
            local_data
                .join("Steam")
                .join("htmlcache")
                .join("Local Storage")
                .join("leveldb"),
        );
    }

    let steam_path = PathBuf::from(steam_path);
    candidates.push(
        steam_path
            .join("config")
            .join("htmlcache")
            .join("Local Storage")
            .join("leveldb"),
    );
    candidates.push(
        steam_path
            .join("htmlcache")
            .join("Local Storage")
            .join("leveldb"),
    );

    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|p| seen.insert(p.clone()))
        .collect()
}

fn open_leveldb(path: &PathBuf) -> Result<DB, String> {
    let mut options = Options::default();
    options.create_if_missing = false;
    options.paranoid_checks = true;
    DB::open(path, options)
        .map_err(|e| format!("Failed to open Steam LevelDB at {}: {}", path.display(), e))
}

fn decode_leveldb_catalog(raw: &[u8]) -> Result<(CatalogEncoding, String), String> {
    if raw.is_empty() {
        return Err("Steam LevelDB catalog value is empty".to_string());
    }

    match raw[0] {
        // Chromium localStorage uses 0x00 for UTF-16 strings.
        0x00 => {
            let bytes = &raw[1..];
            if bytes.len() % 2 != 0 {
                return Err("Steam LevelDB UTF-16 catalog has an odd byte length".to_string());
            }
            let units: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect();
            String::from_utf16(&units)
                .map(|s| (CatalogEncoding::Utf16Le, s))
                .map_err(|e| format!("Failed to decode Steam LevelDB UTF-16 catalog: {}", e))
        }
        // 0x01 is the usual 8-bit string marker. Steam catalog JSON is UTF-8-compatible in practice.
        0x01 => String::from_utf8(raw[1..].to_vec())
            .map(|s| (CatalogEncoding::Utf8, s))
            .map_err(|e| format!("Failed to decode Steam LevelDB UTF-8 catalog: {}", e)),
        marker => String::from_utf8(raw[1..].to_vec())
            .map(|s| (CatalogEncoding::Utf8, s))
            .map_err(|e| format!("Unknown Steam LevelDB catalog marker 0x{marker:02x}: {}", e)),
    }
}

fn encode_leveldb_catalog(catalog_json: &str, encoding: CatalogEncoding) -> Vec<u8> {
    match encoding {
        CatalogEncoding::Utf8 => {
            let mut bytes = Vec::with_capacity(catalog_json.len() + 1);
            bytes.push(0x01);
            bytes.extend_from_slice(catalog_json.as_bytes());
            bytes
        }
        CatalogEncoding::Utf16Le => {
            let mut bytes = Vec::with_capacity(catalog_json.len() * 2 + 1);
            bytes.push(0x00);
            for unit in catalog_json.encode_utf16() {
                bytes.extend_from_slice(&unit.to_le_bytes());
            }
            bytes
        }
    }
}

fn parse_catalog(content: &str) -> Result<Vec<serde_json::Value>, String> {
    serde_json::from_str::<Vec<serde_json::Value>>(content)
        .map_err(|e| format!("Failed to parse Steam collection catalog: {}", e))
}

fn read_json_catalog(path: &PathBuf) -> Result<Vec<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read collections file: {}", e))?;
    parse_catalog(&content)
}

fn read_leveldb_catalog(
    steam_path: &str,
    steam_id3: &str,
) -> Result<Option<LevelDbCatalog>, String> {
    let key = get_leveldb_key(steam_id3);
    let mut open_errors = Vec::new();
    let mut saw_database = false;

    for path in steam_leveldb_candidates(steam_path) {
        if !path.exists() {
            continue;
        }

        saw_database = true;
        let mut db = match open_leveldb(&path) {
            Ok(db) => db,
            Err(e) => {
                open_errors.push(e);
                continue;
            }
        };

        let Some(raw_value) = db.get(&key) else {
            continue;
        };
        let (encoding, catalog_json) = decode_leveldb_catalog(&raw_value)?;
        let catalog = parse_catalog(&catalog_json)?;

        return Ok(Some(LevelDbCatalog {
            path,
            key: key.clone(),
            raw_value: raw_value.to_vec(),
            encoding,
            catalog,
        }));
    }

    if saw_database && !open_errors.is_empty() {
        return Err(open_errors.join("; "));
    }

    Ok(None)
}

fn write_leveldb_catalog(source: &LevelDbCatalog, catalog_json: &str) -> Result<(), String> {
    let mut db = open_leveldb(&source.path)?;
    let encoded = encode_leveldb_catalog(catalog_json, source.encoding);
    db.put(&source.key, &encoded)
        .map_err(|e| format!("Failed to write Steam LevelDB catalog: {}", e))?;
    db.flush()
        .map_err(|e| format!("Failed to flush Steam LevelDB catalog: {}", e))?;
    Ok(())
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
    collections_path: &PathBuf,
    timestamp: &str,
    catalog: &[serde_json::Value],
    leveldb: Option<&LevelDbCatalog>,
    description: &str,
    prefix: &str,
) -> Result<String, String> {
    let dir = collections_path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let backup_name = format!("cloud-storage-namespace-1.{}-{}.json", prefix, timestamp);
    let backup_path = dir.join(&backup_name);
    let catalog_json = serde_json::to_string(catalog)
        .map_err(|e| format!("Failed to serialize backup catalog: {}", e))?;
    fs::write(&backup_path, catalog_json).map_err(|e| format!("Failed to create backup: {}", e))?;

    if let Some(leveldb) = leveldb {
        let leveldb_backup_path = dir.join(get_leveldb_backup_name(timestamp));
        fs::write(&leveldb_backup_path, &leveldb.raw_value)
            .map_err(|e| format!("Failed to create Steam LevelDB backup: {}", e))?;
    }

    let desc_path = dir.join(format!("{}.desc", backup_name));
    let _ = fs::write(&desc_path, description);

    Ok(backup_name)
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
    let collections_path = get_collections_path(&steam_path, &steam_id3);
    let dir = collections_path.parent().ok_or("Invalid path")?;
    let backup_path = dir.join(&backup_filename);

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
    let backup_path = dir.join(&backup_filename);

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
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_steam_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("repressurizer-{name}-{nanos}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn sample_catalog(name: &str, added: Vec<u64>) -> Vec<serde_json::Value> {
        vec![
            serde_json::json!(["other-key", { "key": "other-key", "value": "keep" }]),
            serde_json::json!([
                "user-collections.uc-rpg",
                {
                    "key": "user-collections.uc-rpg",
                    "timestamp": 1,
                    "value": serde_json::to_string(&serde_json::json!({
                        "id": "uc-rpg",
                        "name": name,
                        "added": added,
                        "removed": []
                    })).unwrap(),
                    "version": "20260604",
                    "conflictResolutionMethod": "custom",
                    "strMethodId": "union-collections"
                }
            ]),
            serde_json::json!([
                "user-collections.dynamic",
                {
                    "key": "user-collections.dynamic",
                    "timestamp": 1,
                    "value": serde_json::to_string(&serde_json::json!({
                        "id": "dynamic",
                        "name": "Dynamic",
                        "added": [999],
                        "removed": [],
                        "filterSpec": { "type": "playtime" }
                    })).unwrap()
                }
            ]),
        ]
    }

    fn write_json_catalog(steam_path: &PathBuf, steam_id3: &str, catalog: &[serde_json::Value]) {
        let path = get_collections_path(&steam_path.to_string_lossy(), steam_id3);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, serde_json::to_string(catalog).unwrap()).unwrap();
    }

    fn write_leveldb_catalog_fixture(
        steam_path: &PathBuf,
        steam_id3: &str,
        catalog: &[serde_json::Value],
        encoding: CatalogEncoding,
    ) -> PathBuf {
        let db_path = steam_path
            .join("config")
            .join("htmlcache")
            .join("Local Storage")
            .join("leveldb");
        fs::create_dir_all(&db_path).unwrap();
        let mut db = DB::open(&db_path, Options::default()).unwrap();
        let json = serde_json::to_string(catalog).unwrap();
        db.put(
            &get_leveldb_key(steam_id3),
            &encode_leveldb_catalog(&json, encoding),
        )
        .unwrap();
        db.flush().unwrap();
        db_path
    }

    #[test]
    fn leveldb_catalog_encoding_round_trips_utf8_and_utf16() {
        let json =
            r#"[["user-collections.favorite",{"key":"user-collections.favorite","value":"{}"}]]"#;

        for encoding in [CatalogEncoding::Utf8, CatalogEncoding::Utf16Le] {
            let raw = encode_leveldb_catalog(json, encoding);
            let (_, decoded) = decode_leveldb_catalog(&raw).unwrap();
            assert_eq!(decoded, json);
        }
    }

    #[test]
    fn load_collections_prefers_leveldb_and_injects_special_collections() {
        let steam_path = temp_steam_dir("load-leveldb");
        let steam_id3 = "12345";

        write_json_catalog(&steam_path, steam_id3, &sample_catalog("Json RPG", vec![1]));
        write_leveldb_catalog_fixture(
            &steam_path,
            steam_id3,
            &sample_catalog("LevelDB RPG", vec![2]),
            CatalogEncoding::Utf8,
        );

        let collections = load_collections(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
        )
        .unwrap();
        assert!(collections
            .iter()
            .any(|c| c.name == "LevelDB RPG" && c.added == vec![2]));
        assert!(!collections.iter().any(|c| c.name == "Json RPG"));
        assert!(collections
            .iter()
            .any(|c| c.id == "hidden" && c.key == "user-collections.hidden"));
        assert!(collections
            .iter()
            .any(|c| c.id == "favorite" && c.key == "user-collections.favorite"));

        let _ = fs::remove_dir_all(steam_path);
    }

    #[test]
    fn save_collections_updates_json_and_existing_leveldb_with_coordinated_backups() {
        let steam_path = temp_steam_dir("save-leveldb");
        let steam_id3 = "54321";
        let initial = sample_catalog("Old", vec![10]);

        write_json_catalog(&steam_path, steam_id3, &initial);
        let db_path =
            write_leveldb_catalog_fixture(&steam_path, steam_id3, &initial, CatalogEncoding::Utf8);

        let collections = vec![
            SteamCollection {
                id: "uc-rpg".to_string(),
                key: "user-collections.uc-rpg".to_string(),
                name: "Old".to_string(),
                added: vec![10, 20],
                removed: vec![],
                timestamp: 1,
                is_deleted: false,
                is_dynamic: false,
            },
            SteamCollection {
                id: "hidden".to_string(),
                key: "user-collections.hidden".to_string(),
                name: "Hidden".to_string(),
                added: vec![30],
                removed: vec![],
                timestamp: 1,
                is_deleted: false,
                is_dynamic: false,
            },
            SteamCollection {
                id: "favorite".to_string(),
                key: "user-collections.favorite".to_string(),
                name: "Favorites".to_string(),
                added: vec![20],
                removed: vec![],
                timestamp: 1,
                is_deleted: false,
                is_dynamic: false,
            },
        ];

        save_collections(
            steam_path.to_string_lossy().to_string(),
            steam_id3.to_string(),
            collections,
        )
        .unwrap();

        let json_catalog = read_json_catalog(&get_collections_path(
            &steam_path.to_string_lossy(),
            steam_id3,
        ))
        .unwrap();
        assert!(json_catalog
            .iter()
            .any(|item| item[0] == "user-collections.hidden"));
        assert!(json_catalog
            .iter()
            .any(|item| item[0] == "user-collections.favorite"));
        assert!(json_catalog
            .iter()
            .any(|item| item[0] == "user-collections.dynamic"));

        let mut db = open_leveldb(&db_path).unwrap();
        let raw = db.get(&get_leveldb_key(steam_id3)).unwrap();
        let (_, decoded) = decode_leveldb_catalog(&raw).unwrap();
        assert!(decoded.contains("user-collections.favorite"));
        assert!(decoded.contains("20"));

        let backup_dir = get_collections_path(&steam_path.to_string_lossy(), steam_id3)
            .parent()
            .unwrap()
            .to_path_buf();
        let backups = fs::read_dir(backup_dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert!(backups
            .iter()
            .any(|name| name.starts_with("cloud-storage-namespace-1.backup-")
                && name.ends_with(".json")));
        assert!(backups.iter().any(|name| name
            .starts_with("cloud-storage-namespace-1.leveldb-backup-")
            && name.ends_with(".bin")));

        drop(db);
        let _ = fs::remove_dir_all(steam_path);
    }
}
