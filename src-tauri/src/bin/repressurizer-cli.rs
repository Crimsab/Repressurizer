use repressurizer_integration::{
    parse_library_snapshot_str, summarize_snapshot, verify_library_snapshot_checksum,
};
use repressurizer_lib::{
    automation,
    steam::{collections, detector, sam},
};
use serde_json::{json, Value};
use std::{env, fs, io::Read, path::PathBuf, process};

const GENERAL_HELP: &str = r#"Repressurizer CLI

Usage:
  repressurizer-cli help
  repressurizer-cli version
  repressurizer-cli detect [steam_path]
  repressurizer-cli load <steam_path> <steam_id3>
  repressurizer-cli save <steam_path> <steam_id3> <collections.json>
  repressurizer-cli backup <steam_path> <steam_id3> [description]
  repressurizer-cli list-backups <steam_path> <steam_id3>
  repressurizer-cli restore <steam_path> <steam_id3> <backup_filename>
  repressurizer-cli delete-backup <steam_path> <steam_id3> <backup_filename>
  repressurizer-cli cache-info
  repressurizer-cli settings show
  repressurizer-cli diagnostics <steam_path> <steam_id3> <steam_id64>
  repressurizer-cli snapshot export [output.json]
  repressurizer-cli snapshot validate <snapshot.json>
  repressurizer-cli automation status
  repressurizer-cli automation publish-now
  repressurizer-cli sam help
  repressurizer-cli sam probe <steam_path> <app_id>
  repressurizer-cli sam schema <steam_path> <app_id>
  repressurizer-cli sam achievements <app_id> [filter]
  repressurizer-cli sam backups <app_id>
  repressurizer-cli sam backup-dir <app_id>
  repressurizer-cli sam unlock <app_id> <achievement_id...> --yes
  repressurizer-cli sam lock <app_id> <achievement_id...> --yes
  repressurizer-cli sam unlock-all <app_id> --yes
  repressurizer-cli sam lock-all <app_id> --yes
  repressurizer-cli sam restore <app_id> <backup_path> --yes
  repressurizer-cli sam action <input.json|-> --yes
"#;

const SAM_HELP: &str = r#"Repressurizer CLI SAM commands

Read-only:
  repressurizer-cli sam probe <steam_path> <app_id>
  repressurizer-cli sam schema <steam_path> <app_id>
  repressurizer-cli sam achievements <app_id> [filter]
  repressurizer-cli sam backups <app_id>
  repressurizer-cli sam backup-dir <app_id>

Write-capable, requires --yes and Steam Tools write settings enabled:
  repressurizer-cli sam unlock <app_id> <achievement_id...> --yes
  repressurizer-cli sam lock <app_id> <achievement_id...> --yes
  repressurizer-cli sam unlock-all <app_id> --yes
  repressurizer-cli sam lock-all <app_id> --yes
  repressurizer-cli sam restore <app_id> <backup_path> --yes
  repressurizer-cli sam action <input.json|-> --yes

Short write commands use the Steam path saved by Repressurizer setup.
"#;

fn usage() -> ! {
    eprintln!("{}", GENERAL_HELP.trim_end());
    process::exit(2);
}

fn print_json<T: serde::Serialize>(value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    println!("{text}");
    Ok(())
}

fn print_help(text: &str) -> Result<(), String> {
    println!("{}", text.trim_end());
    Ok(())
}

fn main() {
    if let Some(exit_code) = sam::run_embedded_bridge_from_env() {
        process::exit(exit_code);
    }

    if let Err(error) = run() {
        eprintln!("error: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage();
    };

    match command {
        "help" | "--help" | "-h" => print_help(GENERAL_HELP),
        "version" => print_json(&json!({
            "name": "Repressurizer CLI",
            "version": env!("CARGO_PKG_VERSION"),
        })),
        "detect" => {
            let info = if let Some(path) = args.get(1) {
                detector::detect_steam_at(path.clone())?
            } else {
                detector::detect_steam()?
            };
            print_json(&info)
        }
        "load" => {
            let (steam_path, steam_id3) = two_args(&args)?;
            let collections = collections::load_collections(steam_path, steam_id3)?;
            print_json(&collections)
        }
        "save" => {
            if args.len() != 4 {
                usage();
            }
            let data = fs::read_to_string(&args[3])
                .map_err(|e| format!("failed to read {}: {}", args[3], e))?;
            let parsed: Vec<collections::SteamCollection> = serde_json::from_str(&data)
                .map_err(|e| format!("invalid collections JSON: {e}"))?;
            collections::save_collections(args[1].clone(), args[2].clone(), parsed)?;
            println!("saved");
            Ok(())
        }
        "backup" => {
            if args.len() < 3 {
                usage();
            }
            let description = args
                .get(3)
                .cloned()
                .unwrap_or_else(|| "CLI backup".to_string());
            collections::create_manual_backup(args[1].clone(), args[2].clone(), description)?;
            println!("backup created");
            Ok(())
        }
        "list-backups" => {
            let (steam_path, steam_id3) = two_args(&args)?;
            let backups = collections::list_backups(steam_path, steam_id3)?;
            print_json(&backups)
        }
        "restore" => {
            if args.len() != 4 {
                usage();
            }
            collections::restore_backup(args[1].clone(), args[2].clone(), args[3].clone())?;
            println!("restored");
            Ok(())
        }
        "delete-backup" => {
            if args.len() != 4 {
                usage();
            }
            collections::delete_backup(args[1].clone(), args[2].clone(), args[3].clone())?;
            println!("deleted");
            Ok(())
        }
        "cache-info" => print_json(&cache_info()),
        "settings" => settings_command(&args[1..]),
        "diagnostics" => {
            if args.len() != 4 {
                usage();
            }
            print_json(&diagnostics(&args[1], &args[2], &args[3]))
        }
        "snapshot" => snapshot_command(&args[1..]),
        "automation" => automation_command(&args[1..]),
        "sam" => sam_command(&args[1..]),
        _ => usage(),
    }
}

fn two_args(args: &[String]) -> Result<(String, String), String> {
    if args.len() != 3 {
        usage();
    }
    Ok((args[1].clone(), args[2].clone()))
}

fn snapshot_command(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("export") if args.len() <= 2 => snapshot_export_command(args.get(1)),
        Some("validate") if args.len() == 2 => snapshot_validate_command(&args[1]),
        _ => usage(),
    }
}

fn snapshot_export_command(path: Option<&String>) -> Result<(), String> {
    let snapshot = block_on(automation::build_snapshot_from_settings())?;
    let output = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
    if let Some(path) = path {
        fs::write(path, output).map_err(|error| format!("failed to write {path}: {error}"))?;
        println!("snapshot exported to {path}");
        Ok(())
    } else {
        println!("{output}");
        Ok(())
    }
}

fn snapshot_validate_command(path: &str) -> Result<(), String> {
    let data = fs::read_to_string(path)
        .map_err(|error| format!("failed to read snapshot {path}: {error}"))?;
    match parse_library_snapshot_str(&data) {
        Ok(snapshot) => {
            let summary = summarize_snapshot(&snapshot);
            print_json(&json!({
                "valid": true,
                "path": path,
                "schemaVersion": snapshot.schema_version,
                "generatedAt": snapshot.generated_at,
                "source": snapshot.source,
                "checksum": snapshot.checksum,
                "checksumValid": verify_library_snapshot_checksum(&snapshot),
                "summary": {
                    "games": summary.games,
                    "collections": summary.collections,
                    "hltb": summary.hltb,
                    "achievements": summary.achievements,
                    "wishlist": summary.wishlist,
                    "familyShared": summary.family_shared,
                    "collectionOnly": summary.collection_only,
                    "missingDetails": summary.missing_details,
                },
            }))
        }
        Err(error) => {
            print_json(&json!({
                "valid": false,
                "path": path,
                "error": error.to_string(),
            }))?;
            Err("snapshot validation failed".to_string())
        }
    }
}

fn settings_command(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("show") if args.len() == 1 => settings_show(),
        _ => usage(),
    }
}

fn settings_show() -> Result<(), String> {
    let path = settings_path()?;
    let path_text = path.display().to_string();
    let data = match fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) => {
            return print_json(&json!({
                "settingsAvailable": false,
                "path": path_text,
                "error": format!("failed to read settings file: {error}"),
            }));
        }
    };
    let settings = match serde_json::from_str::<Value>(&data) {
        Ok(settings) => settings,
        Err(error) => {
            return print_json(&json!({
                "settingsAvailable": false,
                "path": path_text,
                "error": format!("failed to parse settings file: {error}"),
            }));
        }
    };
    print_json(&settings_summary(&settings, &path_text))
}

fn automation_command(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("status") if args.len() == 1 => {
            print_json(&automation::automation_status_from_settings()?)
        }
        Some("publish-now") if args.len() == 1 => {
            let status = block_on(automation::publish_now_for_cli())?;
            print_json(&status)
        }
        _ => usage(),
    }
}

fn sam_command(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("help") | Some("--help") | Some("-h") => print_help(SAM_HELP),
        Some("probe") if args.len() == 3 => {
            let app_id = parse_app_id(&args[2])?;
            let probe = sam::probe_sam_bridge_for_cli(args[1].clone(), app_id);
            print_json(&probe)
        }
        Some("schema") if args.len() == 3 => {
            let app_id = parse_app_id(&args[2])?;
            let schema = sam::load_sam_achievement_schema(args[1].clone(), app_id)?;
            print_json(&schema)
        }
        Some("achievements") if args.len() == 2 || args.len() == 3 => {
            let app_id = parse_app_id(&args[1])?;
            let filter = args.get(2).map(String::as_str);
            let steam_path = saved_steam_path()?;
            let schema = sam::load_sam_achievement_schema(steam_path, app_id)?;
            let achievements = filter_sam_schema_items(schema, filter);
            print_json(&json!({
                "appId": app_id,
                "filter": filter,
                "count": achievements.len(),
                "achievements": achievements,
            }))
        }
        Some("backups") if args.len() == 2 => {
            let app_id = parse_app_id(&args[1])?;
            let backups = sam::list_sam_backups(app_id)?;
            print_json(&backups)
        }
        Some("backup-dir") if args.len() == 2 => {
            let app_id = parse_app_id(&args[1])?;
            let path = sam::sam_backup_dir(app_id)?;
            print_json(&json!({ "path": path }))
        }
        Some("action") if args.len() == 3 && args[2] == "--yes" => {
            let input = read_sam_action_input(&args[1])?;
            let result = sam::sam_achievement_action(input)?;
            print_json(&result)
        }
        Some("action") => Err(
            "SAM action writes to Steam achievement state. Re-run with: sam action <input.json|-> --yes"
                .to_string(),
        ),
        Some("unlock") | Some("lock") | Some("unlock-all") | Some("lock-all") | Some("restore") => {
            run_sam_short_action(args)
        }
        _ => usage(),
    }
}

fn run_sam_short_action(args: &[String]) -> Result<(), String> {
    if let Some(command) = args.first().map(String::as_str) {
        if args.last().map(String::as_str) != Some("--yes") {
            return Err(format!(
                "SAM {command} writes to Steam achievement state. Re-run with --yes."
            ));
        }
    }
    let steam_path = saved_steam_path()?;
    let input = short_sam_action_input(args, steam_path)?;
    let result = sam::sam_achievement_action(input)?;
    print_json(&result)
}

fn short_sam_action_input(
    args: &[String],
    steam_path: String,
) -> Result<sam::SamAchievementActionInput, String> {
    let Some(command) = args.first().map(String::as_str) else {
        usage();
    };
    if args.last().map(String::as_str) != Some("--yes") {
        return Err(format!(
            "SAM {command} writes to Steam achievement state. Re-run with --yes."
        ));
    }

    let app_id = args
        .get(1)
        .ok_or_else(|| format!("sam {command} needs an appId"))?
        .as_str();
    let app_id = parse_app_id(app_id)?;
    match command {
        "unlock" | "lock" => {
            if args.len() < 4 {
                return Err(format!(
                    "sam {command} needs at least one achievement API name"
                ));
            }
            let achievement_ids = args[2..args.len() - 1]
                .iter()
                .filter(|id| !id.trim().is_empty())
                .cloned()
                .collect::<Vec<_>>();
            if achievement_ids.is_empty() {
                return Err(format!(
                    "sam {command} needs at least one achievement API name"
                ));
            }
            Ok(sam::SamAchievementActionInput {
                steam_path,
                app_id,
                action: if command == "unlock" {
                    "unlock_selected".to_string()
                } else {
                    "lock_selected".to_string()
                },
                achievement_ids,
                backup_path: None,
            })
        }
        "unlock-all" | "lock-all" => {
            if args.len() != 3 {
                return Err(format!("sam {command} usage: sam {command} <app_id> --yes"));
            }
            Ok(sam::SamAchievementActionInput {
                steam_path,
                app_id,
                action: if command == "unlock-all" {
                    "unlock_all".to_string()
                } else {
                    "lock_all".to_string()
                },
                achievement_ids: Vec::new(),
                backup_path: None,
            })
        }
        "restore" => {
            if args.len() != 4 {
                return Err(
                    "sam restore usage: sam restore <app_id> <backup_path> --yes".to_string(),
                );
            }
            Ok(sam::SamAchievementActionInput {
                steam_path,
                app_id,
                action: "restore_backup".to_string(),
                achievement_ids: Vec::new(),
                backup_path: args.get(2).cloned(),
            })
        }
        _ => usage(),
    }
}

fn read_sam_action_input(path: &str) -> Result<sam::SamAchievementActionInput, String> {
    let raw = if path == "-" {
        let mut input = String::new();
        std::io::stdin()
            .read_to_string(&mut input)
            .map_err(|error| format!("failed to read SAM action input from stdin: {error}"))?;
        input
    } else {
        fs::read_to_string(path)
            .map_err(|error| format!("failed to read SAM action input {path}: {error}"))?
    };
    parse_sam_action_input(&raw)
}

fn parse_sam_action_input(raw: &str) -> Result<sam::SamAchievementActionInput, String> {
    serde_json::from_str(raw).map_err(|error| format!("invalid SAM action JSON: {error}"))
}

fn saved_steam_path() -> Result<String, String> {
    let settings = read_settings_json().map_err(|error| {
        format!(
            "No saved Steam path found. Complete Repressurizer setup first or use sam action JSON. ({error})"
        )
    })?;
    settings
        .get("steamPath")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| {
            "No saved Steam path found. Complete Repressurizer setup first or use sam action JSON."
                .to_string()
        })
}

fn read_settings_json() -> Result<Value, String> {
    let path = settings_path()?;
    let data = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read settings file {}: {error}", path.display()))?;
    serde_json::from_str::<Value>(&data)
        .map_err(|error| format!("failed to parse settings file {}: {error}", path.display()))
}

fn settings_path() -> Result<PathBuf, String> {
    app_data_dir()
        .map(|dir| dir.join("settings.json"))
        .ok_or_else(|| "Could not resolve Repressurizer app data directory".to_string())
}

fn block_on<T>(future: impl std::future::Future<Output = Result<T, String>>) -> Result<T, String> {
    tokio::runtime::Runtime::new()
        .map_err(|error| format!("failed to start async runtime: {error}"))?
        .block_on(future)
}

fn parse_app_id(value: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("invalid app_id: {value}"))
}

fn cache_info() -> Value {
    let Some(dir) = app_data_dir() else {
        return json!({
            "available": false,
            "path": null,
            "files": {},
        });
    };
    let size = |name: &str| -> u64 {
        fs::metadata(dir.join(name))
            .map(|meta| meta.len())
            .unwrap_or(0)
    };
    json!({
        "available": true,
        "path": dir,
        "files": {
            "settings": size("settings.json"),
            "details": size("details_cache.json"),
            "hltb": size("hltb_cache.json"),
            "failed": size("failed_games.json"),
            "achievements": size("achievements.json"),
            "friends": size("friends.json"),
            "wishlist": size("wishlist.json"),
            "steamFamily": size("steam_family.json"),
        }
    })
}

fn diagnostics(steam_path: &str, steam_id3: &str, steam_id64: &str) -> Value {
    let data_dir = app_data_dir();
    let settings = read_settings_json().ok();
    let collections_path = PathBuf::from(steam_path)
        .join("userdata")
        .join(steam_id3)
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json");
    let cache_size = |name: &str| -> u64 {
        data_dir
            .as_ref()
            .and_then(|dir| fs::metadata(dir.join(name)).ok())
            .map(|meta| meta.len())
            .unwrap_or(0)
    };
    let backup_count = collections_path
        .parent()
        .and_then(|dir| fs::read_dir(dir).ok())
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    (name.starts_with("cloud-storage-namespace-1.backup-")
                        || name.starts_with("cloud-storage-namespace-1.pre-restore-"))
                        && name.ends_with(".json")
                })
                .count()
        })
        .unwrap_or(0);

    json!({
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "app": {
            "name": "Repressurizer",
            "version": env!("CARGO_PKG_VERSION"),
            "surface": "cli",
        },
        "system": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "steam": {
            "path": steam_path,
            "steamId3": redact_tail(steam_id3),
            "steamId64": redact_tail(steam_id64),
            "collectionsFileExists": collections_path.exists(),
            "collectionsFileSize": fs::metadata(&collections_path).map(|meta| meta.len()).ok(),
            "backupCount": backup_count,
        },
        "appData": {
            "path": data_dir,
            "detailsCacheBytes": cache_size("details_cache.json"),
            "hltbCacheBytes": cache_size("hltb_cache.json"),
            "failedGamesBytes": cache_size("failed_games.json"),
            "achievementsBytes": cache_size("achievements.json"),
            "friendsBytes": cache_size("friends.json"),
            "wishlistBytes": cache_size("wishlist.json"),
            "steamFamilyBytes": cache_size("steam_family.json"),
            "settingsBytes": cache_size("settings.json"),
        },
        "network": settings
            .as_ref()
            .map(settings_network_summary)
            .unwrap_or(Value::Null),
        "privacy": {
            "apiKeyIncluded": false,
            "proxyCredentialsIncluded": false,
            "steamIdsRedacted": true,
        }
    })
}

fn settings_summary(settings: &Value, path: &str) -> Value {
    let network = settings_network_summary(settings);

    json!({
        "settingsAvailable": true,
        "path": path,
        "setupComplete": setting_bool(settings, "setupComplete"),
        "steam": {
            "steamPathConfigured": setting_configured(settings, "steamPath"),
            "steamPath": string_or_null(setting_str(settings, "steamPath")),
            "steamId3": string_or_null(&redact_tail(setting_str(settings, "steamId3"))),
            "steamId64": string_or_null(&redact_tail(setting_str(settings, "steamId64"))),
            "personaName": string_or_null(setting_str(settings, "steamPersonaName")),
        },
        "credentials": {
            "apiKeyConfigured": setting_configured(settings, "apiKey"),
            "steamFamilyStoreTokenConfigured": steam_family_token_configured(),
        },
        "automation": {
            "publishEnabled": setting_bool(settings, "automationPublishEnabled"),
            "publishUrlConfigured": setting_configured(settings, "automationPublishUrl"),
            "intervalHours": setting_u64(settings, "automationPublishIntervalHours"),
            "lastChecksum": string_or_null(setting_str(settings, "automationPublishLastChecksum")),
            "lastPublishedAt": string_or_null(setting_str(settings, "automationPublishLastPublishedAt")),
            "lastAttemptedAt": string_or_null(setting_str(settings, "automationPublishLastAttemptedAt")),
            "lastStatus": string_or_null(setting_str(settings, "automationPublishLastStatus")),
            "lastMessage": string_or_null(setting_str(settings, "automationPublishLastMessage")),
            "lastHttpStatus": settings.get("automationPublishLastHttpStatus").cloned().unwrap_or(Value::Null),
            "bearerTokenConfigured": setting_configured(settings, "automationPublishBearerToken"),
        },
        "fetch": network["fetch"].clone(),
        "proxy": network["proxy"].clone(),
        "steamTools": {
            "enabled": setting_bool(settings, "steamToolsEnabled"),
            "achievementWritesEnabled": setting_bool(settings, "steamToolsAchievementWritesEnabled"),
            "cardFarmingEnabled": setting_bool(settings, "steamToolsCardFarmingEnabled"),
            "maxConcurrentIdleApps": setting_u64(settings, "steamToolsMaxConcurrentIdleApps"),
            "minPlaytimeMinutes": setting_u64(settings, "steamToolsMinPlaytimeMinutes"),
        },
        "startup": {
            "minimizeToTray": setting_bool(settings, "minimizeToTray"),
            "startOnLogin": setting_bool(settings, "startOnLogin"),
            "startOnLoginMode": string_or_null(setting_str(settings, "startOnLoginMode")),
            "checkUpdatesOnStartup": setting_bool(settings, "checkUpdatesOnStartup"),
            "desktopNotifications": setting_bool(settings, "desktopNotifications"),
        },
        "privacy": {
            "apiKeyIncluded": false,
            "bearerTokenIncluded": false,
            "proxyCredentialsIncluded": false,
            "steamFamilyStoreTokenIncluded": false,
            "steamIdsRedacted": true,
        }
    })
}

fn settings_network_summary(settings: &Value) -> Value {
    let proxy_settings = settings.get("proxySettings").unwrap_or(&Value::Null);
    let proxy_scopes = proxy_settings.get("scopes").unwrap_or(&Value::Null);
    let proxy_profiles = proxy_settings.get("profiles").and_then(Value::as_array);
    let proxy_profile_count = proxy_profiles.map(|profiles| profiles.len()).unwrap_or(0);
    let proxy_enabled_profile_count = proxy_profiles
        .map(|profiles| {
            profiles
                .iter()
                .filter(|profile| value_bool_default(profile, "enabled", true))
                .count()
        })
        .unwrap_or(0);

    json!({
        "fetch": {
            "steamDetailsDelayMs": setting_u64_default(settings, "steamDetailsDelayMs", 1200),
            "steamRatingsDelayMs": setting_u64_default(settings, "steamRatingsDelayMs", 1200),
            "steamRatingsCooldownMinutes": setting_u64_default(settings, "steamRatingsCooldownMinutes", 5),
            "hltbBatchDelayMs": setting_u64_default(settings, "hltbBatchDelayMs", 500),
            "achievementsBatchDelayMs": setting_u64_default(settings, "achievementsBatchDelayMs", 300),
            "autoFetchDetailsOnRefresh": setting_bool_default(settings, "autoFetchDetailsOnRefresh", true),
            "autoFetchHltbOnRefresh": setting_bool_default(settings, "autoFetchHltbOnRefresh", true),
            "libraryRefreshCacheMode": value_str_default(settings, "libraryRefreshCacheMode", "full"),
        },
        "proxy": {
            "enabled": value_bool_default(proxy_settings, "enabled", false),
            "mode": value_str_default(proxy_settings, "mode", "roundRobin"),
            "activeProfileConfigured": !value_str_default(proxy_settings, "activeProfileId", "").trim().is_empty(),
            "profileCount": proxy_profile_count,
            "enabledProfileCount": proxy_enabled_profile_count,
            "scopes": {
                "steamApi": value_bool_default(proxy_scopes, "steamApi", true),
                "steamStore": value_bool_default(proxy_scopes, "steamStore", true),
                "hltb": value_bool_default(proxy_scopes, "hltb", true),
                "automation": value_bool_default(proxy_scopes, "automation", false),
            },
            "proxyCredentialsIncluded": false,
        }
    })
}

fn filter_sam_schema_items(
    items: Vec<sam::SamAchievementSchemaItem>,
    filter: Option<&str>,
) -> Vec<sam::SamAchievementSchemaItem> {
    let Some(needle) = filter.map(str::trim).filter(|value| !value.is_empty()) else {
        return items;
    };
    let needle = needle.to_ascii_lowercase();
    items
        .into_iter()
        .filter(|item| {
            item.api_name.to_ascii_lowercase().contains(&needle)
                || item
                    .flags
                    .iter()
                    .any(|flag| flag.to_ascii_lowercase().contains(&needle))
                || (item.protected_achievement && "protected".contains(&needle))
        })
        .collect()
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join("Repressurizer"))
}

fn steam_family_token_configured() -> bool {
    app_data_dir()
        .map(|dir| dir.join("steam_family_token.json"))
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|data| !data.trim().is_empty())
        .unwrap_or(false)
}

fn setting_bool(settings: &Value, key: &str) -> bool {
    settings.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn setting_bool_default(settings: &Value, key: &str, default: bool) -> bool {
    settings
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn setting_u64(settings: &Value, key: &str) -> u64 {
    settings.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn setting_u64_default(settings: &Value, key: &str, default: u64) -> u64 {
    settings.get(key).and_then(Value::as_u64).unwrap_or(default)
}

fn setting_str<'a>(settings: &'a Value, key: &str) -> &'a str {
    settings.get(key).and_then(Value::as_str).unwrap_or("")
}

fn value_bool_default(value: &Value, key: &str, default: bool) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn value_str_default<'a>(value: &'a Value, key: &str, default: &'a str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or(default)
}

fn setting_configured(settings: &Value, key: &str) -> bool {
    !setting_str(settings, key).trim().is_empty()
}

fn string_or_null(value: &str) -> Value {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Value::Null
    } else {
        Value::String(trimmed.to_string())
    }
}

fn redact_tail(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let tail = value
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    format!("***{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sam_action_input_json() {
        let input = parse_sam_action_input(
            r#"{
              "steamPath": "C:\\Program Files (x86)\\Steam",
              "appId": 632470,
              "action": "unlock_selected",
              "achievementIds": ["ACH_ONE"],
              "backupPath": null
            }"#,
        )
        .expect("valid SAM action input");

        assert_eq!(input.app_id, 632470);
        assert_eq!(input.action, "unlock_selected");
        assert_eq!(input.achievement_ids, vec!["ACH_ONE"]);
        assert!(input.backup_path.is_none());
    }

    #[test]
    fn rejects_invalid_sam_action_input_json() {
        let error =
            parse_sam_action_input(r#"{"appId":632470}"#).expect_err("missing fields should fail");

        assert!(error.contains("invalid SAM action JSON"));
    }

    #[test]
    fn builds_short_sam_unlock_input_from_args() {
        let steam_path = "C:\\Program Files (x86)\\Steam".to_string();
        let args = vec![
            "unlock".to_string(),
            "632470".to_string(),
            "ACH_ONE".to_string(),
            "ACH_TWO".to_string(),
            "--yes".to_string(),
        ];
        let input = short_sam_action_input(&args, steam_path).expect("short SAM action");

        assert_eq!(input.steam_path, "C:\\Program Files (x86)\\Steam");
        assert_eq!(input.app_id, 632470);
        assert_eq!(input.action, "unlock_selected");
        assert_eq!(input.achievement_ids, vec!["ACH_ONE", "ACH_TWO"]);
        assert!(input.backup_path.is_none());
    }

    #[test]
    fn short_sam_actions_require_yes() {
        let steam_path = "C:\\Program Files (x86)\\Steam".to_string();
        let args = vec![
            "unlock".to_string(),
            "632470".to_string(),
            "ACH_ONE".to_string(),
        ];
        let error = short_sam_action_input(&args, steam_path).expect_err("--yes is required");

        assert!(error.contains("Re-run with --yes"));
    }

    #[test]
    fn settings_summary_redacts_sensitive_values() {
        let settings = json!({
            "setupComplete": true,
            "steamPath": "C:\\Program Files (x86)\\Steam",
            "steamId3": "123456",
            "steamId64": "76561198000012345",
            "steamPersonaName": "Player",
            "apiKey": "secret",
            "automationPublishBearerToken": "secret-token",
            "automationPublishEnabled": true,
            "automationPublishUrl": "https://example.test/snapshot",
            "automationPublishIntervalHours": 12,
            "steamDetailsDelayMs": 1500,
            "steamRatingsDelayMs": 2500,
            "steamRatingsCooldownMinutes": 7,
            "hltbBatchDelayMs": 750,
            "achievementsBatchDelayMs": 650,
            "autoFetchDetailsOnRefresh": false,
            "autoFetchHltbOnRefresh": true,
            "libraryRefreshCacheMode": "basic",
            "proxySettings": {
                "enabled": true,
                "mode": "batch",
                "activeProfileId": "proxy-a",
                "scopes": {
                    "steamApi": true,
                    "steamStore": false,
                    "hltb": true,
                    "automation": true
                },
                "profiles": [
                    {
                        "id": "proxy-a",
                        "name": "Primary",
                        "type": "http",
                        "host": "127.0.0.1",
                        "port": 8080,
                        "username": "proxy-user",
                        "password": "proxy-secret",
                        "enabled": true,
                        "batchSize": 3
                    },
                    {
                        "id": "proxy-b",
                        "name": "Disabled",
                        "type": "socks5",
                        "host": "127.0.0.2",
                        "port": 1080,
                        "enabled": false
                    }
                ]
            },
            "steamToolsEnabled": true,
            "steamToolsAchievementWritesEnabled": true,
        });
        let summary = settings_summary(&settings, "/tmp/settings.json");

        assert_eq!(summary["steam"]["steamId3"], "***3456");
        assert_eq!(summary["steam"]["steamId64"], "***2345");
        assert_eq!(summary["credentials"]["apiKeyConfigured"], true);
        assert_eq!(summary["automation"]["bearerTokenConfigured"], true);
        assert_eq!(summary["fetch"]["steamDetailsDelayMs"], 1500);
        assert_eq!(summary["fetch"]["steamRatingsCooldownMinutes"], 7);
        assert_eq!(summary["fetch"]["autoFetchDetailsOnRefresh"], false);
        assert_eq!(summary["fetch"]["libraryRefreshCacheMode"], "basic");
        assert_eq!(summary["proxy"]["enabled"], true);
        assert_eq!(summary["proxy"]["mode"], "batch");
        assert_eq!(summary["proxy"]["activeProfileConfigured"], true);
        assert_eq!(summary["proxy"]["profileCount"], 2);
        assert_eq!(summary["proxy"]["enabledProfileCount"], 1);
        assert_eq!(summary["proxy"]["scopes"]["steamStore"], false);
        assert_eq!(summary["proxy"]["scopes"]["automation"], true);
        assert_eq!(summary["proxy"]["proxyCredentialsIncluded"], false);
        assert_eq!(summary["privacy"]["apiKeyIncluded"], false);
        assert_eq!(summary["privacy"]["proxyCredentialsIncluded"], false);

        let encoded = serde_json::to_string(&summary).expect("summary serializes");
        assert!(!encoded.contains("secret"));
        assert!(!encoded.contains("proxy-user"));
        assert!(!encoded.contains("127.0.0.1"));
    }

    #[test]
    fn filters_sam_schema_by_api_name_flags_and_protected_status() {
        let items = vec![
            sam::SamAchievementSchemaItem {
                api_name: "ACH_STORY_ONE".to_string(),
                permission: 0,
                protected_achievement: false,
                flags: vec!["story".to_string()],
            },
            sam::SamAchievementSchemaItem {
                api_name: "ACH_ONLINE_ONLY".to_string(),
                permission: 1,
                protected_achievement: true,
                flags: vec!["online".to_string()],
            },
        ];

        assert_eq!(
            filter_sam_schema_items(items.clone(), Some("story")).len(),
            1
        );
        assert_eq!(
            filter_sam_schema_items(items.clone(), Some("ONLINE")).len(),
            1
        );
        assert_eq!(filter_sam_schema_items(items, Some("protected")).len(), 1);
    }
}
