import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

interface UpdaterPlatform {
  signature?: unknown;
  url?: unknown;
}

interface UpdaterManifest {
  version?: unknown;
  pub_date?: unknown;
  channel?: unknown;
  platforms?: unknown;
}

export interface UpdaterManifestValidationOptions {
  manifestPath: string;
  artifactsDirectory: string;
  repository: string;
  tag: string;
  version: string;
  requiredPlatforms: string[];
  channel?: "stable" | "beta";
}

export function validateUpdaterManifest(options: UpdaterManifestValidationOptions): void {
  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8")) as UpdaterManifest;
  if (manifest.version !== options.version) {
    throw new Error(`Updater version ${String(manifest.version)} does not match ${options.version}`);
  }
  if (typeof manifest.pub_date !== "string" || !Number.isFinite(Date.parse(manifest.pub_date))) {
    throw new Error("Updater manifest has an invalid pub_date");
  }
  if (!isRecord(manifest.platforms)) {
    throw new Error("Updater manifest has no platforms object");
  }
  if (options.channel) {
    if (manifest.channel !== options.channel) {
      throw new Error(
        `Updater manifest channel ${String(manifest.channel)} does not match ${options.channel}`,
      );
    }
    const wrongChannel = Object.keys(manifest.platforms).find(
      (platform) => !platform.endsWith(`-${options.channel}`),
    );
    if (wrongChannel) {
      throw new Error(`Updater platform ${wrongChannel} crosses the ${options.channel} channel`);
    }
  }

  for (const platformName of options.requiredPlatforms) {
    const platform = manifest.platforms[platformName] as UpdaterPlatform | undefined;
    if (!isRecord(platform)) {
      throw new Error(`Updater manifest is missing ${platformName}`);
    }
    if (typeof platform.signature !== "string" || platform.signature.trim().length < 32) {
      throw new Error(`Updater signature is missing or invalid for ${platformName}`);
    }
    if (typeof platform.url !== "string") {
      throw new Error(`Updater URL is missing for ${platformName}`);
    }

    const url = new URL(platform.url);
    const repositoryPrefix = `/${options.repository}/releases/download/${encodeURIComponent(options.tag)}/`;
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.pathname.indexOf(repositoryPrefix) !== 0
    ) {
      throw new Error(
        `Updater URL for ${platformName} does not target ${options.repository}@${options.tag}`,
      );
    }

    const assetName = decodeURIComponent(basename(url.pathname));
    if (!assetName || basename(assetName) !== assetName) {
      throw new Error(`Updater artifact name is invalid for ${platformName}`);
    }
    if (!existsSync(resolve(options.artifactsDirectory, assetName))) {
      throw new Error(`Updater artifact ${assetName || "<empty>"} is missing for ${platformName}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === `--${name}` && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function requiredOption(argv: string[], name: string, fallback?: string): string {
  const value = optionValues(argv, name)[0] ?? fallback;
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const requiredPlatforms = optionValues(argv, "platform");
  if (requiredPlatforms.length === 0) throw new Error("At least one --platform is required");

  const manifestPath = requiredOption(argv, "manifest");
  validateUpdaterManifest({
    manifestPath,
    artifactsDirectory: requiredOption(argv, "artifacts"),
    repository: requiredOption(argv, "repo", process.env.GITHUB_REPOSITORY),
    tag: requiredOption(argv, "tag", process.env.GITHUB_REF_NAME),
    version: requiredOption(argv, "version"),
    requiredPlatforms,
    channel: optionValues(argv, "channel")[0] as "stable" | "beta" | undefined,
  });
  console.log(`Validated updater manifest ${manifestPath}`);
}
