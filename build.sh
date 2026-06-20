#!/bin/bash
# Build Repressurizer for Windows from Linux with cargo-xwin.
set -e

export PATH="/root/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")"

echo "=== Building Repressurizer for Windows ==="
VERSION="$(bun -e "console.log(JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version)")"

echo "→ SAM bridge sidecar..."
bun run sam:bridge:build -- --target x86_64-pc-windows-msvc --runner cargo-xwin

echo "→ Frontend + Rust cross-compile..."
bunx @tauri-apps/cli build --runner cargo-xwin --target x86_64-pc-windows-msvc 2>&1 | grep -E "(Compiling repressurizer|Finished|Built|error|warning.*repressurizer)"

TARGET_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"
EXE="$TARGET_DIR/repressurizer.exe"
SAM_BRIDGE="src-tauri/binaries/repressurizer-sam-bridge-x86_64-pc-windows-msvc.exe"
INSTALLER="$TARGET_DIR/bundle/nsis/Repressurizer_${VERSION}_x64-setup.exe"
OUT_DIR="artifacts"

if [ -f "$EXE" ] && [ -f "$SAM_BRIDGE" ]; then
    rm -rf "$OUT_DIR"
    mkdir -p "$OUT_DIR"
    cp "$EXE" "$OUT_DIR/Repressurizer-portable.exe"
    cp "$SAM_BRIDGE" "$OUT_DIR/repressurizer-sam-bridge-x86_64-pc-windows-msvc.exe"
    (cd "$OUT_DIR" && zip -q -9 Repressurizer-portable-windows-x64.zip Repressurizer-portable.exe repressurizer-sam-bridge-x86_64-pc-windows-msvc.exe)
    if [ -f "$INSTALLER" ]; then
        cp "$INSTALLER" "$OUT_DIR/"
    fi
    SIZE=$(du -h "$OUT_DIR/Repressurizer-portable.exe" | cut -f1)
    echo ""
    echo "=== Build OK ==="
    echo "→ $OUT_DIR/Repressurizer-portable.exe ($SIZE)"
    echo "→ $OUT_DIR/Repressurizer-portable-windows-x64.zip"
else
    echo "=== Build FAILED ==="
    exit 1
fi
