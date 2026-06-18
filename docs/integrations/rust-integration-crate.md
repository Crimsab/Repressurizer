# Rust Integration Crate

The Rust crate mirrors the TypeScript integration package for receivers written in Rust.

- Crate: `repressurizer-integration`
- Directory: `packages/rust`
- Schema: `repressurizer.library-snapshot.v1`
- Publish secret for token-based crates.io releases: `CARGO_REGISTRY_TOKEN`
- Tag format: `rust-integration-v<packages/rust/Cargo.toml version>`

## Local Checks

```bash
cargo check --manifest-path packages/rust/Cargo.toml
cargo test --manifest-path packages/rust/Cargo.toml
cargo publish --dry-run --manifest-path packages/rust/Cargo.toml
```

The crate exposes serde structs, runtime validation, checksum verification, appId lookup helpers, HLTB lookup, and snapshot diffing.

## GitHub Actions

Workflow: `.github/workflows/publish-rust-integration.yml`

The workflow validates by default with `cargo publish --dry-run` and publishes only when:

- a tag matching `rust-integration-v*` is pushed, or
- `workflow_dispatch` is run with `dry_run: false`.

For token-based publishing, create a GitHub Actions secret named `CARGO_REGISTRY_TOKEN` with a crates.io API token.

Crates.io also supports Trusted Publishing/OIDC. As with npm, keep the first token-based/manual release as the bootstrap path, then we can move the workflow to OIDC after the crate exists and has a trusted publisher configuration.

## Update Behavior

This crate is validated by normal CI, but publishing is release-gated. It only publishes from a matching tag or an explicit manual dispatch with `dry_run: false`.

To publish a Rust library update, bump `packages/rust/Cargo.toml`, merge the validated change, then create `rust-integration-v<version>`.
