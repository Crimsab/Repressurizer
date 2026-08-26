import { describe, expect, it } from "vitest";
import { serializeStorageExport, storageExportExtension } from "./storageExport";
import type { StoragePlannerGame } from "./storagePlanner";

const game: StoragePlannerGame = {
  appid: 42,
  name: 'Demo, "Game"',
  playtimeMinutes: 60,
  lastPlayed: 0,
  status: "none",
  achievementPercent: null,
  remainingHours: null,
  deckCompatible: null,
  protection: null,
  protectedUntil: null,
  hasUnsyncedSaves: null,
  install: {
    appid: 42,
    libraryPath: "D:\\SteamLibrary",
    installPath: "D:\\SteamLibrary\\steamapps\\common\\Demo",
    gameBytes: 8,
    workshopBytes: 2,
    shaderCacheBytes: 1,
    compatdataBytes: 1,
    totalBytes: 12,
    scannedAt: 1,
    scanTruncated: false,
  },
};
const input = {
  generatedAt: 0,
  libraries: [{ path: "D:\\SteamLibrary", drive: "D:", totalBytes: 100, freeBytes: 40 }],
  games: [game],
  selectedAppIds: new Set([42]),
  scopeLabel: "D:",
  goalBytes: 20,
  reclaimBytes: 12,
};

describe("storage export", () => {
  it("writes a structured report with disk totals and every storage component", () => {
    const parsed = JSON.parse(serializeStorageExport(input, "json"));
    expect(parsed.libraries[0]).toMatchObject({ steamBytes: 12, otherUsedBytes: 48 });
    expect(parsed.games[0]).toMatchObject({ appId: 42, selectedForRemoval: true, workshopBytes: 2 });
  });

  it("escapes CSV and provides readable formats", () => {
    expect(serializeStorageExport(input, "csv")).toContain('"Demo, ""Game"""');
    expect(serializeStorageExport(input, "markdown")).toContain("## Games");
    expect(serializeStorageExport(input, "txt")).toContain("SELECTED");
    expect(storageExportExtension("markdown")).toBe("md");
  });
});
