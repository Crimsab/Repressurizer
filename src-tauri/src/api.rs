//! Authenticated loopback HTTP API for local agents and scripts.
//!
//! This is deliberately a small HTTP adapter over the MCP read model. It
//! binds to 127.0.0.1, requires a per-process bearer token for every endpoint
//! except health, caps request sizes, and delegates all writes to the same
//! permission-checked operations used by MCP.

use crate::{
    app_data, integration_access, integration_descriptor,
    mcp::{self, ReadModel, ReadModelCache},
};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub const API_VERSION: &str = "v1";
pub const DEFAULT_PORT: u16 = 47_831;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 128 * 1024;

/// Handle for the API/MCP listener embedded in the Tauri process.
///
/// The listener owns the authoritative process boundary. The bundled CLI
/// never starts a second state owner; it discovers this listener through the
/// private runtime descriptor and speaks HTTP to it.
pub(crate) struct EmbeddedApiServer {
    address: SocketAddr,
    token: String,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl EmbeddedApiServer {
    pub(crate) fn address(&self) -> SocketAddr {
        self.address
    }

    pub(crate) fn token(&self) -> &str {
        &self.token
    }

    pub(crate) fn stop(mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

impl Drop for EmbeddedApiServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

pub(crate) fn start_embedded() -> Result<EmbeddedApiServer, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("failed to bind embedded local API: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("failed to resolve embedded local API address: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("failed to configure embedded local API listener: {error}"))?;

    let token = generate_token();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let expected_host = format!("127.0.0.1:{}", address.port());
    let thread_name = format!("repressurizer-local-api-{}", address.port());
    let thread_token = token.clone();
    let join = thread::Builder::new()
        .name(thread_name)
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    log::error!("Failed to start embedded local integration runtime: {error}");
                    return;
                }
            };
            let mut cache = ReadModelCache::default();
            while !thread_stop.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((mut stream, _peer)) => {
                        if let Err(error) = handle_connection(
                            &mut stream,
                            &thread_token,
                            &expected_host,
                            &runtime,
                            &mut cache,
                        ) {
                            let _ = write_response(
                                &mut stream,
                                error_response(400, "invalid_request", error),
                            );
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(25));
                    }
                    Err(error) => {
                        log::error!("Embedded local integration listener failed: {error}");
                        break;
                    }
                }
            }
        })
        .map_err(|error| format!("failed to start embedded local API thread: {error}"))?;

    Ok(EmbeddedApiServer {
        address,
        token,
        stop,
        join: Some(join),
    })
}

struct ApiRequest {
    method: String,
    target: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

struct ApiResponse {
    status: u16,
    body: Option<Value>,
    headers: Vec<(String, String)>,
}

pub fn status_for_cli() -> Result<Value, String> {
    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    let port = configured_port(&settings);
    let mode = integration_access::from_settings(Some(&settings));
    let descriptor = integration_descriptor::read_live_descriptor().ok();
    Ok(json!({
        "enabled": settings.get("apiEnabled").and_then(Value::as_bool).unwrap_or(false),
        "transport": "http",
        "bind": "127.0.0.1",
        "running": descriptor.is_some(),
        "port": descriptor
            .as_ref()
            .and_then(|value| reqwest::Url::parse(&value.base_url).ok()?.port())
            .unwrap_or(port),
        "baseUrl": descriptor.as_ref().map(|value| format!("{}/v1", value.base_url)).unwrap_or_else(|| format!("http://127.0.0.1:{port}/v1")),
        "permissionMode": mode.as_str(),
        "tokenCommand": "repressurizer-cli api token",
        "serveCommand": if descriptor.is_some() { "embedded in Repressurizer".to_string() } else { format!("repressurizer-cli api serve --port {port}") },
        "cors": "disabled",
        "writesRequireConfirmation": true,
    }))
}

pub fn token_for_cli() -> Result<Value, String> {
    let (token, source) = if let Ok(descriptor) = integration_descriptor::read_live_descriptor() {
        (descriptor.token, "embedded-runtime")
    } else {
        (load_or_create_token()?, "legacy-cli-server")
    };
    Ok(json!({
        "token": token,
        "scheme": "Bearer",
        "source": source,
        "note": "Keep this token local. It is required for every API request except /v1/health and is never included in URLs or logs.",
    }))
}

pub fn serve_for_cli(port_override: Option<u16>) -> Result<(), String> {
    if integration_descriptor::read_live_descriptor().is_ok() {
        return Err(
            "Repressurizer already owns the local integration listener. The API is automatic; do not start a second server."
                .to_string(),
        );
    }
    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    if !settings
        .get("apiEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(
            "Local API is disabled. Enable it in Settings > Integrations > MCP/API before starting the server."
                .to_string(),
        );
    }
    let port = port_override.unwrap_or_else(|| configured_port(&settings));
    let token = load_or_create_token()?;
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|error| format!("failed to bind local API on 127.0.0.1:{port}: {error}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|error| format!("failed to configure local API listener: {error}"))?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("failed to start local API runtime: {error}"))?;
    let mut cache = ReadModelCache::default();
    let expected_host = format!("127.0.0.1:{port}");

    println!(
        "{}",
        serde_json::to_string(&json!({
            "listening": format!("http://127.0.0.1:{port}/{API_VERSION}"),
            "health": format!("http://127.0.0.1:{port}/{API_VERSION}/health"),
            "auth": "Bearer token from repressurizer-cli api token",
            "cors": "disabled",
        }))
        .map_err(|error| format!("failed to serialize API startup status: {error}"))?
    );

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                if let Err(error) =
                    handle_connection(&mut stream, &token, &expected_host, &runtime, &mut cache)
                {
                    let _ =
                        write_response(&mut stream, error_response(400, "invalid_request", error));
                }
            }
            Err(error) => return Err(format!("local API listener failed: {error}")),
        }
    }
    Ok(())
}

fn configured_port(settings: &Value) -> u16 {
    settings
        .get("apiPort")
        .and_then(Value::as_u64)
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port >= 1024)
        .unwrap_or(DEFAULT_PORT)
}

fn load_or_create_token() -> Result<String, String> {
    let path = app_data::app_data_file_path("api_token")?;
    if let Ok(token) = std::fs::read_to_string(&path) {
        let token = token.trim().to_string();
        if token.len() >= 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Ok(token);
        }
    }
    let token = generate_token();
    app_data::write_text_file_atomic(&path, &format!("{token}\n"), "API token", true)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(token)
}

fn generate_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn is_authorized(headers: &HashMap<String, String>, token: &str) -> bool {
    let Some(value) = headers.get("authorization") else {
        return false;
    };
    let Some(provided) = value.strip_prefix("Bearer ") else {
        return false;
    };
    provided.as_bytes().ct_eq(token.as_bytes()).into()
}

fn handle_connection(
    stream: &mut TcpStream,
    token: &str,
    expected_host: &str,
    runtime: &tokio::runtime::Runtime,
    cache: &mut ReadModelCache,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| format!("failed to set API read timeout: {error}"))?;
    let request = read_request(stream)?;
    let response = if request
        .headers
        .get("host")
        .map(String::as_str)
        .is_some_and(|host| host == expected_host)
    {
        runtime.block_on(handle_request(request, token, cache))
    } else {
        error_response(
            400,
            "invalid_host",
            "The local integration endpoint requires the loopback Host header.",
        )
    };
    write_response(stream, response)
}

fn read_request(stream: &TcpStream) -> Result<ApiRequest, String> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|error| error.to_string())?);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|error| format!("failed to read HTTP request line: {error}"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or("missing HTTP method")?
        .to_ascii_uppercase();
    let target = parts.next().ok_or("missing HTTP target")?.to_string();
    let version = parts.next().ok_or("missing HTTP version")?;
    if version != "HTTP/1.1" && version != "HTTP/1.0" {
        return Err("unsupported HTTP version".to_string());
    }

    let mut headers = HashMap::new();
    let mut header_bytes = request_line.len();
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|error| format!("failed to read HTTP headers: {error}"))?;
        header_bytes = header_bytes.saturating_add(line.len());
        if header_bytes > MAX_HEADER_BYTES {
            return Err("HTTP headers exceed the 16 KiB limit".to_string());
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        let (name, value) = line.split_once(':').ok_or("malformed HTTP header")?;
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }

    let length = headers
        .get("content-length")
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "invalid Content-Length".to_string())
        })
        .transpose()?
        .unwrap_or(0);
    if length > MAX_BODY_BYTES {
        return Err("HTTP request body exceeds the 128 KiB limit".to_string());
    }
    let mut body = vec![0; length];
    reader
        .read_exact(&mut body)
        .map_err(|error| format!("failed to read HTTP request body: {error}"))?;
    Ok(ApiRequest {
        method,
        target,
        headers,
        body,
    })
}

async fn handle_request(
    request: ApiRequest,
    token: &str,
    cache: &mut ReadModelCache,
) -> ApiResponse {
    let (path, query) = split_target(&request.target);
    if path == format!("/{API_VERSION}/health") {
        if request.method != "GET" {
            return error_response(
                405,
                "method_not_allowed",
                "Use GET for the health endpoint.",
            );
        }
        let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
        let mode = integration_access::from_settings(Some(&settings));
        return json_response(
            200,
            json!({
                "ok": true,
                "apiVersion": API_VERSION,
                "apiEnabled": settings.get("apiEnabled").and_then(Value::as_bool).unwrap_or(false),
                "permissionMode": mode.as_str(),
            }),
        );
    }
    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    let api_enabled = settings
        .get("apiEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mcp_enabled = settings
        .get("mcpEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let is_mcp_route = path == "/mcp";
    let is_status_route = path == format!("/{API_VERSION}/status");
    let route_enabled = if is_mcp_route {
        mcp_enabled
    } else if is_status_route {
        api_enabled || mcp_enabled
    } else {
        api_enabled
    };
    if !route_enabled {
        return error_response(
            403,
            if is_mcp_route {
                "mcp_disabled"
            } else {
                "api_disabled"
            },
            if is_mcp_route {
                "MCP is disabled in Settings > Integrations > MCP/API."
            } else {
                "Local API is disabled in Settings > Integrations > MCP/API."
            },
        );
    }
    if !is_authorized(&request.headers, token) {
        let mut response = error_response(
            401,
            "unauthorized",
            "Provide the local API token with Authorization: Bearer <token>.",
        );
        response
            .headers
            .push(("WWW-Authenticate".to_string(), "Bearer".to_string()));
        return response;
    }
    if is_mcp_route {
        if request.method != "POST" {
            return error_response(405, "method_not_allowed", "Use POST for the MCP endpoint.");
        }
        let message = match serde_json::from_slice::<Value>(&request.body) {
            Ok(value) => value,
            Err(error) => return error_response(400, "invalid_json", error.to_string()),
        };
        return match mcp::dispatch_request_with_cache(message, cache).await {
            Ok(Some(value)) => json_response(200, value),
            Ok(None) => json_response(200, json!({})),
            Err(error) => error_response(500, "mcp_error", error),
        };
    }
    if !path.starts_with(&format!("/{API_VERSION}/")) {
        return error_response(404, "not_found", "Unknown API route.");
    }

    let mut response = match (request.method.as_str(), path.as_str()) {
        ("GET", route) if route == format!("/{API_VERSION}/status") => json_response(
            200,
            json!({
                "ok": true,
                "appVersion": env!("CARGO_PKG_VERSION"),
                "apiVersion": API_VERSION,
                "apiEnabled": api_enabled,
                "mcpEnabled": mcp_enabled,
                "permissionMode": integration_access::from_settings(Some(&settings)).as_str(),
                "stateLoaded": true,
            }),
        ),
        ("GET", route) if route == format!("/{API_VERSION}/permissions") => {
            let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
            let mode = integration_access::from_settings(Some(&settings));
            json_response(
                200,
                json!({
                    "permissionMode": mode.as_str(),
                    "writesRequireConfirmation": true,
                    "capabilities": {
                        "read": true,
                        "manageLibrary": mode.allows_library_writes(),
                        "full": mode.allows_full_writes(),
                    }
                }),
            )
        }
        ("GET", route) if route == format!("/{API_VERSION}/library/summary") => {
            match load_snapshot(cache).await {
                Ok(model) => match mcp::read_tool_value(
                    model.snapshot(),
                    model.play_history(),
                    "library_summary",
                    &json!({}),
                ) {
                    Ok(value) => data_response(value, model.snapshot()),
                    Err(error) => error_response(503, "snapshot_unavailable", error),
                },
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("GET", route) if route == format!("/{API_VERSION}/library") => {
            match load_snapshot(cache).await {
                Ok(model) => list_snapshot_games(&request, &query, model.snapshot()),
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("GET", route) if route == format!("/{API_VERSION}/games") => {
            match load_snapshot(cache).await {
                Ok(model) => list_games(&request, &query, model.snapshot()),
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("GET", route) if route.starts_with(&format!("/{API_VERSION}/games/")) => {
            match load_snapshot(cache).await {
                Ok(model) => get_game(route, model.snapshot()),
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("GET", route) if route == format!("/{API_VERSION}/collections") => {
            match load_snapshot(cache).await {
                Ok(model) => list_collection_values(&request, &query, model.snapshot()),
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("GET", route) if route == format!("/{API_VERSION}/play-history") => {
            let model = ReadModel::from_play_history();
            list_history_values(&request, &query, model.play_history())
        }
        ("GET", route) if route == format!("/{API_VERSION}/recommendations") => {
            match load_snapshot(cache).await {
                Ok(model) => recommendations(&query, model.snapshot(), model.play_history()),
                Err(error) => error_response(503, "snapshot_unavailable", error),
            }
        }
        ("POST", route) if route == format!("/{API_VERSION}/collections/membership") => {
            write_tool(&request, "set_collection_membership", cache).await
        }
        ("POST", route) if route == format!("/{API_VERSION}/collections") => {
            write_tool(&request, "create_collection", cache).await
        }
        ("POST", route) if route == format!("/{API_VERSION}/sam/action") => {
            write_tool(&request, "sam_achievement_action", cache).await
        }
        _ => error_response(404, "not_found", "Unknown API route."),
    };
    apply_conditional(&request, &mut response);
    response
}

async fn load_snapshot(cache: &mut ReadModelCache) -> Result<ReadModel, String> {
    cache.load().await
}

async fn write_tool(request: &ApiRequest, name: &str, cache: &mut ReadModelCache) -> ApiResponse {
    let args = match serde_json::from_slice::<Value>(&request.body) {
        Ok(value) if value.is_object() => value,
        Ok(_) => return error_response(400, "invalid_json", "Request body must be a JSON object."),
        Err(error) => {
            return error_response(400, "invalid_json", format!("Invalid JSON body: {error}"))
        }
    };
    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    let mode = integration_access::from_settings(Some(&settings));
    match mcp::execute_write_tool(name, &args, mode) {
        Ok(value) => {
            cache.invalidate();
            data_response(value, &Value::Null)
        }
        Err(error) => {
            let code = if error.contains("profile") || error.contains("disabled") {
                403
            } else if error.contains("confirm=true") {
                409
            } else {
                422
            };
            error_response(code, "write_rejected", error)
        }
    }
}

fn list_snapshot_games(
    request: &ApiRequest,
    query: &HashMap<String, String>,
    snapshot: &Value,
) -> ApiResponse {
    let games = snapshot
        .get("games")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    paginated_response(request, query, games, snapshot)
}

fn list_games(
    request: &ApiRequest,
    query: &HashMap<String, String>,
    snapshot: &Value,
) -> ApiResponse {
    let query_text = query
        .get("query")
        .map(|value| value.trim())
        .unwrap_or_default();
    let wishlist_only = match query.get("wishlistOnly") {
        None => false,
        Some(value) => match value.as_str() {
            "true" => true,
            "false" => false,
            _ => {
                return error_response(400, "invalid_query", "wishlistOnly must be true or false.")
            }
        },
    };
    if query_text.is_empty() && !wishlist_only {
        return list_snapshot_games(request, query, snapshot);
    }
    if query_text.is_empty() {
        let items = snapshot
            .get("games")
            .and_then(Value::as_array)
            .map(|games| {
                games
                    .iter()
                    .filter(|game| game.get("wishlist").is_some_and(|value| !value.is_null()))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        return paginated_response(request, query, items, snapshot);
    }
    let args = json!({
        "query": query_text,
        "limit": 50,
        "wishlistOnly": wishlist_only,
    });
    match mcp::read_tool_value(snapshot, &json!({}), "search_games", &args) {
        Ok(value) => {
            let items = value
                .get("games")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            paginated_response(request, query, items, snapshot)
        }
        Err(error) => error_response(400, "invalid_query", error),
    }
}

fn get_game(route: &str, snapshot: &Value) -> ApiResponse {
    let app_id = route.rsplit('/').next().unwrap_or_default();
    let Ok(app_id) = app_id.parse::<u64>() else {
        return error_response(
            400,
            "invalid_app_id",
            "Game route must end with a numeric Steam app ID.",
        );
    };
    match mcp::read_tool_value(
        snapshot,
        &json!({}),
        "get_game",
        &json!({ "appId": app_id }),
    ) {
        Ok(value) => data_response(value, snapshot),
        Err(error) => error_response(404, "game_not_found", error),
    }
}

fn list_collection_values(
    request: &ApiRequest,
    query: &HashMap<String, String>,
    snapshot: &Value,
) -> ApiResponse {
    let items = snapshot
        .get("collections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    paginated_response(request, query, items, snapshot)
}

fn list_history_values(
    request: &ApiRequest,
    query: &HashMap<String, String>,
    history: &Value,
) -> ApiResponse {
    let mut items = history
        .get("sessions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    items.reverse();
    if let Some(raw_app_id) = query.get("appId") {
        let Some(app_id) = raw_app_id.parse::<u64>().ok() else {
            return error_response(400, "invalid_query", "appId must be a positive integer.");
        };
        if app_id == 0 {
            return error_response(400, "invalid_query", "appId must be a positive integer.");
        }
        items.retain(|item| item.get("appid").and_then(Value::as_u64) == Some(app_id));
    }
    paginated_response(request, query, items, history)
}

fn recommendations(
    query: &HashMap<String, String>,
    snapshot: &Value,
    history: &Value,
) -> ApiResponse {
    let limit = match parse_limit(query, 10, 20) {
        Ok(limit) => limit,
        Err(response) => return response,
    };
    let strategy = query
        .get("strategy")
        .map(String::as_str)
        .unwrap_or("backlog");
    if !matches!(strategy, "backlog" | "short" | "quality" | "surprise") {
        return error_response(
            400,
            "invalid_query",
            "strategy must be backlog, short, quality, or surprise.",
        );
    }
    match mcp::read_tool_value(
        snapshot,
        history,
        "recommend_games",
        &json!({ "limit": limit, "strategy": strategy }),
    ) {
        Ok(value) => data_response(value, snapshot),
        Err(error) => error_response(400, "invalid_query", error),
    }
}

fn paginated_response(
    _request: &ApiRequest,
    query: &HashMap<String, String>,
    items: Vec<Value>,
    source: &Value,
) -> ApiResponse {
    let limit = match parse_limit(query, 50, 100) {
        Ok(limit) => limit,
        Err(response) => return response,
    };
    let offset = match query.get("cursor") {
        None => 0,
        Some(cursor) => match decode_cursor(cursor) {
            Ok(offset) => offset,
            Err(error) => return error_response(400, "invalid_cursor", error),
        },
    };
    if offset > items.len() {
        return error_response(
            400,
            "invalid_cursor",
            "cursor points past the end of the collection.",
        );
    }
    let end = offset.saturating_add(limit).min(items.len());
    let next_cursor = (end < items.len()).then(|| encode_cursor(end));
    let value = json!({ "items": items[offset..end].to_vec(), "nextCursor": next_cursor });
    data_response(value, source)
}

fn parse_limit(
    query: &HashMap<String, String>,
    default: usize,
    maximum: usize,
) -> Result<usize, ApiResponse> {
    let Some(raw) = query.get("limit") else {
        return Ok(default);
    };
    let value = raw
        .parse::<usize>()
        .map_err(|_| error_response(400, "invalid_query", "limit must be a positive integer."))?;
    if !(1..=maximum).contains(&value) {
        return Err(error_response(
            400,
            "invalid_query",
            format!("limit must be between 1 and {maximum}."),
        ));
    }
    Ok(value)
}

fn data_response(value: Value, source: &Value) -> ApiResponse {
    let generated_at = source.get("generatedAt").cloned().unwrap_or(Value::Null);
    let body = json!({
        "data": value,
        "meta": { "apiVersion": API_VERSION, "generatedAt": generated_at },
    });
    let etag = etag_for(&body);
    ApiResponse {
        status: 200,
        body: Some(body),
        headers: vec![("ETag".to_string(), etag)],
    }
}

fn apply_conditional(request: &ApiRequest, response: &mut ApiResponse) {
    if request.method != "GET" {
        return;
    }
    let Some(etag) = response
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("ETag"))
        .map(|(_, value)| value.as_str())
    else {
        return;
    };
    if request.headers.get("if-none-match").map(String::as_str) == Some(etag) {
        response.status = 304;
        response.body = None;
    }
}

fn etag_for(value: &Value) -> String {
    let serialized = serde_json::to_vec(value).unwrap_or_default();
    let digest = Sha256::digest(serialized);
    format!("\"{}\"", hex_digest(&digest))
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn split_target(target: &str) -> (String, HashMap<String, String>) {
    let (path, raw_query) = target.split_once('?').unwrap_or((target, ""));
    let mut query = HashMap::new();
    for pair in raw_query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        query.insert(percent_decode(key), percent_decode(value));
    }
    (path.to_string(), query)
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'+' {
            output.push(b' ');
            index += 1;
        } else if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                output.push(high * 16 + low);
                index += 3;
            } else {
                output.push(bytes[index]);
                index += 1;
            }
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn encode_cursor(offset: usize) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(offset.to_string())
}

fn decode_cursor(cursor: &str) -> Result<usize, String> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| "cursor is not valid base64".to_string())?;
    String::from_utf8(bytes)
        .map_err(|_| "cursor is not valid UTF-8".to_string())?
        .parse::<usize>()
        .map_err(|_| "cursor does not contain an offset".to_string())
}

fn json_response(status: u16, body: Value) -> ApiResponse {
    ApiResponse {
        status,
        body: Some(body),
        headers: Vec::new(),
    }
}

fn error_response(status: u16, code: &str, message: impl Into<String>) -> ApiResponse {
    json_response(
        status,
        json!({
            "error": { "code": code, "message": message.into() },
        }),
    )
}

fn write_response(stream: &mut TcpStream, response: ApiResponse) -> Result<(), String> {
    let body = response
        .body
        .map(|value| serde_json::to_vec(&value).map_err(|error| error.to_string()))
        .transpose()?
        .unwrap_or_default();
    let reason = match response.status {
        200 => "OK",
        304 => "Not Modified",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Response",
    };
    write!(stream, "HTTP/1.1 {} {}\r\n", response.status, reason)
        .map_err(|error| format!("failed to write API response: {error}"))?;
    write!(stream, "Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n", body.len())
        .map_err(|error| format!("failed to write API response headers: {error}"))?;
    for (name, value) in response.headers {
        write!(stream, "{name}: {value}\r\n")
            .map_err(|error| format!("failed to write API response header: {error}"))?;
    }
    write!(stream, "\r\n")
        .and_then(|_| stream.write_all(&body))
        .map_err(|error| format!("failed to write API response body: {error}"))?;
    stream
        .flush()
        .map_err(|error| format!("failed to flush API response: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{
        decode_cursor, encode_cursor, is_authorized, list_games, percent_decode, split_target,
        start_embedded, ApiRequest,
    };
    use serde_json::json;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    #[test]
    fn cursors_are_opaque_offsets() {
        let cursor = encode_cursor(42);
        assert_eq!(decode_cursor(&cursor).unwrap(), 42);
        assert!(decode_cursor("not-a-cursor").is_err());
    }

    #[test]
    fn target_query_is_decoded_without_losing_repeated_keys() {
        let (path, query) = split_target("/v1/games?query=Space%20Quest&limit=5");
        assert_eq!(path, "/v1/games");
        assert_eq!(query.get("query").map(String::as_str), Some("Space Quest"));
        assert_eq!(query.get("limit").map(String::as_str), Some("5"));
    }

    #[test]
    fn percent_decode_handles_form_values() {
        assert_eq!(percent_decode("a+b%2Fc"), "a b/c");
    }

    #[test]
    fn authorization_requires_a_bearer_token_and_rejects_wrong_values() {
        let token = "a".repeat(64);
        let mut headers = HashMap::new();
        headers.insert("authorization".to_string(), format!("Bearer {token}"));
        assert!(is_authorized(&headers, &token));
        headers.insert("authorization".to_string(), "Basic anything".to_string());
        assert!(!is_authorized(&headers, &token));
        headers.insert(
            "authorization".to_string(),
            format!("Bearer {}b", &token[..63]),
        );
        assert!(!is_authorized(&headers, &token));
    }

    #[test]
    fn embedded_listener_is_loopback_only_and_stops_cleanly() {
        let server = start_embedded().expect("embedded listener should start");
        let address = server.address();
        assert!(address.ip().is_loopback());

        let mut stream = TcpStream::connect(address).expect("health request should connect");
        write!(
            stream,
            "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            address.port()
        )
        .expect("health request should write");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("health response should read");
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        server.stop();
        assert!(
            TcpStream::connect_timeout(&address, std::time::Duration::from_millis(250)).is_err()
        );
    }

    #[test]
    fn embedded_listener_rejects_a_non_loopback_host_header() {
        let server = start_embedded().expect("embedded listener should start");
        let address = server.address();
        let mut stream = TcpStream::connect(address).expect("request should connect locally");
        write!(
            stream,
            "GET /v1/health HTTP/1.1\r\nHost: localhost:{}\r\nConnection: close\r\n\r\n",
            address.port()
        )
        .expect("request should write");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("rejection response should read");
        assert!(response.starts_with("HTTP/1.1 400 Bad Request"));
        assert!(response.contains("invalid_host"));
        server.stop();
    }

    #[test]
    fn games_wishlist_filter_applies_without_a_search_query() {
        let snapshot = json!({
            "games": [
                { "appId": 1, "name": "Wishlisted", "wishlist": { "priority": 1 } },
                { "appId": 2, "name": "Owned" }
            ]
        });
        let mut query = HashMap::new();
        query.insert("wishlistOnly".to_string(), "true".to_string());
        let response = list_games(
            &ApiRequest {
                method: "GET".to_string(),
                target: "/v1/games?wishlistOnly=true".to_string(),
                headers: HashMap::new(),
                body: Vec::new(),
            },
            &query,
            &snapshot,
        );
        let items = response
            .body
            .and_then(|body| body.get("data").cloned())
            .and_then(|data| data.get("items").cloned())
            .and_then(|items| items.as_array().cloned())
            .expect("wishlist response items");
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].get("appId").and_then(|value| value.as_u64()),
            Some(1)
        );
    }
}
