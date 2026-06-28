import { describe, expect, it } from "vitest";
import {
  categorizeBySteamRating,
  isSteamRatingFresh,
  scoreForRating,
  steamRatingIdsNeedingFetch,
  wilsonLowerBoundPercentage,
} from "./steamRatings";
import type { OwnedGame, SteamReviewSummary } from "./types";

function game(appid: number, name = `Game ${appid}`): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

function rating(
  appId: number,
  positive: number,
  negative: number,
  fetchedAt = Date.now()
): SteamReviewSummary {
  const total = positive + negative;
  return {
    app_id: appId,
    review_score: 0,
    review_score_desc: "",
    total_positive: positive,
    total_negative: negative,
    total_reviews: total,
    positive_percentage: total > 0 ? Math.round((positive / total) * 100) : null,
    fetched_at: fetchedAt,
  };
}

describe("categorizeBySteamRating", () => {
  it("matches Depressurizer Steam user score buckets by percentage and review count", () => {
    const result = categorizeBySteamRating(
      [game(1), game(2), game(3), game(4), game(5)],
      {
        1: rating(1, 960, 40),
        2: rating(2, 86, 14),
        3: rating(3, 8, 2),
        4: rating(4, 75, 25),
        5: rating(5, 35, 65),
      }
    );

    expect(result.assignments).toEqual({
      "Overwhelmingly Positive": [1],
      "Very Positive": [2],
      "Positive": [3],
      "Mostly Positive": [4],
      "Mostly Negative": [5],
    });
    expect(result.games_processed).toBe(5);
    expect(result.games_categorized).toBe(5);
  });

  it("skips games without Steam reviews and supports category prefixes", () => {
    const result = categorizeBySteamRating(
      [game(1), game(2)],
      {
        1: rating(1, 0, 0),
        2: rating(2, 40, 60),
      },
      { prefix: "Steam: " }
    );

    expect(result.assignments).toEqual({ "Steam: Mixed": [2] });
    expect(result.games_categorized).toBe(1);
  });

  it("can use Wilson lower bound before matching buckets", () => {
    const summary = rating(1, 8, 0);

    expect(scoreForRating(summary, false)).toBe(100);
    expect(wilsonLowerBoundPercentage(8, 8)).toBeLessThan(80);
    expect(categorizeBySteamRating([game(1)], { 1: summary }).assignments).toEqual({
      Positive: [1],
    });
    expect(
      categorizeBySteamRating([game(1)], { 1: summary }, { use_wilson_score: true }).assignments
    ).toEqual({
      Mixed: [1],
    });
  });
});

describe("steam rating cache freshness", () => {
  it("fetches only missing or stale ratings", () => {
    const now = 1_800_000_000_000;
    const stale = now - 31 * 24 * 60 * 60 * 1000;

    expect(isSteamRatingFresh(rating(1, 10, 0, now), now)).toBe(true);
    expect(steamRatingIdsNeedingFetch(
      { 1: game(1), 2: game(2), 3: game(3) },
      {
        1: rating(1, 10, 0, now),
        2: rating(2, 10, 0, stale),
      },
      now
    )).toEqual([2, 3]);
  });
});
