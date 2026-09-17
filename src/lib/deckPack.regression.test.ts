import { describe, expect, it } from "vitest";
import { buildDeckPack, type DeckPackCandidate, type DeckPackConfig } from "./deckPack";

const game = (appId: number, sizeBytes: number | null = 10): DeckPackCandidate => ({
  appId, name: `Game ${appId}`, sizeBytes, installed: false, deckStatus: "verified",
  fullController: true, externalLauncher: false, offline: true, firstLaunchOnline: false,
  durationHours: 2, categories: ["short"],
});
const config: DeckPackConfig = { availableBytes: 100, safetyPercent: 10, gameCount: 3,
  wantedCategories: ["short"], deckFilter: "verified", requireController: true,
  noLauncher: true, requireOffline: true, minHours: null, maxHours: null,
  installation: "any", locked: [], excluded: [], seed: 1 };

describe("Pack My Deck numeric and mandatory-game safety", () => {
  for (const size of [null, 0, -10, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    it(`rejects unusable size ${String(size)} even for a mandatory game`, () => {
      const result = buildDeckPack([game(1, size)], { ...config, locked: [1] });
      expect(result.items).toHaveLength(0);
      expect(result.missingLocked).toEqual([1]);
      expect(result.usedBytes).toBe(0);
      expect(result.remainingBytes).toBe(90);
    });
  }
  it("does not admit fractional sizes through automatic selection", () => {
    expect(buildDeckPack([game(1, 1.5)], config).items).toHaveLength(0);
  });
  it("does not create fake free capacity from a negative mandatory size", () => {
    const result = buildDeckPack([game(1, -100), game(2, 150)], { ...config, locked: [1] });
    expect(result.items).toHaveLength(0);
    expect(result.usedBytes).toBe(0);
  });
  it("keeps a valid mandatory overflow visible", () => {
    const result = buildDeckPack([game(1, 95)], { ...config, locked: [1] });
    expect(result.items[0].appId).toBe(1);
    expect(result.overflowBytes).toBe(5);
    expect(result.remainingBytes).toBe(0);
  });
  it("discloses filter conflicts rather than silently overriding requirements", () => {
    const result = buildDeckPack([{ ...game(1), offline: false, deckStatus: "unsupported" }], { ...config, locked: [1] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].limitations).toContain("Required game does not satisfy the current filters");
  });
  it("reports mandatory games beyond the maximum instead of dropping them silently", () => {
    const games = Array.from({ length: 101 }, (_, i) => game(i + 1, 1));
    const result = buildDeckPack(games, { ...config, availableBytes: 200, locked: games.map((g) => g.appId) });
    expect(result.items).toHaveLength(100);
    expect(result.missingLocked).toEqual([101]);
  });
  it("rejects unsafe aggregate sizes without returning rounded or infinite totals", () => {
    const result = buildDeckPack([game(1, Number.MAX_SAFE_INTEGER), game(2, Number.MAX_SAFE_INTEGER)], { ...config, availableBytes: Number.MAX_VALUE, safetyPercent: 0, locked: [1, 2] });
    expect(result.usedBytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.capacityBytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.missingLocked).toEqual([2]);
  });
  it("keeps exclusions stronger than mandatory selection and deduplicates locks", () => {
    const result = buildDeckPack([game(1), game(2)], { ...config, locked: [1, 1, 2], excluded: [2] });
    expect(result.items.map((item) => item.appId)).toEqual([1]);
    expect(result.missingLocked).toEqual([2]);
  });
  it("rejects unknown or non-finite durations for an explicit duration filter", () => {
    for (const durationHours of [null, 0, -1, NaN, Infinity]) {
      expect(buildDeckPack([{ ...game(1), durationHours }], { ...config, minHours: 1 }).items).toHaveLength(0);
    }
  });
  it("does not mutate the candidate or configuration data", () => {
    const data = [game(1), game(2)];
    const before = structuredClone({ data, config });
    buildDeckPack(data, config);
    expect({ data, config }).toEqual(before);
  });
});
