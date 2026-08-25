import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const target = "x86_64-pc-windows-msvc";
const artifactDirectory = resolve(
  process.env.REPRESSURIZER_ARTIFACT_DIR
    ?? join(repositoryRoot, "artifacts", "windows-portable"),
);

async function run(command: string[], env: NodeJS.ProcessEnv = process.env) {
  console.log(`Running: ${command.join(" ")}`);
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}

await run(["bun", "run", "build:sam-sidecar"], {
  ...process.env,
  REPRESSURIZER_SAM_TARGET: target,
});
await run(["bun", "run", "build"]);

const cargo = process.platform === "win32" ? ["cargo"] : ["cargo", "xwin"];
await run([
  ...cargo,
  "build",
  "--manifest-path",
  join(repositoryRoot, "src-tauri", "Cargo.toml"),
  "--release",
  "--bin",
  "repressurizer",
  "--target",
  target,
  "--features",
  "tauri/custom-protocol",
]);

const source = join(
  repositoryRoot,
  "src-tauri",
  "target",
  target,
  "release",
  "repressurizer.exe",
);
const executable = await readFile(source);
const frontendEntry = await readFile(
  join(repositoryRoot, "dist", "index.html"),
  "utf8",
);
const embeddedAssets = [...frontendEntry.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)]
  .map((match) => match[1]);
if (embeddedAssets.length === 0) {
  throw new Error("Production frontend has no entry assets to verify.");
}
for (const asset of embeddedAssets) {
  if (!executable.includes(Buffer.from(asset))) {
    throw new Error(
      `Portable build does not embed production asset ${asset}; refusing to package it.`,
    );
  }
}

await mkdir(artifactDirectory, { recursive: true });
const destination = join(artifactDirectory, "Repressurizer-portable.exe");
await copyFile(source, destination);
console.log(`Prepared production portable executable at ${destination}`);
