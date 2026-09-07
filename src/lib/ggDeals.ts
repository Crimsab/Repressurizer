import type { GgDealsPrice } from "./types";
import {
  isSupportedStoreCountryCode,
  storeCountryCodeForCurrency,
} from "./steamRegions";

export const GG_DEALS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const GG_DEALS_REQUEST_INTERVAL_MS = 2_000;

const GG_DEALS_REGION_BY_CURRENCY: Record<string, string> = {
  EUR: "it",
  USD: "us",
  GBP: "gb",
  CAD: "ca",
  AUD: "au",
  CHF: "ch",
  BRL: "br",
  PLN: "pl",
  RUB: "ru",
};

// GG.deals has its own region catalog and does not cover every Steam Store
// country (for example, JPY is not available in the old currency mapping).
// Keep this allowlist conservative until GG.deals exposes a machine-readable
// catalog; unsupported markets are surfaced instead of silently using US.
export const GG_DEALS_SUPPORTED_REGIONS = new Set(Object.values(GG_DEALS_REGION_BY_CURRENCY));

export interface GgDealsCacheRecord {
  data: GgDealsPrice | null;
  fetchedAt: number;
}

export function isFreshGgDealsRecord(
  record: GgDealsCacheRecord | undefined,
  now = Date.now()
): boolean {
  return !!record && now - record.fetchedAt >= 0 && now - record.fetchedAt < GG_DEALS_CACHE_TTL_MS;
}

export function ggDealsRegionForCurrency(currency: string): string {
  return GG_DEALS_REGION_BY_CURRENCY[currency.trim().toUpperCase()] ?? "us";
}

/**
 * Resolve GG.deals to the same Store market selected by the user. Returning
 * null for an unknown country is intentional: callers must surface the
 * unsupported region instead of silently comparing against US prices.
 */
export function ggDealsRegionForCountry(countryCode: string | null | undefined): string | null {
  const normalized = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  const region = normalized.toLowerCase();
  return isSupportedStoreCountryCode(normalized) && GG_DEALS_SUPPORTED_REGIONS.has(region) ? region : null;
}

/** Legacy helper for profile data that only has a currency. */
export function ggDealsRegionForLegacyCurrency(currency: string | null | undefined): string | null {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const region = GG_DEALS_REGION_BY_CURRENCY[normalized];
  if (!region) return null;
  const country = storeCountryCodeForCurrency(normalized);
  return isSupportedStoreCountryCode(country) && GG_DEALS_SUPPORTED_REGIONS.has(region) ? region : null;
}

export function bestCurrentGgDealsPrice(data: GgDealsPrice): {
  price: number;
  source: "retail" | "keyshop";
} | null {
  const candidates = [
    data.currentRetail == null ? null : { price: data.currentRetail, source: "retail" as const },
    data.currentKeyshops == null ? null : { price: data.currentKeyshops, source: "keyshop" as const },
  ].filter((entry): entry is { price: number; source: "retail" | "keyshop" } =>
    entry != null && Number.isFinite(entry.price) && entry.price >= 0
  );
  return candidates.sort((left, right) => left.price - right.price)[0] ?? null;
}

export function formatGgDealsPrice(price: number, currency: string): string {
  const amount = price.toFixed(2);
  if (["$", "£", "¥", "C$", "A$", "R$"].includes(currency)) return `${currency}${amount}`;
  return `${amount}${currency}`;
}

export function safeGgDealsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "gg.deals" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
