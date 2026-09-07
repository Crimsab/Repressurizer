# Release process

The desktop app, TypeScript integration package, and Rust integration crate have independent versions and tags.

## Desktop version and tag conventions

- Stable: version `X.Y.Z`, tag `vX.Y.Z`, normal GitHub Release.
- Beta: version `X.Y.Z-beta.N`, tag `vX.Y.Z-beta.N` where `N` starts at 1,
  GitHub prerelease.
The tag workflow rejects other desktop prerelease names. The release workflow
derives the channel from the version, marks beta releases as prereleases, and
never marks them as GitHub's latest release.

## Stable desktop release

1. Update the app version consistently in the versioned project files.
2. Push the version commit to `main`.
3. CI validates TypeScript, Rust, browser smoke tests, and the documentation build.
4. After CI succeeds, the tag workflow creates `v<version>` if it does not exist.
5. The release workflow builds a Windows MSI/portable/CLI (including the MCP companion), Linux AppImage/Debian/CLI (including the MCP companion), and a universal macOS desktop bundle with its companion, then publishes a shared updater manifest, release notes, and optional VirusTotal results.

The macOS job is a required release gate. It verifies both Intel and Apple Silicon slices, the ad-hoc app signature, DMG contents, updater archive, and updater signature before the Windows publisher job assembles the final release. The app is not Apple-notarized, so the first launch requires explicit approval in macOS Privacy & Security. See [macOS packaging](macos.md).

Manual release runs require an existing `v<version>` tag. A secret-free preflight
validates its syntax and version, resolves it once to an immutable commit SHA,
and requires a successful CI run for that commit. Every platform then checks out
the same resolved SHA. This permits a failed release pipeline to be rebuilt
without moving the tag, exposing signing keys to unvalidated source, or building
untagged source.

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

Local Linux packaging uses `bun run build:linux`, which passes Tauri's
`--no-sign` flag and is suitable for install/runtime testing without secrets.
The release workflow uses `bun run build:linux:release` with the private Tauri
updater key held in GitHub Actions secrets; this is the key that produces the
`.AppImage.sig` updater artifact and is unrelated to Apple Developer signing,
Steam credentials, or Repressurizer API tokens.

For a local Windows x64 portable test build, use
`bun run build:windows:portable`. On Linux this uses `cargo-xwin`, embeds the
Windows SAM bridge, enables Tauri's production `custom-protocol`, and verifies
that the generated executable contains the Vite entry assets before copying it
to `artifacts/windows-portable`. Set `REPRESSURIZER_ARTIFACT_DIR` to choose a
different output directory. Do not package the result of a direct
`cargo xwin build`: without the production protocol feature it opens the Vite
development URL (`localhost:5173`) instead of the bundled interface.

This command is for local verification. Keep its artifacts outside the public
repository and do not create a GitHub Release or rolling tag for a test build;
public desktop downloads use the versioned stable/beta workflow above.

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

## Integration packages

Changes to `packages/integration/package.json` or `packages/rust/Cargo.toml` create their respective tags only after CI succeeds. Publishing workflows validate that the tag matches the package version before publishing.

Release automation uses pinned GitHub Action revisions. Dependabot proposes action updates so each new revision can be reviewed explicitly.
