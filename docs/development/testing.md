# Testing

## Frontend and shared TypeScript

```bash
bun run check
bun run test:unit
```

`check` verifies translations, TypeScript, and the TypeScript integration package. Unit tests cover domain helpers and stores without requiring a real Steam installation.

## Browser smoke tests

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright output is stored under `playwright-report/` and `test-results/`.

## Rust

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path packages/rust/Cargo.toml
```

Changes to collection parsing, backup behavior, redaction, snapshot contracts, or write guards should include a focused regression test at the owning boundary.
