use repressurizer_lib::{
    automation,
    steam::{collections, detector, sam},
};
use serde_json::{json, Value};
use std::{env, fs, io::Read, path::PathBuf, process};

fn usage() -> ! {
    eprintln!(
        "Repressurizer CLI\n\n\
         Usage:\n\
           repressurizer-cli version\n\
           repressurizer-cli detect [steam_path]\n\
           repressurizer-cli load <steam_path> <steam_id3>\n\
           repressurizer-cli save <steam_path> <steam_id3> <collections.json>\n\
           repressurizer-cli backup <steam_path> <steam_id3> [description]\n\
           repressurizer-cli list-backups <steam_path> <steam_id3>\n\
           repressurizer-cli restore <steam_path> <steam_id3> <backup_filename>\n\
           repressurizer-cli delete-backup <steam_path> <steam_id3> <backup_filename>\n\
           repressurizer-cli cache-info\n\
           repressurizer-cli diagnostics <steam_path> <steam_id3> <steam_id64>\n\
           repressurizer-cli snapshot export [output.json]\n\
           repressurizer-cli automation status\n\
           repressurizer-cli automation publish-now\n\
           repressurizer-cli sam probe <steam_path> <app_id>\n\
           repressurizer-cli sam schema <steam_path> <app_id>\n\
           repressurizer-cli sam backups <app_id>\n\
           repressurizer-cli sam backup-dir <app_id>\n\
           repressurizer-cli sam unlock <app_id> <achievement_id...> --yes\n\
           repressurizer-cli sam lock <app_id> <achievement_id...> --yes\n\
           repressurizer-cli sam unlock-all <app_id> --yes\n\
           repressurizer-cli sam lock-all <app_id> --yes\n\
           repressurizer-cli sam restore <app_id> <backup_path> --yes\n\
           repressurizer-cli sam action <input.json|-> --yes\n"
    );
    process::exit(2);
}

fn print_json<T: serde::Serialize>(value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    println!("{text}");
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
    if args.first().map(String::as_str) != Some("export") || args.len() > 2 {
        usage();
    }
    let snapshot = block_on(automation::build_snapshot_from_settings())?;
    let output = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
    if let Some(path) = args.get(1) {
        fs::write(path, output).map_err(|error| format!("failed to write {path}: {error}"))?;
        println!("snapshot exported to {path}");
        Ok(())
    } else {
        println!("{output}");
        Ok(())
    }
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
    let path = app_data_dir()
        .map(|dir| dir.join("settings.json"))
        .ok_or_else(|| "Could not resolve Repressurizer app data directory".to_string())?;
    let data = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read settings file {}: {error}", path.display()))?;
    serde_json::from_str::<Value>(&data)
        .map_err(|error| format!("failed to parse settings file {}: {error}", path.display()))
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
        "privacy": {
            "apiKeyIncluded": false,
            "steamIdsRedacted": true,
        }
    })
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join("Repressurizer"))
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
}
