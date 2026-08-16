//! User-selected capability profiles shared by MCP and the local HTTP API.
//!
//! The profile is intentionally scoped to Repressurizer's own domain.  It is
//! not an operating-system permission and it never grants arbitrary shell,
//! filesystem, or network access to a connected agent.

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionMode {
    ReadOnly,
    ManageLibrary,
    Full,
}

impl PermissionMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "readOnly",
            Self::ManageLibrary => "manageLibrary",
            Self::Full => "full",
        }
    }

    pub const fn allows_library_writes(self) -> bool {
        matches!(self, Self::ManageLibrary | Self::Full)
    }

    pub const fn allows_full_writes(self) -> bool {
        matches!(self, Self::Full)
    }
}

pub fn from_settings(settings: Option<&Value>) -> PermissionMode {
    match settings
        .and_then(|value| value.get("mcpPermissionMode"))
        .and_then(Value::as_str)
    {
        Some("manageLibrary") => PermissionMode::ManageLibrary,
        Some("full") => PermissionMode::Full,
        _ => PermissionMode::ReadOnly,
    }
}

pub fn require_library_writes(mode: PermissionMode) -> Result<(), String> {
    if mode.allows_library_writes() {
        Ok(())
    } else {
        Err("This operation is disabled by the current integration profile. Choose Manage library or Full in Settings > Integrations, then reconnect the agent.".to_string())
    }
}

pub fn require_full_writes(mode: PermissionMode) -> Result<(), String> {
    if mode.allows_full_writes() {
        Ok(())
    } else {
        Err("This operation requires the Full Repressurizer integration profile. Select Full in Settings > Integrations, then reconnect the agent.".to_string())
    }
}

pub fn require_confirmation(args: &Value, operation: &str) -> Result<(), String> {
    if args.get("confirm").and_then(Value::as_bool) == Some(true) {
        Ok(())
    } else {
        Err(format!(
            "{operation} changes local data. Re-run it with confirm=true after showing the exact change to the user."
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{from_settings, require_confirmation, PermissionMode};
    use serde_json::json;

    #[test]
    fn defaults_to_read_only_and_recognizes_profiles() {
        assert_eq!(from_settings(None), PermissionMode::ReadOnly);
        assert_eq!(
            from_settings(Some(&json!({"mcpPermissionMode": "manageLibrary"}))),
            PermissionMode::ManageLibrary
        );
        assert_eq!(
            from_settings(Some(&json!({"mcpPermissionMode": "full"}))),
            PermissionMode::Full
        );
    }

    #[test]
    fn writes_need_explicit_confirmation() {
        assert!(require_confirmation(&json!({}), "test").is_err());
        assert!(require_confirmation(&json!({"confirm": true}), "test").is_ok());
    }
}
