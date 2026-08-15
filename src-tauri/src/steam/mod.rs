pub mod api;
pub mod collections;
pub mod depressurizer_database;
pub mod depressurizer_profile;
pub mod detector;
pub mod legacy_sharedconfig;
pub mod local_library;
#[cfg(all(feature = "no-sam", feature = "sam-sidecar"))]
compile_error!("no-sam and sam-sidecar are mutually exclusive diagnostic/build features");
#[cfg(feature = "no-sam")]
#[path = "sam_disabled.rs"]
pub mod sam;
#[cfg(all(not(feature = "no-sam"), feature = "sam-sidecar"))]
pub mod sam;
#[cfg(all(not(feature = "no-sam"), not(feature = "sam-sidecar")))]
#[path = "sam_client.rs"]
pub mod sam;
pub mod shortcuts;
