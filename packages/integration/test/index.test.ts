import { describe, expect, it } from "vitest";
import fixture from "./fixtures/repressurizer-library-snapshot-v1.json";
import {
  computeLibrarySnapshotChecksum,
  diffLibrarySnapshots,
  getSnapshotHltb,
  indexSnapshotByAppId,
  LIBRARY_SNAPSHOT_SCHEMA_VERSION,
  validateLibrarySnapshot,
  verifyLibrarySnapshotChecksum,
  type LibrarySnapshot,
} from "../src";

describe("@repressurizer/integration", () => {
  it("accepts the canonical snapshot fixture", () => {
    const result = validateLibrarySnapshot(fixture, { verifyChecksum: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issues.map((item) => `${item.path}: ${item.message}`).join("\n"));
    expect(result.snapshot.schemaVersion).toBe(LIBRARY_SNAPSHOT_SCHEMA_VERSION);
    expect(verifyLibrarySnapshotChecksum(result.snapshot)).toBe(true);
  });

  it("indexes games and exposes HLTB by appId", () => {
    const snapshot = fixture as LibrarySnapshot;
    const games = indexSnapshotByAppId(snapshot);

    expect(games.get(632470)?.name).toBe("Disco Elysium");
    expect(getSnapshotHltb(snapshot, 632470)).toMatchObject({
      source: "howlongtobeat",
      mainStory: 23,
      confidence: 118.2,
    });
  });

  it("diffs snapshots by appId", () => {
    const previous = fixture as LibrarySnapshot;
    const next: LibrarySnapshot = {
      ...previous,
      games: [
        {
          ...previous.games[0],
          playtimeForeverMinutes: 240,
          playtimeForeverHours: 4,
        },
        {
          appId: 1145360,
          name: "Hades",
          playtimeForeverMinutes: 0,
          playtimeForeverHours: 0,
          rtimeLastPlayed: 0,
          lastPlayedAt: null,
          isCollectionOnly: false,
          collections: [],
          details: null,
          hltb: null,
        },
      ],
      summary: {
        gameCount: 2,
        collectionCount: previous.summary.collectionCount,
        hltbCount: 1,
      },
    };
    next.checksum = computeLibrarySnapshotChecksum(next);

    const diff = diffLibrarySnapshots(previous, next);

    expect(diff.added.map((game) => game.appId)).toEqual([1145360]);
    expect(diff.changed.map((item) => item.after.appId)).toEqual([632470]);
    expect(diff.removed).toEqual([]);
  });

  it("reports clear validation errors", () => {
    const result = validateLibrarySnapshot({
      schemaVersion: "wrong",
      games: [{ appId: "632470" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected validation to fail");
    expect(result.issues.some((item) => item.path === "$.schemaVersion")).toBe(true);
    expect(result.issues.some((item) => item.path === "$.games[0].appId")).toBe(true);
  });
});
