use super::*;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn finds_linux_steam_client_library_candidates() {
    let root = temp_dir("sam_probe_library");
    let library = root.join("ubuntu12_64").join("steamclient.so");
    fs::create_dir_all(library.parent().unwrap()).unwrap();
    fs::write(&library, b"mock").unwrap();

    let found = find_steam_client_library(&root);
    assert_eq!(found, Some(library));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn reports_missing_steam_path_without_bridge() {
    let probe = build_probe(String::new(), 39140, None, false, None);
    assert_eq!(probe.app_id, 39140);
    assert!(!probe.available);
    assert!(!probe.writes_steam);
    assert!(probe
        .capabilities
        .iter()
        .any(|capability| { capability.id == "samWriteAchievements" && capability.writes_steam }));
}

#[test]
fn sam_writes_fail_closed_when_schema_permissions_are_unavailable() {
    let missing_root = temp_dir("sam_missing_schema");
    let error =
        load_required_schema_permissions(&missing_root.to_string_lossy(), 39140).unwrap_err();

    assert!(error.contains("no achievements were changed"));
    assert!(error.contains("schema was not found"));

    let mut permissions = HashMap::new();
    permissions.insert(
        "KNOWN".to_string(),
        SamAchievementSchemaItem {
            api_name: "KNOWN".to_string(),
            permission: 0,
            protected_achievement: false,
            flags: Vec::new(),
        },
    );
    assert_eq!(
        local_write_permission(&permissions, "KNOWN"),
        SamLocalWritePermission::Allowed
    );
    assert_eq!(
        local_write_permission(&permissions, "UNKNOWN"),
        SamLocalWritePermission::Unknown
    );
    let error = ensure_verified_target_permissions(
        &permissions,
        &["KNOWN".to_string(), "UNKNOWN".to_string()],
    )
    .unwrap_err();
    assert!(error.contains("UNKNOWN"));
    assert!(error.contains("no achievements were changed"));
}

#[test]
fn pre_change_backup_is_required_but_post_change_backup_is_diagnostic() {
    let before_error = require_pre_change_backup(Err("disk full".to_string())).unwrap_err();
    assert!(before_error.contains("required pre-change SAM backup"));
    assert!(before_error.contains("no achievements were changed"));

    let mut diagnostics = Vec::new();
    let after_path = record_post_change_backup(Err("disk full".to_string()), &mut diagnostics);
    assert_eq!(after_path, None);
    assert_eq!(diagnostics, vec!["after_backup_error=disk full"]);
}

#[test]
fn ignores_normal_app_launch_args() {
    assert_eq!(run_embedded_bridge(["repressurizer"]), None);
}

#[test]
fn embedded_probe_outputs_json() {
    let output = run_embedded_bridge_command(vec![
        "probe".to_string(),
        "--steam-path".to_string(),
        String::new(),
        "--app-id".to_string(),
        "39140".to_string(),
    ])
    .unwrap();
    let probe = serde_json::from_str::<SamBridgeProbe>(&output).unwrap();

    assert_eq!(probe.app_id, 39140);
    assert!(probe.bridge_invoked);
    assert!(probe.local_bridge_found);
}

#[test]
fn single_actions_reject_multiple_achievement_ids() {
    let input = SamAchievementActionInput {
        steam_path: "C:\\Steam".to_string(),
        app_id: 1145360,
        action: "unlock".to_string(),
        achievement_ids: vec!["ACH_ONE".to_string(), "ACH_TWO".to_string()],
        backup_path: None,
    };

    let error = validate_achievement_action_input(&input).unwrap_err();
    assert!(error.contains("exactly one"));
}

#[test]
fn selected_actions_allow_multiple_achievement_ids() {
    let input = SamAchievementActionInput {
        steam_path: "C:\\Steam".to_string(),
        app_id: 1145360,
        action: "unlock_selected".to_string(),
        achievement_ids: vec!["ACH_ONE".to_string(), "ACH_TWO".to_string()],
        backup_path: None,
    };

    validate_achievement_action_input(&input).unwrap();
}

#[test]
fn state_diff_separates_target_from_non_target_changes() {
    let before = vec![
        SamAchievementState {
            api_name: "ACH_ONE".to_string(),
            achieved: false,
            unlock_time: 0,
            valid: true,
        },
        SamAchievementState {
            api_name: "ACH_TWO".to_string(),
            achieved: false,
            unlock_time: 0,
            valid: true,
        },
    ];
    let after = vec![
        SamAchievementState {
            api_name: "ACH_ONE".to_string(),
            achieved: true,
            unlock_time: 1,
            valid: true,
        },
        SamAchievementState {
            api_name: "ACH_TWO".to_string(),
            achieved: true,
            unlock_time: 1,
            valid: true,
        },
    ];
    let targets = HashSet::from(["ACH_ONE".to_string()]);

    assert_eq!(
        count_target_achievement_changes(&before, &after, &targets),
        1
    );
    let unexpected = changed_non_target_states(&before, &after, &targets);
    assert_eq!(unexpected.len(), 1);
    assert_eq!(unexpected[0].api_name, "ACH_TWO");
}

#[test]
fn unapplied_target_states_report_ids_that_did_not_change() {
    let after = vec![SamAchievementState {
        api_name: "ACH_LOCK_ME".to_string(),
        achieved: true,
        unlock_time: 1,
        valid: true,
    }];
    let desired = HashMap::from([("ACH_LOCK_ME".to_string(), false)]);

    assert_eq!(
        unapplied_target_states(&after, &desired),
        vec!["ACH_LOCK_ME".to_string()]
    );
}

#[test]
fn unapplied_target_states_report_missing_ids() {
    let after = vec![SamAchievementState {
        api_name: "ACH_OTHER".to_string(),
        achieved: false,
        unlock_time: 0,
        valid: true,
    }];
    let desired = HashMap::from([("ACH_MISSING".to_string(), false)]);

    assert_eq!(
        unapplied_target_states(&after, &desired),
        vec!["ACH_MISSING".to_string()]
    );
}

#[test]
fn unapplied_target_state_details_include_actual_and_desired_values() {
    let after = vec![SamAchievementState {
        api_name: "ACH_LOCK_ME".to_string(),
        achieved: true,
        unlock_time: 1,
        valid: true,
    }];
    let desired = HashMap::from([
        ("ACH_LOCK_ME".to_string(), false),
        ("ACH_MISSING".to_string(), true),
    ]);

    let mut details = unapplied_target_state_details(&after, &desired);
    details.sort();

    assert_eq!(
        details,
        vec![
            "ACH_LOCK_ME:actual=true,desired=false".to_string(),
            "ACH_MISSING:actual=missing,desired=true".to_string(),
        ]
    );
}

#[test]
fn parses_binary_sam_schema_permission_flags() {
    let schema = binary_schema_fixture(
        614910,
        &[
            ("ACH_OPEN", 0),
            ("NEW_ACHIEVEMENT_4_26", 3),
            ("ACH_UNKNOWN", 8),
        ],
    );

    let items = parse_sam_achievement_schema(&schema, 614910).unwrap();
    let by_id: HashMap<_, _> = items
        .iter()
        .map(|item| (item.api_name.as_str(), item))
        .collect();

    assert_eq!(by_id["ACH_OPEN"].permission, 0);
    assert!(!by_id["ACH_OPEN"].protected_achievement);
    assert_eq!(by_id["NEW_ACHIEVEMENT_4_26"].permission, 3);
    assert!(by_id["NEW_ACHIEVEMENT_4_26"].protected_achievement);
    assert_eq!(
        by_id["ACH_UNKNOWN"].flags,
        vec!["UnknownPermission".to_string()]
    );
}

#[test]
fn schema_entries_without_permissions_are_not_treated_as_writable() {
    let mut schema = Vec::new();
    kv_scope(&mut schema, "614910", |bytes| {
        kv_scope(bytes, "stats", |bytes| {
            kv_scope(bytes, "0", |bytes| {
                kv_scope(bytes, "bits", |bytes| {
                    kv_scope(bytes, "0", |bytes| {
                        kv_string(bytes, "name", "ACH_UNVERIFIED");
                    });
                });
            });
        });
    });
    schema.push(8);

    let items = parse_sam_achievement_schema(&schema, 614910).unwrap();
    let permissions = items
        .into_iter()
        .map(|item| (item.api_name.clone(), item))
        .collect::<HashMap<_, _>>();
    let error = ensure_verified_target_permissions(&permissions, &["ACH_UNVERIFIED".to_string()])
        .unwrap_err();
    assert!(error.contains("ACH_UNVERIFIED"));
    assert!(error.contains("no achievements were changed"));
}

#[test]
fn loads_binary_sam_schema_from_steam_appcache_path() {
    let root = temp_dir("sam_schema");
    let stats_dir = root.join("appcache").join("stats");
    fs::create_dir_all(&stats_dir).unwrap();
    fs::write(
        stats_dir.join("UserGameStatsSchema_614910.bin"),
        binary_schema_fixture(614910, &[("ACH_PROTECTED", 1)]),
    )
    .unwrap();

    let items = load_sam_achievement_schema_items(&root.to_string_lossy(), 614910).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].api_name, "ACH_PROTECTED");
    assert!(items[0].protected_achievement);

    let _ = fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn bridge_child_timeout_reports_hung_runner() {
    let child = Command::new("sh")
        .arg("-c")
        .arg("sleep 2")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let error = wait_for_bridge_child(child, Duration::from_millis(10)).unwrap_err();
    assert!(error.contains("timed out"));
}

fn temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("repressurizer_{name}_{nanos}"))
}

fn binary_schema_fixture(app_id: u64, achievements: &[(&str, i32)]) -> Vec<u8> {
    let mut bytes = Vec::new();
    kv_scope(&mut bytes, &app_id.to_string(), |bytes| {
        kv_scope(bytes, "stats", |bytes| {
            kv_scope(bytes, "0", |bytes| {
                kv_string(bytes, "name", "AchievementStats");
                kv_scope(bytes, "bits", |bytes| {
                    for (index, (api_name, permission)) in achievements.iter().enumerate() {
                        kv_scope(bytes, &index.to_string(), |bytes| {
                            kv_string(bytes, "name", api_name);
                            kv_i32(bytes, "permission", *permission);
                        });
                    }
                });
            });
        });
    });
    bytes.push(8);
    bytes
}

fn kv_scope(bytes: &mut Vec<u8>, name: &str, write_children: impl FnOnce(&mut Vec<u8>)) {
    bytes.push(0);
    push_cstring(bytes, name);
    write_children(bytes);
    bytes.push(8);
}

fn kv_string(bytes: &mut Vec<u8>, name: &str, value: &str) {
    bytes.push(1);
    push_cstring(bytes, name);
    push_cstring(bytes, value);
}

fn kv_i32(bytes: &mut Vec<u8>, name: &str, value: i32) {
    bytes.push(2);
    push_cstring(bytes, name);
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_cstring(bytes: &mut Vec<u8>, value: &str) {
    bytes.extend_from_slice(value.as_bytes());
    bytes.push(0);
}
