import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_PLANNER_CONFIG, planSession } from "./sessionPlanner";
import { DEFAULT_RANKING_WEIGHTS } from "./backlogRanking";

const games = [
  { appid: 1, name: "Installed", playtime_forever: 120, img_icon_url: null, rtime_last_played: 100 },
  { appid: 2, name: "Not installed", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
  { appid: 3, name: "Missing HLTB", playtime_forever: 30, img_icon_url: null, rtime_last_played: 0 },
];

function input(config = DEFAULT_SESSION_PLANNER_CONFIG) {
  return { config, games, details: {}, hltbData: { 1: { main_story: 8, main_extra: null, completionist: null }, 2: { main_story: 2, main_extra: null, completionist: null } }, hltbTimeMode: "main_story" as const, achievements: {}, ratings: {}, wishlistItems: [], installedAppIds: new Set([1, 3]), installedDataReady: true, familyAppIds: new Set<number>(), statuses: {}, diaryDecisions: {}, hiddenAppIds: new Set<number>(), suppressedAppIds: new Set<number>(), frequency: {}, pinnedAppId: null, rankingMode: "smart" as const, rankingWeights: DEFAULT_RANKING_WEIGHTS, seed: 0, now: 1_000_000, detailsMaxAgeDays: 30 };
}

describe("planSession", () => {
  it("uses hard requirements to exclude and preferences only to change score", () => {
    const required = planSession(input({ ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "require" }));
    expect([required.best, required.shorter, required.different].filter(Boolean).map((item) => item!.game.appid)).not.toContain(2);
    const preferred = planSession({ ...input({ ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "any", intent: "new" }), frequency: { 2: 2 } });
    expect(preferred.eligibleCount).toBe(3);
  });

  it("does not treat missing HLTB as zero or exclude the game", () => {
    const result = planSession(input({ ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "any" }));
    expect(result.eligibleCount).toBe(3);
    const missing = [result.best, result.shorter, result.different].find((item) => item?.game.appid === 3);
    expect(missing?.missingData).toContain("HLTB (not treated as zero)");
  });

  it("is stable for identical input and controlled for a seed", () => {
    const config = { ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "any" as const, intent: "random" as const, controlledRandom: true };
    expect(planSession(input(config))).toEqual(planSession(input(config)));
  });

  it("exposes the strongest base-ranking contributions", () => {
    const result = planSession(input({ ...DEFAULT_SESSION_PLANNER_CONFIG, installed: "any" }));
    expect(result.best?.preferenceReasons.some((reason) => reason.includes("ranking score"))).toBe(true);
  });
});
