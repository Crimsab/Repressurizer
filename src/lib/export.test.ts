import { describe, expect, it } from "vitest";
import { generateExport, getDefaultFilename, getExportPreview } from "./export";
import type { GameDetails, OwnedGame, SteamCollection } from "./types";
import type { HltbData } from "./tauri";

function game(appid: number, name: string, playtime = 0, lastPlayed = 0, collectionOnly = false): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: playtime,
    img_icon_url: null,
    rtime_last_played: lastPlayed,
    is_collection_only: collectionOnly,
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

function details(appId: number, overrides: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appId,
    name: overrides.name ?? `Game ${appId}`,
    genres: ["RPG"],
    categories: ["Single-player"],
    release_date: "30 Jun, 2026",
    metacritic_score: 88,
    developers: ["Studio"],
    publishers: ["Publisher"],
    supported_languages: ["English"],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: 1999,
    price_final: 999,
    price_currency: "EUR",
    is_free: false,
    ...overrides,
  };
}

describe("manual export", () => {
  const games = {
    1: game(1, "Alpha", 30, 1_700_000_000),
    2: game(2, "Beta", 0),
    3: game(3, "Gamma", 120, 1_700_100_000, true),
  };
  const collections = [
    collection("user-collections.rpg", "RPG", [1, 2, 999]),
    collection("user-collections.favorite", "Favorites", [3]),
    collection("user-collections.empty", "Empty after filters", [2]),
    collection("user-collections.skip", "Skip me", [3]),
  ];
  const hltbData: Record<number, HltbData> = {
    1: { main_story: 5, main_extra: 7, completionist: 10 },
    3: { main_story: 12, main_extra: 15, completionist: 20 },
  };

  it("uses unique timestamped default filenames", () => {
    expect(
      getDefaultFilename("category", "json", {
        categoryName: "RPG / Great",
        now: new Date(2026, 5, 30, 12, 34, 56),
      })
    ).toBe("repressurizer-category-RPG-Great-20260630-123456.json");
  });

  it("does not export status by default", () => {
    const exported = JSON.parse(
      generateExport({
        scope: "all",
        format: "json",
        games,
        collections,
        statuses: { 1: "playing" },
      })
    );

    expect(exported[0]).toMatchObject({
      appid: 1,
      name: "Alpha",
    });
    expect(exported[0]).not.toHaveProperty("status");
  });

  it("exports structured categories after filters with correct counts", () => {
    const opts = {
      scope: "categories" as const,
      format: "json" as const,
      games,
      collections,
      details: { 1: details(1), 3: details(3, { genres: ["Action"] }) },
      hltbData,
      statuses: { 1: "playing" as const, 3: "completed" as const },
      fields: ["appid", "name", "playtime", "status", "hltb", "categories", "genres", "collectionOnly"] as const,
      filters: { minSteamHours: 0.5 },
      excludedCategoryKeys: ["user-collections.favorite", "user-collections.skip"],
      skipEmptyCategories: true,
      categoryColors: { "user-collections.rpg": "#10b981" },
    };

    const preview = getExportPreview(opts);
    expect(preview).toMatchObject({
      gameCount: 1,
      categoryCount: 1,
      skippedGameCount: 1,
      skippedCategoryCount: 1,
    });

    const exported = JSON.parse(generateExport(opts));
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      name: "RPG",
      color: "#10B981",
      game_count: 1,
      source_game_count: 3,
      skipped_game_count: 2,
      missing_appids: [999],
    });
    expect(exported[0].games[0]).toMatchObject({
      appid: 1,
      name: "Alpha",
      status: "playing",
      categories: ["RPG"],
      genres: ["RPG"],
      collection_only: false,
    });
    expect(exported[0].games[0].hltb).toMatchObject({
      hours: 5,
      mode: "main_story",
      main_story: 5,
      completionist: 10,
    });
  });

  it("applies metadata filters and selected HLTB mode to flat exports", () => {
    const exported = JSON.parse(
      generateExport({
        scope: "all",
        format: "json",
        games,
        collections,
        details: { 1: details(1), 3: details(3, { genres: ["Action"] }) },
        hltbData,
        statuses: { 1: "playing", 3: "completed" },
        hltbTimeMode: "completionist",
        fields: ["name", "status", "hltb", "genres", "price"],
        filters: {
          hltbPresence: "with",
          collectionOnly: "exclude",
          statuses: ["playing"],
        },
      })
    );

    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      name: "Alpha",
      status: "playing",
      genres: ["RPG"],
      price: { display: "9.99 EUR", final: 999, currency: "EUR" },
      hltb: { hours: 10, mode: "completionist" },
    });
  });

  it("writes category CSV exports as a valid table", () => {
    const csv = generateExport({
      scope: "categories",
      format: "csv",
      games,
      collections,
      fields: ["appid", "name", "playtime"],
      skipEmptyCategories: false,
    });

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Category,Category Key,Category Game Count,App ID,Name,Steam Hours");
    expect(lines.some((line) => line.startsWith("# "))).toBe(false);
    expect(lines).toContain("RPG,user-collections.rpg,2,1,Alpha,0.5");
    expect(lines).toContain("Favorites,user-collections.favorite,1,3,Gamma,2.0");
    expect(lines).toContain("Empty after filters,user-collections.empty,1,2,Beta,0.0");
  });

  it("uses selected category keys for all-categories exports", () => {
    const exported = JSON.parse(
      generateExport({
        scope: "categories",
        format: "json",
        games,
        collections,
        categoryKeys: ["user-collections.favorite"],
        fields: ["appid", "name"],
      })
    );

    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      key: "user-collections.favorite",
      name: "Favorites",
      game_count: 1,
    });
    expect(exported[0].games).toEqual([{ appid: 3, name: "Gamma" }]);
  });
});
