use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=REPRESSURIZER_CHANNEL");
    println!("cargo:rerun-if-env-changed=REPRESSURIZER_PREVIEW_VERSION");

    prepare_embedded_sam_payload();

    let channel = std::env::var("REPRESSURIZER_CHANNEL").unwrap_or_else(|_| "stable".to_string());
    let version = std::env::var("REPRESSURIZER_PREVIEW_VERSION")
        .or_else(|_| std::env::var("CARGO_PKG_VERSION"))
        .unwrap_or_else(|_| "0.0.0".to_string());

    println!("cargo:rustc-env=REPRESSURIZER_CHANNEL={channel}");
    println!("cargo:rustc-env=REPRESSURIZER_DISPLAY_VERSION={version}");

    tauri_build::build()
}

fn prepare_embedded_sam_payload() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let payload_source = manifest_dir
        .join("binaries")
        .join("repressurizer-sam-embedded.bin");
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let payload = out_dir.join("repressurizer-sam-embedded.bin");

    if payload_source.is_file() {
        fs::copy(&payload_source, &payload).expect("failed to prepare embedded SAM payload");
    } else {
        fs::write(&payload, []).expect("failed to create empty embedded SAM payload");
    }

    println!("cargo:rerun-if-changed={}", payload_source.display());
    println!(
        "cargo:rustc-env=REPRESSURIZER_SAM_EMBEDDED_PAYLOAD={}",
        payload.display()
    );
}
