//! Private discovery and transport helpers for the embedded local integrations.
//!
//! The descriptor is deliberately the only hand-off between the bundled MCP
//! adapter and the running Tauri process. It contains a per-process token and
//! is written atomically inside a user-scoped runtime directory.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub(crate) const DESCRIPTOR_SCHEMA: u32 = 1;
pub(crate) const PROTOCOL_VERSION: &str = "v1";
const DESCRIPTOR_FILE: &str = "endpoint.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EndpointDescriptor {
    pub(crate) schema: u32,
    pub(crate) pid: u32,
    pub(crate) nonce: String,
    pub(crate) base_url: String,
    pub(crate) token: String,
    pub(crate) protocol_version: String,
    pub(crate) app_version: String,
}

impl EndpointDescriptor {
    pub(crate) fn new(port: u16, token: String, nonce: String) -> Self {
        Self {
            schema: DESCRIPTOR_SCHEMA,
            pid: std::process::id(),
            nonce,
            base_url: format!("http://127.0.0.1:{port}"),
            token,
            protocol_version: PROTOCOL_VERSION.to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema != DESCRIPTOR_SCHEMA {
            return Err(format!(
                "Unsupported local integration descriptor schema {}",
                self.schema
            ));
        }
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(format!(
                "Unsupported local integration protocol {}",
                self.protocol_version
            ));
        }
        if self.nonce.trim().is_empty() || self.token.len() < 32 {
            return Err("Local integration descriptor is incomplete".to_string());
        }
        let url = reqwest::Url::parse(&self.base_url)
            .map_err(|error| format!("Invalid local integration endpoint: {error}"))?;
        if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
            return Err("Local integration endpoint must use http://127.0.0.1".to_string());
        }
        if url.username() != ""
            || url.password().is_some()
            || !matches!(url.path(), "" | "/")
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(
                "Local integration endpoint must not contain credentials or a path".to_string(),
            );
        }
        if !url
            .port()
            .is_some_and(|port| (1024..=u16::MAX).contains(&port))
        {
            return Err("Local integration endpoint is missing a port".to_string());
        }
        Ok(())
    }
}

pub(crate) fn runtime_dir() -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "linux") {
        dirs::runtime_dir()
            .or_else(dirs::cache_dir)
            .or_else(dirs::data_dir)
    } else if cfg!(target_os = "macos") {
        dirs::data_dir()
    } else if cfg!(target_os = "windows") {
        dirs::data_local_dir().or_else(dirs::data_dir)
    } else {
        dirs::data_dir()
    };

    let root = base.ok_or("Could not resolve the local integration runtime directory")?;
    let path = if cfg!(target_os = "linux") && dirs::runtime_dir().is_some() {
        root.join("repressurizer")
    } else {
        root.join("Repressurizer").join("runtime")
    };
    std::fs::create_dir_all(&path).map_err(|error| {
        format!(
            "Failed to create local integration runtime directory {}: {error}",
            path.display()
        )
    })?;
    set_private_directory_permissions(&path)?;
    Ok(path)
}

pub(crate) fn descriptor_path() -> Result<PathBuf, String> {
    Ok(runtime_dir()?.join(DESCRIPTOR_FILE))
}

pub(crate) fn write_descriptor(descriptor: &EndpointDescriptor) -> Result<(), String> {
    descriptor.validate()?;
    let path = descriptor_path()?;
    let data = serde_json::to_string_pretty(descriptor)
        .map_err(|error| format!("Failed to serialize local integration descriptor: {error}"))?;
    crate::app_data::write_text_file_atomic(
        &path,
        &format!("{data}\n"),
        "local integration descriptor",
        true,
    )?;
    set_private_file_permissions(&path)
}

pub(crate) fn read_descriptor() -> Result<EndpointDescriptor, String> {
    let path = descriptor_path()?;
    let data = std::fs::read_to_string(&path).map_err(|error| {
        format!(
            "Repressurizer is not running with local integrations enabled ({}): {error}",
            path.display()
        )
    })?;
    let descriptor = serde_json::from_str::<EndpointDescriptor>(&data)
        .map_err(|error| format!("Invalid local integration descriptor: {error}"))?;
    descriptor.validate()?;
    Ok(descriptor)
}

/// Read the descriptor and prove that the advertised Repressurizer endpoint
/// is still serving requests. A process killed outside the normal Tauri quit
/// path cannot remove its descriptor, so callers must not treat the file alone
/// as proof that an integration runtime is alive.
pub(crate) fn read_live_descriptor() -> Result<EndpointDescriptor, String> {
    let descriptor = read_descriptor()?;
    probe_descriptor(&descriptor).map_err(|error| {
        format!("Repressurizer local integration descriptor is stale or unreachable: {error}")
    })?;
    Ok(descriptor)
}

fn probe_descriptor(descriptor: &EndpointDescriptor) -> Result<(), String> {
    let url = reqwest::Url::parse(&descriptor.base_url)
        .map_err(|error| format!("Invalid local integration endpoint: {error}"))?;
    let port = url
        .port()
        .ok_or("Local integration endpoint is missing a port")?;
    let address = format!("127.0.0.1:{port}");
    let mut stream = TcpStream::connect_timeout(
        &address
            .parse()
            .map_err(|error| format!("Invalid local integration address: {error}"))?,
        Duration::from_millis(500),
    )
    .map_err(|error| format!("could not connect to {address}: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(750)))
        .map_err(|error| format!("could not configure probe timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| format!("could not configure probe timeout: {error}"))?;
    write!(
        stream,
        "GET /v1/status HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
        descriptor.token
    )
    .map_err(|error| format!("could not send endpoint probe: {error}"))?;
    stream
        .shutdown(Shutdown::Write)
        .map_err(|error| format!("could not finish endpoint probe: {error}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("could not read endpoint probe: {error}"))?;
    parse_http_json_response(&response)
        .map(|_| ())
        .map_err(|error| format!("endpoint probe failed: {error}"))
}

pub(crate) fn remove_descriptor_if_owned(nonce: &str) -> Result<bool, String> {
    let path = descriptor_path()?;
    let Ok(data) = std::fs::read_to_string(&path) else {
        return Ok(false);
    };
    let Ok(descriptor) = serde_json::from_str::<EndpointDescriptor>(&data) else {
        return Ok(false);
    };
    if descriptor.nonce != nonce {
        return Ok(false);
    }
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Failed to remove local integration descriptor {}: {error}",
            path.display()
        )),
    }
}

pub(crate) fn post_mcp_request(request: &Value) -> Result<Option<Value>, String> {
    let descriptor = read_live_descriptor()?;
    let url = reqwest::Url::parse(&descriptor.base_url)
        .map_err(|error| format!("Invalid local integration endpoint: {error}"))?;
    let port = url
        .port()
        .ok_or("Local integration endpoint is missing a port")?;
    let address = format!("127.0.0.1:{port}");
    let mut stream = TcpStream::connect_timeout(
        &address
            .parse()
            .map_err(|error| format!("Invalid local integration address: {error}"))?,
        Duration::from_secs(5),
    )
    .map_err(|error| format!("Could not connect to the running Repressurizer app: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(15)))
        .map_err(|error| format!("Could not configure MCP adapter timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| format!("Could not configure MCP adapter timeout: {error}"))?;

    let body = serde_json::to_vec(request)
        .map_err(|error| format!("Failed to serialize MCP request: {error}"))?;
    write!(
        stream,
        "POST /mcp HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        descriptor.token,
        body.len()
    )
    .and_then(|_| stream.write_all(&body))
    .map_err(|error| format!("Failed to send MCP request: {error}"))?;
    stream
        .shutdown(Shutdown::Write)
        .map_err(|error| format!("Failed to finish MCP request: {error}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("Failed to read MCP response: {error}"))?;
    parse_http_json_response(&response)
}

fn parse_http_json_response(response: &[u8]) -> Result<Option<Value>, String> {
    let separator = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or("MCP adapter received a malformed HTTP response")?;
    let (headers, body) = response.split_at(separator + 4);
    let status = headers
        .split(|byte| *byte == b'\n')
        .next()
        .and_then(|line| line.split(|byte| *byte == b' ').nth(1))
        .and_then(|value| std::str::from_utf8(value).ok())
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or("MCP adapter received an invalid HTTP status")?;
    if status != 200 {
        let message = String::from_utf8_lossy(body);
        return Err(format!(
            "Embedded MCP endpoint returned HTTP {status}: {message}"
        ));
    }
    if body.is_empty() || body == b"{}" {
        return Ok(None);
    }
    serde_json::from_slice(body)
        .map(Some)
        .map_err(|error| format!("Embedded MCP endpoint returned invalid JSON: {error}"))
}

fn set_private_directory_permissions(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).map_err(
            |error| format!("Failed to protect local integration runtime directory: {error}"),
        )?;
    }
    Ok(())
}

fn set_private_file_permissions(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Failed to protect local integration descriptor: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        parse_http_json_response, probe_descriptor, EndpointDescriptor, DESCRIPTOR_SCHEMA,
        PROTOCOL_VERSION,
    };
    use serde_json::json;
    use std::net::TcpListener;

    fn descriptor() -> EndpointDescriptor {
        EndpointDescriptor {
            schema: DESCRIPTOR_SCHEMA,
            pid: 42,
            nonce: "nonce".to_string(),
            base_url: "http://127.0.0.1:47831".to_string(),
            token: "a".repeat(64),
            protocol_version: PROTOCOL_VERSION.to_string(),
            app_version: "0.6.4".to_string(),
        }
    }

    #[test]
    fn descriptor_rejects_non_loopback_endpoints() {
        let mut descriptor = descriptor();
        descriptor.base_url = "http://0.0.0.0:47831".to_string();
        assert!(descriptor.validate().is_err());
    }

    #[test]
    fn descriptor_rejects_credentials_and_paths() {
        let mut descriptor = descriptor();
        descriptor.base_url = "http://user:pass@127.0.0.1:47831".to_string();
        assert!(descriptor.validate().is_err());
        descriptor.base_url = "http://127.0.0.1:47831/mcp".to_string();
        assert!(descriptor.validate().is_err());
    }

    #[test]
    fn descriptor_accepts_only_the_current_schema_and_protocol() {
        assert!(descriptor().validate().is_ok());
        let mut invalid = descriptor();
        invalid.schema += 1;
        assert!(invalid.validate().is_err());
        let mut invalid = descriptor();
        invalid.protocol_version = "v2".to_string();
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn http_json_parser_preserves_json_rpc_responses_and_notifications() {
        let response = b"HTTP/1.1 200 OK\r\nContent-Length: 25\r\n\r\n{\"jsonrpc\":\"2.0\"}";
        assert_eq!(
            parse_http_json_response(response).unwrap(),
            Some(json!({"jsonrpc": "2.0"}))
        );
        assert_eq!(
            parse_http_json_response(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap(),
            None
        );
    }

    #[test]
    fn live_probe_rejects_a_descriptor_without_a_listener() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("test port should bind");
        let port = listener.local_addr().expect("test address").port();
        drop(listener);

        let mut descriptor = descriptor();
        descriptor.base_url = format!("http://127.0.0.1:{port}");
        assert!(probe_descriptor(&descriptor).is_err());
    }
}
