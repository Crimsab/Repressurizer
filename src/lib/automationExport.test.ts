import { describe, expect, it } from "vitest";
import { buildLibrarySnapshot, LIBRARY_SNAPSHOT_SCHEMA_VERSION } from "./automationExport";
import type { GameDetails, OwnedGame, SteamCollection } from "./types";
import type { HltbData } from "./tauri";

function game(appid: number, name: string, playtime = 0, lastPlayed = 0): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: playtime,
    img_icon_url: null,
    rtime_last_played: lastPlayed,
  };
}

function collection(key: string, name: string, added: number[]): SteamCollection {
  return {
    id: key,
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
  };
}

function details(appId: number): GameDetails {
  return {
    app_id: appId,
    name: "Disco Elysium",
    genres: ["RPG"],
    categories: ["Single-player"],
    release_date: "15 Oct, 2019",
    metacritic_score: 97,
    developers: ["ZA/UM"],
    publishers: ["ZA/UM"],
    platforms: { windows: true, mac: true, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: 3999,
    price_final: 999,
    price_currency: "EUR",
    is_free: false,
  };
}

describe("buildLibrarySnapshot", () => {
  it("exports a stable appId-oriented snapshot with HLTB provenance", () => {
    const hltb: HltbData = {
      main_story: 23,
      main_extra: 31.5,
      completionist: 48,
      game_id: 57335,
      game_name: "Disco Elysium",
      confidence: 118.2,
    };

    const snapshot = buildLibrarySnapshot({
      games: {
        632470: game(632470, "Disco Elysium", 180, 1_700_000_000),
      },
      collections: [collection("user-collections.rpg", "RPG", [632470])],
      details: { 632470: details(632470) },
      hltbData: { 632470: hltb },
      appVersion: "0.1.10",
      steamId64: "76561198000012345",
      steamPersonaName: "Tester",
      generatedAt: "2026-06-18T18:00:00.000Z",
    });

    expect(snapshot.schemaVersion).toBe(LIBRARY_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.summary).toEqual({ gameCount: 1, collectionCount: 1, hltbCount: 1 });
    expect(snapshot.steam.steamId64Tail).toBe("2345");
    expect(snapshot.games[0]).toMatchObject({
      appId: 632470,
      playtimeForeverMinutes: 180,
      playtimeForeverHours: 3,
      lastPlayedAt: "2023-11-14T22:13:20.000Z",
      collections: [{ key: "user-collections.rpg", name: "RPG", isDynamic: false }],
      hltb: {
        source: "howlongtobeat",
        mainStory: 23,
        hltbGameId: 57335,
        matchedName: "Disco Elysium",
        confidence: 118.2,
      },
    });
    expect(snapshot.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it("does not let generatedAt change the content checksum", () => {
    const base = {
      games: { 10: game(10, "Hades", 90) },
      collections: [collection("favorites", "Favorites", [10])],
      appVersion: "0.1.10",
    };

    const first = buildLibrarySnapshot({ ...base, generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = buildLibrarySnapshot({ ...base, generatedAt: "2026-01-02T00:00:00.000Z" });

    expect(first.checksum).toBe(second.checksum);
  });
});
