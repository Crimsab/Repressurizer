import type { SteamReviewTone } from "./steamRatings";

export const STEAM_REVIEW_TONE_CLASS: Record<SteamReviewTone, string> = {
  positive: "text-sky-300",
  mixed: "text-amber-300",
  negative: "text-rose-300",
};

export const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
export const fullNumber = new Intl.NumberFormat();
