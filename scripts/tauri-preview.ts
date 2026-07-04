#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const command = Bun.argv[2] ?? "build";
if (!["build", "dev"].includes(command)) {
  console.error(`Unsupported preview command: ${command}`);
  process.exit(1);
}
const extraArgs = Bun.argv.slice(3);

const previewNumber = Bun.env.REPRESSURIZER_PREVIEW_NUMBER ?? "1";
const previewVersion =
  Bun.env.REPRESSURIZER_PREVIEW_VERSION ??
  `0.0.0-preview.${previewNumber}`;
const previewLabel = Bun.env.REPRESSURIZER_PREVIEW_LABEL ?? `Preview.${previewNumber}`;

const basePreviewConfig = await Bun.file("src-tauri/tauri.preview.conf.json").json() as Record<string, unknown>;
const generatedConfigPath = "src-tauri/target/preview/tauri.preview.generated.conf.json";
await mkdir(dirname(generatedConfigPath), { recursive: true });
await Bun.write(
  generatedConfigPath,
  `${JSON.stringify({ ...basePreviewConfig, version: previewVersion }, null, 2)}\n`,
);

const child = Bun.spawn(["bun", "tauri", command, "--config", generatedConfigPath, ...extraArgs], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...Bun.env,
    REPRESSURIZER_CHANNEL: "preview",
    VITE_REPRESSURIZER_CHANNEL: "preview",
    REPRESSURIZER_PREVIEW_VERSION: previewVersion,
    REPRESSURIZER_PREVIEW_LABEL: previewLabel,
    REPRESSURIZER_PREVIEW_NUMBER: previewNumber,
  },
});

process.exit(await child.exited);
