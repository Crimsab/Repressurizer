import { create } from "zustand";
import type { HltbData } from "../lib/tauri";
import { loadHltbCache, saveHltbCache } from "../lib/tauri";

interface HltbState {
  data: Record<number, HltbData>;
  setData: (appId: number, hltb: HltbData) => void;
  setBulkData: (hltb: Record<number, HltbData>) => void;
  getData: (appId: number) => HltbData | null;
  hydrateCache: () => Promise<void>;
}

function saveAsync(data: Record<number, HltbData>) {
  saveHltbCache(JSON.stringify(data)).catch(() => {});
}

export const useHltbStore = create<HltbState>((set, get) => ({
  data: {},

  setData: (appId, hltb) =>
    set((state) => {
      const next = { ...state.data, [appId]: hltb };
      saveAsync(next);
      return { data: next };
    }),

  setBulkData: (hltb) =>
    set((state) => {
      const next = { ...state.data, ...hltb };
      saveAsync(next);
      return { data: next };
    }),

  getData: (appId) => get().data[appId] ?? null,

  hydrateCache: async () => {
    try {
      const raw = await loadHltbCache();
      if (raw) {
        const parsed = JSON.parse(raw) as Record<number, HltbData>;
        set({ data: parsed });
      }
    } catch {
      // Cache miss or parse error — start fresh
    }
  },
}));
