#!/bin/bash
# Build Repressurizer for Windows from Linux with cargo-xwin.
set -e

export PATH="/root/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")"

echo "=== Building Repressurizer for Windows ==="

echo "→ Frontend + Rust cross-compile..."
bunx @tauri-apps/cli build --runner cargo-xwin --target x86_64-pc-windows-msvc 2>&1 | grep -E "(Compiling repressurizer|Finished|Built|error|warning.*repressurizer)"

TARGET_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"
EXE="$TARGET_DIR/repressurizer.exe"
INSTALLER="$TARGET_DIR/bundle/nsis/Repressurizer_0.1.0_x64-setup.exe"
OUT_DIR="artifacts"

if [ -f "$EXE" ]; then
    rm -rf "$OUT_DIR"
    mkdir -p "$OUT_DIR"
    cp "$EXE" "$OUT_DIR/Repressurizer-portable.exe"
    (cd "$OUT_DIR" && zip -q -9 Repressurizer-portable-windows-x64.zip Repressurizer-portable.exe)
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
