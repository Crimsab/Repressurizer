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

## Ad-hoc signing and Gatekeeper

Repressurizer uses Tauri's ad-hoc signing identity (`-`) for direct macOS
distribution. It does not require an Apple Developer account, certificate, or
notarization credentials. The updater archive remains cryptographically signed
with the normal Tauri updater key, so the release workflow still requires
`TAURI_SIGNING_PRIVATE_KEY` and its optional password.

Ad-hoc signing satisfies Apple Silicon's requirement that application code has
a signature, but it does not establish an identified developer or notarization
ticket. Gatekeeper therefore requires the user to approve Repressurizer on the
first launch through **System Settings > Privacy & Security > Open Anyway**.
Subsequent launches work normally. This limitation cannot be removed without a
Developer ID certificate and Apple notarization.

The release job verifies the universal binary, deep code signature, mounted DMG,
updater archive, and updater signature. Follow Tauri's current
[macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) for the
distinction between ad-hoc and Developer ID signing. Apple documents the
[manual Gatekeeper approval flow](https://support.apple.com/102445).

## Local and CI validation

On a Mac with both Rust targets installed:

```bash
bun install --frozen-lockfile
bun run build:macos
```

Pull-request CI uses `src-tauri/tauri.macos-ci.conf.json` to disable updater artifacts while exercising the same ad-hoc signature. It verifies the two binary slices, the app signature, and mounts the generated DMG. The release job additionally creates and validates the signed updater archive before uploading the public assets.
