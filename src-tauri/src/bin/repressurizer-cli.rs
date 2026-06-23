use repressurizer_lib::{
    automation,
    steam::{collections, detector, sam},
};
use serde_json::{json, Value};
use std::{env, fs, path::PathBuf, process};

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
           repressurizer-cli sam schema <steam_path> <app_id>\n"
    );
    process::exit(2);
}

fn print_json<T: serde::Serialize>(value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    println!("{text}");
    Ok(())
}

fn main() {
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
        _ => usage(),
    }
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
