use repressurizer_lib::steam::{collections, detector};
use std::{env, fs, process};

fn usage() -> ! {
    eprintln!(
        "Repressurizer CLI\n\n\
         Usage:\n\
           repressurizer-cli detect [steam_path]\n\
           repressurizer-cli load <steam_path> <steam_id3>\n\
           repressurizer-cli save <steam_path> <steam_id3> <collections.json>\n\
           repressurizer-cli backup <steam_path> <steam_id3> [description]\n\
           repressurizer-cli list-backups <steam_path> <steam_id3>\n\
           repressurizer-cli restore <steam_path> <steam_id3> <backup_filename>\n\
           repressurizer-cli delete-backup <steam_path> <steam_id3> <backup_filename>\n"
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
            let parsed: Vec<collections::SteamCollection> =
                serde_json::from_str(&data).map_err(|e| format!("invalid collections JSON: {e}"))?;
            collections::save_collections(args[1].clone(), args[2].clone(), parsed)?;
            println!("saved");
            Ok(())
        }
        "backup" => {
            if args.len() < 3 {
                usage();
            }
            let description = args.get(3).cloned().unwrap_or_else(|| "CLI backup".to_string());
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
        _ => usage(),
    }
}

fn two_args(args: &[String]) -> Result<(String, String), String> {
    if args.len() != 3 {
        usage();
    }
    Ok((args[1].clone(), args[2].clone()))
}
