import { create } from "zustand";
import { loadFailedCache, saveFailedCache } from "../lib/tauri";
import { useGameStore } from "./gameStore";

export const MAX_FAIL_RUNS = 2; // ignore a game after this many permanent failures (removed from Steam)

interface FailedGamesState {
  /** appId → number of permanent fetch failures across runs */
  fails: Record<number, number>;

  recordFailure: (appId: number) => void;
  resetFailure: (appId: number) => void;
  resetAll: () => void;
  isIgnored: (appId: number) => boolean;
  ignoredIds: () => number[];

  hydrateCache: () => Promise<void>;
}

function saveAsync(fails: Record<number, number>) {
  saveFailedCache(JSON.stringify(fails)).catch(() => {});
}

export const useFailedGamesStore = create<FailedGamesState>((set, get) => ({
  fails: {},

  recordFailure: (appId) =>
    set((state) => {
      const count = (state.fails[appId] ?? 0) + 1;
      const next = { ...state.fails, [appId]: count };
      saveAsync(next);
      return { fails: next };
    }),

  resetFailure: (appId) =>
    set((state) => {
      const next = { ...state.fails };
      delete next[appId];
      saveAsync(next);
      return { fails: next };
    }),

  resetAll: () => {
    saveAsync({});
    set({ fails: {} });
  },

  isIgnored: (appId) => (get().fails[appId] ?? 0) >= MAX_FAIL_RUNS,

  ignoredIds: () =>
    Object.entries(get().fails)
      .filter(([, count]) => count >= MAX_FAIL_RUNS)
      .map(([id]) => Number(id)),

  hydrateCache: async () => {
    try {
      const raw = await loadFailedCache();
      if (raw) {
        const parsed = JSON.parse(raw) as Record<number, number>;
        set({ fails: parsed });
      }
    } catch {
      // Cache miss or parse error — start fresh
    }
  },
}));

/** Human-readable name for an ignored game, falls back to appId */
export function getIgnoredGameName(appId: number): string {
  const games = useGameStore.getState().games;
  return String(games[appId]?.name ?? `App #${appId}`);
}
