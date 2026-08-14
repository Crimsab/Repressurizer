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

On macOS, create a universal app bundle and DMG with:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
bun run build:macos
```

The release command also creates the signed `.app.tar.gz` updater artifact. It needs the Tauri updater signing key and the Apple signing/notarization environment described in [macOS packaging](macos.md). CI uses an ad-hoc signature only for structural bundle smoke tests; release artifacts require Developer ID signing and notarization.

Do not commit Steam API keys, Store tokens, private paths, personal library exports, generated build output, or Playwright reports.
