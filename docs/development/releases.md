# Release process

The desktop app, TypeScript integration package, and Rust integration crate have independent versions and tags.

## Stable desktop release

1. Update the app version consistently in the versioned project files.
2. Push the version commit to `main`.
3. CI validates TypeScript, Rust, browser smoke tests, and the documentation build.
4. After CI succeeds, the tag workflow creates `v<version>` if it does not exist.
5. The release workflow builds Windows, Linux, and a universal macOS desktop bundle, then publishes a shared updater manifest, release notes, and optional VirusTotal results.

The macOS job is a required release gate. It verifies both Intel and Apple Silicon slices, the app signature, Gatekeeper assessment, notarization ticket, DMG, updater archive, and updater signature before the Windows publisher job assembles the final release. See [macOS packaging](macos.md) for the required Apple secrets.

## Preview

Every commit on `main` starts the Preview workflow. It replaces the rolling Windows `preview` prerelease and produces a preview-specific updater manifest. Linux uses stable releases until the preview workflow gains matching Linux artifacts.

## Integration packages

Changes to `packages/integration/package.json` or `packages/rust/Cargo.toml` create their respective tags only after CI succeeds. Publishing workflows validate that the tag matches the package version before publishing.

Release automation uses pinned GitHub Action revisions. Dependabot proposes action updates so each new revision can be reviewed explicitly.
