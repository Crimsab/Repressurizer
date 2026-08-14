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
    use super::{classify_runtime, UpdaterCapability, UpdaterKind};

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
}
