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
  return (values ?? []).map((value) => value.toLocaleLowerCase());
}

function hasCategory(details: GameDetails | undefined, values: string[]): boolean {
  const categories = normalizedValues(details?.categories);
  return values.some((value) => categories.some((category) => category.includes(value)));
}

function achievementPercent(summary: AchievementSummary | undefined): number | null {
  return summary && summary.total > 0 ? (summary.achieved / summary.total) * 100 : null;
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
    const diaryStatus = input.diaryDecisions[game.appid] ?? input.statuses[game.appid] ?? "none";
    const hltbHours = getHltbHours(input.hltbData[game.appid], input.hltbTimeMode);

    if (["completed", "beaten", "abandoned"].includes(input.statuses[game.appid] ?? "") && cfg.intent !== "achievements") continue;
    if (input.diaryDecisions[game.appid] === "archived" && cfg.intent !== "achievements") continue;

    if (cfg.installed !== "any") {
      if (!input.installedDataReady) missingData.push("installation freshness");
      else if ((cfg.installed === "require" && !installed) || (cfg.installed === "exclude" && installed)) continue;
      else requirementsPassed.push(cfg.installed === "require" ? "installed" : "not installed");
    }
    if (family && !cfg.familyAvailable) continue;
    if (family) requirementsPassed.push("Family Sharing available");
    if (cfg.deckCompatible) {
      if (!details) missingData.push("Deck compatibility");
      else if (!details.platforms?.linux) continue;
      else requirementsPassed.push("Deck-compatible platform");
    }
    if ((cfg.input === "controller" || cfg.input === "touch") && !details) missingData.push(`${cfg.input} support`);
    if (cfg.input === "controller" && details && !hasCategory(details, ["controller"])) continue;
    if (cfg.input === "touch" && details && !hasCategory(details, ["touch"])) continue;
    if (cfg.mode !== "any" && details) {
      const modes: Record<Exclude<PlannerMode, "any">, string[]> = {
        single: ["single-player"],
        "local-coop": ["local co-op", "shared/split screen"],
        "online-coop": ["online co-op", "co-op"],
        competitive: ["multi-player", "pvp"],
      };
      if (!hasCategory(details, modes[cfg.mode])) continue;
      requirementsPassed.push(cfg.mode);
    }
    if (cfg.mode !== "any" && !details) missingData.push("game modes");
    if (cfg.genre && cfg.genreRequired && !normalizedValues(details?.genres).includes(cfg.genre.toLocaleLowerCase())) continue;
    if (cfg.tag && cfg.tagRequired && !normalizedValues(details?.tags).includes(cfg.tag.toLocaleLowerCase())) continue;
    if (cfg.minHltbHours != null || cfg.maxHltbHours != null) {
      const hltbMatches = hltbHours != null
        && (cfg.minHltbHours == null || hltbHours >= cfg.minHltbHours)
        && (cfg.maxHltbHours == null || hltbHours <= cfg.maxHltbHours);
      if (cfg.hltbRequired && !hltbMatches) continue;
      if (hltbMatches) requirementsPassed.push(cfg.hltbRequired ? "HLTB requirement" : "HLTB preference");
      else if (hltbHours == null) missingData.push("HLTB");
    }
    if (cfg.minSteamReviewPercent != null) {
      if (rating == null) missingData.push("Steam reviews"); else if (rating < cfg.minSteamReviewPercent) continue; else requirementsPassed.push("Steam review threshold");
    }
    if (cfg.minMetacritic != null) {
      if (details?.metacritic_score == null) missingData.push("Metacritic"); else if (details.metacritic_score < cfg.minMetacritic) continue; else requirementsPassed.push("Metacritic threshold");
    }
    if (cfg.maxDaysSincePlayed != null && game.rtime_last_played > 0 && (input.now / 1000 - game.rtime_last_played) / 86_400 > cfg.maxDaysSincePlayed) continue;
    if (cfg.minPlaytimeHours != null && playtimeHours < cfg.minPlaytimeHours) continue;
    if (cfg.maxPlaytimeHours != null && playtimeHours > cfg.maxPlaytimeHours) continue;
    if (cfg.diaryStatus && diaryStatus !== cfg.diaryStatus) continue;
    if (cfg.minAchievementPercent != null) {
      if (achievement == null) missingData.push("achievements"); else if (achievement < cfg.minAchievementPercent) continue;
    }
    if (cfg.maxAchievementPercent != null) {
      if (achievement == null) missingData.push("achievements"); else if (achievement > cfg.maxAchievementPercent) continue;
    }

    let adjustment = (input.frequency[game.appid] ?? 0) * 5;
    if (input.pinnedAppId === game.appid) { adjustment += 100; preferenceReasons.push("pinned"); }
    if (cfg.genre && !cfg.genreRequired && normalizedValues(details?.genres).includes(cfg.genre.toLocaleLowerCase())) { adjustment += 10; preferenceReasons.push("preferred genre"); }
    if (cfg.tag && !cfg.tagRequired && normalizedValues(details?.tags).includes(cfg.tag.toLocaleLowerCase())) { adjustment += 8; preferenceReasons.push("preferred tag"); }
    if (!cfg.hltbRequired && (cfg.minHltbHours != null || cfg.maxHltbHours != null) && hltbHours != null
      && (cfg.minHltbHours == null || hltbHours >= cfg.minHltbHours)
      && (cfg.maxHltbHours == null || hltbHours <= cfg.maxHltbHours)) { adjustment += 8; preferenceReasons.push("preferred HLTB range"); }
    if (cfg.intent === "new" && playtimeHours === 0) { adjustment += 18; preferenceReasons.push("new game"); }
    if (cfg.intent === "continue" && playtimeHours > 0) { adjustment += 16; preferenceReasons.push("continue progress"); }
    if (cfg.intent === "finish" && playtimeHours > 0 && ranked.mainTime != null && playtimeHours / ranked.mainTime >= 0.65) { adjustment += 22; preferenceReasons.push("close to estimated finish"); }
    if (cfg.intent === "short" && (ranked.mainTime == null || ranked.mainTime <= 10)) { adjustment += 12; preferenceReasons.push("short-session fit"); }
    if (cfg.intent === "achievements" && achievement != null && achievement > 0 && achievement < 100) { adjustment += 16; preferenceReasons.push("achievement progress available"); }
    if (cfg.intent === "relaxing" && normalizedValues(details?.tags).some((tag) => ["relaxing", "cozy", "casual"].some((value) => tag.includes(value)))) { adjustment += 14; preferenceReasons.push("relaxing tag"); }
    if (cfg.intent === "difficult" && normalizedValues(details?.tags).some((tag) => ["difficult", "souls-like", "precision"].some((value) => tag.includes(value)))) { adjustment += 14; preferenceReasons.push("challenge tag"); }
    if (cfg.intent === "random" && cfg.controlledRandom) adjustment += deterministicNoise(game.appid, input.seed);

    const endless = normalizedValues(details?.genres).some((genre) => ["massively multiplayer", "simulation"].some((value) => genre.includes(value)))
      || normalizedValues(details?.tags).some((tag) => ["sandbox", "roguelike", "rogue-lite"].some((value) => tag.includes(value)));
    const estimatedRemainingHours = endless || hltbHours == null ? null : Math.max(0, hltbHours - playtimeHours);
    if (endless) preferenceReasons.push("open-ended game: session time used");
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
  const shorter = [...remaining].sort((left, right) => (left.estimatedRemainingHours ?? Infinity) - (right.estimatedRemainingHours ?? Infinity) || right.adjustedScore - left.adjustedScore)[0] ?? null;
  const used = new Set([best?.game.appid, shorter?.game.appid]);
  const different = remaining
    .filter((candidate) => !used.has(candidate.game.appid))
    .sort((left, right) => {
      const leftAffinity = left.contributions.find((item) => item.signal === "genre")?.points ?? 0;
      const rightAffinity = right.contributions.find((item) => item.signal === "genre")?.points ?? 0;
      return leftAffinity - rightAffinity || right.adjustedScore - left.adjustedScore;
    })[0] ?? null;
  return { best, shorter, different, eligibleCount: candidates.length, excludedCount: base.length - candidates.length };
}
