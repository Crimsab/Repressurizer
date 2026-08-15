import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const tauriRoot = join(repositoryRoot, "src-tauri");
const binariesRoot = join(tauriRoot, "binaries");

function isWindowsTarget(target: string | undefined) {
  return target?.includes("windows") ?? false;
}

function inferredWindowsTarget() {
  const arch = process.env.TAURI_ENV_ARCH ?? process.arch;
  const targetArch = arch === "arm64" || arch === "aarch64" ? "aarch64" : "x86_64";
  return `${targetArch}-pc-windows-msvc`;
}

const target =
  process.env.REPRESSURIZER_SAM_TARGET ??
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  (process.env.TAURI_ENV_PLATFORM === "windows" || process.platform === "win32"
    ? inferredWindowsTarget()
    : undefined);

if (!isWindowsTarget(target)) {
  console.log("Skipping SAM sidecar: the current target is not Windows.");
  process.exit(0);
}

const extension = target?.includes("windows") ? ".exe" : "";
const targetArgs = target ? ["--target", target] : [];
const cargoTargetRoot = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(tauriRoot, "target");
const targetDirectory = target
  ? join(cargoTargetRoot, target, "release")
  : join(cargoTargetRoot, "release");
const sidecarBinary = join(targetDirectory, `repressurizer-sam${extension}`);
const bundledBinary = join(
  binariesRoot,
  `repressurizer-sam-${target}${extension}`,
);
const embeddedBinary = join(binariesRoot, "repressurizer-sam-embedded.bin");

const cargoCommand = process.platform === "win32" ? ["cargo"] : ["cargo", "xwin"];
const command = [
  ...cargoCommand,
  "build",
  "--manifest-path",
  join(tauriRoot, "Cargo.toml"),
  "--release",
  "--bin",
  "repressurizer-sam",
  "--features",
  "sam-sidecar",
  ...targetArgs,
];

console.log(`Building SAM sidecar for ${target}: ${command.join(" ")}`);
const build = Bun.spawn(command, {
  cwd: repositoryRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    // The sidecar itself is the binary being built; it must not try to copy
    // itself as an external binary during tauri-build's Cargo build script.
    TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
  },
});
if ((await build.exited) !== 0) {
  throw new Error("Failed to build the SAM sidecar");
}

await access(sidecarBinary);
await mkdir(binariesRoot, { recursive: true });
await copyFile(sidecarBinary, bundledBinary);
await copyFile(sidecarBinary, embeddedBinary);
if (process.platform !== "win32") {
  await chmod(bundledBinary, 0o755);
}

console.log(`Prepared SAM sidecar at ${bundledBinary}`);
