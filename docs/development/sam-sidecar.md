# SAM sidecar architecture

Repressurizer keeps the local Steam Achievement Manager bridge in a separate
`repressurizer-sam` executable on Windows. The main desktop process contains
the normal library tools and a small JSON client; it starts the sidecar only
when a SAM probe, schema refresh, or explicitly enabled achievement action is
requested.

This boundary is intentional. The bridge needs Windows process discovery and
Steamworks loading, while the normal app should not expose those imports to
Windows antivirus heuristics during ordinary library management. The Windows
Tauri bundle includes the matching sidecar as an external binary, and the
portable/CLI archives include it beside the executable. If it is missing, the
UI reports SAM as unavailable and blocks writes instead of silently falling
back to an embedded bridge.

Linux and macOS continue to build the core app without the Windows SAM sidecar.
The cross-platform library features remain available; local SAM achievement
editing is reported as unsupported because the current Steamworks bridge is
Windows-first.

## Local build

On a Windows host, or when a Windows cross toolchain is configured, prepare the
sidecar with:

```sh
bun run build:sam-sidecar
```

The Tauri Windows build invokes this step automatically and expects the target
binary under `src-tauri/binaries/` with the target-triple suffix required by
Tauri external binaries. `REPRESSURIZER_SAM_PATH` can point to a sidecar during
local protocol tests; it is not persisted in application settings.
