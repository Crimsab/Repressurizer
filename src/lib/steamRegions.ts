/**
 * Steam Store markets that can be selected for regional pricing.
 *
 * Steam's Store API takes a country code, not a currency.  A currency-only
 * preference therefore cannot represent USD regions such as LATAM or MENA.
 * Keep the country as the source of truth and derive the returned currency
 * from this table.
 */

export interface SteamStoreRegion {
  countryCode: string;
  currency: string;
  name: string;
  group?: "local" | "usd_cis" | "usd_latam" | "usd_mena" | "usd_sasia";
}

/**
 * Country codes documented by Valve for Steam's live currencies and USD
 * regional groups.  The list intentionally uses ISO 3166-1 alpha-2 codes;
 * the Store API accepts these values through its `cc` query parameter.
 */
export const STORE_REGIONS: readonly SteamStoreRegion[] = [
  { countryCode: "AE", currency: "AED", name: "United Arab Emirates" },
  { countryCode: "AM", currency: "USD", name: "Armenia (USD CIS)", group: "usd_cis" },
  { countryCode: "AR", currency: "USD", name: "Argentina (USD LATAM)", group: "usd_latam" },
  { countryCode: "AT", currency: "EUR", name: "Austria" },
  { countryCode: "AU", currency: "AUD", name: "Australia" },
  { countryCode: "AZ", currency: "USD", name: "Azerbaijan (USD CIS)", group: "usd_cis" },
  { countryCode: "BE", currency: "EUR", name: "Belgium" },
  { countryCode: "BD", currency: "USD", name: "Bangladesh (USD South Asia)", group: "usd_sasia" },
  { countryCode: "BG", currency: "EUR", name: "Bulgaria" },
  { countryCode: "BH", currency: "USD", name: "Bahrain (USD MENA)", group: "usd_mena" },
  { countryCode: "BO", currency: "USD", name: "Bolivia (USD LATAM)", group: "usd_latam" },
  { countryCode: "BR", currency: "BRL", name: "Brazil" },
  { countryCode: "BT", currency: "USD", name: "Bhutan (USD South Asia)", group: "usd_sasia" },
  { countryCode: "BY", currency: "USD", name: "Belarus (USD CIS)", group: "usd_cis" },
  { countryCode: "BZ", currency: "USD", name: "Belize (USD LATAM)", group: "usd_latam" },
  { countryCode: "CA", currency: "CAD", name: "Canada" },
  { countryCode: "CH", currency: "CHF", name: "Switzerland" },
  { countryCode: "CL", currency: "CLP", name: "Chile" },
  { countryCode: "CN", currency: "CNY", name: "China" },
  { countryCode: "CO", currency: "COP", name: "Colombia" },
  { countryCode: "CR", currency: "CRC", name: "Costa Rica" },
  { countryCode: "CY", currency: "EUR", name: "Cyprus" },
  { countryCode: "CZ", currency: "EUR", name: "Czechia" },
  { countryCode: "DE", currency: "EUR", name: "Germany" },
  { countryCode: "DK", currency: "EUR", name: "Denmark" },
  { countryCode: "DZ", currency: "USD", name: "Algeria (USD MENA)", group: "usd_mena" },
  { countryCode: "EC", currency: "USD", name: "Ecuador (USD LATAM)", group: "usd_latam" },
  { countryCode: "EE", currency: "EUR", name: "Estonia" },
  { countryCode: "EG", currency: "USD", name: "Egypt (USD MENA)", group: "usd_mena" },
  { countryCode: "ES", currency: "EUR", name: "Spain" },
  { countryCode: "FI", currency: "EUR", name: "Finland" },
  { countryCode: "FR", currency: "EUR", name: "France" },
  { countryCode: "GB", currency: "GBP", name: "United Kingdom" },
  { countryCode: "GE", currency: "USD", name: "Georgia (USD CIS)", group: "usd_cis" },
  { countryCode: "GR", currency: "EUR", name: "Greece" },
  { countryCode: "GY", currency: "USD", name: "Guyana (USD LATAM)", group: "usd_latam" },
  { countryCode: "GT", currency: "USD", name: "Guatemala (USD LATAM)", group: "usd_latam" },
  { countryCode: "HK", currency: "HKD", name: "Hong Kong" },
  { countryCode: "HN", currency: "USD", name: "Honduras (USD LATAM)", group: "usd_latam" },
  { countryCode: "HR", currency: "EUR", name: "Croatia" },
  { countryCode: "HU", currency: "EUR", name: "Hungary" },
  { countryCode: "ID", currency: "IDR", name: "Indonesia" },
  { countryCode: "IE", currency: "EUR", name: "Ireland" },
  { countryCode: "IL", currency: "ILS", name: "Israel" },
  { countryCode: "IN", currency: "INR", name: "India" },
  { countryCode: "IQ", currency: "USD", name: "Iraq (USD MENA)", group: "usd_mena" },
  { countryCode: "IS", currency: "EUR", name: "Iceland" },
  { countryCode: "IT", currency: "EUR", name: "Italy" },
  { countryCode: "JO", currency: "USD", name: "Jordan (USD MENA)", group: "usd_mena" },
  { countryCode: "JP", currency: "JPY", name: "Japan" },
  { countryCode: "KG", currency: "USD", name: "Kyrgyzstan (USD CIS)", group: "usd_cis" },
  { countryCode: "KR", currency: "KRW", name: "South Korea" },
  { countryCode: "KW", currency: "KWD", name: "Kuwait" },
  { countryCode: "KZ", currency: "KZT", name: "Kazakhstan" },
  { countryCode: "LB", currency: "USD", name: "Lebanon (USD MENA)", group: "usd_mena" },
  { countryCode: "LT", currency: "EUR", name: "Lithuania" },
  { countryCode: "LU", currency: "EUR", name: "Luxembourg" },
  { countryCode: "LV", currency: "EUR", name: "Latvia" },
  { countryCode: "LY", currency: "USD", name: "Libya (USD MENA)", group: "usd_mena" },
  { countryCode: "MA", currency: "USD", name: "Morocco (USD MENA)", group: "usd_mena" },
  { countryCode: "MD", currency: "USD", name: "Moldova (USD CIS)", group: "usd_cis" },
  { countryCode: "ME", currency: "EUR", name: "Montenegro" },
  { countryCode: "MK", currency: "EUR", name: "North Macedonia" },
  { countryCode: "MN", currency: "USD", name: "Mongolia" },
  { countryCode: "MT", currency: "EUR", name: "Malta" },
  { countryCode: "MX", currency: "MXN", name: "Mexico" },
  { countryCode: "MY", currency: "MYR", name: "Malaysia" },
  { countryCode: "NI", currency: "USD", name: "Nicaragua (USD LATAM)", group: "usd_latam" },
  { countryCode: "NL", currency: "EUR", name: "Netherlands" },
  { countryCode: "NO", currency: "NOK", name: "Norway" },
  { countryCode: "NP", currency: "USD", name: "Nepal (USD South Asia)", group: "usd_sasia" },
  { countryCode: "NZ", currency: "NZD", name: "New Zealand" },
  { countryCode: "OM", currency: "USD", name: "Oman (USD MENA)", group: "usd_mena" },
  { countryCode: "PS", currency: "USD", name: "Palestine (USD MENA)", group: "usd_mena" },
  { countryCode: "PA", currency: "USD", name: "Panama (USD LATAM)", group: "usd_latam" },
  { countryCode: "PE", currency: "PEN", name: "Peru" },
  { countryCode: "PH", currency: "PHP", name: "Philippines" },
  { countryCode: "PK", currency: "USD", name: "Pakistan (USD South Asia)", group: "usd_sasia" },
  { countryCode: "PL", currency: "PLN", name: "Poland" },
  { countryCode: "PT", currency: "EUR", name: "Portugal" },
  { countryCode: "PY", currency: "USD", name: "Paraguay (USD LATAM)", group: "usd_latam" },
  { countryCode: "QA", currency: "QAR", name: "Qatar" },
  { countryCode: "RO", currency: "EUR", name: "Romania" },
  { countryCode: "RU", currency: "RUB", name: "Russia" },
  { countryCode: "SA", currency: "SAR", name: "Saudi Arabia" },
  { countryCode: "SD", currency: "USD", name: "Sudan (USD MENA)", group: "usd_mena" },
  { countryCode: "SE", currency: "EUR", name: "Sweden" },
  { countryCode: "SG", currency: "SGD", name: "Singapore" },
  { countryCode: "SI", currency: "EUR", name: "Slovenia" },
  { countryCode: "LK", currency: "USD", name: "Sri Lanka (USD South Asia)", group: "usd_sasia" },
  { countryCode: "SV", currency: "USD", name: "El Salvador (USD LATAM)", group: "usd_latam" },
  { countryCode: "SK", currency: "EUR", name: "Slovakia" },
  { countryCode: "SR", currency: "USD", name: "Suriname (USD LATAM)", group: "usd_latam" },
  { countryCode: "TH", currency: "THB", name: "Thailand" },
  { countryCode: "TJ", currency: "USD", name: "Tajikistan (USD CIS)", group: "usd_cis" },
  { countryCode: "TM", currency: "USD", name: "Turkmenistan (USD CIS)", group: "usd_cis" },
  { countryCode: "TN", currency: "USD", name: "Tunisia (USD MENA)", group: "usd_mena" },
  { countryCode: "TR", currency: "USD", name: "Türkiye (USD MENA)", group: "usd_mena" },
  { countryCode: "TW", currency: "TWD", name: "Taiwan" },
  { countryCode: "UA", currency: "UAH", name: "Ukraine" },
  { countryCode: "US", currency: "USD", name: "United States" },
  { countryCode: "UY", currency: "UYU", name: "Uruguay" },
  { countryCode: "UZ", currency: "USD", name: "Uzbekistan (USD CIS)", group: "usd_cis" },
  { countryCode: "VE", currency: "USD", name: "Venezuela (USD LATAM)", group: "usd_latam" },
  { countryCode: "VN", currency: "VND", name: "Vietnam" },
  { countryCode: "YE", currency: "USD", name: "Yemen (USD MENA)", group: "usd_mena" },
  { countryCode: "ZA", currency: "ZAR", name: "South Africa" },
] as const;

export const DEFAULT_STORE_COUNTRY_CODE = "IT";

const REGION_BY_COUNTRY = new Map(STORE_REGIONS.map((region) => [region.countryCode, region]));

// Existing releases stored only a currency.  Keep deterministic, familiar
// countries for that legacy representation while new settings store a country.
const LEGACY_COUNTRY_BY_CURRENCY: Record<string, string> = {
  AED: "AE", AUD: "AU", BRL: "BR", CAD: "CA", CHF: "CH", CLP: "CL", CNY: "CN",
  COP: "CO", CRC: "CR", EUR: "IT", GBP: "GB", HKD: "HK", IDR: "ID", ILS: "IL",
  INR: "IN", JPY: "JP", KRW: "KR", KWD: "KW", KZT: "KZ", MXN: "MX", MYR: "MY",
  NOK: "NO", NZD: "NZ", PEN: "PE", PHP: "PH", PLN: "PL", QAR: "QA", RUB: "RU",
  SAR: "SA", SGD: "SG", THB: "TH", TWD: "TW", UAH: "UA", USD: "US", UYU: "UY",
  VND: "VN", ZAR: "ZA",
};

export function normalizeStoreCountryCode(value: unknown, legacyCurrency?: unknown): string {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (REGION_BY_COUNTRY.has(candidate)) return candidate;
  const currency = typeof legacyCurrency === "string" ? legacyCurrency.trim().toUpperCase() : "";
  return LEGACY_COUNTRY_BY_CURRENCY[currency] ?? DEFAULT_STORE_COUNTRY_CODE;
}

export function storeRegionForCountry(countryCode: unknown): SteamStoreRegion | null {
  const normalized = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  return REGION_BY_COUNTRY.get(normalized) ?? null;
}

export function isSupportedStoreCountryCode(countryCode: unknown): boolean {
  return storeRegionForCountry(countryCode) !== null;
}

export function currencyForStoreCountry(countryCode: unknown): string {
  return storeRegionForCountry(countryCode)?.currency ?? currencyForStoreCountry(DEFAULT_STORE_COUNTRY_CODE);
}

export function storeCountryCodeForCurrency(currency: unknown): string {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return LEGACY_COUNTRY_BY_CURRENCY[normalized] ?? DEFAULT_STORE_COUNTRY_CODE;
}

export function storeRegionsForCurrency(currency: unknown): readonly SteamStoreRegion[] {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return STORE_REGIONS.filter((region) => region.currency === normalized);
}
