# Architecture

Repressurizer keeps the browser-facing interface separate from filesystem and Steam integration code.

```text
React pages and components
  -> Zustand stores and TypeScript domain helpers
  -> typed Tauri command wrappers
  -> Rust Tauri commands
  -> Steam files, caches, HTTP providers, and app data
```

## Frontend

`src/components` owns application surfaces. `src/stores` owns client state, while `src/lib` contains reusable domain operations such as search, exports, AutoCat preview/apply logic, save previews, metadata refresh, and redaction.

## Rust backend

`src-tauri/src/steam` owns Steam detection, local library parsing, collections, shortcuts, Depressurizer imports, and guarded Steam tooling. Other Rust modules own application data, runtime cache, HTTP policy, HLTB access, and automation snapshots.

The integration boundary is split between `src-tauri/src/mcp.rs` and
`src-tauri/src/api.rs`. `ReadModel` loads the normalized library snapshot and
observed play history with a short per-process cache. Both transports delegate
mutations to the same permission-checked operation seam, so MCP and HTTP cannot
drift into different safety rules.

```text
local Steam/cache data
  -> automation snapshot + observed play history
  -> cached ReadModel + user-selected capability profile
       -> embedded loopback runtime (enabled explicitly)
          -> MCP stdio adapter (`repressurizer-mcp`)
          -> tools + user-controlled prompts
          -> authenticated loopback JSON API (enabled explicitly)
           -> guarded collection/SAM domain writes
       -> future reverse tunnel adapter (not enabled)
```

Play history is intentionally event-based. Repressurizer records the first
observation separately from the first positive playtime delta, so an existing
Steam lifetime counter is never presented as a historically known first launch.

## Integration packages

`packages/integration` publishes the TypeScript snapshot contract. `packages/rust` publishes the matching Rust crate. Both are validated against shared snapshot fixtures and versioned independently from the desktop app.

## Safety boundary

Filesystem and network side effects belong behind explicit Tauri or CLI commands. Collection writes must preserve the preview and backup-first invariants rather than being triggered indirectly from view state.

MCP/API are capability gates, not arbitrary computer-control channels. They are
disabled by default, bind locally, and keep writes behind the user-selected
profile plus per-operation confirmation. The embedded runtime creates a fresh
per-process bearer token and a private atomic descriptor; the stdio companion
never becomes a second state owner. CORS is disabled; any reverse tunnel must
remain a separate, explicit adapter with its own authorization and opt-in
lifecycle.
