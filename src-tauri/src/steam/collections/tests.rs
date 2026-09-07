use super::leveldb::{decode_leveldb_catalog, get_leveldb_key};
use super::*;
use std::cell::RefCell;
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

fn write_json_catalog(steam_path: &Path, steam_id3: &str, catalog: &[serde_json::Value]) {
    let path = get_collections_path(&steam_path.to_string_lossy(), steam_id3);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, serde_json::to_string(catalog).unwrap()).unwrap();
}

fn write_leveldb_catalog_fixture(
    steam_path: &Path,
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
fn leveldb_backup_must_match_json_catalog_before_restore() {
    let raw = encode_leveldb_catalog(
        &serde_json::to_string(&sample_catalog("Different", vec![9])).unwrap(),
        CatalogEncoding::Utf8,
    );
    let expected = sample_catalog("Expected", vec![1]);

    let error = validate_leveldb_backup(&raw, &expected, "backup.json")
        .expect_err("a mismatched LevelDB sidecar must be rejected");
    assert!(error.contains("does not match its JSON backup"));
}

#[test]
fn corrupt_leveldb_does_not_silently_fall_back_to_json() {
    let steam_path = temp_steam_dir("corrupt-leveldb");
    let steam_id3 = "11223";
    write_json_catalog(
        &steam_path,
        steam_id3,
        &sample_catalog("Stale JSON", vec![1]),
    );

    let db_path = steam_path
        .join("config")
        .join("htmlcache")
        .join("Local Storage")
        .join("leveldb");
    fs::create_dir_all(&db_path).unwrap();
    fs::write(db_path.join("CURRENT"), b"not a valid LevelDB manifest").unwrap();

    let error = load_collections(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
    )
    .expect_err("a corrupt LevelDB must not be hidden by the JSON fallback");
    assert!(error.contains("JSON fallback was skipped"));
    assert!(error.contains("LevelDB"));

    let _ = fs::remove_dir_all(steam_path);
}

#[test]
fn paired_catalog_write_restores_both_archives_after_leveldb_failure() {
    let state = RefCell::new((Some("old-json".to_string()), b"old-leveldb".to_vec()));
    let original_leveldb = state.borrow().1.clone();

    let error = persist_catalog_pair_with(
        "Failed to save Steam collections",
        "new-json",
        Some("old-json"),
        Some(original_leveldb.as_slice()),
        |candidate| {
            state.borrow_mut().0 = Some(candidate.to_string());
            Ok(())
        },
        |_| Err("injected LevelDB write failure".to_string()),
        |original| {
            state.borrow_mut().0 = original.map(ToString::to_string);
            Ok(())
        },
        |raw| {
            state.borrow_mut().1 = raw.to_vec();
            Ok(())
        },
    )
    .expect_err("the injected LevelDB failure must be returned");

    assert!(error.contains("injected LevelDB write failure"));
    assert!(error.contains("original JSON and LevelDB catalogs were restored"));
    let (json, leveldb) = state.into_inner();
    assert_eq!(json.as_deref(), Some("old-json"));
    assert_eq!(leveldb, b"old-leveldb");
}

#[test]
fn paired_catalog_write_reports_each_recovery_failure() {
    let original_leveldb = b"old-leveldb".to_vec();
    let error = persist_catalog_pair_with(
        "Failed to save Steam collections",
        "new-json",
        Some("old-json"),
        Some(original_leveldb.as_slice()),
        |_| Ok(()),
        |_| Err("injected LevelDB write failure".to_string()),
        |_| Err("injected JSON recovery failure".to_string()),
        |_| Err("injected LevelDB recovery failure".to_string()),
    )
    .expect_err("the injected write failure must be returned");

    assert!(error.contains("JSON recovery failed: injected JSON recovery failure"));
    assert!(error.contains("LevelDB recovery failed: injected LevelDB recovery failure"));
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
    assert!(backups.iter().any(
        |name| name.starts_with("cloud-storage-namespace-1.backup-") && name.ends_with(".json")
    ));
    assert!(backups.iter().any(|name| name
        .starts_with("cloud-storage-namespace-1.leveldb-backup-")
        && name.ends_with(".bin")));

    drop(db);
    let _ = fs::remove_dir_all(steam_path);
}

#[test]
fn backup_commands_reject_paths_outside_the_backup_directory() {
    let steam_path = temp_steam_dir("backup-path-traversal");
    let steam_id3 = "67890";
    write_json_catalog(&steam_path, steam_id3, &sample_catalog("RPG", vec![10]));

    let victim = steam_path
        .join("userdata")
        .join(steam_id3)
        .join("victim.txt");
    fs::write(&victim, "keep me").unwrap();

    let error = delete_backup(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
        "../../victim.txt".to_string(),
    )
    .expect_err("path traversal must be rejected");

    assert!(error.contains("Invalid backup filename"));
    assert!(victim.exists());
    let _ = fs::remove_dir_all(steam_path);
}

#[test]
fn rapid_manual_backups_do_not_overwrite_each_other() {
    let steam_path = temp_steam_dir("backup-collision");
    let steam_id3 = "24680";
    write_json_catalog(&steam_path, steam_id3, &sample_catalog("RPG", vec![10]));

    create_manual_backup(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
        "first".to_string(),
    )
    .unwrap();
    create_manual_backup(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
        "second".to_string(),
    )
    .unwrap();

    let backups = list_backups(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
    )
    .unwrap();
    assert_eq!(backups.len(), 2);
    let descriptions = backups
        .iter()
        .map(|backup| backup.description.as_str())
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(
        descriptions,
        std::collections::HashSet::from(["first", "second"])
    );

    let _ = fs::remove_dir_all(steam_path);
}

#[test]
fn stale_leveldb_directory_does_not_block_json_backup_or_save() {
    let steam_path = temp_steam_dir("stale-leveldb");
    let steam_id3 = "13579";
    write_json_catalog(&steam_path, steam_id3, &sample_catalog("RPG", vec![10]));

    let stale_db_path = steam_path
        .join("config")
        .join("htmlcache")
        .join("Local Storage")
        .join("leveldb");
    fs::create_dir_all(&stale_db_path).unwrap();
    for filename in ["LOCK", "LOG", "LOG.old"] {
        fs::write(stale_db_path.join(filename), []).unwrap();
    }

    create_manual_backup(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
        "before save".to_string(),
    )
    .unwrap();

    let mut collections = load_collections(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
    )
    .unwrap();
    collections
        .iter_mut()
        .find(|collection| collection.name == "RPG")
        .unwrap()
        .added
        .push(20);

    save_collections(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
        collections,
    )
    .unwrap();

    let saved = read_json_catalog(&get_collections_path(
        &steam_path.to_string_lossy(),
        steam_id3,
    ))
    .unwrap();
    let collection_data = extract_collection_data(&saved);
    let rpg_games = collection_data
        .iter()
        .find(|(name, _)| name == "RPG")
        .map(|(_, games)| games)
        .unwrap();
    assert!(rpg_games.contains(&10));
    assert!(rpg_games.contains(&20));

    let backups = list_backups(
        steam_path.to_string_lossy().to_string(),
        steam_id3.to_string(),
    )
    .unwrap();
    assert_eq!(backups.len(), 2);

    let _ = fs::remove_dir_all(steam_path);
}

#[test]
fn paired_catalog_write_recovers_json_when_flush_fails_after_replacement() {
    let json = RefCell::new(Some("original".to_string()));
    let error = persist_catalog_pair_with(
        "Save failed",
        "new",
        Some("original"),
        Some(b"old-leveldb"),
        |value| {
            *json.borrow_mut() = Some(value.to_string());
            Err("directory flush failed".to_string())
        },
        |_| panic!("LevelDB must not change after a JSON error"),
        |original| {
            *json.borrow_mut() = original.map(ToString::to_string);
            Ok(())
        },
        |_| panic!("LevelDB was not changed"),
    )
    .unwrap_err();
    assert!(error.contains("original JSON catalog was restored"));
    assert_eq!(json.into_inner().as_deref(), Some("original"));
}
