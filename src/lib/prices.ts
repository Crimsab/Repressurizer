import type { GameDetails, GamePriceSnapshot } from "./types";

// Steam Store prices are stored in minor units (cents for EUR/USD).
// Values above this are almost always bad regional/store data and would poison
// aggregate stats like library value or the shame wall.
export const MAX_PLAUSIBLE_STEAM_PRICE_CENTS = 500_000;

export function isPlausibleSteamPrice(cents: number | null | undefined): cents is number {
  return cents != null && Number.isFinite(cents) && cents >= 0 && cents <= MAX_PLAUSIBLE_STEAM_PRICE_CENTS;
}

export function sanitizeGameDetailsPrices(details: GameDetails): GameDetails {
  const initial = isPlausibleSteamPrice(details.price_initial) ? details.price_initial : null;
  const final = isPlausibleSteamPrice(details.price_final) ? details.price_final : null;
  if (initial === details.price_initial && final === details.price_final) return details;
  return {
    ...details,
    price_initial: initial,
    price_final: final,
    price_currency: initial == null && final == null ? null : details.price_currency,
  };
}

export function priceCacheKey(currency: string | null | undefined): string {
  return String(currency ?? "").trim().toUpperCase();
}

export function priceSnapshotFromDetails(
  details: GameDetails,
  fetchedAt = Date.now()
): GamePriceSnapshot | null {
  const initial = isPlausibleSteamPrice(details.price_initial) ? details.price_initial : null;
  const final = isPlausibleSteamPrice(details.price_final) ? details.price_final : null;
  if (!details.is_free && initial == null && final == null) return null;
  return {
    price_initial: initial,
    price_final: final,
    price_currency: details.price_currency,
    price_country_code: details.price_country_code ?? null,
    is_free: details.is_free,
    fetched_at: fetchedAt,
  };
}

export function mergeDetailsPriceCache(
  details: GameDetails,
  previous?: GameDetails,
  fetchedAt = Date.now()
): GameDetails {
  const priceCache: Record<string, GamePriceSnapshot> = {
    ...(previous?.price_cache ?? {}),
    ...(details.price_cache ?? {}),
  };
  const snapshot = priceSnapshotFromDetails(details, fetchedAt);
  const key = priceCacheKey(snapshot?.price_currency);
  if (snapshot && key) priceCache[key] = snapshot;
  return {
    ...details,
    price_cache: Object.keys(priceCache).length > 0 ? priceCache : undefined,
  };
}

export function priceSnapshotForCurrency(
  details: GameDetails | null | undefined,
  currency: string | null | undefined
): GamePriceSnapshot | null {
  if (!details) return null;

  const expected = priceCacheKey(currency);
  if (expected && details.price_cache?.[expected]) {
    return details.price_cache[expected];
  }

  const direct = priceSnapshotFromDetails(details, details.fetched_at);
  if (!direct) return null;
  if (direct.is_free) return direct;

  const actual = priceCacheKey(direct.price_currency);
  if (!expected || !actual || actual === expected) return direct;
  return null;
}

export function detailsWithPriceForCurrency(
  details: GameDetails | null | undefined,
  currency: string | null | undefined
): GameDetails | null {
  if (!details) return null;
  const snapshot = priceSnapshotForCurrency(details, currency);
  if (!snapshot) return null;
  return {
    ...details,
    price_initial: snapshot.price_initial,
    price_final: snapshot.price_final,
    price_currency: snapshot.price_currency,
    price_country_code: snapshot.price_country_code ?? null,
    is_free: snapshot.is_free,
  };
}

export function detailsPriceMatchesCurrency(
  details: GameDetails | null | undefined,
  currency: string | null | undefined
): boolean {
  if (!details || details.is_free) return true;
  if (details.price_initial == null && details.price_final == null) return true;
  return !!priceSnapshotForCurrency(details, currency);
}

export function detailsPriceNeedsCurrencyRefresh(
  details: GameDetails | null | undefined,
  currency: string | null | undefined
): boolean {
  return !detailsPriceMatchesCurrency(details, currency);
}
