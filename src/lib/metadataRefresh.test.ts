import { describe, expect, it } from "vitest";
import {
  appIdsForCollections,
  buildMetadataRefreshPlan,
  DEFAULT_METADATA_REFRESH_OPTIONS,
} from "./metadataRefresh";
import { DETAILS_CACHE_SCHEMA_VERSION, MS_PER_DAY } from "./detailsCache";
import type {
  AchievementSummary,
  GameDetails,
  OwnedGame,
  SteamCollection,
  SteamReviewSummary,
} from "./types";

function collection(key: string, added: number[]): SteamCollection {
  return {
    id: key,
    key,
    name: key,
    added,
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  };
}

function game(appid: number): OwnedGame {
  return {
    appid,
    name: `Game ${appid}`,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

function details(appId: number, fetchedAt: number, extra: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
    fetched_at: fetchedAt,
    genres: ["Action"],
    categories: ["Single-player"],
    release_date: "Jan 1, 2020",
    store_release_date: null,
    store_release_date_fetched_at: Date.now(),
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: ["English"],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: "EUR",
    is_free: false,
    ...extra,
  };
}

function rating(appId: number, fetchedAt: number): SteamReviewSummary {
  return {
    app_id: appId,
    review_score: 8,
    review_score_desc: "Very Positive",
    total_positive: 9,
    total_negative: 1,
    total_reviews: 10,
    positive_percentage: 90,
    fetched_at: fetchedAt,
  };
}

function achievement(): AchievementSummary {
  return { total: 10, achieved: 5, achievements: [] };
}

describe("metadata refresh planning", () => {
  it("builds a unique app id list from multiple collections", () => {
    expect(appIdsForCollections([
      collection("a", [3, 1, 3]),
      collection("b", [2, 1]),
    ])).toEqual([1, 2, 3]);
  });

  it("respects stale-only options and ignored app ids", () => {
    const now = Date.now();
    const plan = buildMetadataRefreshPlan({
      appIds: [1, 2, 3],
      games: { 1: game(1), 2: game(2), 3: game(3) },
      details: {
        1: details(1, now - 1 * MS_PER_DAY),
        2: details(2, now - 40 * MS_PER_DAY),
        3: details(3, now - 40 * MS_PER_DAY),
      },
      ratings: {
        1: rating(1, now),
        2: rating(2, now - 40 * MS_PER_DAY),
      },
      hltbData: { 1: { main_story: 5, main_extra: null, completionist: null } },
      achievements: { 1: achievement() },
      ignoredDetailFails: { 3: 3 },
      ignoredHltbFails: { 2: 3 },
      currency: "EUR",
      detailsMaxAgeDays: 30,
      options: {
        ...DEFAULT_METADATA_REFRESH_OPTIONS,
        forceDetails: false,
        forceRatings: false,
        forceHltb: false,
        includeReleaseDates: false,
        includeAchievements: true,
        forceAchievements: false,
      },
    });

    expect(plan.detailIds).toEqual([2]);
    expect(plan.ratingItems.map((item) => item.appId)).toEqual([2, 3]);
    expect(plan.hltbItems.map((item) => item.appId)).toEqual([3]);
    expect(plan.achievementItems.map((item) => item.appId)).toEqual([2, 3]);
  });

  it("can force-refresh current details while still respecting permanently ignored Steam details", () => {
    const now = Date.now();
    const plan = buildMetadataRefreshPlan({
      appIds: [1, 2],
      games: { 1: game(1), 2: game(2) },
      details: {
        1: details(1, now),
        2: details(2, now),
      },
      ratings: {},
      hltbData: {},
      achievements: {},
      ignoredDetailFails: { 2: 3 },
      ignoredHltbFails: {},
      currency: "EUR",
      detailsMaxAgeDays: 30,
      options: {
        ...DEFAULT_METADATA_REFRESH_OPTIONS,
        includeRatings: false,
        includeHltb: false,
        includeReleaseDates: false,
        includeAchievements: false,
        forceDetails: true,
      },
    });

    expect(plan.detailIds).toEqual([1]);
  });
});
