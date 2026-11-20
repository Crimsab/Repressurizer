use semver::Version;
use serde::Serialize;
use std::path::Path;

const PORTABLE_MARKER: &str = "repressurizer-portable.marker";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum UpdaterKind {
    WindowsInstaller,
    WindowsPortable,
    LinuxAppimage,
    LinuxSystemPackage,
    MacosApp,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct UpdaterCapability {
    pub(crate) kind: UpdaterKind,
    pub(crate) can_install: bool,
}

pub(crate) fn current_capability() -> UpdaterCapability {
    let executable = std::env::current_exe().ok();
    let executable_name = executable
        .as_deref()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str());
    let portable_marker = executable
        .as_deref()
        .and_then(Path::parent)
        .is_some_and(|directory| directory.join(PORTABLE_MARKER).is_file());
    let appimage = std::env::var_os("APPIMAGE").is_some_and(|value| !value.is_empty());

    classify_runtime(
        std::env::consts::OS,
        executable_name,
        portable_marker,
        appimage,
    )
}

pub(crate) fn current_manifest_target() -> Option<&'static str> {
    manifest_target(std::env::consts::OS, std::env::consts::ARCH)
}

/// Decides whether a remote release should replace the running build.
///
/// Channel manifests only publish releases of their own channel, so a stable
/// release that is older than the running beta only arrives after the user
/// switched that beta back to the stable channel. That return is allowed; every
/// other case installs newer versions only.
pub(crate) fn accepts_release(current: &Version, remote: &Version) -> bool {
    remote > current || (is_numbered_beta(current) && remote.pre.is_empty())
}

fn is_numbered_beta(version: &Version) -> bool {
    version
        .pre
        .as_str()
        .strip_prefix("beta.")
        .is_some_and(|number| !number.is_empty() && number.bytes().all(|b| b.is_ascii_digit()))
}

fn manifest_target(operating_system: &str, architecture: &str) -> Option<&'static str> {
    match (operating_system, architecture) {
        ("windows", "x86_64") => Some("windows-x86_64"),
        ("linux", "x86_64") => Some("linux-x86_64"),
        ("macos", "aarch64") => Some("darwin-aarch64"),
        ("macos", "x86_64") => Some("darwin-x86_64"),
        _ => None,
    }
}

fn classify_runtime(
    operating_system: &str,
    executable_name: Option<&str>,
    portable_marker: bool,
    appimage: bool,
) -> UpdaterCapability {
    match operating_system {
        "windows" => {
            let portable_name =
                executable_name.is_some_and(|name| name.to_ascii_lowercase().contains("portable"));
            if portable_marker || portable_name {
                UpdaterCapability {
                    kind: UpdaterKind::WindowsPortable,
                    can_install: false,
                }
            } else {
                UpdaterCapability {
                    kind: UpdaterKind::WindowsInstaller,
                    can_install: true,
                }
            }
        }
        "linux" if appimage => UpdaterCapability {
            kind: UpdaterKind::LinuxAppimage,
            can_install: true,
        },
        "linux" => UpdaterCapability {
            kind: UpdaterKind::LinuxSystemPackage,
            can_install: false,
        },
        "macos" => UpdaterCapability {
            kind: UpdaterKind::MacosApp,
            can_install: true,
        },
        _ => UpdaterCapability {
            kind: UpdaterKind::Unsupported,
            can_install: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        accepts_release, classify_runtime, manifest_target, UpdaterCapability, UpdaterKind,
    };
    use semver::Version;

    fn accepts(current: &str, remote: &str) -> bool {
        accepts_release(
            &Version::parse(current).unwrap(),
            &Version::parse(remote).unwrap(),
        )
    }

    #[test]
    fn installs_newer_releases_on_every_channel() {
        assert!(accepts("0.8.6", "0.8.7"));
        assert!(accepts("0.8.0-beta.1", "0.8.0-beta.2"));
        assert!(accepts("0.8.0-beta.2", "0.8.0"));
        assert!(accepts("0.0.0-preview.12", "0.0.0-preview.13"));
    }

    #[test]
    fn lets_a_beta_return_to_an_older_stable_release() {
        assert!(accepts("0.9.0-beta.2", "0.8.7"));
    }

    #[test]
    fn shipped_config_requires_version_bound_update_signatures() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater: tauri_plugin_updater::Config =
            serde_json::from_value(config["plugins"]["updater"].clone()).unwrap();
        assert!(updater.require_signed_version);
    }

    #[test]
    fn never_downgrades_outside_a_beta_returning_to_stable() {
        assert!(!accepts("0.8.7", "0.8.6"));
        assert!(!accepts("0.8.7", "0.8.7"));
        assert!(!accepts("0.9.0-beta.2", "0.9.0-beta.1"));
        assert!(!accepts("0.9.0-beta.2", "0.9.0-beta.2"));
        assert!(!accepts("0.0.0-preview.12", "0.0.0-preview.11"));
        assert!(!accepts("0.9.0-beta", "0.8.7"));
    }

    #[test]
    fn windows_installer_supports_in_app_updates() {
        assert_eq!(
            classify_runtime("windows", Some("repressurizer.exe"), false, false),
            UpdaterCapability {
                kind: UpdaterKind::WindowsInstaller,
                can_install: true,
            }
        );
    }

    #[test]
    fn windows_portable_name_disables_in_place_updates() {
        assert_eq!(
            classify_runtime("windows", Some("Repressurizer-portable.exe"), false, false),
            UpdaterCapability {
                kind: UpdaterKind::WindowsPortable,
                can_install: false,
            }
        );
    }

    #[test]
    fn windows_portable_marker_survives_an_executable_rename() {
        assert_eq!(
            classify_runtime("windows", Some("renamed.exe"), true, false).kind,
            UpdaterKind::WindowsPortable
        );
    }

    #[test]
    fn only_linux_appimages_support_in_app_updates() {
        assert!(classify_runtime("linux", Some("repressurizer"), false, true).can_install);
        assert_eq!(
            classify_runtime("linux", Some("repressurizer"), false, false).kind,
            UpdaterKind::LinuxSystemPackage
        );
    }

    #[test]
    fn macos_app_bundles_support_in_place_updates() {
        assert_eq!(
            classify_runtime("macos", Some("repressurizer"), false, false),
            UpdaterCapability {
                kind: UpdaterKind::MacosApp,
                can_install: true,
            }
        );
    }

    #[test]
    fn unconfigured_platforms_do_not_offer_installation() {
        assert_eq!(
            classify_runtime("freebsd", Some("repressurizer"), false, false),
            UpdaterCapability {
                kind: UpdaterKind::Unsupported,
                can_install: false,
            }
        );
    }

    #[test]
    fn manifest_targets_match_release_platform_names() {
        assert_eq!(manifest_target("windows", "x86_64"), Some("windows-x86_64"));
        assert_eq!(manifest_target("linux", "x86_64"), Some("linux-x86_64"));
        assert_eq!(manifest_target("macos", "aarch64"), Some("darwin-aarch64"));
        assert_eq!(manifest_target("macos", "x86_64"), Some("darwin-x86_64"));
        assert_eq!(manifest_target("windows", "aarch64"), None);
    }
}
