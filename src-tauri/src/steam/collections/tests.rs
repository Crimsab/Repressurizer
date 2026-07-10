use super::leveldb::{decode_leveldb_catalog, get_leveldb_key};
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
