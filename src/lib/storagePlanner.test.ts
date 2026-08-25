import { describe, expect, test } from "vitest";
import { rankStorageCandidates, simulateReclaim, targetBytes } from "./storagePlanner";
const install = (appid: number, totalBytes: number) => ({ appid, totalBytes, gameBytes: totalBytes, workshopBytes: 0, shaderCacheBytes: 0, compatdataBytes: 0, libraryPath: "/steam", installPath: `/steam/${appid}`, scannedAt: 1 });
describe("storage planner", () => {
  test("ranks explainably while excluding protected and unsynced-save games", () => {
    const base = { name: "Game", playtimeMinutes: 0, lastPlayed: 0, status: "none" as const, achievementPercent: null, remainingHours: null, deckCompatible: null, protection: null, protectedUntil: null, hasUnsyncedSaves: null };
    const results = rankStorageCandidates([{ ...base, appid: 1, install: install(1, 50e9) }, { ...base, appid: 2, install: install(2, 80e9), protection: "keep" }, { ...base, appid: 3, install: install(3, 90e9), hasUnsyncedSaves: true }], 1_800_000_000_000);
    expect(results.map((item) => item.appid)).toEqual([1]); expect(results[0].reasons.length).toBeGreaterThan(0); expect(results[0].limitations).toContain("Cloud/local save status unknown");
  });
  test("calculates byte and free-space goals and exact simulation", () => {
    expect(targetBytes({ mode: "bytes", bytes: 50, freePercent: 20, library: null })).toBe(50);
    expect(targetBytes({ mode: "free-percent", bytes: 0, freePercent: 20, library: { path: "/", drive: "/", totalBytes: 1000, freeBytes: 50 } })).toBe(150);
    const suggestion: any = { appid: 1, install: install(1, 50) }; expect(simulateReclaim(new Set([1]), [suggestion])).toBe(50);
  });
});
