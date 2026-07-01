import { describe, expect, it } from "vitest";
import { prepareDepressurizerDatabaseMerge } from "./depressurizerDatabaseImport";
import type { DepressurizerDatabaseImport, GameDetails, SteamReviewSummary } from "./types";

function details(appId: number, overrides: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    genres: [],
    tags: [],
    categories: [],
    release_date: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: false, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: null,
    is_free: false,
    ...overrides,
  };
}

function rating(appId: number, total = 100): SteamReviewSummary {
  return {
    app_id: appId,
    review_score: 8,
    review_score_desc: "Very Positive",
    total_positive: 90,
    total_negative: 10,
    total_reviews: total,
    positive_percentage: 90,
    fetched_at: 1,
  };
}

describe("Depressurizer database merge", () => {
  it("fills missing metadata without replacing live Steam fields", () => {
    const imported: DepressurizerDatabaseImport = {
      sourcePath: null,
      names: { 10: "Counter-Strike" },
      details: [
        details(10, {
          name: "Counter-Strike",
          genres: ["Action"],
          tags: ["Classic", "FPS"],
          categories: ["Family Sharing"],
          release_date: "Nov 1, 2000",
          developers: ["Valve"],
          supported_languages: ["English"],
          platforms: { windows: true, mac: true, linux: true },
        }),
      ],
      hltb: { 10: { main_story: 25.5, main_extra: 91.3, completionist: 774.8 } },
      steamReviews: [rating(10)],
      stats: {
        databaseEntries: 1,
        requestedAppIds: 1,
        matchedEntries: 1,
        names: 1,
        details: 1,
        hltb: 1,
        steamReviews: 1,
        entriesWithTags: 1,
        entriesWithAchievements: 0,
      },
    };

    const result = prepareDepressurizerDatabaseMerge({
      imported,
      currentDetails: {
        10: details(10, {
          name: "Counter-Strike",
          genres: ["Action"],
          categories: ["Steam Cloud"],
          release_date: "1 Nov, 2000",
          platforms: { windows: true, mac: false, linux: false },
        }),
      },
      currentHltb: {},
      currentSteamReviews: {},
    });

    expect(result.details).toHaveLength(1);
    expect(result.details[0].categories).toEqual(["Steam Cloud"]);
    expect(result.details[0].release_date).toBe("1 Nov, 2000");
    expect(result.details[0].store_release_date).toBe("Nov 1, 2000");
    expect(result.details[0].tags).toEqual(["Classic", "FPS"]);
    expect(result.details[0].platforms).toEqual({ windows: true, mac: false, linux: false });
    expect(result.hltb[10]?.main_story).toBe(25.5);
    expect(result.steamReviews).toHaveLength(1);
    expect(result.stats).toMatchObject({ detailsMerged: 1, hltbAdded: 1, steamReviewsAdded: 1 });
  });

  it("treats blank cached release dates as missing during database import", () => {
    const imported: DepressurizerDatabaseImport = {
      sourcePath: null,
      names: {},
      details: [
        details(260730, {
          release_date: "23 Jul, 2001",
        }),
      ],
      hltb: {},
      steamReviews: [],
      stats: {
        databaseEntries: 1,
        requestedAppIds: 1,
        matchedEntries: 1,
        names: 0,
        details: 1,
        hltb: 0,
        steamReviews: 0,
        entriesWithTags: 0,
        entriesWithAchievements: 0,
      },
    };

    const result = prepareDepressurizerDatabaseMerge({
      imported,
      currentDetails: {
        260730: details(260730, {
          release_date: "",
          store_release_date: "",
        }),
      },
      currentHltb: {},
      currentSteamReviews: {},
    });

    expect(result.details[0].release_date).toBe("23 Jul, 2001");
    expect(result.details[0].store_release_date).toBe("23 Jul, 2001");
  });

  it("fills missing HLTB fields without replacing local values and skips existing reviews", () => {
    const imported: DepressurizerDatabaseImport = {
      sourcePath: null,
      names: {},
      details: [],
      hltb: { 20: { main_story: 16, main_extra: 20, completionist: 30 } },
      steamReviews: [rating(20)],
      stats: {
        databaseEntries: 1,
        requestedAppIds: 1,
        matchedEntries: 1,
        names: 0,
        details: 0,
        hltb: 1,
        steamReviews: 1,
        entriesWithTags: 0,
        entriesWithAchievements: 0,
      },
    };

    const result = prepareDepressurizerDatabaseMerge({
      imported,
      currentDetails: {},
      currentHltb: { 20: { main_story: 12, main_extra: null, completionist: null } },
      currentSteamReviews: { 20: rating(20, 50) },
    });

    expect(result.hltb[20]).toEqual({
      main_story: 12,
      main_extra: 20,
      completionist: 30,
      game_id: null,
      game_name: null,
      confidence: null,
    });
    expect(result.steamReviews).toEqual([]);
  });

  it("can overwrite selected cached metadata when explicitly requested", () => {
    const imported: DepressurizerDatabaseImport = {
      sourcePath: null,
      names: {},
      details: [
        details(30, {
          name: "Day of Defeat",
          genres: ["Action"],
          tags: ["Classic"],
          categories: ["Family Sharing"],
          release_date: "May 1, 2003",
          platforms: { windows: true, mac: true, linux: true },
        }),
      ],
      hltb: { 30: { main_story: 5.9, main_extra: null, completionist: null } },
      steamReviews: [rating(30, 2147)],
      stats: {
        databaseEntries: 1,
        requestedAppIds: 1,
        matchedEntries: 1,
        names: 0,
        details: 1,
        hltb: 1,
        steamReviews: 1,
        entriesWithTags: 1,
        entriesWithAchievements: 0,
      },
    };

    const result = prepareDepressurizerDatabaseMerge({
      imported,
      currentDetails: {
        30: details(30, {
          name: "Local Name",
          genres: ["Old Genre"],
          tags: ["Old Tag"],
          categories: ["Old Feature"],
          release_date: "Old Date",
          platforms: { windows: true, mac: false, linux: false },
        }),
      },
      currentHltb: { 30: { main_story: 1, main_extra: null, completionist: null } },
      currentSteamReviews: { 30: rating(30, 10) },
      options: {
        overwriteDetails: true,
        overwriteTags: true,
        overwriteHltb: true,
        overwriteSteamReviews: true,
      },
    });

    expect(result.details[0]).toMatchObject({
      name: "Day of Defeat",
      genres: ["Action"],
      tags: ["Classic"],
      categories: ["Family Sharing"],
      release_date: "May 1, 2003",
      platforms: { windows: true, mac: true, linux: true },
    });
    expect(result.hltb[30].main_story).toBe(5.9);
    expect(result.steamReviews[0].total_reviews).toBe(2147);
  });

  it("can import only tags while leaving other detail fields untouched", () => {
    const imported: DepressurizerDatabaseImport = {
      sourcePath: null,
      names: {},
      details: [
        details(40, {
          genres: ["Action"],
          tags: ["Arena Shooter"],
          categories: ["Family Sharing"],
          release_date: "Jan 1, 2004",
        }),
      ],
      hltb: {},
      steamReviews: [],
      stats: {
        databaseEntries: 1,
        requestedAppIds: 1,
        matchedEntries: 1,
        names: 0,
        details: 1,
        hltb: 0,
        steamReviews: 0,
        entriesWithTags: 1,
        entriesWithAchievements: 0,
      },
    };

    const result = prepareDepressurizerDatabaseMerge({
      imported,
      currentDetails: {
        40: details(40, {
          genres: ["Puzzle"],
          categories: ["Steam Cloud"],
          release_date: "Live Date",
        }),
      },
      currentHltb: {},
      currentSteamReviews: {},
      options: { includeDetails: false, includeTags: true },
    });

    expect(result.details[0].genres).toEqual(["Puzzle"]);
    expect(result.details[0].categories).toEqual(["Steam Cloud"]);
    expect(result.details[0].release_date).toBe("Live Date");
    expect(result.details[0].tags).toEqual(["Arena Shooter"]);
  });
});
