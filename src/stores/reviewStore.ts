import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "repressurizer-game-reviews";

export interface GameReview {
  rating: number; // 1-10
  updatedAt: number; // unix ms
}

function loadReviews(): Record<number, GameReview> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReviews(reviews: Record<number, GameReview>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch {}
  // Also persist to Tauri file cache
  invoke("save_app_data", { key: "reviews.json", data: JSON.stringify(reviews) }).catch(() => {});
}

interface ReviewState {
  reviews: Record<number, GameReview>;
  setRating: (appId: number, rating: number) => void;
  clearRating: (appId: number) => void;
  getRating: (appId: number) => number;
  hydrate: () => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  reviews: loadReviews(),

  setRating: (appId, rating) =>
    set((state) => {
      const next = {
        ...state.reviews,
        [appId]: { rating: Math.max(1, Math.min(10, rating)), updatedAt: Date.now() },
      };
      saveReviews(next);
      return { reviews: next };
    }),

  clearRating: (appId) =>
    set((state) => {
      const next = { ...state.reviews };
      delete next[appId];
      saveReviews(next);
      return { reviews: next };
    }),

  getRating: (appId) => get().reviews[appId]?.rating ?? 0,

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "reviews.json" });
      if (raw) {
        const parsed: Record<number, GameReview> = JSON.parse(raw);
        // Merge: Tauri cache wins if it has more entries
        const local = get().reviews;
        const merged = { ...local, ...parsed };
        set({ reviews: merged });
        // Sync back to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {
      // Tauri not available (browser dev) or cache miss
    }
  },
}));
