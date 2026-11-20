import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { signedUpdaterVersion, validateUpdaterManifest } from "./updater-manifest";

const temporaryDirectories: string[] = [];

function signature(version: string | null, file = "Repressurizer_0.5.6_x64-setup.exe"): string {
  const fields = ["timestamp:1795205483", `file:${file}`];
  if (version !== null) fields.push(`version:${version}`);
  return Buffer.from(
    `untrusted comment: signature from tauri secret key\nRUTtestsignaturepayload\ntrusted comment: ${fields.join("\t")}\nglobalsignaturepayload\n`,
  ).toString("base64");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("updater manifest validation", () => {
  it("accepts signed artifacts for the expected release", () => {
    const fixture = createFixture();
    expect(() => validateUpdaterManifest(fixture.options)).not.toThrow();
  });

  it("accepts one universal macOS updater for both architectures", () => {
    const fixture = createFixture();
    const assetName = "Repressurizer_0.5.6_universal.app.tar.gz";
    const entry = {
      signature: signature("0.5.6", assetName),
      url: `https://github.com/Crimsab/Repressurizer/releases/download/v0.5.6/${assetName}`,
    };
    writeFileSync(join(fixture.options.artifactsDirectory, assetName), "universal app", "utf8");
    fixture.manifest.platforms["darwin-aarch64"] = entry;
    fixture.manifest.platforms["darwin-x86_64"] = entry;
    fixture.options.requiredPlatforms.push("darwin-aarch64", "darwin-x86_64");
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).not.toThrow();
  });

  it("rejects a manifest URL that points at another tag", () => {
    const fixture = createFixture();
    fixture.manifest.platforms["windows-x86_64"].url =
      "https://github.com/Crimsab/Repressurizer/releases/download/v0.5.5/Repressurizer_0.5.6_x64-setup.exe";
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).toThrow(/does not target/);
  });

  it("rejects a referenced artifact that was not packaged", () => {
    const fixture = createFixture();
    fixture.manifest.platforms["windows-x86_64"].url =
      "https://github.com/Crimsab/Repressurizer/releases/download/v0.5.6/missing.exe";
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).toThrow(/artifact missing\.exe is missing/);
  });

  it("rejects a channel manifest with a cross-channel target", () => {
    const fixture = createFixture();
    fixture.manifest.channel = "stable";
    fixture.options.channel = "stable";
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).toThrow(/crosses the stable channel/);
  });

  it("reads the version recorded by the Tauri CLI in the trusted comment", () => {
    expect(signedUpdaterVersion(signature("0.8.7"))).toBe("0.8.7");
    expect(signedUpdaterVersion(signature(null))).toBeNull();
    expect(signedUpdaterVersion("not a signature")).toBeNull();
  });

  it("rejects signatures made before the CLI recorded the version", () => {
    const fixture = createFixture();
    fixture.manifest.platforms["windows-x86_64"].signature = signature(null);
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).toThrow(/records version <none>/);
  });

  it("rejects a signature bound to another version", () => {
    const fixture = createFixture();
    fixture.manifest.platforms["windows-x86_64"].signature = signature("0.5.5");
    writeFileSync(fixture.options.manifestPath, JSON.stringify(fixture.manifest), "utf8");

    expect(() => validateUpdaterManifest(fixture.options)).toThrow(/records version 0\.5\.5, expected 0\.5\.6/);
  });
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "repressurizer-updater-"));
  temporaryDirectories.push(directory);
  const assetName = "Repressurizer_0.5.6_x64-setup.exe";
  const manifestPath = join(directory, "latest.json");
  writeFileSync(join(directory, assetName), "installer", "utf8");
  const platforms: Record<string, { signature: string; url: string }> = {
    "windows-x86_64": {
      signature: signature("0.5.6"),
      url: `https://github.com/Crimsab/Repressurizer/releases/download/v0.5.6/${assetName}`,
    },
  };
  const manifest = {
    version: "0.5.6",
    pub_date: "2026-08-14T00:00:00.000Z",
    platforms,
    channel: undefined as string | undefined,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

  return {
    manifest,
    options: {
      manifestPath,
      artifactsDirectory: directory,
      repository: "Crimsab/Repressurizer",
      tag: "v0.5.6",
      version: "0.5.6",
      requiredPlatforms: ["windows-x86_64"],
      channel: undefined as "stable" | "beta" | undefined,
    },
  };
}
