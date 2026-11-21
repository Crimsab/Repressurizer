import type { GameDetails, GamePriceSnapshot } from "./types";

// Steam returns hundredths of each currency, including JPY. Preserve integer precision.
export const MAX_PLAUSIBLE_STEAM_PRICE_CENTS = Number.MAX_SAFE_INTEGER;

export function isPlausibleSteamPrice(cents: number | null | undefined): cents is number {
  return cents != null
    && Number.isSafeInteger(cents)
    && cents >= 0
    && cents <= MAX_PLAUSIBLE_STEAM_PRICE_CENTS;
}

function normalizeCurrency(currency: string | null | undefined): string {
  return typeof currency === "string" ? currency.trim().toUpperCase() : "";
}

function normalizeCountryCode(countryCode: string | null | undefined): string {
  const value = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(value) ? value : "";
}

function snapshotMatchesRegion(
  snapshot: GamePriceSnapshot,
  currency: string,
  countryCode: string,
): boolean {
  return normalizeCountryCode(snapshot.price_country_code) === countryCode
    && (normalizeCurrency(snapshot.price_currency) === currency
      || (snapshot.is_free && !normalizeCurrency(snapshot.price_currency)));
}

function snapshotMatchesCurrency(snapshot: GamePriceSnapshot, currency: string): boolean {
  return normalizeCurrency(snapshot.price_currency) === currency;
}

/**
 * Keys include the Store country and returned currency. Currency-only keys are
 * retained only as legacy entries and are never used for a country-scoped
 * lookup, preventing US/USD data from being reused for LATAM/MENA USD.
 */
export function priceCacheKey(
  currency: string | null | undefined,
  countryCode?: string | null,
): string {
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedCountry = normalizeCountryCode(countryCode);
  return normalizedCountry ? `${normalizedCountry}:${normalizedCurrency}` : normalizedCurrency;
}

export function sanitizeGameDetailsPrices(details: GameDetails): GameDetails {
  const initial = isPlausibleSteamPrice(details.price_initial) ? details.price_initial : null;
  const final = isPlausibleSteamPrice(details.price_final) ? details.price_final : null;
  if (initial === details.price_initial && final === details.price_final) return details;
  return {
    ...details,
    price_initial: initial,
    price_final: final,
    price_currency: initial == null && final == null ? null : normalizeCurrency(details.price_currency) || null,
  };
}

export function priceSnapshotFromDetails(
  details: GameDetails,
  fetchedAt = Date.now()
): GamePriceSnapshot | null {
  const initial = isPlausibleSteamPrice(details.price_initial) ? details.price_initial : null;
  const final = isPlausibleSteamPrice(details.price_final) ? details.price_final : null;
  const currency = normalizeCurrency(details.price_currency) || null;
  // A non-free Store response with a currency and no amount is an explicit
  // unavailable-price result. Cache it for the selected region instead of
  // repeatedly retrying the same game on every refresh.
  if (!details.is_free && initial == null && final == null && currency == null) return null;
  return {
    price_initial: initial,
    price_final: final,
    price_currency: currency,
    price_country_code: normalizeCountryCode(details.price_country_code) || null,
    is_free: details.is_free,
    fetched_at: fetchedAt,
  };
}

export function sanitizeGamePriceSnapshot(
  snapshot: GamePriceSnapshot,
  fetchedAt = Date.now()
): GamePriceSnapshot | null {
  const initial = isPlausibleSteamPrice(snapshot.price_initial) ? snapshot.price_initial : null;
  const final = isPlausibleSteamPrice(snapshot.price_final) ? snapshot.price_final : null;
  const currency = normalizeCurrency(snapshot.price_currency) || null;
  const countryCode = normalizeCountryCode(snapshot.price_country_code) || null;
  if (!snapshot.is_free && initial == null && final == null && !currency) return null;
  return {
    price_initial: initial,
    price_final: final,
    price_currency: currency,
    price_country_code: countryCode,
    is_free: !!snapshot.is_free,
    fetched_at: snapshot.fetched_at ?? fetchedAt,
  };
}

function mergeCacheRecords(
  ...caches: Array<Record<string, GamePriceSnapshot> | undefined>
): Record<string, GamePriceSnapshot> {
  const merged: Record<string, GamePriceSnapshot> = {};
  for (const cache of caches) {
    if (!cache || typeof cache !== "object") continue;
    for (const [rawKey, rawSnapshot] of Object.entries(cache)) {
      const snapshot = sanitizeGamePriceSnapshot(rawSnapshot);
      if (!snapshot) continue;
      const key = priceCacheKey(snapshot.price_currency, snapshot.price_country_code);
      // Keep old currency-only keys intact as migration candidates. New
      // regional snapshots are always stored under COUNTRY:CURRENCY.
      merged[key || rawKey] = snapshot;
      // Preserve the legacy property shape for existing persisted consumers.
      // Country-aware lookups never read this alias, so it cannot cross a
      // selected-market boundary.
      const legacyKey = priceCacheKey(snapshot.price_currency);
      if (key && legacyKey && !merged[legacyKey]) merged[legacyKey] = snapshot;
    }
  }
  return merged;
}

export function mergeDetailsPriceCache(
  details: GameDetails,
  previous?: GameDetails,
  fetchedAt = Date.now()
): GameDetails {
  const priceCache = mergeCacheRecords(previous?.price_cache, details.price_cache);
  const snapshot = priceSnapshotFromDetails(details, fetchedAt);
  const key = priceCacheKey(snapshot?.price_currency, snapshot?.price_country_code);
  if (snapshot && key) {
    priceCache[key] = snapshot;
    const legacyKey = priceCacheKey(snapshot.price_currency);
    if (legacyKey && !priceCache[legacyKey]) priceCache[legacyKey] = snapshot;
  }
  return {
    ...details,
    price_cache: Object.keys(priceCache).length > 0 ? priceCache : undefined,
  };
}

export function mergePriceSnapshotIntoDetails(
  details: GameDetails,
  snapshot: GamePriceSnapshot,
  fetchedAt = Date.now()
): GameDetails {
  const withExistingCache = mergeDetailsPriceCache(details, undefined, details.fetched_at ?? fetchedAt);
  const cleanSnapshot = sanitizeGamePriceSnapshot(snapshot, fetchedAt);
  if (!cleanSnapshot) return withExistingCache;

  const key = priceCacheKey(cleanSnapshot.price_currency, cleanSnapshot.price_country_code);
  const priceCache: Record<string, GamePriceSnapshot> = {
    ...withExistingCache.price_cache,
  };
  if (key) {
    priceCache[key] = cleanSnapshot;
    const legacyKey = priceCacheKey(cleanSnapshot.price_currency);
    if (legacyKey && !priceCache[legacyKey]) priceCache[legacyKey] = cleanSnapshot;
  }

  return {
    ...withExistingCache,
    price_initial: cleanSnapshot.price_initial,
    price_final: cleanSnapshot.price_final,
    price_currency: cleanSnapshot.price_currency,
    price_country_code: cleanSnapshot.price_country_code ?? null,
    is_free: cleanSnapshot.is_free,
    price_cache: Object.keys(priceCache).length > 0 ? priceCache : undefined,
  };
}

export function priceSnapshotForCurrency(
  details: GameDetails | null | undefined,
  currency: string | null | undefined,
  countryCode?: string | null,
): GamePriceSnapshot | null {
  if (!details) return null;

  const expectedCurrency = normalizeCurrency(currency);
  const expectedCountry = normalizeCountryCode(countryCode);
  if (!expectedCurrency) return details.is_free ? priceSnapshotFromDetails(details, details.fetched_at) : null;

  if (expectedCountry) {
    const exact = details.price_cache?.[priceCacheKey(expectedCurrency, expectedCountry)];
    if (exact && snapshotMatchesRegion(exact, expectedCurrency, expectedCountry)) return exact;
    // Read old currency-only cache entries only when the snapshot itself
    // records the requested country. This allows safe one-time migration and
    // never treats an unknown country as a match.
    const migrated = Object.values(details.price_cache ?? {}).find((snapshot) =>
      snapshotMatchesRegion(snapshot, expectedCurrency, expectedCountry));
    if (migrated) return migrated;

    const direct = priceSnapshotFromDetails(details, details.fetched_at);
    if (direct?.is_free && snapshotMatchesRegion(direct, expectedCurrency, expectedCountry)) return direct;
    if (direct && snapshotMatchesRegion(direct, expectedCurrency, expectedCountry)) return direct;
    return null;
  }

  // Compatibility for callers and profiles created before Store country was
  // added. New country-aware callers always use the branch above.
  const legacy = details.price_cache?.[priceCacheKey(expectedCurrency)];
  if (legacy && snapshotMatchesCurrency(legacy, expectedCurrency)) return legacy;
  const direct = priceSnapshotFromDetails(details, details.fetched_at);
  if (!direct) return null;
  if (direct.is_free) return direct;
  return snapshotMatchesCurrency(direct, expectedCurrency) ? direct : null;
}

export function detailsWithPriceForCurrency(
  details: GameDetails | null | undefined,
  currency: string | null | undefined,
  countryCode?: string | null,
): GameDetails | null {
  if (!details) return null;
  const snapshot = priceSnapshotForCurrency(details, currency, countryCode);
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
  currency: string | null | undefined,
  countryCode?: string | null,
): boolean {
  if (!details) return true;
  if (countryCode && details.price_initial == null && details.price_final == null && !details.price_currency && !details.price_cache) {
    return false;
  }
  if (details.price_initial == null && details.price_final == null && !details.price_currency && !countryCode) return true;
  return !!priceSnapshotForCurrency(details, currency, countryCode);
}

export function detailsPriceNeedsCurrencyRefresh(
  details: GameDetails | null | undefined,
  currency: string | null | undefined,
  countryCode?: string | null,
): boolean {
  return !detailsPriceMatchesCurrency(details, currency, countryCode);
}
