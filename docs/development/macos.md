# macOS packaging

## Supported architecture

Repressurizer targets macOS 11 or newer with one `universal-apple-darwin` application containing both `arm64` and `x86_64` slices. Tauri must build macOS bundles on a Mac; Linux and Windows cannot produce the intended `.app` and DMG. The CI bundle job therefore runs on GitHub's Apple Silicon `macos-15` runner after installing both Rust targets.

The public download is a universal DMG. Tauri also creates `Repressurizer.app.tar.gz` and its minisign signature for the updater. Both `darwin-aarch64` and `darwin-x86_64` entries in `latest.json` reference that universal updater archive.

## Steam data access

The direct-download build is intentionally not App Sandbox enabled. Repressurizer needs user-selected access to Steam data under `~/Library/Application Support/Steam`, including:

- `config/loginusers.vdf` for local account detection;
- `userdata/<id3>/config/cloudstorage` for collection JSON and LevelDB data;
- the existing backup files stored beside the collection catalog.

The save and restore paths use the same backup implementation as Windows and Linux. The write guard checks both `steam_osx` and `Steam` process names and refuses collection writes while Steam is open. Steam Achievement Manager capabilities remain explicitly unsupported because the embedded bridge is Windows-only.

## Signing and notarization

Direct distribution requires a **Developer ID Application** certificate and Apple notarization. The release workflow expects these repository secrets:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID `.p12` certificate. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the certificate. |
| `APPLE_SIGNING_IDENTITY` | Full Developer ID Application identity shown by `security find-identity`. |
| `APPLE_ID` | Apple account used for notarization. |
| `APPLE_PASSWORD` | App-specific password for that account. |
| `APPLE_TEAM_ID` | Apple Developer team identifier. |
| `TAURI_SIGNING_PRIVATE_KEY` | Existing Tauri updater signing key. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the updater signing key. |

The release job imports the certificate into an ephemeral keychain. Tauri signs, notarizes, and staples the app and DMG. The job then runs `codesign`, `spctl`, and `xcrun stapler validate`; any missing credential or failed assessment blocks the release.

Follow the current [Tauri macOS signing and notarization guide](https://v2.tauri.app/distribute/sign/macos/) when creating or rotating Apple credentials. Tauri documents `.app` and DMG creation in its [macOS distribution guide](https://v2.tauri.app/distribute/), while GitHub lists runner architecture and labels in the [hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Local and CI validation

On a Mac with both Rust targets installed:

```bash
bun install --frozen-lockfile
bun run build:macos
```

Pull-request CI uses `src-tauri/tauri.macos-ci.conf.json` to disable updater artifacts and apply an ad-hoc signature. It verifies the two binary slices, the app signature, and mounts the generated DMG. This proves packaging without pretending that an ad-hoc CI bundle is suitable for distribution. Only the signed and notarized release job uploads public macOS assets.
