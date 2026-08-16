import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const targetRoot = join(repositoryRoot, "src-tauri", "target");
const armBinary = join(
  targetRoot,
  "aarch64-apple-darwin",
  "release",
  "repressurizer-cli",
);
const intelBinary = join(
  targetRoot,
  "x86_64-apple-darwin",
  "release",
  "repressurizer-cli",
);
const universalBinary = join(
  targetRoot,
  "universal-apple-darwin",
  "release",
  "repressurizer-cli",
);
const armMcpBinary = join(
  targetRoot,
  "aarch64-apple-darwin",
  "release",
  "repressurizer-mcp",
);
const intelMcpBinary = join(
  targetRoot,
  "x86_64-apple-darwin",
  "release",
  "repressurizer-mcp",
);
const universalMcpBinary = join(
  targetRoot,
  "universal-apple-darwin",
  "release",
  "repressurizer-mcp",
);
const bundledMcpBinary = join(
  repositoryRoot,
  "src-tauri",
  "binaries",
  "repressurizer-mcp-universal-apple-darwin",
);

async function run(command: string[]) {
  const process = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited with code ${exitCode}`);
  }
}

await Promise.all([
  access(armBinary),
  access(intelBinary),
  access(armMcpBinary),
  access(intelMcpBinary),
]);
await mkdir(dirname(universalBinary), { recursive: true });
await run([
  "lipo",
  "-create",
  armBinary,
  intelBinary,
  "-output",
  universalBinary,
]);
await chmod(universalBinary, 0o755);
await run(["lipo", universalBinary, "-verify_arch", "x86_64", "arm64"]);

await run([
  "lipo",
  "-create",
  armMcpBinary,
  intelMcpBinary,
  "-output",
  universalMcpBinary,
]);
await chmod(universalMcpBinary, 0o755);
await run(["lipo", universalMcpBinary, "-verify_arch", "x86_64", "arm64"]);
await mkdir(dirname(bundledMcpBinary), { recursive: true });
await copyFile(universalMcpBinary, bundledMcpBinary);
await chmod(bundledMcpBinary, 0o755);

console.log(`Prepared universal CLI binary at ${universalBinary}`);
console.log(`Prepared universal MCP adapter at ${bundledMcpBinary}`);
