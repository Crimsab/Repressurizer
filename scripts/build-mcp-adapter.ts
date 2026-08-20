import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const tauriRoot = join(repositoryRoot, "src-tauri");
const binariesRoot = join(tauriRoot, "binaries");

function inferredTarget() {
  if (process.platform === "win32") {
    const arch = process.env.TAURI_ENV_ARCH ?? process.arch;
    return arch === "arm64" || arch === "aarch64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }
  return process.arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}

const target =
  process.env.REPRESSURIZER_MCP_TARGET ??
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  inferredTarget();
const extension = target.includes("windows") ? ".exe" : "";
const targetArgs = ["--target", target];
const cargoTargetRoot = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(tauriRoot, "target");
const sourceBinary = join(
  cargoTargetRoot,
  target,
  "release",
  `repressurizer-mcp${extension}`,
);
const bundledBinary = join(
  binariesRoot,
  `repressurizer-mcp-${target}${extension}`,
);

const cargoCommand = target.includes("windows") && process.platform !== "win32"
  ? ["cargo", "xwin"]
  : ["cargo"];
const command = [
  ...cargoCommand,
  "build",
  "--manifest-path",
  join(tauriRoot, "Cargo.toml"),
  "--release",
  "--bin",
  "repressurizer-mcp",
  "--features",
  "mcp-sidecar",
  ...targetArgs,
];

console.log(`Building MCP adapter for ${target}: ${command.join(" ")}`);
const build = Bun.spawn(command, {
  cwd: repositoryRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    // The adapter is the binary being built; it must not be copied as an
    // external binary by tauri-build during this Cargo invocation.
    TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
  },
});
if ((await build.exited) !== 0) {
  throw new Error("Failed to build the MCP adapter");
}

await access(sourceBinary);
await mkdir(binariesRoot, { recursive: true });
await copyFile(sourceBinary, bundledBinary);
if (process.platform !== "win32") {
  await chmod(bundledBinary, 0o755);
}

console.log(`Prepared MCP adapter at ${bundledBinary}`);
