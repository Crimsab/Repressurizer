import type { HltbData, WishlistItem } from "./tauri";
import type { AchievementSummary, GameDetails, OwnedGame } from "./types";

export type RankingMode = "smart" | "surprise" | "quick" | "quality" | "backlog";
export type RankingSignal =
  | "playtime"
  | "wishlist"
  | "hltb"
  | "achievements"
  | "recency"
  | "quality"
  | "genre";

export type RankingWeights = Record<RankingSignal, number>;

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  playtime: 1,
  wishlist: 1,
  hltb: 1,
  achievements: 1,
  recency: 1,
  quality: 1,
  genre: 1,
};

export interface RankingContribution {
  signal: RankingSignal;
  points: number;
  reason:
    | "unplayed"
    | "barelyPlayed"
    | "started"
    | "wishlist"
    | "short"
    | "medium"
    | "long"
    | "achievementFresh"
    | "achievementProgress"
    | "achievementComplete"
    | "recentlyPlayed"
    | "quality"
    | "genreFit";
  value?: number;
}

export interface RankedBacklogGame {
  game: OwnedGame;
  details?: GameDetails;
  hltb?: HltbData;
  score: number;
  contributions: RankingContribution[];
  missingSignals: RankingSignal[];
  mainTime: number | null;
}

interface RankBacklogCandidatesInput {
  games: OwnedGame[];
  details: Record<number, GameDetails>;
  hltbData: Record<number, HltbData>;
  achievements: Record<number, AchievementSummary>;
  wishlistItems: WishlistItem[];
  hiddenAppIds?: ReadonlySet<number>;
  excludedAppIds?: ReadonlySet<number>;
  genreAffinity?: ReadonlyMap<number, number>;
  mode: RankingMode;
  weights: RankingWeights;
  nowSeconds: number;
}

const SIGNALS: RankingSignal[] = [
  "playtime",
  "wishlist",
  "hltb",
  "achievements",
  "recency",
  "quality",
  "genre",
];

const MODE_MULTIPLIERS: Record<RankingMode, Partial<RankingWeights>> = {
  smart: {},
  surprise: {},
  quick: { hltb: 1.5 },
  quality: { quality: 1.5 },
  backlog: { playtime: 1.4 },
};

export function sanitizeRankingWeights(value: unknown): RankingWeights {
  if (!value || typeof value !== "object") return { ...DEFAULT_RANKING_WEIGHTS };
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    SIGNALS.map((signal) => {
      const raw = record[signal];
      const weight = typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(2, Math.max(0, raw))
        : DEFAULT_RANKING_WEIGHTS[signal];
      return [signal, weight];
    }),
  ) as RankingWeights;
}

export function rankBacklogCandidates({
  games,
  details,
  hltbData,
  achievements,
  wishlistItems,
  hiddenAppIds = new Set(),
  excludedAppIds = new Set(),
  genreAffinity = new Map(),
  mode,
  weights,
  nowSeconds,
}: RankBacklogCandidatesInput): RankedBacklogGame[] {
  const wishlistPriority = new Map(wishlistItems.map((item) => [item.appid, item.priority]));
  const modeMultipliers = MODE_MULTIPLIERS[mode];

  const weighted = (signal: RankingSignal, base: number) =>
    base * weights[signal] * (modeMultipliers[signal] ?? 1);

  return games
    .filter((game) => !hiddenAppIds.has(game.appid) && !excludedAppIds.has(game.appid))
    .map((game): RankedBacklogGame => {
      const gameDetails = details[game.appid];
      const hltb = hltbData[game.appid];
      const achievement = achievements[game.appid];
      const contributions: RankingContribution[] = [];
      const missingSignals: RankingSignal[] = [];

      if (weights.playtime > 0) {
        if (game.playtime_forever === 0) {
          contributions.push({ signal: "playtime", points: weighted("playtime", 18), reason: "unplayed" });
        } else if (game.playtime_forever <= 60) {
          contributions.push({ signal: "playtime", points: weighted("playtime", 14), reason: "barelyPlayed" });
        } else if (game.playtime_forever <= 240) {
          contributions.push({ signal: "playtime", points: weighted("playtime", 8), reason: "started" });
        }
      }

      const priority = wishlistPriority.get(game.appid);
      if (weights.wishlist > 0 && priority != null) {
        const priorityBonus = Math.max(0, 6 - Math.max(0, priority));
        contributions.push({
          signal: "wishlist",
          points: weighted("wishlist", 10 + priorityBonus),
          reason: "wishlist",
          value: priority,
        });
      }

      const mainTime = hltb?.main_story ?? hltb?.main_extra ?? null;
      if (weights.hltb > 0) {
        if (mainTime == null) {
          missingSignals.push("hltb");
        } else if (mainTime <= 10) {
          contributions.push({ signal: "hltb", points: weighted("hltb", 16), reason: "short", value: mainTime });
        } else if (mainTime <= 30) {
          contributions.push({ signal: "hltb", points: weighted("hltb", 10), reason: "medium", value: mainTime });
        } else {
          contributions.push({ signal: "hltb", points: weighted("hltb", -2), reason: "long", value: mainTime });
        }
      }

      if (weights.achievements > 0) {
        if (!achievement || achievement.total <= 0) {
          missingSignals.push("achievements");
        } else if (achievement.achieved >= achievement.total) {
          contributions.push({
            signal: "achievements",
            points: weighted("achievements", -18),
            reason: "achievementComplete",
            value: 100,
          });
        } else if (achievement.achieved === 0) {
          contributions.push({
            signal: "achievements",
            points: weighted("achievements", 4),
            reason: "achievementFresh",
            value: 0,
          });
        } else {
          const progress = Math.round((achievement.achieved / achievement.total) * 100);
          const progressBonus = 8 + Math.min(8, (progress / 100) * 8);
          contributions.push({
            signal: "achievements",
            points: weighted("achievements", progressBonus),
            reason: "achievementProgress",
            value: progress,
          });
        }
      }

      if (weights.recency > 0 && game.rtime_last_played > 0 && game.playtime_forever > 0) {
        const daysSincePlay = Math.max(0, (nowSeconds - game.rtime_last_played) / 86_400);
        const base = daysSincePlay <= 14 ? 12 : daysSincePlay <= 60 ? 7 : daysSincePlay <= 180 ? 3 : 0;
        if (base > 0) {
          contributions.push({
            signal: "recency",
            points: weighted("recency", base),
            reason: "recentlyPlayed",
            value: Math.floor(daysSincePlay),
          });
        }
      }

      if (weights.quality > 0) {
        const metacritic = gameDetails?.metacritic_score;
        if (metacritic == null) {
          missingSignals.push("quality");
        } else {
          contributions.push({
            signal: "quality",
            points: weighted("quality", (metacritic - 50) * 0.4),
            reason: "quality",
            value: metacritic,
          });
        }
      }

      if (weights.genre > 0) {
        const affinity = genreAffinity.get(game.appid);
        if (affinity == null || !gameDetails?.genres.length) {
          missingSignals.push("genre");
        } else if (affinity > 0) {
          contributions.push({
            signal: "genre",
            points: weighted("genre", affinity * 15),
            reason: "genreFit",
            value: Math.round(affinity * 100),
          });
        }
      }

      contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || SIGNALS.indexOf(a.signal) - SIGNALS.indexOf(b.signal));
      const score = contributions.reduce((sum, contribution) => sum + contribution.points, 0);
      return {
        game,
        details: gameDetails,
        hltb,
        score: Math.round(score * 100) / 100,
        contributions,
        missingSignals,
        mainTime,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.game.name !== b.game.name) return a.game.name < b.game.name ? -1 : 1;
      return a.game.appid - b.game.appid;
    });
}
