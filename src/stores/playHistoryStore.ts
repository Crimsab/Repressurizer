import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { OwnedGame } from "../lib/types";
import {
  EMPTY_PLAY_HISTORY,
  parsePlayHistory,
  recordPlaytimeObservation,
  type PlayHistoryData,
} from "../lib/playHistory";

const PLAY_HISTORY_KEY = "play_history.json";

interface PlayHistoryState {
  data: PlayHistoryData;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  observeLibrary: (games: OwnedGame[]) => Promise<void>;
}

export const usePlayHistoryStore = create<PlayHistoryState>((set, get) => ({
  data: structuredClone(EMPTY_PLAY_HISTORY),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const raw = await loadAppData(PLAY_HISTORY_KEY).catch(() => null);
    set({ data: parsePlayHistory(raw), hydrated: true });
  },

  observeLibrary: async (games) => {
    if (!get().hydrated) {
      await get().hydrate();
    }
    const previous = get().data;
    const next = recordPlaytimeObservation(previous, games);
    if (next === previous) return;
    set({ data: next, hydrated: true });
    saveAppData(PLAY_HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  },
}));
