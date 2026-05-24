import { create } from "zustand";
import { fetchSteamAppList, loadAppData, saveAppData } from "../lib/tauri";
import {
  buildSteamAppIndex,
  EMPTY_STEAM_APP_INDEX,
  isSteamAppIndexStale,
  parseSteamAppIndex,
  type SteamAppIndexData,
} from "../lib/steamAppIndex";

const STEAM_APP_INDEX_KEY = "steam_apps_index.json";

interface SteamAppIndexState {
  data: SteamAppIndexData;
  hydrated: boolean;
  refreshing: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: (apiKey: string) => Promise<SteamAppIndexData>;
  ensureFresh: (apiKey: string) => Promise<void>;
  resolveName: (appid: number) => string | null;
}

export const useSteamAppIndexStore = create<SteamAppIndexState>((set, get) => ({
  data: structuredClone(EMPTY_STEAM_APP_INDEX),
  hydrated: false,
  refreshing: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const raw = await loadAppData(STEAM_APP_INDEX_KEY).catch(() => null);
    set({ data: parseSteamAppIndex(raw), hydrated: true });
  },

  refresh: async (apiKey) => {
    if (get().refreshing) return get().data;
    set({ refreshing: true, error: null });
    try {
      const list = await fetchSteamAppList(apiKey);
      const data = buildSteamAppIndex(list);
      set({ data, hydrated: true, refreshing: false });
      saveAppData(STEAM_APP_INDEX_KEY, JSON.stringify(data)).catch(() => {});
      return data;
    } catch (e) {
      const error = String(e);
      set({ error, refreshing: false, hydrated: true });
      throw e;
    }
  },

  ensureFresh: async (apiKey) => {
    await get().hydrate();
    if (!isSteamAppIndexStale(get().data) || get().refreshing) return;
    await get().refresh(apiKey);
  },

  resolveName: (appid) => get().data.apps[appid]?.name?.trim() || null,
}));
