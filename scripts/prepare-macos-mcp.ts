import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const targetRoot = join(repositoryRoot, "src-tauri", "target");
const binariesRoot = join(repositoryRoot, "src-tauri", "binaries");
const targets = ["aarch64-apple-darwin", "x86_64-apple-darwin"];

async function run(command: string[], env: Record<string, string>) {
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env },
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited with code ${exitCode}`);
  }
}

for (const target of targets) {
  await run(
    [
      "cargo",
      "build",
      "--manifest-path",
      join(repositoryRoot, "src-tauri", "Cargo.toml"),
      "--release",
      "--bin",
      "repressurizer-mcp",
      "--target",
      target,
    ],
    { TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }) },
  );
}

const universal = join(
  targetRoot,
  "universal-apple-darwin",
  "release",
  "repressurizer-mcp",
);
const arm = join(targetRoot, targets[0], "release", "repressurizer-mcp");
const intel = join(targetRoot, targets[1], "release", "repressurizer-mcp");
await Promise.all([access(arm), access(intel)]);
await mkdir(dirname(universal), { recursive: true });
await run(["lipo", "-create", arm, intel, "-output", universal], {});
await run(["lipo", universal, "-verify_arch", "x86_64", "arm64"], {});
await chmod(universal, 0o755);
await mkdir(binariesRoot, { recursive: true });
const bundled = join(binariesRoot, "repressurizer-mcp-universal-apple-darwin");
await copyFile(universal, bundled);
await chmod(bundled, 0o755);

console.log("Prepared universal MCP adapter before the Tauri bundle build.");
