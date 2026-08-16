//! Bundled MCP stdio adapter.
//!
//! The adapter is intentionally transport-only. Repressurizer owns the
//! state, permissions, and loopback listener; this executable discovers the
//! private descriptor and forwards JSON-RPC messages to that process.

use repressurizer_lib::mcp;

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        None => {
            if let Err(error) = mcp::run_stdio() {
                eprintln!("error: {error}");
                std::process::exit(1);
            }
        }
        Some("--self-test") if args.next().is_none() => match mcp::self_test_for_cli() {
            Ok(result) => match serde_json::to_string_pretty(&result) {
                Ok(serialized) => println!("{serialized}"),
                Err(error) => {
                    eprintln!("error: failed to serialize self-test result: {error}");
                    std::process::exit(1);
                }
            },
            Err(error) => {
                eprintln!("error: {error}");
                std::process::exit(1);
            }
        },
        _ => {
            eprintln!("usage: repressurizer-mcp [--self-test]");
            std::process::exit(2);
        }
    }
}
