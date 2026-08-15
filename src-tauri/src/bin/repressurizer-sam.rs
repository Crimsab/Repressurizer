//! Standalone SAM bridge sidecar.
//!
//! The main Repressurizer process intentionally does not link the SAM bridge.
//! This binary is packaged next to it on Windows and is launched only for an
//! explicit SAM probe, schema read, or achievement action.

#[cfg(not(feature = "sam-sidecar"))]
fn main() {
    eprintln!("repressurizer-sam was built without the SAM sidecar feature");
    std::process::exit(2);
}

#[cfg(feature = "sam-sidecar")]
fn main() {
    if let Some(exit_code) = repressurizer_lib::steam::sam::run_embedded_bridge_from_env() {
        std::process::exit(exit_code);
    }

    eprintln!("repressurizer-sam requires --repressurizer-sam-bridge");
    std::process::exit(2);
}
