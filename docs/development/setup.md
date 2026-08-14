# Development setup

## Requirements

- Bun matching `.bun-version`.
- Rust matching `rust-toolchain.toml`.
- Tauri development dependencies for your operating system.
- WebView2 and Visual Studio Build Tools for Windows desktop builds.
- WebKitGTK 4.1, AppIndicator, and librsvg development packages for Linux desktop builds.

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

Do not commit Steam API keys, Store tokens, private paths, personal library exports, generated build output, or Playwright reports.
