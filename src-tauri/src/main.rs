#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(exit_code) = repressurizer_lib::steam::sam::run_embedded_bridge_from_env() {
        std::process::exit(exit_code);
    }

    repressurizer_lib::app_channel::delay_preview_autostart_if_needed();
    repressurizer_lib::run()
}
