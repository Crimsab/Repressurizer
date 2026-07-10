use super::{CatalogEncoding, LevelDbCatalog};
use rusty_leveldb::{Options, DB};
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn get_collections_path(steam_path: &str, steam_id3: &str) -> PathBuf {
    PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json")
}

pub(super) fn get_leveldb_key(steam_id3: &str) -> Vec<u8> {
    format!(
        "_https://steamloopback.host\u{0}\u{1}U{}-cloud-storage-namespace-1",
        steam_id3
    )
    .into_bytes()
}

pub(super) fn get_leveldb_backup_name(timestamp: &str) -> String {
    format!("cloud-storage-namespace-1.leveldb-backup-{}.bin", timestamp)
}

pub(super) fn leveldb_backup_for_json_backup(filename: &str) -> Option<String> {
    filename
        .strip_prefix("cloud-storage-namespace-1.backup-")
        .or_else(|| filename.strip_prefix("cloud-storage-namespace-1.pre-restore-"))
        .and_then(|s| s.strip_suffix(".json"))
        .map(get_leveldb_backup_name)
}

pub(super) fn steam_leveldb_candidates(steam_path: &str) -> Vec<PathBuf> {
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

pub(super) fn open_leveldb(path: &Path) -> Result<DB, String> {
    let options = Options {
        create_if_missing: false,
        paranoid_checks: true,
        ..Options::default()
    };
    DB::open(path, options)
        .map_err(|e| format!("Failed to open Steam LevelDB at {}: {}", path.display(), e))
}

pub(super) fn decode_leveldb_catalog(raw: &[u8]) -> Result<(CatalogEncoding, String), String> {
    if raw.is_empty() {
        return Err("Steam LevelDB catalog value is empty".to_string());
    }

    match raw[0] {
        // Chromium localStorage uses 0x00 for UTF-16 strings.
        0x00 => {
            let bytes = &raw[1..];
            if !bytes.len().is_multiple_of(2) {
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

pub(super) fn encode_leveldb_catalog(catalog_json: &str, encoding: CatalogEncoding) -> Vec<u8> {
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

pub(super) fn parse_catalog(content: &str) -> Result<Vec<serde_json::Value>, String> {
    serde_json::from_str::<Vec<serde_json::Value>>(content)
        .map_err(|e| format!("Failed to parse Steam collection catalog: {}", e))
}

pub(super) fn read_json_catalog(path: &Path) -> Result<Vec<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read collections file: {}", e))?;
    parse_catalog(&content)
}

pub(super) fn read_leveldb_catalog(
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

pub(super) fn write_leveldb_catalog(
    source: &LevelDbCatalog,
    catalog_json: &str,
) -> Result<(), String> {
    let mut db = open_leveldb(&source.path)?;
    let encoded = encode_leveldb_catalog(catalog_json, source.encoding);
    db.put(&source.key, &encoded)
        .map_err(|e| format!("Failed to write Steam LevelDB catalog: {}", e))?;
    db.flush()
        .map_err(|e| format!("Failed to flush Steam LevelDB catalog: {}", e))?;
    Ok(())
}
