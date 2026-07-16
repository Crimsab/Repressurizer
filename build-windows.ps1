# Repressurizer - Windows Build Script
# Prerequisites: Rust (rustup.rs), Bun (bun.sh), Visual Studio Build Tools

$ErrorActionPreference = "Stop"

Write-Host "=== Repressurizer Build ===" -ForegroundColor Cyan
$version = (Get-Content package.json | ConvertFrom-Json).version

# Check prerequisites
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Rust not found. Install from https://rustup.rs" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Bun not found. Install from https://bun.sh" -ForegroundColor Red
    exit 1
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
bun install --frozen-lockfile

Write-Host "Running project checks..." -ForegroundColor Yellow
bun run check
if ($LASTEXITCODE -ne 0) {
    Write-Host "Project checks failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Building Repressurizer..." -ForegroundColor Yellow
bun tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Build Complete ===" -ForegroundColor Green
    Write-Host "Installer: src-tauri\target\release\bundle\nsis\Repressurizer_${version}_x64-setup.exe"
    Write-Host "Portable:  src-tauri\target\release\repressurizer.exe"
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
