# Development setup

## Requirements

- Bun matching `.bun-version`.
- Rust matching `rust-toolchain.toml`.
- Tauri development dependencies for your operating system.
- WebView2 and Visual Studio Build Tools for Windows desktop builds.
- WebKitGTK 4.1, AppIndicator, and librsvg development packages for Linux desktop builds.
- Xcode Command Line Tools plus the `aarch64-apple-darwin` and `x86_64-apple-darwin` Rust targets for universal macOS builds.

## Install and run

```bash
bun install --frozen-lockfile
bun run dev
```

For the Tauri application:

```bash
bun tauri dev
```

Create local Linux AppImage and Debian bundles with:

```bash
bun run build:linux
```

The local Linux command deliberately skips code and updater signing, so it does
not require any private key. Release automation uses `bun run build:linux:release`
instead; that command requires the Tauri updater minisign private key through
`TAURI_SIGNING_PRIVATE_KEY` and, when configured, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
The private key must never be committed or placed in a local project file.

On macOS, create a universal app bundle and DMG with:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
bun run build:macos
```

The release command also creates the signed `.app.tar.gz` updater artifact. It needs the Tauri updater signing key described in [macOS packaging](macos.md). Both CI and release builds use an ad-hoc macOS code signature and require no Apple Developer credentials.

Do not commit Steam API keys, Store tokens, private paths, personal library exports, generated build output, or Playwright reports.
