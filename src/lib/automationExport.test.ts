import { describe, expect, it } from "vitest";
import { buildLibrarySnapshot, LIBRARY_SNAPSHOT_SCHEMA_VERSION } from "./automationExport";
import type { AchievementSummary, GameDetails, OwnedGame, SteamCollection } from "./types";
import type { FamilyLibraryApp, HltbData } from "./tauri";

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
    supported_languages: [],
    platforms: { windows: true, mac: true, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: 3999,
    price_final: 999,
    price_currency: "EUR",
    is_free: false,
  };
}

function familyApp(appId: number): FamilyLibraryApp {
  return {
    appid: appId,
    name: "Disco Elysium",
    owner_steamids: ["76561198000099999"],
    exclude_reason: 0,
    playtime_forever: 180,
    rtime_last_played: 1_700_000_000,
    img_icon_hash: null,
    app_type: 1,
    is_non_game: false,
    is_owned_by_current_user: false,
    is_family_shared: true,
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
    const achievements: AchievementSummary = {
      total: 45,
      achieved: 12,
      achievements: [],
    };

    const snapshot = buildLibrarySnapshot({
      games: {
        632470: game(632470, "Disco Elysium", 180, 1_700_000_000),
      },
      collections: [collection("user-collections.rpg", "RPG", [632470])],
      details: { 632470: details(632470) },
      hltbData: { 632470: hltb },
      achievements: { 632470: achievements },
      wishlistItems: [{ appid: 632470, priority: 1, date_added: 1_700_000_100 }],
      wishlistLastFetched: Date.parse("2026-06-18T18:01:00.000Z"),
      familyApps: { 632470: familyApp(632470) },
      familyAuthUsed: "access_token",
      familyOwnerSteamId: "76561198000012345",
      familyLastFetched: Date.parse("2026-06-18T18:02:00.000Z"),
      appVersion: "0.2.0",
      steamId64: "76561198000012345",
      steamPersonaName: "Tester",
      generatedAt: "2026-06-18T18:00:00.000Z",
    });

    expect(snapshot.schemaVersion).toBe(LIBRARY_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.summary).toEqual({
      gameCount: 1,
      collectionCount: 1,
      hltbCount: 1,
      achievementCount: 1,
      wishlistCount: 1,
      familySharedCount: 1,
    });
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
      achievements: {
        source: "steam_web_api",
        total: 45,
        achieved: 12,
        percent: 26.7,
      },
      wishlist: {
        source: "steam_wishlist",
        priority: 1,
        dateAddedAt: "2023-11-14T22:15:00.000Z",
      },
      ownership: {
        source: "steam_family",
        ownerSteamIdTail: "2345",
        ownerSteamIdTails: ["9999"],
        familyShared: true,
      },
      flags: {
        hasAchievements: true,
        wishlist: true,
        familyShared: true,
      },
    });
    expect(snapshot.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it("does not let generatedAt change the content checksum", () => {
    const base = {
      games: { 10: game(10, "Hades", 90) },
      collections: [collection("favorites", "Favorites", [10])],
      appVersion: "0.2.0",
    };

    const first = buildLibrarySnapshot({ ...base, generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = buildLibrarySnapshot({ ...base, generatedAt: "2026-01-02T00:00:00.000Z" });

    expect(first.checksum).toBe(second.checksum);
  });

  it("filters automation snapshots by category, cache requirements, playtime and collection-only state", () => {
    const hltb: HltbData = {
      main_story: 12,
      main_extra: null,
      completionist: null,
      game_id: 1,
      game_name: "Hades",
      confidence: 90,
    };
    const collectionOnly = {
      ...game(30, "Removed Family Game", 300),
      is_collection_only: true,
    };

    const snapshot = buildLibrarySnapshot({
      games: {
        10: game(10, "Hades", 180),
        20: game(20, "Celeste", 30),
        30: collectionOnly,
      },
      collections: [
        collection("user-collections.action", "Action", [10, 30]),
        collection("user-collections.platformers", "Platformers", [20]),
      ],
      details: {
        10: details(10),
        30: details(30),
      },
      hltbData: {
        10: hltb,
      },
      payloadSettings: {
        categoryMode: "custom",
        categoryKeys: ["user-collections.action"],
        includeCollectionOnlyGames: false,
        minSteamHours: 1,
        requireDetails: true,
        requireHltb: true,
        skipEmptyCollections: true,
      },
      appVersion: "0.4.7",
      generatedAt: "2026-06-18T18:00:00.000Z",
    });

    expect(snapshot.summary.gameCount).toBe(1);
    expect(snapshot.summary.collectionCount).toBe(1);
    expect(snapshot.collections).toEqual([
      {
        key: "user-collections.action",
        name: "Action",
        isDynamic: false,
        gameCount: 1,
        appIds: [10],
      },
    ]);
    expect(snapshot.games.map((item) => item.appId)).toEqual([10]);
    expect(snapshot.games[0].flags).toMatchObject({
      collectionOnly: false,
      hasDetails: true,
      hasHltb: true,
    });
  });

  it("omits optional automation sections while preserving snapshot compatibility", () => {
    const snapshot = buildLibrarySnapshot({
      games: {
        10: game(10, "Hades", 90),
      },
      collections: [collection("favorites", "Favorites", [10])],
      details: { 10: details(10) },
      hltbData: {
        10: {
          main_story: 12,
          main_extra: 18,
          completionist: 40,
          game_id: 1,
          game_name: "Hades",
          confidence: 90,
        },
      },
      achievements: {
        10: {
          total: 49,
          achieved: 49,
          achievements: [],
        },
      },
      wishlistItems: [{ appid: 10, priority: 0, date_added: 1_700_000_100 }],
      familyApps: { 10: familyApp(10) },
      payloadSettings: {
        includeDetails: false,
        includeHltb: false,
        includeAchievements: false,
        includeWishlist: false,
        includeOwnership: false,
      },
      appVersion: "0.4.7",
      generatedAt: "2026-06-18T18:00:00.000Z",
    });

    expect(snapshot.summary).toMatchObject({
      gameCount: 1,
      hltbCount: 0,
      achievementCount: 0,
      wishlistCount: 0,
      familySharedCount: 0,
    });
    expect(snapshot.games[0]).toMatchObject({
      details: null,
      hltb: null,
      achievements: null,
      wishlist: null,
      ownership: null,
      flags: {
        hasDetails: false,
        missingDetails: true,
        hasHltb: false,
        hasAchievements: false,
        wishlist: false,
        familyShared: false,
      },
    });
    expect(snapshot.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });
});
