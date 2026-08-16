# Local MCP integration

Repressurizer includes an optional Model Context Protocol (MCP) integration for
local agents. It is disabled by default. When MCP or API is enabled, the app
starts one authenticated loopback listener and keeps the state in the Tauri
process; the default capability profile is read-only.

## Enable it

Open **Settings → Integrations → MCP/API**, enable MCP, and choose one profile:

- **Read-only**: library, metadata, history, recommendations, and prompts.
- **Manage library**: read-only plus collection membership and collection
  creation. Every mutation needs `confirm: true` and creates a Steam backup.
- **Full Repressurizer**: the previous operations plus the guarded SAM action
  when Steam Tools is enabled and the local bridge supports it.

The toggle is a permission boundary for the integration and also controls the
embedded listener lifecycle. Turning both API and MCP off stops the listener.

The current agent transport is stdio, implemented by a bundled
`repressurizer-mcp` adapter. Configure an MCP-capable client with:

```text
repressurizer-cli mcp config
```

The generated command uses `repressurizer-mcp` when the companion is next to the
CLI and falls back to `repressurizer-cli mcp stdio` for older/manual installs.
The adapter forwards JSON-RPC to the running app; it does not read settings,
Steam files, or secrets itself.

This works for a desktop client that can launch a local command. A browser tab
cannot start an arbitrary process on the host by itself; use the authenticated
loopback [HTTP API](local-api.md) for local scripts and browser-compatible
connectors.

To generate a client-specific JSON fragment with the absolute CLI path, run:

```text
repressurizer-cli mcp config
```

Before connecting an agent, run the local checker:

```text
repressurizer-cli mcp doctor
```

For a direct transport check (without printing the bearer token), run the
packaged adapter while Repressurizer is open:

```text
repressurizer-mcp --self-test
```

It reports whether the settings file, MCP toggle, CLI, local play history, and
snapshot prerequisites are ready, without printing API keys or tokens. To
merge the generated server entry into an existing generic JSON client config:

```text
repressurizer-cli mcp install /path/to/client-mcp.json
```

The command writes only `mcpServers.repressurizer` and preserves other server
entries. Use `repressurizer-cli mcp prompt` to list copy-ready starter prompts,
or `repressurizer-cli mcp prompt choose_next_game` for one prompt.

The desktop installers bundle the MCP adapter with the app where the platform
supports Tauri external binaries. The release CLI archive also contains the
adapter for clients that are installed separately; keep both files from the
same release.

For a generic stdio client, the generated entry has this shape (the CLI path is
absolute on your machine):

```json
{
  "mcpServers": {
    "repressurizer": {
      "command": "/path/to/repressurizer-mcp",
      "args": []
    }
  }
}
```

The easiest hand-off is to send the output of `mcp config` to the person
setting up the client, then have them run `mcp doctor` after placing the CLI on
their PATH. The prompt command is similarly copy-ready:

```text
repressurizer-cli mcp prompt choose_next_game
```

## Exposed data

The server exposes only local, normalized data:

- `get_library_context`
- `library_summary`
- `search_games`
- `get_game`
- `list_collections`
- `get_play_history`
- `recommend_games`

It also exposes the `repressurizer://library` and
`repressurizer://play-history` resources. Recommendations are deterministic
heuristics based on the current snapshot; they are not an AI-generated source
of truth.

`get_library_context` is the compact entry point: it combines the summary,
recent observed sessions, collections, and a small recommendation set so an
agent does not need several round trips just to decide what to do next.

The play-history tool and resource are local-only and can be read without a
live Steam Web API request. Snapshot-backed tools require the normal Repressurizer
Steam setup and available library data.

The repository keeps a ten-scenario integration eval set in
[`mcp-evals.xml`](mcp-evals.xml). It covers composition, recovery, pagination,
partial metadata, permission confirmation, and the Linux/SAM boundary.

The server also exposes user-controlled prompts such as `choose_next_game`,
`review_backlog`, `summarize_recent_play`, and `prepare_next_session`. Prompts
are templates, not hidden instructions: the user chooses when to request one
and the client decides whether to call the read-only tools it references.

When the selected profile is read-only, no tool can modify Steam, collections,
Repressurizer settings, or the filesystem. In write profiles, only the
explicitly documented Repressurizer-domain tools are advertised:

- `set_collection_membership`
- `create_collection`
- `sam_achievement_action` (Full profile only)

Every mutation requires `confirm: true`; the client should show the exact
operation to the user before sending it. API keys, bearer tokens, cookies, and
full Steam IDs are not returned. Accepted and rejected write attempts are kept
in a redacted local `integration_audit.jsonl` record; Steam collection writes
also create the normal automatic backup.
Collection and SAM mutations use a cross-process OS lock shared with the
desktop and HTTP API paths. If another write holds it beyond the bounded wait,
the new operation is rejected instead of risking a lost update.

## Permission model

The capability profile is deliberately broad only inside Repressurizer's own
domain. It never grants an agent arbitrary filesystem, shell, Steam-account, or
network access. MCP clients can be model-controlled, so the client should keep
the user in the loop for tool use, as described in the [MCP tools
specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## Play history semantics

Play history is based on observed Steam library refreshes. A first observation
with existing lifetime playtime is stored as a baseline. Repressurizer records a
session only after a later positive playtime delta. It does not claim to know a
game's historical first launch date.

## HTTP and tunnel transport

The loopback API reuses the same read model and write seam. It requires a
per-process bearer token and is started automatically while API or MCP is
enabled. CORS is disabled. A reverse tunnel would be a separate opt-in bridge
for remote clients such as ChatGPT; it must not be the default network
behavior.
