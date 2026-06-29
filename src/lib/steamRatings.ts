import type { SteamRatingConfig, SteamRatingRule, CategorizeResult } from "./tauri";
import type { OwnedGame, SteamReviewSummary } from "./types";

export const STEAM_RATING_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const STEAM_RATING_RULES: SteamRatingRule[] = [
  { name: "Overwhelmingly Positive", min_score: 95, max_score: 100, min_reviews: 500, max_reviews: 0 },
  { name: "Very Positive", min_score: 80, max_score: 100, min_reviews: 50, max_reviews: 0 },
  { name: "Positive", min_score: 80, max_score: 100, min_reviews: 1, max_reviews: 0 },
  { name: "Mostly Positive", min_score: 70, max_score: 79, min_reviews: 1, max_reviews: 0 },
  { name: "Mixed", min_score: 40, max_score: 69, min_reviews: 1, max_reviews: 0 },
  { name: "Mostly Negative", min_score: 20, max_score: 39, min_reviews: 1, max_reviews: 0 },
  { name: "Overwhelmingly Negative", min_score: 0, max_score: 19, min_reviews: 500, max_reviews: 0 },
  { name: "Very Negative", min_score: 0, max_score: 19, min_reviews: 50, max_reviews: 0 },
  { name: "Negative", min_score: 0, max_score: 19, min_reviews: 1, max_reviews: 0 },
];

export function expectedSteamRatingCategoryNames(config: SteamRatingConfig = {}): string[] {
  return steamRatingRulesForConfig(config).map((rule) => prefixedName(config.prefix, rule.name));
}

export function steamRatingRulesForConfig(config: SteamRatingConfig = {}): SteamRatingRule[] {
  const source = config.rules?.length ? config.rules : STEAM_RATING_RULES;
  return source
    .map(normalizeSteamRatingRule)
    .filter((rule) => rule.name.length > 0);
}

export function defaultSteamRatingRules(): SteamRatingRule[] {
  return STEAM_RATING_RULES.map((rule) => ({ ...rule }));
}

function normalizeSteamRatingRule(rule: SteamRatingRule): SteamRatingRule {
  return {
    name: String(rule.name ?? "").trim(),
    min_score: clampInt(rule.min_score, 0, 100),
    max_score: clampInt(rule.max_score, 0, 100),
    min_reviews: Math.max(0, Math.floor(Number(rule.min_reviews) || 0)),
    max_reviews: Math.max(0, Math.floor(Number(rule.max_reviews) || 0)),
  };
}

export function isSteamRatingFresh(
  rating: SteamReviewSummary | undefined,
  now = Date.now()
): rating is SteamReviewSummary {
  return !!rating && now - rating.fetched_at < STEAM_RATING_CACHE_TTL_MS;
}

export function steamRatingIdsNeedingFetch(
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>,
  now = Date.now()
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => !isSteamRatingFresh(ratings[id], now));
}

export function isSteamReviewRateLimitedError(error: unknown): boolean {
  const message = String(error);
  return (
    /\bHTTP\s+(403|429)\b/i.test(message) ||
    /\b(rate[- ]?limit(?:ed)?|too many requests)\b/i.test(message)
  );
}

export function categorizeBySteamRating(
  games: OwnedGame[],
  ratings: Record<number, SteamReviewSummary>,
  config: SteamRatingConfig = {}
): CategorizeResult {
  const assignments: Record<string, number[]> = {};
  let gamesCategorized = 0;

  for (const game of games) {
    const rating = ratings[game.appid];
    if (!rating || rating.total_reviews <= 0) continue;

    const score = scoreForRating(rating, config.use_wilson_score ?? false);
    if (score == null) continue;

    const rule = steamRatingRulesForConfig(config).find((item) => {
      const inScore = score >= item.min_score && score <= item.max_score;
      const enoughReviews = rating.total_reviews >= item.min_reviews;
      const belowMax = item.max_reviews === 0 || rating.total_reviews <= item.max_reviews;
      return inScore && enoughReviews && belowMax;
    });
    if (!rule) continue;

    const category = prefixedName(config.prefix, rule.name);
    if (!assignments[category]) assignments[category] = [];
    assignments[category].push(game.appid);
    gamesCategorized += 1;
  }

  return {
    assignments,
    games_processed: games.length,
    games_categorized: gamesCategorized,
  };
}

export function scoreForRating(
  rating: SteamReviewSummary,
  useWilsonScore: boolean
): number | null {
  if (rating.total_reviews <= 0) return null;
  if (!useWilsonScore) {
    return rating.positive_percentage ?? Math.round((rating.total_positive / rating.total_reviews) * 100);
  }
  return wilsonLowerBoundPercentage(rating.total_positive, rating.total_reviews);
}

export function wilsonLowerBoundPercentage(positive: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = positive / total;
  const n = total;
  const lower =
    (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n);
  return Math.round(Math.max(0, Math.min(1, lower)) * 100);
}

function prefixedName(prefix: string | undefined, name: string): string {
  return `${prefix ?? ""}${name}`.trim();
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}
