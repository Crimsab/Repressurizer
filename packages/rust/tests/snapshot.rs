use repressurizer_integration::{
    compute_library_snapshot_checksum, diff_library_snapshots, get_snapshot_hltb,
    index_snapshot_by_app_id, parse_library_snapshot_str, validate_library_snapshot,
    verify_library_snapshot_checksum, LibrarySnapshot, LibrarySnapshotGame,
    LIBRARY_SNAPSHOT_SCHEMA_JSON, LIBRARY_SNAPSHOT_SCHEMA_VERSION,
};

const FIXTURE: &str = include_str!("fixtures/repressurizer-library-snapshot-v1.json");

#[test]
fn accepts_the_canonical_snapshot_fixture() {
    let snapshot = parse_library_snapshot_str(FIXTURE).expect("fixture should parse");

    assert_eq!(snapshot.schema_version, LIBRARY_SNAPSHOT_SCHEMA_VERSION);
    assert!(verify_library_snapshot_checksum(&snapshot));
    assert!(LIBRARY_SNAPSHOT_SCHEMA_JSON.contains("Repressurizer Library Snapshot v1"));
}

#[test]
fn indexes_games_and_exposes_hltb_by_app_id() {
    let snapshot = parse_library_snapshot_str(FIXTURE).expect("fixture should parse");
    let games = index_snapshot_by_app_id(&snapshot);

    assert_eq!(
        games.get(&632470).map(|game| game.name.as_str()),
        Some("Disco Elysium")
    );
    assert_eq!(
        get_snapshot_hltb(&snapshot, 632470).and_then(|hltb| hltb.main_story),
        Some(23.0)
    );
}

#[test]
fn diffs_snapshots_by_app_id() {
    let previous = parse_library_snapshot_str(FIXTURE).expect("fixture should parse");
    let mut next = previous.clone();
    next.games[0].playtime_forever_minutes = 240;
    next.games[0].playtime_forever_hours = 4.0;
    next.games.push(LibrarySnapshotGame {
        app_id: 1145360,
        name: "Hades".to_string(),
        playtime_forever_minutes: 0,
        playtime_forever_hours: 0.0,
        rtime_last_played: 0,
        last_played_at: None,
        is_collection_only: false,
        collections: Vec::new(),
        details: None,
        hltb: None,
    });
    next.summary.game_count = 2;
    next.checksum = compute_library_snapshot_checksum(&next);

    let diff = diff_library_snapshots(&previous, &next);

    assert_eq!(
        diff.added
            .iter()
            .map(|game| game.app_id)
            .collect::<Vec<_>>(),
        vec![1145360]
    );
    assert_eq!(
        diff.changed
            .iter()
            .map(|item| item.after.app_id)
            .collect::<Vec<_>>(),
        vec![632470]
    );
    assert!(diff.removed.is_empty());
}

#[test]
fn reports_validation_errors() {
    let mut snapshot: LibrarySnapshot =
        serde_json::from_str(FIXTURE).expect("fixture should parse");
    snapshot.schema_version = "wrong".to_string();
    snapshot.games.push(snapshot.games[0].clone());
    snapshot.summary.game_count = snapshot.games.len();

    let issues = validate_library_snapshot(&snapshot, false).expect_err("validation should fail");

    assert!(issues.iter().any(|issue| issue.path == "$.schemaVersion"));
    assert!(issues.iter().any(|issue| issue.path == "$.games[1].appId"));
}
