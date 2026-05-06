import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "./gameStore";

const STORAGE_KEY = "repressurizer-hltb-ignored";

function loadIgnored(): Record<number, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveIgnored(fails: Record<number, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fails));
  } catch {}
  invoke("save_app_data", { key: "hltb_ignored.json", data: JSON.stringify(fails) }).catch(() => {});
}

/** After this many confirmed "not found" results, auto-ignore the game */
export const HLTB_MAX_FAILS = 3;

interface HltbIgnoredState {
  fails: Record<number, number>;
  recordNotFound: (appId: number) => void;
  resetGame: (appId: number) => void;
  resetAll: () => void;
  isIgnored: (appId: number) => boolean;
  ignoredIds: () => number[];
  hydrate: () => Promise<void>;
}

export const useHltbIgnoredStore = create<HltbIgnoredState>((set, get) => ({
  fails: loadIgnored(),

  recordNotFound: (appId) =>
    set((state) => {
      const count = (state.fails[appId] ?? 0) + 1;
      const next = { ...state.fails, [appId]: count };
      saveIgnored(next);
      return { fails: next };
    }),

  resetGame: (appId) =>
    set((state) => {
      const next = { ...state.fails };
      delete next[appId];
      saveIgnored(next);
      return { fails: next };
    }),

  resetAll: () => {
    saveIgnored({});
    set({ fails: {} });
  },

  isIgnored: (appId) => (get().fails[appId] ?? 0) >= HLTB_MAX_FAILS,

  ignoredIds: () =>
    Object.entries(get().fails)
      .filter(([, count]) => count >= HLTB_MAX_FAILS)
      .map(([id]) => Number(id)),

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "hltb_ignored.json" });
      if (raw) {
        const parsed: Record<number, number> = JSON.parse(raw);
        const local = get().fails;
        const merged = { ...local, ...parsed };
        set({ fails: merged });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {}
  },
}));

/** Human-readable name for an ignored game, falls back to appId */
export function getHltbIgnoredGameName(appId: number): string {
  const games = useGameStore.getState().games;
  return String(games[appId]?.name ?? `App #${appId}`);
}
