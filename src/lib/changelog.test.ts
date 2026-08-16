import { describe, expect, it } from "vitest";
import {
  changelogEntriesForUpgrade,
  compareVersions,
  previousChangelogVersion,
  type ChangelogEntry,
} from "./changelog";

const entries = ["0.6.4", "0.6.3", "0.6.2", "0.6.1"].map((version) => ({
  version,
  date: "2026-08-16",
  releaseUrl: `https://example.test/${version}`,
  compareUrl: `https://example.test/${version}/compare`,
  groups: [],
})) satisfies ChangelogEntry[];

describe("upgrade changelog", () => {
  it("returns every release after the installed version through the current version", () => {
    expect(changelogEntriesForUpgrade("0.6.1", "0.6.4", entries).map((entry) => entry.version))
      .toEqual(["0.6.4", "0.6.3", "0.6.2"]);
  });

  it("does not show a changelog for the same version, downgrades, or invalid versions", () => {
    expect(changelogEntriesForUpgrade("0.6.4", "0.6.4", entries)).toEqual([]);
    expect(changelogEntriesForUpgrade("0.6.4", "0.6.3", entries)).toEqual([]);
    expect(changelogEntriesForUpgrade("unknown", "0.6.4", entries)).toEqual([]);
  });

  it("orders prereleases before their stable release", () => {
    expect(compareVersions("0.6.4-beta.2", "0.6.4")).toBe(-1);
    expect(compareVersions("0.6.4-beta.10", "0.6.4-beta.2")).toBe(1);
  });

  it("finds the nearest older generated release for the first migration", () => {
    expect(previousChangelogVersion("0.6.4", entries)).toBe("0.6.3");
  });
});
