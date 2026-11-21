import { createHash } from "node:crypto";
import { signedUpdaterVersion } from "./updater-manifest";

export const UPDATER_TARGETS = ["windows-x86_64", "linux-x86_64", "darwin-aarch64", "darwin-x86_64"] as const;

interface PublishedManifest {
  version?: unknown;
  platforms?: Record<string, { url?: unknown; signature?: unknown }>;
}

/** Checks one published channel manifest against the release it should announce. */
export function publishedManifestProblems(
  target: string,
  manifest: PublishedManifest,
  options: { version: string; tag: string; repository: string },
): string[] {
  const problems: string[] = [];
  if (manifest.version !== options.version) {
    problems.push(`${target}: announces ${String(manifest.version)}, expected ${options.version}`);
  }
  const platform = manifest.platforms?.[target];
  if (!platform || typeof platform.url !== "string" || typeof platform.signature !== "string") {
    problems.push(`${target}: missing url or signature`);
    return problems;
  }
  const prefix = `https://github.com/${options.repository}/releases/download/${options.tag}/`;
  if (!platform.url.startsWith(prefix)) problems.push(`${target}: url does not point at ${options.tag}`);
  const signed = signedUpdaterVersion(platform.signature);
  if (signed !== options.version) problems.push(`${target}: signature records ${signed ?? "<none>"}`);
  return problems;
}

export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

async function fetchWithRetry(url: string, attempts = 6): Promise<Response> {
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { redirect: "follow", cache: "no-store" });
    if (response.ok) return response;
    last = `HTTP ${response.status}`;
    // Release assets can take a short while to propagate to the download CDN.
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  throw new Error(`${url}: ${last}`);
}

async function main(argv: string[]) {
  const option = (name: string) => {
    const value = argv[argv.indexOf(`--${name}`) + 1];
    if (!argv.includes(`--${name}`) || !value) throw new Error(`Missing --${name}`);
    return value;
  };
  const repository = option("repo");
  const tag = option("tag");
  const channel = option("channel");
  const version = tag.replace(/^v/, "");
  const download = (name: string) => `https://github.com/${repository}/releases/download/${name}`;

  const checksums = parseChecksums(await (await fetchWithRetry(download(`${tag}/SHA256SUMS.txt`))).text());
  const problems: string[] = [];
  const checkedAssets = new Set<string>();
  for (const target of UPDATER_TARGETS) {
    const manifestUrl = download(`updater-manifests/${target}-${channel}.json`);
    const manifest = (await (await fetchWithRetry(manifestUrl)).json()) as PublishedManifest;
    const channelTarget = `${target}-${channel}`;
    problems.push(...publishedManifestProblems(channelTarget, manifest, { version, tag, repository }));
    const url = manifest.platforms?.[channelTarget]?.url;
    if (typeof url !== "string" || checkedAssets.has(url)) continue;
    checkedAssets.add(url);
    const asset = decodeURIComponent(url.split("/").pop() ?? "");
    const bytes = new Uint8Array(await (await fetchWithRetry(url)).arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const expected = checksums.get(asset);
    if (!expected) problems.push(`${asset}: not listed in SHA256SUMS.txt`);
    else if (expected !== digest) problems.push(`${asset}: checksum mismatch`);
    console.log(`${channelTarget}: ${asset} ${bytes.length} bytes ok`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
  }
  console.log(`Verified published ${channel} updater manifests for ${tag}`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
