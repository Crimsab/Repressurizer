import type { GameDetails } from "./types";

export const DETAILS_CACHE_SCHEMA_VERSION = 2;
export const DEFAULT_DETAILS_CACHE_MAX_AGE_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

function maxAgeMs(maxAgeDays: number): number | null {
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days * MS_PER_DAY;
}

export function isDetailsCacheCurrent(detail: GameDetails | undefined): boolean {
  return !!detail && detail.cache_schema === DETAILS_CACHE_SCHEMA_VERSION;
}

export function detailsCacheNeedsRefresh(
  detail: GameDetails | undefined,
  maxAgeDays = DEFAULT_DETAILS_CACHE_MAX_AGE_DAYS,
  now = Date.now()
): boolean {
  if (!detail || detail.cache_schema !== DETAILS_CACHE_SCHEMA_VERSION) return true;

  const ttlMs = maxAgeMs(maxAgeDays);
  if (ttlMs == null) return false;

  const fetchedAt = Number(detail.fetched_at ?? 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return true;
  return now - fetchedAt > ttlMs;
}
