//! Lifecycle supervisor for the embedded API/MCP listener.
//!
//! This module is intentionally small: it owns start/stop decisions and the
//! runtime descriptor, while the API module owns HTTP/MCP transport details.
//! The Tauri process remains the single state owner.

use crate::{
    api, app_data,
    integration_descriptor::{self, EndpointDescriptor},
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub(crate) struct IntegrationRuntime {
    state: Arc<Mutex<RuntimeState>>,
}

#[derive(Default)]
struct RuntimeState {
    generation: u64,
    server: Option<api::EmbeddedApiServer>,
    descriptor: Option<EndpointDescriptor>,
}

impl Drop for RuntimeState {
    fn drop(&mut self) {
        if let Some(server) = self.server.take() {
            server.stop();
        }
        if let Some(descriptor) = self.descriptor.take() {
            let _ = integration_descriptor::remove_descriptor_if_owned(&descriptor.nonce);
        }
    }
}

impl IntegrationRuntime {
    pub(crate) fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(RuntimeState::default())),
        }
    }

    /// Reconcile the listener with the persisted integration toggles.
    ///
    /// The operation is idempotent and serialized inside this process. The
    /// descriptor nonce protects a newer listener if a previous stop completes
    /// after a restart.
    pub(crate) fn sync_from_settings(&self) -> Result<(), String> {
        let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
        let enabled = integrations_enabled(&settings);
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Local integration runtime state is poisoned".to_string())?;

        if enabled {
            if state.server.is_some() {
                return Ok(());
            }
            state.generation = state.generation.wrapping_add(1);
            let server = api::start_embedded()?;
            let descriptor = EndpointDescriptor::new(
                server.address().port(),
                server.token().to_string(),
                Uuid::new_v4().simple().to_string(),
            );
            if let Err(error) = integration_descriptor::write_descriptor(&descriptor) {
                server.stop();
                return Err(error);
            }
            state.descriptor = Some(descriptor);
            state.server = Some(server);
            return Ok(());
        }

        let server = state.server.take();
        let descriptor = state.descriptor.take();
        if server.is_some() || descriptor.is_some() {
            state.generation = state.generation.wrapping_add(1);
        }
        drop(state);

        if let Some(server) = server {
            server.stop();
        }
        if let Some(descriptor) = descriptor {
            let _ = integration_descriptor::remove_descriptor_if_owned(&descriptor.nonce);
        }
        Ok(())
    }

    pub(crate) fn stop(&self) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let server = state.server.take();
        let descriptor = state.descriptor.take();
        if server.is_some() || descriptor.is_some() {
            state.generation = state.generation.wrapping_add(1);
        }
        drop(state);

        if let Some(server) = server {
            server.stop();
        }
        if let Some(descriptor) = descriptor {
            let _ = integration_descriptor::remove_descriptor_if_owned(&descriptor.nonce);
        }
    }

    pub(crate) fn status(&self) -> Value {
        let Ok(state) = self.state.lock() else {
            return json!({"state": "unavailable"});
        };
        let Some(descriptor) = state.descriptor.as_ref() else {
            return json!({
                "state": "stopped",
                "generation": state.generation,
            });
        };
        json!({
            "state": "ready",
            "generation": state.generation,
            "pid": descriptor.pid,
            "baseUrl": descriptor.base_url,
            "protocolVersion": descriptor.protocol_version,
            "appVersion": descriptor.app_version,
        })
    }
}

fn integrations_enabled(settings: &Value) -> bool {
    settings
        .get("apiEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || settings
            .get("mcpEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::integrations_enabled;
    use serde_json::json;

    #[test]
    fn either_integration_toggle_starts_the_shared_runtime() {
        assert!(!integrations_enabled(&json!({})));
        assert!(integrations_enabled(&json!({"apiEnabled": true})));
        assert!(integrations_enabled(&json!({"mcpEnabled": true})));
        assert!(integrations_enabled(
            &json!({"apiEnabled": true, "mcpEnabled": true})
        ));
    }
}
