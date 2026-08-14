import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  releaseChannelForVersion,
  writeChannelUpdaterManifests,
} from "./release-channel";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release channels", () => {
  it("accepts only stable and numbered beta tag conventions", () => {
    expect(releaseChannelForVersion("0.6.0", "v0.6.0")).toBe("stable");
    expect(releaseChannelForVersion("0.7.0-beta.2", "v0.7.0-beta.2")).toBe("beta");
    expect(() => releaseChannelForVersion("0.7.0-rc.1", "v0.7.0-rc.1")).toThrow(
      /Unsupported desktop release version/
    );
    expect(() => releaseChannelForVersion("0.7.0-beta.0", "v0.7.0-beta.0")).toThrow();
    expect(() => releaseChannelForVersion("0.7.0", "v0.7.1")).toThrow(/does not match/);
  });

  it("writes one target-specific manifest per platform and channel", () => {
    const directory = mkdtempSync(join(tmpdir(), "repressurizer-release-channel-"));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, "latest.json");
    const platforms = Object.fromEntries(
      ["windows-x86_64", "linux-x86_64", "darwin-aarch64", "darwin-x86_64"].map(
        (target) => [target, { signature: `${target}-signature-value-long-enough`, url: `https://example.test/${target}` }]
      )
    );
    writeFileSync(
      sourcePath,
      JSON.stringify({ version: "0.7.0-beta.2", pub_date: "2026-08-14T00:00:00Z", platforms }),
      "utf8"
    );

    const outputs = writeChannelUpdaterManifests({
      manifestPath: sourcePath,
      outputDirectory: directory,
      channel: "beta",
    });
    expect(outputs).toHaveLength(4);
    const manifest = JSON.parse(
      readFileSync(join(directory, "windows-x86_64-beta.json"), "utf8")
    );
    expect(manifest.channel).toBe("beta");
    expect(Object.keys(manifest.platforms)).toEqual(["windows-x86_64-beta"]);
    expect(JSON.stringify(manifest)).not.toContain("-stable");
  });
});
