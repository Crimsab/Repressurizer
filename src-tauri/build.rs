fn main() {
    println!("cargo:rerun-if-env-changed=REPRESSURIZER_CHANNEL");
    println!("cargo:rerun-if-env-changed=REPRESSURIZER_PREVIEW_VERSION");

    let channel = std::env::var("REPRESSURIZER_CHANNEL").unwrap_or_else(|_| "stable".to_string());
    let version = std::env::var("REPRESSURIZER_PREVIEW_VERSION")
        .or_else(|_| std::env::var("CARGO_PKG_VERSION"))
        .unwrap_or_else(|_| "0.0.0".to_string());

    println!("cargo:rustc-env=REPRESSURIZER_CHANNEL={channel}");
    println!("cargo:rustc-env=REPRESSURIZER_DISPLAY_VERSION={version}");

    tauri_build::build()
}
