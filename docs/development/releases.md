# Release process

The desktop app, TypeScript integration package, and Rust integration crate have independent versions and tags. A version bump or a merged release PR is preparation, not proof that a GitHub Release has been published.

## Desktop version and tag conventions

- Stable: version `X.Y.Z`, tag `vX.Y.Z`, normal GitHub Release.
- Beta: version `X.Y.Z-beta.N`, tag `vX.Y.Z-beta.N` where `N` starts at 1, GitHub prerelease.

Tag reconciliation rejects other desktop prerelease names. The release workflow derives the channel from the version, marks beta releases as prereleases, and never marks them as GitHub's latest release.

## Stable desktop release

1. Keep `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the app entry in `src-tauri/Cargo.lock` on the same version.
2. Merge the version change into `main`.
3. Let **CI** finish successfully for the exact merged commit. It checks workflow syntax, release-gate regressions, TypeScript, localization, unit tests, Rust, the Linux executable, macOS bundles, and browser smoke tests.
4. Check **Documentation** separately when its path filters apply. The strict documentation build, documentation audit, browser checks, and Pages deployment are in `docs.yml`, not `ci.yml`; they are not an automatic prerequisite of tag reconciliation.
5. **Tag Release** accepts only successful main-branch push/manual CI from this repository. Manual reconciliation also verifies CI before creating any desktop or integration tags. Fork and pull-request runs do not authorize publication.
6. Reconciliation creates a missing desktop tag, or retries a missing/draft desktop release for an existing tag after verifying that tag's exact commit. It does not move tags, overwrite published releases, or duplicate an active release run.
7. **Release** builds Windows MSI/portable/CLI, Linux AppImage/Debian/CLI, and universal macOS bundles with their companions. It publishes release notes, updater manifests, checksums, and optional VirusTotal results.

The macOS job is a required release gate. It verifies both Intel and Apple Silicon slices, the ad-hoc app signature, DMG contents, updater archive, and updater signature before the Windows publisher job assembles the final release. The app is not Apple-notarized, so the first launch requires explicit approval in macOS Privacy & Security. See [macOS packaging](macos.md).

Manual release runs require an existing `v<version>` tag. A secret-free preflight validates its syntax and version, resolves it to an immutable commit SHA, and requires a successful CI run for that commit. Every platform checks out that resolved SHA. Do not move an existing tag merely to retry a failed build.

## Recover a stalled release

First inspect actual run status and the exact commit, rather than assuming a merged PR produced a release:

```bash
gh run list --repo Crimsab/Repressurizer --workflow ci.yml --branch main --limit 10
gh release view v0.8.6 --repo Crimsab/Repressurizer
```

Replace `v0.8.6` with the intended version. A `404` or an empty response is not by itself proof of an account suspension or proof that all releases were deleted. Check repository access, workflow permissions, and the individual release/tag endpoints.

When there is no completed CI run for current `main`, start one without pushing an empty commit:

```bash
gh workflow run ci.yml --repo Crimsab/Repressurizer --ref main
```

The workflow file must exist on the default branch for manual dispatch. Wait for the resulting **CI** run to succeed, then retry reconciliation when necessary:

```bash
gh workflow run tag-release.yml --repo Crimsab/Repressurizer --ref main
```

The reconciliation gate checks the most recent matching CI run. An older green run does not override a newer failed, cancelled, or still-running validation. API/permission failures stop reconciliation instead of being interpreted as successful checks.

For a published release with a separately diagnosed artifact or registry problem, use an explicit rebuild of its existing tag and verify the result; automatic reconciliation deliberately leaves published releases untouched:

```bash
gh workflow run release.yml --repo Crimsab/Repressurizer --ref main -f release_tag=v0.8.6
```

Re-running CI for an older commit does not validate a newer release commit. If Actions is unavailable, run the [local test suites](testing.md) and record the tested SHA and environment. Local test evidence is useful but does not automatically satisfy the GitHub release gate. Do not fabricate successful checks, remove signing requirements, or publish unsigned test binaries as stable to conceal a blocked pipeline.

## Beta desktop release

1. Set all desktop version files to the next base version plus `-beta.1`.
2. Merge into `main`; successful CI permits tag reconciliation to create the beta tag.
3. The release workflow builds all supported platforms, validates the beta manifests, signs the updater artifacts, and publishes a prerelease.
4. Increment `N` for another beta.

Promotion does not copy or rename beta binaries into stable. Set the base version without the beta suffix and produce new, versioned, signed stable artifacts from the validated commit.

## Channel manifest isolation

Installed apps request platform-and-channel targets such as `windows-x86_64-stable` or `linux-x86_64-beta`. The `updater-manifests` registry release holds one small manifest per target. Each release updates only its four channel files; artifact URLs point to the version tag that produced them. Stable releases also carry the legacy `latest.json` for older apps.

The release workflow validates version, tag, channel, platform target, artifact presence, download tag, and updater signature. Mixing stable and beta targets fails validation.

Since 0.8.8 the app sets `requireSignedVersion`: it installs an update only when the signature's trusted comment records the version the manifest announces (`version:0.8.8`), so a tampered manifest cannot pair a new version number with an older signed file. Tauri CLI 2.12 and later write that field during `tauri build`, and the workflow refuses to publish a manifest whose signature lacks it or records another version. Stable releases signed before 0.8.8 carry no version, so a beta cannot return to them. v0.8.7 was tagged but never published because its Windows build failed.

## Local packaging and temporary builds

`bun run build:linux` creates local unsigned Linux bundles using Tauri's `--no-sign` flag. The release workflow instead uses `bun run build:linux:release` and the private Tauri updater key in Actions secrets to produce `.AppImage.sig`. This key is unrelated to Apple signing, Steam credentials, or Repressurizer API tokens.

For a local Windows x64 portable test build, use `bun run build:windows:portable`. On Linux this uses `cargo-xwin`, embeds the Windows SAM bridge, enables Tauri's production `custom-protocol`, and verifies the Vite entry assets before copying the executable to `artifacts/windows-portable`. Set `REPRESSURIZER_ARTIFACT_DIR` to select another directory. Do not package a direct `cargo xwin build` without the production protocol feature: it can open `localhost:5173` instead of the bundled interface.

Keep local test artifacts outside public releases. Public desktop downloads use versioned stable/beta releases, not `test-*` tags or a release for every commit. Cross-compilation and browser mocks are not proof of native Windows runtime behavior.

## Safe repository cleanup

Before removing a temporary release, verify its exact tag, commit, prerelease status, and assets; preserve release metadata and checksum-verified binaries. Before deleting a branch, verify that its current head is the head of a merged PR, that its tree matches the resulting squash/merge tree, and that the merge commit belongs to `main`. Commit-count divergence alone does not establish unmerged work after a squash merge. Use ref leases to reject concurrent branch/tag changes.

Do not include versioned stable/beta tags, `updater-manifests`, or the legacy `preview` endpoint in a wildcard cleanup. The rolling preview workflow is retired, but already-installed preview clients can still refer to its update endpoint; removing it requires a separate migration decision.

## Rollback and channel recovery

- Never move or delete a published version tag.
- Fix a bad beta with a higher `beta.N`, or restore its four channel manifests from the previous known-good beta release.
- Fix a bad stable build with a higher patch version. To stop serving a bad update, restore the four stable registry manifests from the previous known-good stable release while preparing the fix.
- Never upload beta manifests under stable filenames. Verify all four registry assets and validate against the source release artifacts after recovery.
- Returning an installed beta to stable is a user-selected, confirmed downgrade; automatic checks do not silently switch channels.

## Integration packages

`packages/integration/package.json` and `packages/rust/Cargo.toml` have independent versions and tags. Reconciliation creates missing integration tags only after CI succeeds. Publishing workflows validate the tag/package version relationship. Desktop release recovery does not republish existing npm or crates.io versions.

Release automation uses pinned GitHub Action revisions. Review Dependabot's proposed updates before changing them.
