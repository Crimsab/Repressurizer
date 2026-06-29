import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { SteamReviewSummary } from "../lib/types";

const STORAGE_KEY = "steam_ratings_cache.json";

interface SteamRatingsState {
  ratings: Record<number, SteamReviewSummary>;
  hydrated: boolean;
  hydrating: boolean;
  setRating: (appId: number, rating: SteamReviewSummary) => void;
  setBulkRatings: (ratings: SteamReviewSummary[]) => void;
  getRating: (appId: number) => SteamReviewSummary | null;
  hydrateCache: () => Promise<void>;
}

function saveAsync(ratings: Record<number, SteamReviewSummary>) {
  saveAppData(STORAGE_KEY, JSON.stringify(ratings)).catch(() => {});
}

let hydratePromise: Promise<void> | null = null;

function cleanRatings(raw: Record<string, SteamReviewSummary>): Record<number, SteamReviewSummary> {
  const next: Record<number, SteamReviewSummary> = {};
  for (const [key, rating] of Object.entries(raw)) {
    const appId = Number(key);
    const resolvedAppId = Number.isFinite(rating.app_id) ? rating.app_id : appId;
    if (!Number.isFinite(resolvedAppId)) continue;
    next[resolvedAppId] = {
      ...rating,
      app_id: resolvedAppId,
      review_score: Number(rating.review_score) || 0,
      review_score_desc: rating.review_score_desc ?? "",
      total_positive: Number(rating.total_positive) || 0,
      total_negative: Number(rating.total_negative) || 0,
      total_reviews: Number(rating.total_reviews) || 0,
      positive_percentage:
        rating.positive_percentage == null ? null : Number(rating.positive_percentage),
      fetched_at: Number(rating.fetched_at) || 0,
    };
  }
  return next;
}

export const useSteamRatingsStore = create<SteamRatingsState>((set, get) => ({
  ratings: {},
  hydrated: false,
  hydrating: false,

  setRating: (appId, rating) =>
    set((state) => {
      const next = { ...state.ratings, [appId]: rating };
      saveAsync(next);
      return { ratings: next };
    }),

  setBulkRatings: (ratings) =>
    set((state) => {
      const next = { ...state.ratings };
      for (const rating of ratings) next[rating.app_id] = rating;
      saveAsync(next);
      return { ratings: next };
    }),

  getRating: (appId) => get().ratings[appId] ?? null,

  hydrateCache: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    set({ hydrating: true });
    hydratePromise = (async () => {
      try {
        const raw = await loadAppData(STORAGE_KEY);
        set({
          ratings: raw ? cleanRatings(JSON.parse(raw)) : {},
          hydrated: true,
          hydrating: false,
        });
      } catch {
        // Cache miss or parse error: start fresh.
        set({ ratings: {}, hydrated: true, hydrating: false });
      } finally {
        hydratePromise = null;
      }
    })();
    return hydratePromise;
  },
}));
