use super::{
    preserve_newer_automation_status, read_optional_text_file, should_sync_app_data,
    validate_app_data_key,
};
use crate::app_data::write_text_file_atomic_validated;

fn temp_test_path(prefix: &str) -> std::path::PathBuf {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "repressurizer-{}-{}-{}.json",
        prefix,
        std::process::id(),
        unique
    ))
}

#[test]
fn app_data_key_accepts_existing_storage_names() {
    for key in [
        "settings.json",
        "tags.json",
        "statuses.json",
        "reviews.json",
        "notes.json",
        "hltb_ignored.json",
        "play_history.json",
        "steam_apps_index.json",
        "steam_family.json",
        "steam_family_token.json",
        "steam_ratings_cache.json",
        "depressurizer-profile-import.json",
        "details_cache.json",
        "hltb_cache.json",
        "failed_games.json",
        "achievements.json",
        "friends.json",
        "wishlist.json",
    ] {
        assert!(validate_app_data_key(key).is_ok(), "{key} should be valid");
    }
}

#[test]
fn app_data_key_rejects_paths_and_hidden_files() {
    for key in [
        "",
        ".env",
        "../settings.json",
        "settings/backup.json",
        "settings\\backup.json",
        "settings..json",
        "settings.",
        "settings json",
        "settings:json",
        "CON",
        "nul.json",
        "COM1.txt",
        "LPT9",
    ] {
        assert!(
            validate_app_data_key(key).is_err(),
            "{key} should be invalid"
        );
    }
}

#[test]
fn app_data_sync_policy_keeps_user_data_durable_and_skips_regenerable_caches() {
    for key in [
        "settings.json",
        "notes.json",
        "reviews.json",
        "steam_family_token.json",
    ] {
        assert!(should_sync_app_data(key), "{key} should sync to disk");
    }

    for key in [
        "steam_apps_index.json",
        "steam_ratings_cache.json",
        "details_cache.json",
    ] {
        assert!(!should_sync_app_data(key), "{key} should skip sync");
    }
}

#[test]
fn optional_text_read_distinguishes_missing_files() {
    let path = temp_test_path("missing");
    let _ = std::fs::remove_file(&path);

    assert_eq!(read_optional_text_file(&path, "test file").unwrap(), None);
}

#[test]
fn optional_text_read_returns_existing_file_contents() {
    let path = temp_test_path("existing");
    std::fs::write(&path, "{\"ok\":true}").unwrap();

    let result = read_optional_text_file(&path, "test file").unwrap();
    let _ = std::fs::remove_file(&path);

    assert_eq!(result.as_deref(), Some("{\"ok\":true}"));
}

#[test]
fn validated_atomic_write_rejects_invalid_data_without_replacing_target() {
    let path = temp_test_path("atomic-validation");
    std::fs::write(&path, "{\"safe\":true}").unwrap();

    let result =
        write_text_file_atomic_validated(&path, "{not-json", "test JSON", true, |candidate| {
            serde_json::from_str::<serde_json::Value>(candidate)
                .map(|_| ())
                .map_err(|error| error.to_string())
        });

    assert!(result.is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"safe\":true}");
    let _ = std::fs::remove_file(path);
}

#[test]
fn validated_atomic_write_replaces_target_after_verifying_temp_file() {
    let path = temp_test_path("atomic-success");
    std::fs::write(&path, "{\"version\":1}").unwrap();

    write_text_file_atomic_validated(&path, "{\"version\":2}", "test JSON", true, |candidate| {
        serde_json::from_str::<serde_json::Value>(candidate)
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
    .unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"version\":2}");
    let _ = std::fs::remove_file(path);
}

#[test]
fn settings_save_preserves_newer_automation_status() {
    let mut incoming = serde_json::json!({
        "theme": "light",
        "automationPublishLastAttemptedAt": "2026-07-09T10:00:00.000Z",
        "automationPublishLastStatus": "running",
    });
    let current = serde_json::json!({
        "theme": "dark",
        "automationPublishLastAttemptedAt": "2026-07-09T10:01:00.000Z",
        "automationPublishLastStatus": "success",
        "automationPublishLastMessage": "Published",
        "automationPublishLogs": [{ "status": "success" }],
    });

    preserve_newer_automation_status(&mut incoming, &current);

    assert_eq!(incoming["theme"], "light");
    assert_eq!(incoming["automationPublishLastStatus"], "success");
    assert_eq!(incoming["automationPublishLastMessage"], "Published");
    assert_eq!(incoming["automationPublishLogs"][0]["status"], "success");
}
