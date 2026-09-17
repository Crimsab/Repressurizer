import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_PLANNER_CONFIG, planSession, sessionRecommendationCards, type SessionPlannerConfig, type SessionPlannerInput } from "./sessionPlanner";
import type { AchievementSummary, GameDetails, OwnedGame, SteamReviewSummary } from "./types";

const game = (appid: number): OwnedGame => ({ appid, name: `Game ${appid}`, playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 });
const details = (app_id: number, patch: Partial<GameDetails> = {}): GameDetails => ({
  app_id, name: `Game ${app_id}`, genres: [], tags: [], categories: [], release_date: null,
  metacritic_score: null, developers: [], publishers: [], supported_languages: [],
  platforms: { windows: true, mac: false, linux: false }, header_image: null, capsule_image: null,
  price_initial: null, price_final: null, price_currency: null, is_free: false, ...patch,
});
const hours = (main_story: number, completionist: number | null = null) => ({ main_story, main_extra: null, completionist });
const review = (positive_percentage: number): SteamReviewSummary => ({
  app_id: 1, review_score: 0, review_score_desc: "Test", total_positive: 70,
  total_negative: 30, total_reviews: 100, positive_percentage, fetched_at: 0,
});
const summary = (achieved: number): AchievementSummary => ({ total: 10, achieved, achievements: [] });
function input(config: Partial<SessionPlannerConfig> = {}, patch: Partial<SessionPlannerInput> = {}): SessionPlannerInput {
  return {
    config: { ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "any", intent: "random", ...config },
    games: [game(1)], details: {}, hltbData: {}, hltbTimeMode: "main_story", achievements: {}, ratings: {},
    wishlistItems: [], installedAppIds: new Set(), installedDataReady: true, familyAppIds: new Set(),
    statuses: {}, diaryDecisions: {}, hiddenAppIds: new Set(), suppressedAppIds: new Set(), frequency: {},
    pinnedAppId: null, rankingMode: "smart", rankingWeights: { playtime: 0, wishlist: 0, hltb: 0, achievements: 0, recency: 0, quality: 0, genre: 0 },
    seed: 1, now: 100 * 86_400_000, detailsMaxAgeDays: 30, ...patch,
  };
}

describe("Session Planner requirements", () => {
  for (const installed of ["require", "exclude"] as const) {
    it(`does not satisfy ${installed} from an unread installation inventory`, () => {
      const result = planSession(input({ installed }, { installedDataReady: false }));
      expect(result.eligibleCount).toBe(0);
      expect(result.excludedCount).toBe(1);
    });
  }
  it("keeps unknown installation eligible when no installation condition is set", () => {
    expect(planSession(input({}, { installedDataReady: false })).eligibleCount).toBe(1);
  });
  it("uses Deck status rather than a native Linux platform flag", () => {
    const result = planSession(input({ deckCompatible: true }, { games: [game(1), game(2), game(3)], details: {
      1: details(1, { platforms: { windows: true, mac: false, linux: true }, deck_status: "unsupported" }),
      2: details(2, { deck_status: "verified" }), 3: details(3, { deck_status: "playable" }),
    } }));
    expect(result.eligibleCount).toBe(2);
    expect(result.best?.requirementsPassed).toContain("Deck verified");
    expect([result.best, result.shorter, result.different].filter(Boolean).map((item) => item!.game.appid)).not.toContain(1);
  });
  for (const config of [{ deckCompatible: true }, { input: "controller" }, { input: "touch" }, { mode: "single" },
    { minSteamReviewPercent: 70 }, { minMetacritic: 70 }, { minAchievementPercent: 0 }, { maxAchievementPercent: 100 },
    { maxDaysSincePlayed: 30 }] satisfies Partial<SessionPlannerConfig>[]) {
    it(`rejects unknown evidence for ${JSON.stringify(config)}`, () => {
      expect(planSession(input(config)).eligibleCount).toBe(0);
    });
  }
  it("accepts explicit full controller metadata without category labels", () => {
    expect(planSession(input({ input: "controller" }, { details: { 1: details(1, { full_controller_support: true }) } })).eligibleCount).toBe(1);
  });
  it("preserves explicit partial controller support", () => {
    expect(planSession(input({ input: "controller" }, { details: { 1: details(1, { full_controller_support: false, categories: ["Partial Controller Support"] }) } })).eligibleCount).toBe(1);
  });
  it("does not infer online co-op from local or generic co-op", () => {
    expect(planSession(input({ mode: "online-coop" }, { details: { 1: details(1, { categories: ["Co-op", "Shared/Split Screen Co-op"] }) } })).eligibleCount).toBe(0);
  });
  it("accepts explicit online co-op", () => {
    expect(planSession(input({ mode: "online-coop" }, { details: { 1: details(1, { categories: ["Online Co-op"] }) } })).eligibleCount).toBe(1);
  });
  it("does not infer local co-op from competitive split screen", () => {
    expect(planSession(input({ mode: "local-coop" }, { details: { 1: details(1, { categories: ["Shared/Split Screen PvP"] }) } })).eligibleCount).toBe(0);
  });
  it("does not infer competitive play from generic multiplayer", () => {
    expect(planSession(input({ mode: "competitive" }, { details: { 1: details(1, { categories: ["Multi-player", "Online Co-op"] }) } })).eligibleCount).toBe(0);
    expect(planSession(input({ mode: "competitive" }, { details: { 1: details(1, { categories: ["Online PvP"] }) } })).eligibleCount).toBe(1);
  });
  it("does not let a pin bypass a failed requirement", () => {
    expect(planSession(input({ deckCompatible: true }, { pinnedAppId: 1 })).eligibleCount).toBe(0);
  });
  it("accepts known threshold boundary values", () => {
    const patch = {
      details: { 1: details(1, { metacritic_score: 70 }) },
      ratings: { 1: review(70) },
      achievements: { 1: summary(5) },
    };
    expect(planSession(input({ minMetacritic: 70, minSteamReviewPercent: 70, minAchievementPercent: 50, maxAchievementPercent: 50 }, patch)).eligibleCount).toBe(1);
  });
  it("does not accept non-finite provider percentages", () => {
    expect(planSession(input({ minSteamReviewPercent: 70 }, { ratings: { 1: review(NaN) } })).eligibleCount).toBe(0);
    expect(planSession(input({ maxAchievementPercent: 100 }, { achievements: { 1: summary(NaN) } })).eligibleCount).toBe(0);
  });
  it("matches lifecycle status without a backlog decision hiding it", () => {
    const patch = { statuses: { 1: "playing" }, diaryDecisions: { 1: "backlog" } };
    expect(planSession(input({ diaryStatus: "playing" }, patch)).eligibleCount).toBe(1);
    expect(planSession(input({ diaryStatus: "backlog" }, patch)).eligibleCount).toBe(1);
  });
});

describe("Session Planner estimates and alternatives", () => {
  it("keeps missing HLTB unknown without rewarding it as a short game", () => {
    const result = planSession(input({ intent: "short" }));
    expect(result.eligibleCount).toBe(1);
    expect(result.best?.estimatedRemainingHours).toBe(null);
    expect(result.best?.missingData).toContain("HLTB (not treated as zero)");
    expect(result.best?.preferenceReasons).not.toContain("short-session fit");
  });
  it("uses the chosen HLTB mode for finish and short preferences", () => {
    const patch = { games: [{ ...game(1), playtime_forever: 60 }], hltbData: { 1: hours(1, 20) }, hltbTimeMode: "completionist" as const };
    expect(planSession(input({ intent: "finish" }, patch)).best?.preferenceReasons).not.toContain("close to estimated finish");
    expect(planSession(input({ intent: "short" }, patch)).best?.preferenceReasons).not.toContain("short-session fit");
  });
  it("applies the session budget at the estimated remaining-time boundary", () => {
    const patch = { games: [{ ...game(1), playtime_forever: 15 }], hltbData: { 1: hours(1) } };
    const tooShort = planSession(input({ durationMinutes: 44 }, patch));
    const fitting = planSession(input({ durationMinutes: 45 }, patch));
    expect(fitting.best?.adjustedScore).toBe(tooShort.best!.adjustedScore + 12);
    expect(fitting.best?.preferenceReasons).toContain("estimated remaining time fits session budget");
  });
  it("does not claim a duration fit for an open-ended game", () => {
    const result = planSession(input({ durationMinutes: 120 }, { details: { 1: details(1, { tags: ["Sandbox"] }) }, hltbData: { 1: hours(1) } }));
    expect(result.best?.estimatedRemainingHours).toBe(null);
    expect(result.best?.preferenceReasons).not.toContain("estimated remaining time fits session budget");
  });
  it("does not claim a duration fit from zero/invalid durations", () => {
    for (const durationMinutes of [0, -1, NaN, Infinity]) {
      expect(planSession(input({ durationMinutes }, { hltbData: { 1: hours(1) } })).best?.preferenceReasons).not.toContain("estimated remaining time fits session budget");
    }
  });
  it("leaves the shorter slot empty when no comparison can be made", () => {
    const result = planSession(input({}, { games: [game(1), game(2)] }));
    expect(result.shorter).toBe(null);
    expect(result.different?.game.appid).toBe(2);
  });
  it("does not label a longer game as the shorter alternative", () => {
    expect(planSession(input({}, { games: [game(1), game(2)], pinnedAppId: 1, hltbData: { 1: hours(1), 2: hours(3) } })).shorter).toBe(null);
  });
  it("selects a genuinely shorter known alternative without duplicate cards", () => {
    const result = planSession(input({}, { games: [game(1), game(2), game(3)], pinnedAppId: 1, hltbData: { 1: hours(10), 2: hours(2), 3: hours(8) } }));
    expect(result.shorter?.game.appid).toBe(2);
    expect(new Set([result.best, result.shorter, result.different].filter(Boolean).map((item) => item!.game.appid)).size).toBe(3);
  });
  it("uses known genre/tag differences rather than absent ranking affinity", () => {
    const result = planSession(input({}, { games: [game(1), game(2), game(3), game(4)], pinnedAppId: 1, details: {
      1: details(1, { genres: ["RPG"], tags: ["Fantasy"] }),
      3: details(3, { genres: ["RPG"], tags: ["Fantasy"] }),
      4: details(4, { genres: ["Strategy"], tags: ["Cards"] }),
    } }));
    expect(result.different?.game.appid).toBe(4);
  });
  it("is deterministic and does not mutate caller state", () => {
    const data = input({ controlledRandom: true }, { games: [game(1), game(2), game(3)] });
    const before = structuredClone(data);
    expect(planSession(data)).toEqual(planSession(data));
    expect(data).toEqual(before);
  });
});

describe("Session Planner card roles", () => {
  it("keeps a different alternative labeled different when shorter is absent", () => {
    const result = planSession(input({}, { games: [game(1), game(2)] }));
    const cards = sessionRecommendationCards(result);
    expect(cards.map((card) => card.role)).toEqual(["best", "different"]);
    expect(cards[1].candidate).toBe(result.different);
  });
  it("keeps all three semantic roles in order when present", () => {
    const result = planSession(input({}, { games: [game(1), game(2), game(3)], pinnedAppId: 1,
      hltbData: { 1: hours(10), 2: hours(2), 3: hours(8) } }));
    expect(sessionRecommendationCards(result).map((card) => card.role)).toEqual(["best", "shorter", "different"]);
  });
  it("renders no cards for an empty result", () => {
    expect(sessionRecommendationCards(planSession(input({}, { games: [] })))).toEqual([]);
  });
  it("does not invent an alternative for a single eligible game", () => {
    expect(sessionRecommendationCards(planSession(input())).map((card) => card.role)).toEqual(["best"]);
  });
});
