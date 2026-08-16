# Local HTTP API

Repressurizer includes an opt-in loopback HTTP API for local scripts,
dashboards, browser agents, and clients that cannot launch an MCP stdio
process. It is an adapter over the same read model and guarded write operations
used by MCP; it is not a hosted backend.

Enable **API** or **MCP** in **Settings → Integrations → MCP/API**. Repressurizer
then starts one embedded loopback listener automatically; there is no port to
reserve and no second server process to keep alive:

```text
repressurizer-cli api token
repressurizer-cli api status
```

Disabling both toggles stops the listener and removes its private runtime
descriptor. The legacy `repressurizer-cli api serve` command is retained only
as a compatibility fallback for older installations and refuses to start when
the embedded listener is already present.

The listener binds to `127.0.0.1` on an ephemeral port chosen at startup. The
CLI discovers the current address and per-process bearer token through a
user-private, atomically written descriptor; the token command is intentionally
the only supported way to print it. Do not put it in a URL, browser history,
prompt, or log.

## Scope

The API is a loopback-only adapter over the same `ReadModel` used by MCP. It is
for local agents, scripts, and dashboards; it is not a hosted backend and it
must not expose Steam credentials or arbitrary file access. Read routes are
available to authenticated callers, while the selected profile gates the small
set of explicit Repressurizer-domain write routes below.

## v1 endpoints

```text
GET /v1/health
GET /v1/status
GET /v1/library/summary
GET /v1/library?limit=50&cursor=<opaque>
GET /v1/games/<appId>
GET /v1/collections
GET /v1/play-history?limit=50&cursor=<opaque>
GET /v1/recommendations?strategy=backlog&limit=10
GET /v1/permissions
GET /v1/games?query=<text>&wishlistOnly=true&limit=50&cursor=<opaque>
POST /v1/collections/membership
POST /v1/collections
POST /v1/sam/action
```

List responses use a hard limit and opaque cursor:

```json
{
  "data": { "items": [], "nextCursor": null },
  "meta": { "apiVersion": "v1", "generatedAt": "..." }
}
```

Unknown games return `404`; malformed parameters return `400`; a disabled
write profile returns `403`; an unavailable Steam snapshot returns `503`.
Errors use one stable shape:

```json
{
  "error": {
    "code": "snapshot_unavailable",
    "message": "Complete Steam setup before requesting library data."
  }
}
```

Responses include an `ETag` and support `If-None-Match`, so polling clients do
not repeatedly download unchanged data. CORS is disabled and the server closes
each HTTP connection after one bounded request.

## Security model

- Bind to `127.0.0.1` only; no LAN or public bind by default.
- Generate a fresh random bearer token for every app process and keep it out of
  logs, URLs, settings, and WebView state.
- Store only the current endpoint, token, and process nonce in a user-private
  runtime descriptor (`0700` directory, `0600` file on Unix). A stop operation
  removes the descriptor only if its nonce still belongs to that process.
- Require the token for every request except `/v1/health`.
- Disable CORS; callers must be local processes or an explicitly configured
  local bridge.
- The selected `readOnly`, `manageLibrary`, or `full` profile controls which
  write routes are accepted. Every write body must contain `confirm: true`.
- Collection writes reuse Steam's automatic backup path. SAM writes are only
  accepted by `full`, require Steam Tools write settings, and are still subject
  to SAM's platform and bridge checks.
- Collection and SAM mutations acquire a cross-process OS lock, so a desktop
  write, MCP process, and API process cannot perform overlapping integration
  writes. A lock held longer than the bounded wait is rejected safely.
- Accepted and rejected write attempts append a redacted local record to
  `integration_audit.jsonl`; bearer tokens and backup paths are never logged.
- No endpoint exposes arbitrary filesystem, shell, Steam-account, or outbound
  network operations.

## Relationship to MCP

The HTTP server is an adapter, not a second data implementation. MCP stdio is a
thin client of the same embedded listener, while HTTP is useful when many local
callers need the same compact JSON. A future Streamable HTTP MCP adapter or
reverse tunnel must remain a separate, explicit, authenticated feature.

The machine-readable contract is also checked in
[`openapi.yaml`](openapi.yaml). The OpenAPI file documents the stable v1 read
surface and the confirmation/profile rules for writes.
