import { rankBacklogCandidates, type RankedBacklogGame, type RankingMode, type RankingWeights } from "./backlogRanking";
import type { HltbData, WishlistItem } from "./tauri";
import type { AchievementSummary, GameDetails, HltbTimeMode, OwnedGame, SteamReviewSummary } from "./types";
import { getHltbHours } from "./hltb";

export type PlannerDevice = "desktop" | "laptop" | "deck" | "custom";
export type PlannerInput = "keyboard" | "controller" | "both" | "touch";
export type PlannerMode = "any" | "single" | "local-coop" | "online-coop" | "competitive";
export type PlannerIntent = "new" | "continue" | "finish" | "short" | "achievements" | "relaxing" | "difficult" | "random";
export type PlannerRequirementMode = "any" | "require" | "exclude";

export interface SessionPlannerConfig {
  durationMinutes: number;
  device: PlannerDevice;
  customDeviceName: string;
  input: PlannerInput;
  mode: PlannerMode;
  intent: PlannerIntent;
  installed: PlannerRequirementMode;
  familyAvailable: boolean;
  deckCompatible: boolean;
  genre: string;
  genreRequired: boolean;
  tag: string;
  tagRequired: boolean;
  minHltbHours: number | null;
  maxHltbHours: number | null;
  hltbRequired: boolean;
  minSteamReviewPercent: number | null;
  minMetacritic: number | null;
  maxDaysSincePlayed: number | null;
  minPlaytimeHours: number | null;
  maxPlaytimeHours: number | null;
  diaryStatus: string;
  minAchievementPercent: number | null;
  maxAchievementPercent: number | null;
  controlledRandom: boolean;
}

export const DEFAULT_SESSION_PLANNER_CONFIG: SessionPlannerConfig = {
  durationMinutes: 45,
  device: "desktop",
  customDeviceName: "",
  input: "both",
  mode: "any",
  intent: "continue",
  installed: "require",
  familyAvailable: true,
  deckCompatible: false,
  genre: "",
  genreRequired: false,
  tag: "",
  tagRequired: false,
  minHltbHours: null,
  maxHltbHours: null,
  hltbRequired: false,
  minSteamReviewPercent: null,
  minMetacritic: null,
  maxDaysSincePlayed: null,
  minPlaytimeHours: null,
  maxPlaytimeHours: null,
  diaryStatus: "",
  minAchievementPercent: null,
  maxAchievementPercent: null,
  controlledRandom: false,
};

export interface SessionPlannerCandidate extends RankedBacklogGame {
  adjustedScore: number;
  requirementsPassed: string[];
  preferenceReasons: string[];
  missingData: string[];
  estimatedRemainingHours: number | null;
  staleData: boolean;
}

export interface SessionPlannerResult {
  best: SessionPlannerCandidate | null;
  shorter: SessionPlannerCandidate | null;
  different: SessionPlannerCandidate | null;
  eligibleCount: number;
  excludedCount: number;
}

/** Preserve semantic card labels when an optional recommendation is absent. */
export function sessionRecommendationCards(result: SessionPlannerResult): Array<{
  role: "best" | "shorter" | "different";
  candidate: SessionPlannerCandidate;
}> {
  return (["best", "shorter", "different"] as const).flatMap((role) => {
    const candidate = result[role];
    return candidate ? [{ role, candidate }] : [];
  });
}

export interface SessionPlannerInput {
  config: SessionPlannerConfig;
  games: OwnedGame[];
  details: Record<number, GameDetails>;
  hltbData: Record<number, HltbData>;
  hltbTimeMode: HltbTimeMode;
  achievements: Record<number, AchievementSummary>;
  ratings: Record<number, SteamReviewSummary>;
  wishlistItems: WishlistItem[];
  installedAppIds: ReadonlySet<number>;
  installedDataReady: boolean;
  familyAppIds: ReadonlySet<number>;
  statuses: Record<number, string>;
  diaryDecisions: Record<number, string | undefined>;
  hiddenAppIds: ReadonlySet<number>;
  suppressedAppIds: ReadonlySet<number>;
  frequency: Record<number, number>;
  pinnedAppId: number | null;
  rankingMode: RankingMode;
  rankingWeights: RankingWeights;
  seed: number;
  now: number;
  detailsMaxAgeDays: number;
}

function normalizedValues(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim().toLowerCase());
}

function hasCategory(details: GameDetails | undefined, values: string[]): boolean {
  const categories = normalizedValues(details?.categories);
  return values.some((value) => categories.some((category) => category.includes(value)));
}

function achievementPercent(summary: AchievementSummary | undefined): number | null {
  if (!summary || !Number.isFinite(summary.total) || summary.total <= 0 ||
      !Number.isFinite(summary.achieved) || summary.achieved < 0 || summary.achieved > summary.total) return null;
  return (summary.achieved / summary.total) * 100;
}

function deterministicNoise(appId: number, seed: number): number {
  let value = (appId ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return ((value >>> 0) / 0xffffffff) * 6 - 3;
}

function explainContribution(reason: string, points: number): string {
  const label = reason.replace(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase();
  const signedPoints = points > 0 ? `+${Math.round(points)}` : `${Math.round(points)}`;
  return `${signedPoints} ranking score · ${label}`;
}

export function planSession(input: SessionPlannerInput): SessionPlannerResult {
  const cfg = input.config;
  const base = rankBacklogCandidates({
    games: input.games,
    details: input.details,
    hltbData: input.hltbData,
    achievements: input.achievements,
    wishlistItems: input.wishlistItems,
    hiddenAppIds: input.hiddenAppIds,
    excludedAppIds: input.suppressedAppIds,
    mode: input.rankingMode,
    weights: input.rankingWeights,
    nowSeconds: Math.floor(input.now / 1000),
  });
  const candidates: SessionPlannerCandidate[] = [];

  for (const ranked of base) {
    const game = ranked.game;
    const details = ranked.details;
    const installed = input.installedAppIds.has(game.appid);
    const family = input.familyAppIds.has(game.appid);
    const requirementsPassed: string[] = [];
    const preferenceReasons: string[] = [];
    const missingData = ranked.missingSignals.map(String);
    const playtimeHours = game.playtime_forever / 60;
    const achievement = achievementPercent(input.achievements[game.appid]);
    const rating = input.ratings[game.appid]?.positive_percentage ?? null;
    const rawHltbHours = getHltbHours(input.hltbData[game.appid], input.hltbTimeMode);
    const hltbHours = rawHltbHours != null && Number.isFinite(rawHltbHours) && rawHltbHours > 0 ? rawHltbHours : null;

    if (["completed", "beaten", "abandoned"].includes(input.statuses[game.appid] ?? "") && cfg.intent !== "achievements") continue;
    if (input.diaryDecisions[game.appid] === "archived" && cfg.intent !== "achievements") continue;

    // Missing evidence must not silently satisfy an explicit requirement.
    if (cfg.installed !== "any") {
      if (!input.installedDataReady) continue;
      if ((cfg.installed === "require" && !installed) || (cfg.installed === "exclude" && installed)) continue;
      requirementsPassed.push(cfg.installed === "require" ? "installed" : "not installed");
    }
    if (family && !cfg.familyAvailable) continue;
    if (family) requirementsPassed.push("Family Sharing library entry");
    if (cfg.deckCompatible) {
      if (details?.deck_status !== "verified" && details?.deck_status !== "playable") continue;
      requirementsPassed.push(`Deck ${details.deck_status}`);
    }
    if (cfg.input === "controller") {
      if (details?.full_controller_support !== true && !hasCategory(details, ["controller"])) continue;
      requirementsPassed.push("controller support");
    }
    if (cfg.input === "touch") {
      if (!hasCategory(details, ["touch"])) continue;
      requirementsPassed.push("touch support");
    }
    if (cfg.mode !== "any") {
      const modes: Record<Exclude<PlannerMode, "any">, string[]> = {
        single: ["single-player"],
        "local-coop": ["local co-op", "shared/split screen co-op"],
        "online-coop": ["online co-op"],
        competitive: ["pvp", "online pvp", "lan pvp", "shared/split screen pvp"],
      };
      // Generic co-op/multiplayer does not prove an online/competitive mode.
      const categories = normalizedValues(details?.categories);
      if (!modes[cfg.mode].some((category) => categories.includes(category))) continue;
      requirementsPassed.push(cfg.mode);
    }
    if (cfg.genre && cfg.genreRequired && !normalizedValues(details?.genres).includes(cfg.genre.trim().toLowerCase())) continue;
    if (cfg.tag && cfg.tagRequired && !normalizedValues(details?.tags).includes(cfg.tag.trim().toLowerCase())) continue;
    if (cfg.minHltbHours != null || cfg.maxHltbHours != null) {
      const hltbMatches = hltbHours != null
        && (cfg.minHltbHours == null || hltbHours >= cfg.minHltbHours)
        && (cfg.maxHltbHours == null || hltbHours <= cfg.maxHltbHours);
      if (cfg.hltbRequired && !hltbMatches) continue;
      if (hltbMatches) requirementsPassed.push(cfg.hltbRequired ? "HLTB requirement" : "HLTB preference");
      else if (hltbHours == null) missingData.push("HLTB");
    }
    if (cfg.minSteamReviewPercent != null) {
      if (rating == null || !Number.isFinite(rating) || rating < 0 || rating > 100 ||
          !Number.isFinite(cfg.minSteamReviewPercent) || rating < cfg.minSteamReviewPercent) continue;
      requirementsPassed.push("Steam review threshold");
    }
    if (cfg.minMetacritic != null) {
      const metacritic = details?.metacritic_score;
      if (metacritic == null || !Number.isFinite(metacritic) || metacritic < 0 || metacritic > 100 ||
          !Number.isFinite(cfg.minMetacritic) || metacritic < cfg.minMetacritic) continue;
      requirementsPassed.push("Metacritic threshold");
    }
    if (cfg.maxDaysSincePlayed != null) {
      if (!Number.isFinite(game.rtime_last_played) || game.rtime_last_played <= 0 ||
          !Number.isFinite(cfg.maxDaysSincePlayed) ||
          Math.max(0, (input.now / 1000 - game.rtime_last_played) / 86_400) > cfg.maxDaysSincePlayed) continue;
      requirementsPassed.push("recent playtime");
    }
    if (cfg.minPlaytimeHours != null && (!Number.isFinite(playtimeHours) || playtimeHours < cfg.minPlaytimeHours)) continue;
    if (cfg.maxPlaytimeHours != null && (!Number.isFinite(playtimeHours) || playtimeHours > cfg.maxPlaytimeHours)) continue;
    if (cfg.diaryStatus && cfg.diaryStatus !== input.diaryDecisions[game.appid] &&
        cfg.diaryStatus !== (input.statuses[game.appid] ?? "none")) continue;
    if (cfg.minAchievementPercent != null || cfg.maxAchievementPercent != null) {
      if (achievement == null ||
          (cfg.minAchievementPercent != null && (!Number.isFinite(cfg.minAchievementPercent) || achievement < cfg.minAchievementPercent)) ||
          (cfg.maxAchievementPercent != null && (!Number.isFinite(cfg.maxAchievementPercent) || achievement > cfg.maxAchievementPercent))) continue;
      requirementsPassed.push("achievement progress threshold");
    }

    let adjustment = (input.frequency[game.appid] ?? 0) * 5;
    if (input.pinnedAppId === game.appid) { adjustment += 100; preferenceReasons.push("pinned"); }
    if (cfg.genre && !cfg.genreRequired && normalizedValues(details?.genres).includes(cfg.genre.trim().toLowerCase())) { adjustment += 10; preferenceReasons.push("preferred genre"); }
    if (cfg.tag && !cfg.tagRequired && normalizedValues(details?.tags).includes(cfg.tag.trim().toLowerCase())) { adjustment += 8; preferenceReasons.push("preferred tag"); }
    if (!cfg.hltbRequired && (cfg.minHltbHours != null || cfg.maxHltbHours != null) && hltbHours != null
      && (cfg.minHltbHours == null || hltbHours >= cfg.minHltbHours)
      && (cfg.maxHltbHours == null || hltbHours <= cfg.maxHltbHours)) { adjustment += 8; preferenceReasons.push("preferred HLTB range"); }
    if (cfg.intent === "new" && playtimeHours === 0) { adjustment += 18; preferenceReasons.push("new game"); }
    if (cfg.intent === "continue" && playtimeHours > 0) { adjustment += 16; preferenceReasons.push("continue progress"); }
    if (cfg.intent === "finish" && playtimeHours > 0 && hltbHours != null && playtimeHours / hltbHours >= 0.65) { adjustment += 22; preferenceReasons.push("close to estimated finish"); }
    if (cfg.intent === "short" && hltbHours != null && hltbHours <= 10) { adjustment += 12; preferenceReasons.push("short-session fit"); }
    if (cfg.intent === "achievements" && achievement != null && achievement > 0 && achievement < 100) { adjustment += 16; preferenceReasons.push("achievement progress available"); }
    if (cfg.intent === "relaxing" && normalizedValues(details?.tags).some((tag) => ["relaxing", "cozy", "casual"].some((value) => tag.includes(value)))) { adjustment += 14; preferenceReasons.push("relaxing tag"); }
    if (cfg.intent === "difficult" && normalizedValues(details?.tags).some((tag) => ["difficult", "souls-like", "precision"].some((value) => tag.includes(value)))) { adjustment += 14; preferenceReasons.push("challenge tag"); }
    if (cfg.intent === "random" && cfg.controlledRandom) adjustment += deterministicNoise(game.appid, input.seed);

    const endless = normalizedValues(details?.genres).some((genre) => ["massively multiplayer", "simulation"].some((value) => genre.includes(value)))
      || normalizedValues(details?.tags).some((tag) => ["sandbox", "roguelike", "rogue-lite"].some((value) => tag.includes(value)));
    const estimatedRemainingHours = endless || hltbHours == null ? null : Math.max(0, hltbHours - playtimeHours);
    if (estimatedRemainingHours != null && estimatedRemainingHours > 0 &&
        Number.isFinite(cfg.durationMinutes) && cfg.durationMinutes > 0 &&
        estimatedRemainingHours * 60 <= cfg.durationMinutes) {
      adjustment += 12;
      preferenceReasons.push("estimated remaining time fits session budget");
    }
    if (endless) preferenceReasons.push("open-ended game: completion time not inferred");
    if (hltbHours == null) missingData.push("HLTB (not treated as zero)");
    const scoreReasons = ranked.contributions
      .filter((contribution) => contribution.points !== 0)
      .sort((left, right) => Math.abs(right.points) - Math.abs(left.points))
      .slice(0, 2)
      .map((contribution) => explainContribution(contribution.reason, contribution.points));
    preferenceReasons.unshift(...scoreReasons);
    const staleData = details?.fetched_at != null && details.fetched_at < input.now - input.detailsMaxAgeDays * 86_400_000;
    if (staleData) missingData.push("stale store metadata");
    candidates.push({ ...ranked, adjustedScore: Math.round((ranked.score + adjustment) * 100) / 100, requirementsPassed, preferenceReasons, missingData: [...new Set(missingData)], estimatedRemainingHours, staleData });
  }

  candidates.sort((left, right) => right.adjustedScore - left.adjustedScore || left.game.name.localeCompare(right.game.name) || left.game.appid - right.game.appid);
  const best = candidates[0] ?? null;
  const remaining = candidates.filter((candidate) => candidate.game.appid !== best?.game.appid);
  const bestRemaining = best?.estimatedRemainingHours;
  const shorter = bestRemaining == null ? null : remaining
    .filter((candidate) => candidate.estimatedRemainingHours != null && candidate.estimatedRemainingHours < bestRemaining)
    .sort((left, right) => left.estimatedRemainingHours! - right.estimatedRemainingHours! || right.adjustedScore - left.adjustedScore)[0] ?? null;
  const used = new Set([best?.game.appid, shorter?.game.appid]);
  const traits = (candidate: SessionPlannerCandidate | null) => new Set([
    ...normalizedValues(candidate?.details?.genres).map((value) => `genre:${value}`),
    ...normalizedValues(candidate?.details?.tags).map((value) => `tag:${value}`),
  ]);
  const bestTraits = traits(best);
  const affinity = (candidate: SessionPlannerCandidate): number => {
    const candidateTraits = traits(candidate);
    // Unknown metadata is not evidence that a game is deliberately different.
    if (!bestTraits.size || !candidateTraits.size) return 1;
    const common = [...candidateTraits].filter((value) => bestTraits.has(value)).length;
    return common / (bestTraits.size + candidateTraits.size - common);
  };
  const different = remaining
    .filter((candidate) => !used.has(candidate.game.appid))
    .map((candidate) => ({ candidate, affinity: affinity(candidate) }))
    .sort((left, right) => left.affinity - right.affinity || right.candidate.adjustedScore - left.candidate.adjustedScore)[0]?.candidate ?? null;
  return { best, shorter, different, eligibleCount: candidates.length, excludedCount: base.length - candidates.length };
}
