//! Model Context Protocol server for local agents.
//!
//! The stdio runner exposes a small, user-selected set of Repressurizer-domain
//! tools. Read operations are available in every profile; write operations are
//! advertised only when the user opted into the corresponding profile and
//! still require `confirm: true` for every mutation.

use crate::{
    app_data, automation,
    integration_access::{self, PermissionMode},
    integration_descriptor,
    steam::{collections, sam},
};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const PROTOCOL_VERSION: &str = "2025-06-18";
const SERVER_NAME: &str = "repressurizer";
const MAX_RESULTS: usize = 50;
const SNAPSHOT_CACHE_TTL: Duration = Duration::from_secs(30);

const PROMPT_NAMES: [&str; 4] = [
    "choose_next_game",
    "review_backlog",
    "summarize_recent_play",
    "prepare_next_session",
];

/// Read-only data provider shared by every future MCP transport.
#[derive(Clone)]
pub struct ReadModel {
    snapshot: Value,
    play_history: Value,
}

/// Per-process cache used by MCP and the local API. Building an automation
/// snapshot performs several network/cache reads, so reusing it for a short
/// window keeps repeated agent calls inexpensive while play history remains
/// refreshable on demand.
#[derive(Default)]
pub struct ReadModelCache {
    model: Option<ReadModel>,
    loaded_at: Option<Instant>,
}

impl ReadModelCache {
    pub async fn load(&mut self) -> Result<ReadModel, String> {
        let fresh = self
            .loaded_at
            .is_some_and(|loaded_at| loaded_at.elapsed() < SNAPSHOT_CACHE_TTL);
        if !fresh {
            self.model = Some(ReadModel::load().await?);
            self.loaded_at = Some(Instant::now());
        }
        self.model
            .clone()
            .ok_or_else(|| "MCP snapshot cache is unavailable".to_string())
    }

    pub fn invalidate(&mut self) {
        self.model = None;
        self.loaded_at = None;
    }
}

impl ReadModel {
    pub async fn load() -> Result<Self, String> {
        Ok(Self {
            snapshot: automation::build_snapshot_from_settings().await?,
            play_history: load_play_history(),
        })
    }

    /// Build the local-only portion without requiring Steam credentials or a
    /// live Web API request. This keeps observed play history useful while the
    /// snapshot-backed tools are unavailable or intentionally offline.
    pub fn from_play_history() -> Self {
        Self {
            snapshot: Value::Object(serde_json::Map::new()),
            play_history: load_play_history(),
        }
    }

    pub fn snapshot(&self) -> &Value {
        &self.snapshot
    }

    pub fn play_history(&self) -> &Value {
        &self.play_history
    }
}

pub fn status_for_cli() -> Result<Value, String> {
    let settings = match app_data::read_settings_json() {
        Ok(value) => value,
        Err(error) => {
            return Ok(json!({
                "settingsAvailable": false,
                "enabled": false,
                "transport": "stdio",
                "error": error,
            }));
        }
    };

    let permission_mode = integration_access::from_settings(Some(&settings));
    let descriptor = integration_descriptor::read_live_descriptor().ok();
    Ok(json!({
        "settingsAvailable": true,
        "enabled": settings.get("mcpEnabled").and_then(Value::as_bool).unwrap_or(false),
        "transport": "stdio-via-embedded-loopback",
        "running": descriptor.is_some(),
        "baseUrl": descriptor.as_ref().map(|value| value.base_url.clone()),
        "permissionMode": permission_mode.as_str(),
        "scope": if permission_mode == PermissionMode::ReadOnly { "read-only" } else { "repressurizer-domain" },
        "writesRequireConfirmation": true,
        "command": "repressurizer-mcp",
        "fallbackCommand": "repressurizer-cli mcp stdio",
        "resources": [
            "repressurizer://library/summary",
            "repressurizer://library",
            "repressurizer://play-history",
        ],
    }))
}

pub fn config_for_cli() -> Result<Value, String> {
    let cli_command = std::env::current_exe()
        .map_err(|error| format!("failed to resolve the CLI path: {error}"))?;
    let (command, args, transport) = bundled_adapter_command(&cli_command);
    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    let permission_mode = integration_access::from_settings(Some(&settings));
    Ok(json!({
        "mcpServers": {
            "repressurizer": {
                "command": command,
                "args": args
            }
        },
        "transport": transport,
        "permissionMode": permission_mode.as_str(),
        "readOnly": permission_mode == PermissionMode::ReadOnly,
        "writesRequireConfirmation": true,
        "enableInRepressurizer": "Settings > Integrations > MCP",
    }))
}

fn bundled_adapter_command(cli_command: &Path) -> (PathBuf, Value, &'static str) {
    let adapter_name = if cfg!(target_os = "windows") {
        "repressurizer-mcp.exe"
    } else {
        "repressurizer-mcp"
    };
    if let Some(adapter) = cli_command
        .parent()
        .map(|directory| directory.join(adapter_name))
        .filter(|path| path.is_file())
    {
        return (adapter, json!([]), "bundled-mcp-adapter");
    }
    (
        cli_command.to_path_buf(),
        json!(["mcp", "stdio"]),
        "repressurizer-cli-adapter",
    )
}

pub fn doctor_for_cli() -> Result<Value, String> {
    let cli_path = std::env::current_exe().ok();
    let cli_available = cli_path.as_ref().is_some_and(|path| path.is_file());
    let adapter_path = cli_path
        .as_ref()
        .map(|path| bundled_adapter_command(path).0);
    let adapter_available = adapter_path.as_ref().is_some_and(|path| path.is_file());
    let embedded_runtime = integration_descriptor::read_live_descriptor().is_ok();
    let settings = app_data::read_settings_json().ok();
    let settings_available = settings.is_some();
    let mcp_enabled = settings
        .as_ref()
        .and_then(|value| value.get("mcpEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let setup_complete = settings
        .as_ref()
        .and_then(|value| value.get("setupComplete"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let steam_configured = settings.as_ref().is_some_and(|value| {
        ["steamPath", "steamId3", "steamId64", "apiKey"]
            .iter()
            .all(|key| {
                value
                    .get(*key)
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty())
            })
    });
    let play_history_path = app_data::app_data_file_path("play_history.json").ok();
    let play_history_available = play_history_path
        .as_ref()
        .is_some_and(|path| path.is_file());
    let local_ready = mcp_enabled && cli_available && embedded_runtime;
    let snapshot_ready = local_ready && setup_complete && steam_configured;
    let permission_mode = integration_access::from_settings(settings.as_ref());

    Ok(json!({
        "ok": local_ready,
        "transport": "stdio",
        "permissionMode": permission_mode.as_str(),
        "writesRequireConfirmation": true,
        "protocolVersion": PROTOCOL_VERSION,
        "checks": {
            "settingsAvailable": settings_available,
            "mcpEnabled": mcp_enabled,
            "cliAvailable": cli_available,
            "adapterAvailable": adapter_available,
            "embeddedRuntime": embedded_runtime,
            "playHistoryReadable": play_history_available,
            "snapshotToolsReady": snapshot_ready,
        },
        "paths": {
            "cli": cli_path.map(|path| path.display().to_string()),
            "adapter": adapter_path.map(|path| path.display().to_string()),
            "playHistory": play_history_path.map(|path| path.display().to_string()),
        },
        "next": if !settings_available {
            "Launch Repressurizer once so it can create its settings file."
        } else if !mcp_enabled {
            "Enable MCP in Settings > Integrations > MCP."
        } else if !embedded_runtime {
            "Keep Repressurizer running with MCP enabled so the local endpoint can be discovered."
        } else if !snapshot_ready && play_history_available {
            "Local play history is ready; complete Steam setup for library tools."
        } else if !snapshot_ready {
            "Enable local history after the first library observation; complete Steam setup for library tools."
        } else {
            "MCP is ready for local agents."
        },
    }))
}

pub fn prompt_for_cli(name: Option<&str>) -> Result<Value, String> {
    match name {
        Some(name) => prompt_get(name, &json!({})),
        None => Ok(json!({
            "prompts": prompt_definitions(),
            "usage": "repressurizer-cli mcp prompt <name>",
        })),
    }
}

pub fn install_config_for_cli(path: &str) -> Result<Value, String> {
    let target = Path::new(path);
    if path.trim().is_empty() {
        return Err("A target JSON config path is required.".to_string());
    }

    let mut root = if target.exists() {
        let raw = std::fs::read_to_string(target)
            .map_err(|error| format!("Failed to read MCP client config: {error}"))?;
        serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("MCP client config is not valid JSON: {error}"))?
    } else {
        json!({})
    };
    if !root.is_object() {
        return Err("MCP client config must contain a JSON object.".to_string());
    }

    let server = config_for_cli()?
        .get("mcpServers")
        .and_then(|value| value.get(SERVER_NAME))
        .cloned()
        .ok_or("Failed to build the Repressurizer MCP client entry")?;
    if root
        .get("mcpServers")
        .is_some_and(|value| !value.is_object())
    {
        return Err("MCP client config field 'mcpServers' must be a JSON object.".to_string());
    }
    if root.get("mcpServers").is_none() {
        root["mcpServers"] = json!({});
    }
    let servers = root
        .get_mut("mcpServers")
        .expect("mcpServers was created above");
    servers[SERVER_NAME] = server;

    let serialized = serde_json::to_string_pretty(&root)
        .map_err(|error| format!("Failed to serialize MCP client config: {error}"))?;
    app_data::write_text_file_atomic(
        target,
        &format!("{serialized}\n"),
        "MCP client config",
        true,
    )?;

    Ok(json!({
        "installed": true,
        "path": target.display().to_string(),
        "server": SERVER_NAME,
        "note": "Existing client entries were preserved; only mcpServers.repressurizer was replaced.",
    }))
}

pub fn run_stdio() -> Result<(), String> {
    // The bundled CLI is a protocol adapter only. It discovers the running
    // Tauri-owned endpoint and never reads or writes Repressurizer data files.
    integration_descriptor::read_live_descriptor()?;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());

    for line in stdin.lock().lines() {
        let line = line.map_err(|error| format!("failed to read MCP stdin: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }

        let request: Value = serde_json::from_str(&line)
            .map_err(|error| format!("invalid MCP JSON-RPC message: {error}"))?;
        if let Some(response) = integration_descriptor::post_mcp_request(&request)? {
            serde_json::to_writer(&mut stdout, &response)
                .map_err(|error| format!("failed to serialize MCP response: {error}"))?;
            stdout
                .write_all(b"\n")
                .map_err(|error| format!("failed to write MCP response: {error}"))?;
            stdout
                .flush()
                .map_err(|error| format!("failed to flush MCP response: {error}"))?;
        }
    }

    Ok(())
}

/// Probe the running embedded endpoint without exposing its bearer token.
/// This is used by packaged clients and support diagnostics, not by the
/// normal stdio stream.
pub fn self_test_for_cli() -> Result<Value, String> {
    let descriptor = integration_descriptor::read_live_descriptor()?;
    let response = integration_descriptor::post_mcp_request(&json!({
        "jsonrpc": "2.0",
        "id": "repressurizer-self-test",
        "method": "ping",
        "params": {}
    }))?;
    Ok(json!({
        "ok": response.is_some(),
        "transport": "stdio-via-embedded-loopback",
        "baseUrl": descriptor.base_url,
        "protocolVersion": descriptor.protocol_version,
    }))
}

#[allow(dead_code)]
async fn dispatch_request(request: Value) -> Result<Option<Value>, String> {
    let mut cache = ReadModelCache::default();
    dispatch_request_with_cache(request, &mut cache).await
}

pub(crate) async fn dispatch_request_with_cache(
    request: Value,
    cache: &mut ReadModelCache,
) -> Result<Option<Value>, String> {
    let id = request.get("id").cloned();
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let settings = app_data::read_settings_json().unwrap_or_else(|_| json!({}));
    let permission_mode = integration_access::from_settings(Some(&settings));
    let mcp_enabled = settings
        .get("mcpEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !mcp_enabled
        && !matches!(
            method,
            "initialize" | "notifications/initialized" | "notifications/cancelled"
        )
    {
        return Ok(id.map(|request_id| {
            error_response(
                Some(request_id),
                -32000,
                "MCP was disabled in Settings > Integrations. Re-enable it and reconnect the agent."
                    .to_string(),
            )
        }));
    }
    let result = match method {
        "initialize" => Some(json!({
            "protocolVersion": negotiated_protocol_version(request.get("params")),
            "capabilities": {
                "tools": { "listChanged": false },
                "resources": { "subscribe": false, "listChanged": false },
                "prompts": { "listChanged": false },
            },
            "serverInfo": {
                "name": SERVER_NAME,
                "version": env!("CARGO_PKG_VERSION"),
            },
            "instructions": format!("Repressurizer local integration profile: {}. Read operations are available to compatible agents; domain writes are advertised only when enabled by the user and each mutation requires confirm=true. No arbitrary shell, filesystem, Steam-account, or network access is available.", permission_mode.as_str()),
        })),
        "notifications/initialized" | "notifications/cancelled" => None,
        "ping" => Some(json!({})),
        "tools/list" => Some(json!({ "tools": tool_definitions_for_mode(permission_mode) })),
        "resources/list" => Some(json!({ "resources": resource_definitions() })),
        "prompts/list" => Some(json!({ "prompts": prompt_definitions() })),
        "prompts/get" => {
            let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match prompt_get(name, &arguments) {
                Ok(prompt) => Some(prompt),
                Err(error) => {
                    return Ok(Some(error_response(
                        id,
                        -32602,
                        format!("Invalid prompt request: {error}"),
                    )));
                }
            }
        }
        "tools/call" => {
            let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let model = match if is_write_tool(name) || name == "get_play_history" {
                Ok(ReadModel::from_play_history())
            } else {
                cache.load().await
            } {
                Ok(model) => model,
                Err(error) => {
                    return Ok(id.map(|request_id| {
                        success_response(request_id, tool_result(json!({ "error": error }), true))
                    }));
                }
            };
            let response = call_tool_with_mode(
                model.snapshot(),
                model.play_history(),
                name,
                &arguments,
                permission_mode,
            );
            if is_write_tool(name) && response["isError"] != json!(true) {
                cache.invalidate();
            }
            Some(response)
        }
        "resources/read" => {
            let uri = request
                .get("params")
                .and_then(|params| params.get("uri"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let model = match if uri == "repressurizer://play-history" {
                Ok(ReadModel::from_play_history())
            } else {
                cache.load().await
            } {
                Ok(model) => model,
                Err(error) => {
                    return Ok(id.map(|request_id| {
                        success_response(
                            request_id,
                            json!({
                                "contents": [],
                                "isError": true,
                                "error": error,
                            }),
                        )
                    }));
                }
            };
            Some(read_resource(model.snapshot(), model.play_history(), uri))
        }
        _ => {
            if id.is_none() {
                None
            } else {
                return Ok(Some(error_response(
                    id,
                    -32601,
                    format!("Unsupported MCP method: {method}"),
                )));
            }
        }
    };

    Ok(id
        .map(|request_id| match result {
            Some(value) => success_response(request_id, value),
            None => Value::Null,
        })
        .filter(|response| !response.is_null()))
}

fn negotiated_protocol_version(params: Option<&Value>) -> &'static str {
    match params
        .and_then(|value| value.get("protocolVersion"))
        .and_then(Value::as_str)
    {
        Some("2025-06-18") | Some("2025-03-26") | Some("2024-11-05") => params
            .and_then(|value| value.get("protocolVersion"))
            .and_then(Value::as_str)
            .and_then(|version| match version {
                "2025-06-18" => Some("2025-06-18"),
                "2025-03-26" => Some("2025-03-26"),
                "2024-11-05" => Some("2024-11-05"),
                _ => None,
            })
            .unwrap_or(PROTOCOL_VERSION),
        _ => PROTOCOL_VERSION,
    }
}

fn success_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error_response(id: Option<Value>, code: i64, message: String) -> Value {
    json!({ "jsonrpc": "2.0", "id": id.unwrap_or(Value::Null), "error": { "code": code, "message": message } })
}

#[allow(dead_code)]
fn tool_definitions() -> Vec<Value> {
    tool_definitions_for_mode(PermissionMode::ReadOnly)
}

fn tool_definitions_for_mode(mode: PermissionMode) -> Vec<Value> {
    let mut tools = vec![
        tool_definition(
            "get_library_context",
            "Return one compact, decision-ready context for an agent: summary, recent observed sessions, collections, and deterministic backlog recommendations. Use this as the first call when you want to minimize round trips and context size.",
            json!({
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 10,
                        "description": "Maximum recommendations and recent sessions to include. Defaults to 5."
                    }
                },
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "library_summary",
            "Return a privacy-safe summary of the local Steam library snapshot.",
            json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        ),
        tool_definition(
            "search_games",
            "Search games by name, genre, category, or collection.",
            json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Case-insensitive text to match against game names, genres, categories, and collection names." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_RESULTS, "description": "Maximum matching games to return. Defaults to 50." },
                    "wishlistOnly": { "type": "boolean", "description": "When true, return only games present in the local wishlist cache." }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "get_game",
            "Return the normalized snapshot for one Steam app ID.",
            json!({
                "type": "object",
                "properties": { "appId": { "type": "integer", "minimum": 1, "description": "Steam App ID." } },
                "required": ["appId"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "list_collections",
            "List local Repressurizer collections and their app IDs.",
            json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        ),
        tool_definition(
            "get_play_history",
            "Return observed playtime sessions. Historical first launches are not inferred.",
            json!({
                "type": "object",
                "properties": {
                    "appId": { "type": "integer", "minimum": 1, "description": "Optional Steam App ID filter." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_RESULTS, "description": "Maximum observed sessions to return. Defaults to 50." }
                },
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "recommend_games",
            "Return deterministic, read-only recommendations based on playtime, wishlist, HLTB, achievements, and metadata.",
            json!({
                "type": "object",
                "properties": {
                    "limit": { "type": "integer", "minimum": 1, "maximum": 20, "description": "Maximum recommendations to return. Defaults to 10." },
                    "strategy": { "type": "string", "enum": ["backlog", "short", "quality", "surprise"], "description": "Ranking strategy: unplayed backlog, shorter games, metadata quality, or deterministic variety." }
                },
                "additionalProperties": false
            }),
        ),
    ];

    if mode.allows_library_writes() {
        tools.push(tool_definition_with_hints(
            "set_collection_membership",
            "Add or remove one Steam app from a local Repressurizer collection. This writes the Steam collection cache, creates an automatic backup, and requires confirm=true.",
            json!({
                "type": "object",
                "properties": {
                    "collectionKey": { "type": "string", "minLength": 1, "maxLength": 128, "description": "Exact local collection key, for example user-collections.backlog." },
                    "appId": { "type": "integer", "minimum": 1, "description": "Steam App ID." },
                    "present": { "type": "boolean", "description": "true to add the game, false to remove it." },
                    "confirm": { "type": "boolean", "description": "Must be true after the user has reviewed the requested change." }
                },
                "required": ["collectionKey", "appId", "present", "confirm"],
                "additionalProperties": false
            }),
            false,
            true,
            true,
        ));
        tools.push(tool_definition_with_hints(
            "create_collection",
            "Create a local static Repressurizer collection, optionally seeded with Steam app IDs. The operation creates an automatic backup and requires confirm=true.",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "minLength": 1, "maxLength": 80, "description": "Human-readable collection name." },
                    "appIds": { "type": "array", "maxItems": 1000, "items": { "type": "integer", "minimum": 1 }, "description": "Optional Steam App IDs to add." },
                    "confirm": { "type": "boolean", "description": "Must be true after the user has reviewed the requested change." }
                },
                "required": ["name", "confirm"],
                "additionalProperties": false
            }),
            false,
            true,
            false,
        ));
    }

    if mode.allows_full_writes() {
        tools.push(tool_definition_with_hints(
            "sam_achievement_action",
            "Run one explicit SAM achievement action through Repressurizer's guarded bridge. Windows/SAM availability, Steam Tools settings, backup creation, and confirm=true are all required.",
            json!({
                "type": "object",
                "properties": {
                    "appId": { "type": "integer", "minimum": 1, "description": "Steam App ID." },
                    "action": { "type": "string", "enum": ["unlock", "lock", "unlock_all", "lock_all", "restore_backup"], "description": "Use unlock/lock with achievementIds; restore_backup with backupPath." },
                    "achievementIds": { "type": "array", "maxItems": 2000, "items": { "type": "string", "minLength": 1, "maxLength": 256 } },
                    "backupPath": { "type": "string", "maxLength": 1024 },
                    "allowUnverified": { "type": "boolean", "description": "Allow runtime-only permission verification, matching the explicit CLI flag." },
                    "confirm": { "type": "boolean", "description": "Must be true after the user has reviewed the exact SAM action." }
                },
                "required": ["appId", "action", "confirm"],
                "additionalProperties": false
            }),
            false,
            true,
            false,
        ));
    }

    tools
}

fn prompt_definitions() -> Vec<Value> {
    vec![
        prompt_definition(
            "choose_next_game",
            "Choose one game to play next using the local backlog, observed activity, and deterministic recommendations.",
            vec![],
        ),
        prompt_definition(
            "review_backlog",
            "Review the backlog and return a short, evidence-based prioritization without changing collections.",
            vec![],
        ),
        prompt_definition(
            "summarize_recent_play",
            "Summarize observed recent play sessions and identify unfinished games.",
            vec![],
        ),
        prompt_definition(
            "prepare_next_session",
            "Prepare a focused next-session plan for a named game or the best current recommendation.",
            vec![json!({
                "name": "game",
                "description": "Optional game title or app ID to focus on.",
                "type": "string",
                "required": false,
            })],
        ),
    ]
}

fn prompt_definition(name: &str, description: &str, arguments: Vec<Value>) -> Value {
    json!({ "name": name, "description": description, "arguments": arguments })
}

fn prompt_get(name: &str, arguments: &Value) -> Result<Value, String> {
    if !PROMPT_NAMES.contains(&name) {
        return Err(format!(
            "Unknown prompt '{name}'. Available prompts: {}",
            PROMPT_NAMES.join(", ")
        ));
    }
    let game = arguments
        .get("game")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("the best current candidate");
    let text = match name {
        "choose_next_game" => "Use Repressurizer's read-only tools in this order: get_play_history, recommend_games, then get_game for the top candidates. Choose exactly one game, explain the evidence, and do not modify Steam, collections, or settings.",
        "review_backlog" => "Use library_summary, list_collections, search_games, and recommend_games to review the backlog. Return a compact priority list with reasons grounded in local data. Do not change any collection.",
        "summarize_recent_play" => "Use get_play_history and get_game to summarize observed sessions. Clearly distinguish observed activity from unknown historical first launches, and call out games that appear unfinished.",
        "prepare_next_session" => "Focus on {game}. Use search_games or get_game plus get_play_history and recommend_games as needed. Return a short session goal, estimated scope from available HLTB data, and a stopping point. Do not write data.",
        _ => unreachable!(),
    }
    .replace("{game}", game);

    Ok(json!({
        "description": prompt_definitions()
            .into_iter()
            .find(|prompt| prompt.get("name").and_then(Value::as_str) == Some(name))
            .and_then(|prompt| prompt.get("description").cloned())
            .unwrap_or(Value::Null),
        "messages": [{
            "role": "user",
            "content": { "type": "text", "text": text }
        }]
    }))
}

fn tool_definition(name: &str, description: &str, input_schema: Value) -> Value {
    tool_definition_with_hints(name, description, input_schema, true, false, true)
}

fn tool_definition_with_hints(
    name: &str,
    description: &str,
    input_schema: Value,
    read_only: bool,
    destructive: bool,
    idempotent: bool,
) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema,
        "annotations": {
            "readOnlyHint": read_only,
            "destructiveHint": destructive,
            "idempotentHint": idempotent,
            "openWorldHint": false,
        }
    })
}

fn resource_definitions() -> Vec<Value> {
    vec![
        json!({
            "uri": "repressurizer://library/summary",
            "name": "Library summary",
            "description": "Privacy-safe summary of the current library snapshot.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": "repressurizer://library",
            "name": "Library snapshot",
            "description": "Normalized read-only library data used by Repressurizer integrations.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": "repressurizer://play-history",
            "name": "Observed play history",
            "description": "Locally observed playtime deltas and sessions.",
            "mimeType": "application/json"
        }),
    ]
}

fn load_play_history() -> Value {
    let Ok(path) = app_data::app_data_file_path("play_history.json") else {
        return json!({ "version": 1, "snapshots": {}, "sessions": [] });
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return json!({ "version": 1, "snapshots": {}, "sessions": [] });
    };
    serde_json::from_str(&raw)
        .unwrap_or_else(|_| json!({ "version": 1, "snapshots": {}, "sessions": [] }))
}

fn is_write_tool(name: &str) -> bool {
    matches!(
        name,
        "set_collection_membership" | "create_collection" | "sam_achievement_action"
    )
}

pub fn read_tool_value(
    snapshot: &Value,
    play_history: &Value,
    name: &str,
    args: &Value,
) -> Result<Value, String> {
    match name {
        "get_library_context" => get_library_context(snapshot, play_history, args),
        "library_summary" => Ok(json!({
            "schemaVersion": snapshot.get("schemaVersion"),
            "generatedAt": snapshot.get("generatedAt"),
            "summary": snapshot.get("summary"),
        })),
        "search_games" => search_games(snapshot, args),
        "get_game" => get_game(snapshot, args),
        "list_collections" => Ok(snapshot
            .get("collections")
            .cloned()
            .unwrap_or_else(|| json!([]))),
        "get_play_history" => get_play_history(play_history, args),
        "recommend_games" => recommend_games(snapshot, args),
        _ => Err(format!("Unknown MCP tool: {name}")),
    }
}

#[allow(dead_code)]
fn call_tool(snapshot: &Value, play_history: &Value, name: &str, args: &Value) -> Value {
    call_tool_with_mode(snapshot, play_history, name, args, PermissionMode::ReadOnly)
}

fn call_tool_with_mode(
    snapshot: &Value,
    play_history: &Value,
    name: &str,
    args: &Value,
    mode: PermissionMode,
) -> Value {
    let result = if is_write_tool(name) {
        execute_write_tool(name, args, mode)
    } else {
        read_tool_value(snapshot, play_history, name, args)
    };

    match result {
        Ok(value) => tool_result(value, false),
        Err(error) => tool_result(json!({ "error": error }), true),
    }
}

fn tool_result(value: Value, is_error: bool) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string());
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": value,
        "isError": is_error,
    })
}

/// Execute a guarded Repressurizer-domain write. The API adapter calls the
/// same function, so MCP and HTTP cannot drift into separate mutation logic.
pub fn execute_write_tool(name: &str, args: &Value, mode: PermissionMode) -> Result<Value, String> {
    let result = (|| -> Result<Value, String> {
        match name {
            "set_collection_membership" => {
                integration_access::require_library_writes(mode)?;
                integration_access::require_confirmation(args, "set_collection_membership")?;
                app_data::with_integration_write_lock(|| set_collection_membership(args))
            }
            "create_collection" => {
                integration_access::require_library_writes(mode)?;
                integration_access::require_confirmation(args, "create_collection")?;
                app_data::with_integration_write_lock(|| create_collection(args))
            }
            "sam_achievement_action" => {
                integration_access::require_full_writes(mode)?;
                integration_access::require_confirmation(args, "sam_achievement_action")?;
                sam_achievement_action(args)
            }
            _ => Err(format!("Unknown write tool: {name}")),
        }
    })();
    let status = if result.is_ok() {
        "success"
    } else {
        "rejected"
    };
    let _ = app_data::append_integration_audit(name, status, &audit_details(args));
    result
}

fn audit_details(args: &Value) -> Value {
    let Some(object) = args.as_object() else {
        return json!({});
    };
    let mut details = object.clone();
    details.remove("confirm");
    if details.contains_key("backupPath") {
        details.insert("backupPath".to_string(), json!("<provided>"));
    }
    Value::Object(details)
}

fn saved_steam_identity(settings: &Value) -> Result<(String, String), String> {
    let steam_path = settings
        .get("steamPath")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Steam path is not configured in Repressurizer settings.")?;
    let steam_id3 = settings
        .get("steamId3")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Steam user ID3 is not configured in Repressurizer settings.")?;
    Ok((steam_path.to_string(), steam_id3.to_string()))
}

fn collection_key_from_args(args: &Value) -> Result<&str, String> {
    args.get("collectionKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "collectionKey must be a non-empty local collection key".to_string())
}

fn app_id_from_args(args: &Value) -> Result<u64, String> {
    let app_id = args
        .get("appId")
        .and_then(Value::as_u64)
        .ok_or("appId must be a positive integer")?;
    if app_id == 0 || app_id > u32::MAX as u64 {
        return Err("appId must be between 1 and 4294967295".to_string());
    }
    Ok(app_id)
}

fn set_collection_membership(args: &Value) -> Result<Value, String> {
    let settings = app_data::read_settings_json()?;
    let (steam_path, steam_id3) = saved_steam_identity(&settings)?;
    let key = collection_key_from_args(args)?;
    let app_id = app_id_from_args(args)?;
    let present = args
        .get("present")
        .and_then(Value::as_bool)
        .ok_or("present must be a boolean")?;
    let mut collections = collections::load_collections(steam_path.clone(), steam_id3.clone())?;
    let collection = collections
        .iter_mut()
        .find(|collection| collection.key == key)
        .ok_or_else(|| format!("Collection '{key}' was not found"))?;
    if collection.is_dynamic {
        return Err(format!(
            "Collection '{key}' is dynamic and cannot be edited by an integration."
        ));
    }
    collection.added.retain(|id| *id != app_id);
    collection.removed.retain(|id| *id != app_id);
    if present {
        collection.added.push(app_id);
    } else {
        collection.removed.push(app_id);
    }
    collections::save_collections_unlocked(steam_path, steam_id3, collections)?;
    Ok(json!({
        "ok": true,
        "operation": "set_collection_membership",
        "collectionKey": key,
        "appId": app_id,
        "present": present,
        "backup": "automatic",
    }))
}

fn create_collection(args: &Value) -> Result<Value, String> {
    let settings = app_data::read_settings_json()?;
    let (steam_path, steam_id3) = saved_steam_identity(&settings)?;
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("name must be a non-empty collection name")?;
    if name.chars().count() > 80 {
        return Err("name must be 80 characters or fewer".to_string());
    }
    let app_ids = args
        .get("appIds")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    let app_id = item
                        .as_u64()
                        .ok_or("appIds must contain positive integers")?;
                    if app_id == 0 || app_id > u32::MAX as u64 {
                        return Err("appIds must be between 1 and 4294967295".to_string());
                    }
                    Ok(app_id)
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .transpose()?
        .unwrap_or_default();
    if app_ids.len() > 1_000 {
        return Err("appIds may contain at most 1000 entries".to_string());
    }
    let mut collections = collections::load_collections(steam_path.clone(), steam_id3.clone())?;
    if collections
        .iter()
        .any(|collection| !collection.is_deleted && collection.name.eq_ignore_ascii_case(name))
    {
        return Err(format!("A collection named '{name}' already exists"));
    }
    let mut deduped_app_ids = app_ids;
    deduped_app_ids.sort_unstable();
    deduped_app_ids.dedup();
    collections.push(collections::SteamCollection {
        id: String::new(),
        key: String::new(),
        name: name.to_string(),
        added: deduped_app_ids.clone(),
        removed: Vec::new(),
        timestamp: chrono::Utc::now().timestamp().max(0) as u64,
        is_deleted: false,
        is_dynamic: false,
    });
    collections::save_collections_unlocked(steam_path.clone(), steam_id3.clone(), collections)?;
    let generated_key = collections::load_collections(steam_path, steam_id3)
        .ok()
        .and_then(|saved| {
            saved
                .into_iter()
                .find(|collection| !collection.is_deleted && collection.name == name)
        })
        .map(|collection| collection.key);
    Ok(json!({
        "ok": true,
        "operation": "create_collection",
        "name": name,
        "key": generated_key,
        "appIds": deduped_app_ids,
        "backup": "automatic",
    }))
}

fn sam_achievement_action(args: &Value) -> Result<Value, String> {
    let settings = app_data::read_settings_json()?;
    if !settings
        .get("steamToolsEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || !settings
            .get("steamToolsAchievementWritesEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return Err(
            "Enable Steam Tools and achievement writes in Settings before using the SAM integration."
                .to_string(),
        );
    }
    let steam_path = settings
        .get("steamPath")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Steam path is not configured in Repressurizer settings.")?
        .to_string();
    let app_id = app_id_from_args(args)?;
    let action = args
        .get("action")
        .and_then(Value::as_str)
        .ok_or("action is required")?;
    let action = match action {
        "unlock" => "unlock_selected",
        "lock" => "lock_selected",
        "unlock_all" | "lock_all" | "restore_backup" => action,
        _ => {
            return Err(
                "action must be unlock, lock, unlock_all, lock_all, or restore_backup".to_string(),
            )
        }
    };
    let achievement_ids = args
        .get("achievementIds")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    item.as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToString::to_string)
                        .ok_or("achievementIds must contain non-empty strings".to_string())
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .transpose()?
        .unwrap_or_default();
    if achievement_ids.len() > 2_000 {
        return Err("achievementIds may contain at most 2000 entries".to_string());
    }
    let backup_path = args
        .get("backupPath")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if action == "restore_backup" {
        let provided = backup_path
            .as_deref()
            .ok_or("backupPath is required for restore_backup")?;
        let expected_dir = crate::app_data_dir()
            .ok_or("Could not resolve Repressurizer app data directory.")?
            .join("sam_backups")
            .join(app_id.to_string());
        let provided_path = std::path::Path::new(provided);
        if provided_path.parent() != Some(expected_dir.as_path())
            || provided_path.extension().and_then(|value| value.to_str()) != Some("json")
        {
            return Err(
                "backupPath must point to a JSON backup inside Repressurizer's SAM backup directory."
                    .to_string(),
            );
        }
    }
    let input = sam::SamAchievementActionInput {
        steam_path,
        app_id,
        action: action.to_string(),
        achievement_ids,
        backup_path,
        allow_unverified_permissions: args
            .get("allowUnverified")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    };
    let result = sam::sam_achievement_action(input)?;
    serde_json::to_value(result).map_err(|error| format!("Failed to serialize SAM result: {error}"))
}

fn get_library_context(
    snapshot: &Value,
    play_history: &Value,
    args: &Value,
) -> Result<Value, String> {
    let limit = bounded_limit(args.get("limit"), 5).min(10);
    let recommendations =
        recommend_games(snapshot, &json!({ "limit": limit, "strategy": "backlog" }))?;
    Ok(json!({
        "summary": snapshot.get("summary").cloned().unwrap_or(Value::Null),
        "collections": snapshot
            .get("collections")
            .and_then(Value::as_array)
            .map(|collections| collections.iter().take(12).cloned().collect::<Vec<_>>())
            .unwrap_or_default(),
        "recentSessions": recent_sessions(play_history, limit),
        "recommendations": recommendations
            .get("games")
            .cloned()
            .unwrap_or_else(|| json!([])),
        "note": "Play history is observed activity only; recommendations are deterministic heuristics, not an AI-generated source of truth.",
    }))
}

fn read_resource(snapshot: &Value, play_history: &Value, uri: &str) -> Value {
    let value = match uri {
        "repressurizer://library/summary" => json!({
            "schemaVersion": snapshot.get("schemaVersion"),
            "generatedAt": snapshot.get("generatedAt"),
            "summary": snapshot.get("summary"),
        }),
        "repressurizer://library" => snapshot.clone(),
        "repressurizer://play-history" => play_history.clone(),
        _ => return tool_result(json!({ "error": format!("Unknown resource: {uri}") }), true),
    };

    json!({
        "contents": [{
            "uri": uri,
            "mimeType": "application/json",
            "text": serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string())
        }]
    })
}

fn games(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("games")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn search_games(snapshot: &Value, args: &Value) -> Result<Value, String> {
    let query = args
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if query.is_empty() {
        return Err("query must not be empty".to_string());
    }
    let limit = bounded_limit(args.get("limit"), MAX_RESULTS);
    let wishlist_only = args
        .get("wishlistOnly")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let matches = games(snapshot)
        .into_iter()
        .filter(|game| !wishlist_only || game.get("wishlist").is_some_and(|value| !value.is_null()))
        .filter(|game| searchable_game_text(game).contains(&query))
        .take(limit)
        .collect::<Vec<_>>();
    Ok(json!({ "query": query, "count": matches.len(), "games": matches }))
}

fn get_game(snapshot: &Value, args: &Value) -> Result<Value, String> {
    let app_id = args
        .get("appId")
        .and_then(Value::as_u64)
        .ok_or("appId must be a positive integer")?;
    if app_id == 0 {
        return Err("appId must be a positive integer".to_string());
    }
    games(snapshot)
        .into_iter()
        .find(|game| game.get("appId").and_then(Value::as_u64) == Some(app_id))
        .ok_or_else(|| format!("Game {app_id} was not found in the current snapshot"))
}

fn get_play_history(play_history: &Value, args: &Value) -> Result<Value, String> {
    let app_id = args.get("appId").and_then(Value::as_u64);
    if app_id == Some(0) {
        return Err("appId must be a positive integer".to_string());
    }
    let limit = bounded_limit(args.get("limit"), MAX_RESULTS);
    let mut sessions = recent_sessions(play_history, MAX_RESULTS);
    if let Some(app_id) = app_id {
        sessions.retain(|session| session.get("appid").and_then(Value::as_u64) == Some(app_id));
    }
    sessions.truncate(limit);
    Ok(json!({
        "note": "This is observed activity only; Repressurizer does not infer a historical first launch from Steam lifetime playtime.",
        "count": sessions.len(),
        "sessions": sessions,
    }))
}

fn recent_sessions(play_history: &Value, limit: usize) -> Vec<Value> {
    let mut sessions = play_history
        .get("sessions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    sessions.reverse();
    sessions.truncate(limit);
    sessions
}

fn recommend_games(snapshot: &Value, args: &Value) -> Result<Value, String> {
    let limit = bounded_limit(args.get("limit"), 10).min(20);
    let strategy = args
        .get("strategy")
        .and_then(Value::as_str)
        .unwrap_or("backlog");
    let mut candidates = games(snapshot)
        .into_iter()
        .filter(|game| {
            game.get("flags")
                .and_then(|flags| flags.get("nonGame"))
                .and_then(Value::as_bool)
                != Some(true)
        })
        .map(|game| {
            let score = recommendation_score(&game, strategy);
            (score, game)
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|(score_a, game_a), (score_b, game_b)| {
        score_b
            .partial_cmp(score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                game_a
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .cmp(
                        game_b
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default(),
                    )
            })
    });
    let recommendations = candidates
        .into_iter()
        .take(limit)
        .map(|(score, game)| {
            json!({
                "score": (score * 100.0).round() / 100.0,
                "appId": game.get("appId"),
                "name": game.get("name"),
                "playtimeForeverMinutes": game.get("playtimeForeverMinutes"),
                "hltb": game.get("hltb"),
                "achievements": game.get("achievements"),
                "wishlist": game.get("wishlist"),
                "reason": recommendation_reason(&game, strategy),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "strategy": strategy,
        "heuristic": true,
        "count": recommendations.len(),
        "games": recommendations,
    }))
}

fn recommendation_score(game: &Value, strategy: &str) -> f64 {
    let playtime = game
        .get("playtimeForeverMinutes")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let wishlist = if game.get("wishlist").is_some_and(|value| !value.is_null()) {
        1.0
    } else {
        0.0
    };
    let metacritic = game
        .get("details")
        .and_then(|details| details.get("metacriticScore"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        / 100.0;
    let hltb_main = game
        .get("hltb")
        .and_then(|hltb| hltb.get("mainStory"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let unplayed = if playtime <= 0.0 { 1.0 } else { 0.0 };
    match strategy {
        "short" => unplayed * 4.0 + wishlist * 1.5 + (1.0 / (1.0 + hltb_main / 10.0)),
        "quality" => unplayed * 2.0 + wishlist + metacritic * 4.0,
        "surprise" => {
            unplayed * 2.0
                + wishlist * 0.5
                + (game.get("appId").and_then(Value::as_u64).unwrap_or(0) % 97) as f64 / 97.0
        }
        _ => unplayed * 4.0 + wishlist * 2.0 + metacritic + if hltb_main > 0.0 { 0.5 } else { 0.0 },
    }
}

fn recommendation_reason(game: &Value, strategy: &str) -> &'static str {
    let unplayed = game
        .get("playtimeForeverMinutes")
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
        <= 0.0;
    if unplayed && strategy == "short" {
        "Non ancora giocato e con una durata principale contenuta."
    } else if unplayed {
        "Non ancora giocato, con priorità ai dati disponibili e alla wishlist."
    } else if strategy == "quality" {
        "Selezionato in base alla qualità metadata disponibile."
    } else {
        "Candidato scelto dai dati locali della libreria."
    }
}

fn searchable_game_text(game: &Value) -> String {
    let mut values = Vec::new();
    values.push(
        game.get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    );
    for path in [["details", "genres"], ["details", "categories"]] {
        if let Some(items) = game
            .get(path[0])
            .and_then(|value| value.get(path[1]))
            .and_then(Value::as_array)
        {
            values.extend(
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string),
            );
        }
    }
    if let Some(collections) = game.get("collections").and_then(Value::as_array) {
        values.extend(
            collections
                .iter()
                .filter_map(|item| item.get("name"))
                .filter_map(Value::as_str)
                .map(ToString::to_string),
        );
    }
    values.join(" ").to_ascii_lowercase()
}

fn bounded_limit(value: Option<&Value>, fallback: usize) -> usize {
    value
        .and_then(Value::as_u64)
        .map(|limit| limit.clamp(1, MAX_RESULTS as u64) as usize)
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::{
        call_tool, dispatch_request, prompt_definitions, prompt_get, tool_definitions,
        tool_definitions_for_mode,
    };
    use crate::integration_access::PermissionMode;
    use serde_json::json;

    fn snapshot() -> serde_json::Value {
        json!({
            "schemaVersion": "repressurizer.library-snapshot.v1",
            "generatedAt": "2026-01-01T00:00:00Z",
            "summary": { "gameCount": 2 },
            "collections": [{ "key": "backlog", "name": "Backlog", "appIds": [10, 20] }],
            "games": [
                {
                    "appId": 10,
                    "name": "Alpha Quest",
                    "playtimeForeverMinutes": 0,
                    "hltb": { "mainStory": 8 },
                    "wishlist": { "priority": 1 },
                    "details": { "genres": ["RPG"], "categories": ["Single-player"], "metacriticScore": 80 },
                    "flags": { "nonGame": false }
                },
                {
                    "appId": 20,
                    "name": "Beta Racer",
                    "playtimeForeverMinutes": 120,
                    "hltb": null,
                    "wishlist": null,
                    "details": { "genres": ["Racing"], "categories": [], "metacriticScore": 70 },
                    "flags": { "nonGame": false }
                }
            ]
        })
    }

    #[test]
    fn advertises_only_read_only_tools() {
        let tools = tool_definitions();
        assert!(tools
            .iter()
            .any(|tool| tool.get("name") == Some(&json!("get_game"))));
        assert!(!tools.iter().any(|tool| tool
            .get("name")
            .and_then(|value| value.as_str())
            .is_some_and(|name| name.contains("write"))));
    }

    #[test]
    fn write_tools_follow_the_selected_profile_and_are_not_read_only() {
        let read_only = tool_definitions_for_mode(PermissionMode::ReadOnly);
        assert!(!read_only
            .iter()
            .any(|tool| tool.get("name") == Some(&json!("create_collection"))));
        let manage_library = tool_definitions_for_mode(PermissionMode::ManageLibrary);
        let create = manage_library
            .iter()
            .find(|tool| tool.get("name") == Some(&json!("create_collection")))
            .expect("library profile should advertise collection writes");
        assert_eq!(create["annotations"]["readOnlyHint"], json!(false));
        assert!(tool_definitions_for_mode(PermissionMode::Full)
            .iter()
            .any(|tool| tool.get("name") == Some(&json!("sam_achievement_action"))));
    }

    #[test]
    fn search_returns_matching_games() {
        let result = call_tool(
            &snapshot(),
            &json!({ "sessions": [] }),
            "search_games",
            &json!({ "query": "rpg" }),
        );
        assert_eq!(result.get("isError"), Some(&json!(false)));
        assert_eq!(result["structuredContent"]["count"], json!(1));
    }

    #[test]
    fn recommendation_is_deterministic_and_marks_heuristics() {
        let result = call_tool(
            &snapshot(),
            &json!({ "sessions": [] }),
            "recommend_games",
            &json!({ "strategy": "backlog" }),
        );
        assert_eq!(result["structuredContent"]["heuristic"], json!(true));
        assert_eq!(result["structuredContent"]["games"][0]["appId"], json!(10));
    }

    #[test]
    fn compact_context_combines_decision_ready_data() {
        let result = call_tool(
            &snapshot(),
            &json!({
                "sessions": [{ "appid": 20, "deltaMinutes": 30 }]
            }),
            "get_library_context",
            &json!({ "limit": 1 }),
        );
        assert_eq!(result["isError"], json!(false));
        assert_eq!(
            result["structuredContent"]["recommendations"][0]["appId"],
            json!(10)
        );
        assert_eq!(
            result["structuredContent"]["recentSessions"][0]["appid"],
            json!(20)
        );
    }

    #[tokio::test]
    async fn initialize_uses_json_rpc_response_shape() {
        let response = dispatch_request(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": { "protocolVersion": "2025-03-26" }
        }))
        .await
        .expect("initialize should succeed")
        .expect("request should receive a response");
        assert_eq!(response["jsonrpc"], json!("2.0"));
        assert_eq!(response["id"], json!(1));
        assert_eq!(response["result"]["protocolVersion"], json!("2025-03-26"));
        assert_eq!(
            response["result"]["capabilities"]["prompts"]["listChanged"],
            json!(false)
        );
    }

    #[test]
    fn prompts_are_user_controlled_and_actionable() {
        let prompts = prompt_definitions();
        assert_eq!(prompts.len(), 4);
        let prompt = prompt_get("prepare_next_session", &json!({ "game": "Alpha Quest" }))
            .expect("known prompt should resolve");
        assert_eq!(prompt["messages"][0]["role"], json!("user"));
        assert!(prompt["messages"][0]["content"]["text"]
            .as_str()
            .is_some_and(|text| text.contains("Alpha Quest")));
        assert!(prompt_get("unknown", &json!({})).is_err());
    }
}
