use repressurizer_lib::steam::sam::probe_sam_bridge_for_cli;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "help".to_string());

    match command.as_str() {
        "probe" => probe(args.collect()),
        "help" | "--help" | "-h" => {
            println!("repressurizer-sam-bridge probe --steam-path <path> [--app-id <appid>]");
            Ok(())
        }
        other => Err(format!("unknown command: {other}")),
    }
}

fn probe(args: Vec<String>) -> Result<(), String> {
    let mut steam_path = String::new();
    let mut app_id = 0_u64;
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--steam-path" => {
                steam_path = iter.next().ok_or("--steam-path needs a value")?;
            }
            "--app-id" => {
                let value = iter.next().ok_or("--app-id needs a value")?;
                app_id = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --app-id value: {value}"))?;
            }
            "--json" => {}
            other => return Err(format!("unknown probe argument: {other}")),
        }
    }

    let probe = probe_sam_bridge_for_cli(steam_path, app_id);
    let json = serde_json::to_string(&probe).map_err(|error| error.to_string())?;
    println!("{json}");
    Ok(())
}
