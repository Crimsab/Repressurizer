import type { GameDetails } from "./types";

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
