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

## Integration packages

`packages/integration` publishes the TypeScript snapshot contract. `packages/rust` publishes the matching Rust crate. Both are validated against shared snapshot fixtures and versioned independently from the desktop app.

## Safety boundary

Filesystem and network side effects belong behind explicit Tauri or CLI commands. Collection writes must preserve the preview and backup-first invariants rather than being triggered indirectly from view state.
