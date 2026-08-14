import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseChannel = "stable" | "beta";

const RELEASE_PLATFORM_TARGETS = [
  "windows-x86_64",
  "linux-x86_64",
  "darwin-aarch64",
  "darwin-x86_64",
] as const;

export function releaseChannelForVersion(version: string, tag: string): ReleaseChannel {
  if (tag !== `v${version}`) {
    throw new Error(`Tag ${tag} does not match package version v${version}`);
  }
  if (/^\d+\.\d+\.\d+$/.test(version)) return "stable";
  if (/^\d+\.\d+\.\d+-beta\.[1-9]\d*$/.test(version)) return "beta";
  throw new Error(
    `Unsupported desktop release version ${version}; use X.Y.Z or X.Y.Z-beta.N (N >= 1)`,
  );
}

export function writeChannelUpdaterManifests(options: {
  manifestPath: string;
  outputDirectory: string;
  channel: ReleaseChannel;
}): string[] {
  const source = JSON.parse(readFileSync(options.manifestPath, "utf8")) as {
    version?: unknown;
    notes?: unknown;
    pub_date?: unknown;
    platforms?: unknown;
  };
  if (!isRecord(source.platforms)) {
    throw new Error("Source updater manifest has no platforms object");
  }

  mkdirSync(options.outputDirectory, { recursive: true });
  const outputs: string[] = [];
  for (const platformTarget of RELEASE_PLATFORM_TARGETS) {
    const platform = source.platforms[platformTarget];
    if (!isRecord(platform)) {
      throw new Error(`Source updater manifest is missing ${platformTarget}`);
    }
    const channelTarget = `${platformTarget}-${options.channel}`;
    const outputPath = join(options.outputDirectory, `${channelTarget}.json`);
    writeFileSync(
      outputPath,
      `${JSON.stringify({
        version: source.version,
        notes: source.notes,
        pub_date: source.pub_date,
        channel: options.channel,
        platforms: { [channelTarget]: platform },
      }, null, 2)}\n`,
      "utf8",
    );
    outputs.push(outputPath);
  }
  return outputs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function option(argv: string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === "identify") {
    const channel = releaseChannelForVersion(option(argv, "version"), option(argv, "tag"));
    process.stdout.write(channel);
  } else if (command === "manifests") {
    const channel = option(argv, "channel");
    if (channel !== "stable" && channel !== "beta") {
      throw new Error("--channel must be stable or beta");
    }
    const outputs = writeChannelUpdaterManifests({
      manifestPath: option(argv, "manifest"),
      outputDirectory: option(argv, "out"),
      channel,
    });
    console.log(`Wrote ${outputs.length} ${channel} updater manifests`);
  } else {
    throw new Error("Usage: release-channel.ts identify|manifests ...");
  }
}
