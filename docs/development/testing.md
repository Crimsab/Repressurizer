# Testing

Run checks from the repository root after installing the pinned Bun version from `.bun-version` and the Rust toolchain used by CI. Start with `bun install --frozen-lockfile`; do not silently regenerate the lockfile to make a failing installation pass.

## Frontend and shared TypeScript

```bash
bun run check
bun run test:unit
bun run build
```

`check` verifies translations, TypeScript, and the TypeScript integration package. Unit tests cover domain helpers and stores without requiring Steam. A frontend build is not a native desktop build.

To check the generated localization report without modifying its committed result:

```bash
bun run i18n:status:write
git diff --exit-code -- docs/localization.md
```

## Release-gate regression tests

These tests use Node's built-in test runner (Node 22 or newer), require no package installation, and do not call GitHub or change remote state:

```bash
node --test scripts/verify-release-ci.test.mjs
```

They cover trusted main push/manual runs, rejection of fork/PR/other-commit runs, the most recent validation taking precedence, failure and cancellation states, input validation, API errors, and bounded waiting. They do not prove that GitHub Actions currently has permission to run or publish.

## Browser smoke tests

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright output is stored under `playwright-report/` and `test-results/`. Browser tests using mocked Tauri APIs do not replace native tests against real Steam files. Record any retries instead of describing an initially failing suite as an unconditional first-pass success.

## Rust

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path packages/rust/Cargo.toml
```

When running isolated app checks without packaged sidecars, CI sets `TAURI_CONFIG` to `{"bundle":{"externalBin":[]}}` for `cargo check`, Clippy, and app tests. Set that environment variable using the syntax of your shell when reproducing those checks. Do not use this override to produce a release that is supposed to include its companions.

Changes to collection parsing, backup behavior, redaction, snapshot contracts, or write guards need regression coverage at the owning boundary.

## Documentation

```bash
python -m pip install --requirement requirements-docs.txt
python -m mkdocs build --strict
bun run docs:audit
bunx playwright install chromium
bun run test:docs
```

The documentation workflow uses Python 3.13 and installs `pngquant` for image optimization. Its browser reports use `playwright-report-docs/` and `test-results-docs/`. Documentation checks run in the separate `Documentation` workflow; a green main `CI` run alone does not prove that these checks passed.

## Native platform checks

Use the platform build commands described in [releases](releases.md) and [macOS packaging](macos.md). Preserve a backup and use disposable test data before testing real collection writes. Report the tested commit, operating system, build command, passed/failed/ignored tests, and whether Steam integration and update/restart behavior were actually exercised.

A cancelled or missing workflow is not a successful check. See [release recovery](releases.md#recover-a-stalled-release) for manual CI dispatch and permission failures.
