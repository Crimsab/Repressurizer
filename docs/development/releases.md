# Release process

The desktop app, TypeScript integration package, and Rust integration crate have independent versions and tags.

## Desktop version and tag conventions

- Stable: version `X.Y.Z`, tag `vX.Y.Z`, normal GitHub Release.
- Beta: version `X.Y.Z-beta.N`, tag `vX.Y.Z-beta.N` where `N` starts at 1,
  GitHub prerelease.
- Developer preview: rolling `0.0.0-preview.N` build and moving `preview` tag;
  it is separate from both user-selectable channels.

The tag workflow rejects other desktop prerelease names. The release workflow
derives the channel from the version, marks beta releases as prereleases, and
never marks them as GitHub's latest release.

## Stable desktop release

1. Update the app version consistently in the versioned project files.
2. Push the version commit to `main`.
3. CI validates TypeScript, Rust, browser smoke tests, and the documentation build.
4. After CI succeeds, the tag workflow creates `v<version>` if it does not exist.
5. The release workflow builds Windows, Linux, and a universal macOS desktop bundle, then publishes a shared updater manifest, release notes, and optional VirusTotal results.

The macOS job is a required release gate. It verifies both Intel and Apple Silicon slices, the app signature, Gatekeeper assessment, notarization ticket, DMG, updater archive, and updater signature before the Windows publisher job assembles the final release. See [macOS packaging](macos.md) for the required Apple secrets.

## Beta desktop release

1. Choose the next stable base version and set all desktop version files to
   `X.Y.Z-beta.1`.
2. Push the version commit to `main`; after CI succeeds, tag reconciliation
   creates `vX.Y.Z-beta.1`.
3. The normal release workflow builds every supported platform, validates the
   beta-only manifests, signs the updater artifacts, and publishes a prerelease.
4. For another beta, increment only `N` and repeat.

Beta promotion does not copy or rename beta binaries into stable. Set the same
base version to `X.Y.Z`, run the full stable release from the validated commit,
and let the workflow produce newly versioned and signed stable artifacts.

## Channel manifest isolation

Installed apps request a platform-and-channel target such as
`windows-x86_64-stable` or `linux-x86_64-beta`. The updater registry release
(`updater-manifests`) holds one small manifest per target. Each release updates
only the four files belonging to its own channel; artifact URLs still point to
the immutable version tag that produced them. The legacy `latest.json` remains
attached to stable releases for older app versions.

The release workflow validates version, tag, declared channel, platform target,
artifact presence, download tag, and updater signature before publishing. A
beta manifest with a stable target (or the reverse) fails validation.

## Rollback and channel recovery

- Do not move or delete a published version tag.
- For a bad beta, publish a higher `beta.N` with the fix, or restore the four
  beta manifest assets from the previous known-good beta release.
- For a bad stable release, fix forward with a higher patch version. If checks
  must stop immediately, restore the four stable manifest assets from the
  previous known-good stable release while preparing that patch.
- Never upload beta manifests under stable filenames. Verify all four registry
  assets after recovery and run the manifest validator against the source
  release artifacts.
- Returning an installed beta to stable is a user-selected, confirmed updater
  downgrade; automatic checks never silently switch channels.

## Preview

Every commit on `main` starts the Preview workflow. It replaces the rolling Windows `preview` prerelease and produces a preview-specific updater manifest. Linux uses stable releases until the preview workflow gains matching Linux artifacts.

## Integration packages

Changes to `packages/integration/package.json` or `packages/rust/Cargo.toml` create their respective tags only after CI succeeds. Publishing workflows validate that the tag matches the package version before publishing.

Release automation uses pinned GitHub Action revisions. Dependabot proposes action updates so each new revision can be reviewed explicitly.
