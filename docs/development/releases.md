# Release process

The desktop app, TypeScript integration package, and Rust integration crate have independent versions and tags.

## Stable desktop release

1. Update the app version consistently in the versioned project files.
2. Push the version commit to `main`.
3. CI validates TypeScript, Rust, browser smoke tests, and the documentation build.
4. After CI succeeds, the tag workflow creates `v<version>` if it does not exist.
5. The release workflow builds the Windows installer, portable executable, CLI, updater manifest, release notes, and optional VirusTotal results.

## Preview

Every commit on `main` starts the Preview workflow. It replaces the rolling `preview` prerelease and produces a preview-specific updater manifest.

## Integration packages

Changes to `packages/integration/package.json` or `packages/rust/Cargo.toml` create their respective tags only after CI succeeds. Publishing workflows validate that the tag matches the package version before publishing.

Release automation uses pinned GitHub Action revisions. Dependabot proposes action updates so each new revision can be reviewed explicitly.
