import type { GameDetails } from "./types";

export const STORE_RELEASE_DATE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function cleanDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function bestAvailableReleaseDate(details: GameDetails | null | undefined): string | null {
  return cleanDate(details?.store_release_date) ?? cleanDate(details?.release_date);
}

export function yearCategorizationReleaseDate(details: GameDetails | null | undefined): string | null {
  const storeDate = cleanDate(details?.store_release_date);
  if (storeDate) return storeDate;

  // API release dates can be Steam release dates rather than original/store dates.
  // Only fall back to them after the Store page has been checked and had no date.
  if (details?.store_release_date_fetched_at) {
    return cleanDate(details.release_date);
  }

  return null;
}

export function storeReleaseDateNeedsRefresh(
  details: GameDetails | null | undefined,
  now = Date.now()
): boolean {
  if (!details) return false;
  if (cleanDate(details.store_release_date)) return false;

  const fetchedAt = Number(details.store_release_date_fetched_at ?? 0);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return true;
  return now - fetchedAt > STORE_RELEASE_DATE_TTL_MS;
}
