import { describe, expect, it } from "vitest";
import { buildSteamAppIndex, isSteamAppIndexStale, parseSteamAppIndex } from "./steamAppIndex";

describe("steamAppIndex", () => {
  it("builds a compact appid-name lookup and skips blank names", () => {
    const index = buildSteamAppIndex([
      { appid: 10, name: "  Counter-Strike  " },
      { appid: 20, name: "" },
      { appid: 30, name: "Half-Life" },
    ], 1_700_000_000);

    expect(index.fetchedAt).toBe(1_700_000_000);
    expect(index.apps[10]?.name).toBe("Counter-Strike");
    expect(index.apps[20]).toBeUndefined();
    expect(index.apps[30]?.name).toBe("Half-Life");
  });

  it("parses invalid cache data as an empty index", () => {
    expect(parseSteamAppIndex("{ nope").apps).toEqual({});
    expect(parseSteamAppIndex(JSON.stringify({ version: 0, apps: {} })).apps).toEqual({});
  });

  it("marks missing or old cache data as stale", () => {
    expect(isSteamAppIndexStale({ version: 1, fetchedAt: 0, apps: {} }, 100)).toBe(true);
    expect(isSteamAppIndexStale({ version: 1, fetchedAt: 100, apps: {} }, 101)).toBe(false);
  });
});
