# SAM sidecar architecture

Repressurizer keeps the local Steam Achievement Manager bridge in a separate
`repressurizer-sam` executable on Windows. The main desktop process contains
the normal library tools and a small JSON client; it starts the sidecar only
when a SAM probe, schema refresh, or explicitly enabled achievement action is
requested.

This boundary is intentional. The bridge needs Windows process discovery and
Steamworks loading, while the normal app should not expose those imports to
Windows antivirus heuristics during ordinary library management. The Windows
Tauri bundle still includes the matching sidecar as an external binary. The
portable executable also contains an exact copy of that sidecar, so a portable
distribution can consist of one `.exe` and work offline without downloading
anything. When the app needs SAM and no sibling/resource sidecar is present,
it writes the embedded bytes to a per-version directory under `%TEMP%`, checks
their SHA-256/integrity, and launches that temporary executable. Nothing is
extracted during normal library-only use.

An external sidecar is preferred when present (for example in a Tauri install
or a developer build). This keeps development and installer behavior explicit,
while the embedded fallback makes the portable artifact self-contained. The
temporary executable may remain in `%TEMP%` after the first SAM operation; it is
not part of the portable folder and is reused only when its contents still
match the embedded payload.

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
Tauri external binaries. The same build step creates the payload used by the
portable executable. `REPRESSURIZER_SAM_PATH` can point to a sidecar during
local protocol tests; it is not persisted in application settings.
