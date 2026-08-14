import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateUpdaterManifest } from "./updater-manifest";

const temporaryDirectories: string[] = [];

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
      signature: "dW50cnVzdGVkIGNvbW1lbnQ6IG1hY09TIHRlc3Qgc2lnbmF0dXJl",
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
});

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "repressurizer-updater-"));
  temporaryDirectories.push(directory);
  const assetName = "Repressurizer_0.5.6_x64-setup.exe";
  const manifestPath = join(directory, "latest.json");
  writeFileSync(join(directory, assetName), "installer", "utf8");
  const platforms: Record<string, { signature: string; url: string }> = {
    "windows-x86_64": {
      signature: "dW50cnVzdGVkIGNvbW1lbnQ6IHRlc3Qgc2lnbmF0dXJl",
      url: `https://github.com/Crimsab/Repressurizer/releases/download/v0.5.6/${assetName}`,
    },
  };
  const manifest = {
    version: "0.5.6",
    pub_date: "2026-08-14T00:00:00.000Z",
    platforms,
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
    },
  };
}
