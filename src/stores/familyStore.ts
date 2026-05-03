import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { FamilyLibraryApp, FamilyLibraryResult } from "../lib/tauri";
import type { OwnedGame } from "../lib/types";

const STORAGE_KEY = "steam_family.json";

interface FamilyCache {
  apps: FamilyLibraryApp[];
  authUsed: string | null;
  ownerSteamId: string | null;
  lastFetched: number | null;
}

interface FamilyState {
  apps: Record<number, FamilyLibraryApp>;
  authUsed: string | null;
  ownerSteamId: string | null;
  lastFetched: number | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setResult: (result: FamilyLibraryResult) => void;
  clear: () => void;
  isFamilyShared: (appId: number) => boolean;
  sharedCount: () => number;
  sharedGamesAsOwned: () => OwnedGame[];
}

function toMap(apps: FamilyLibraryApp[]): Record<number, FamilyLibraryApp> {
  const map: Record<number, FamilyLibraryApp> = {};
  for (const app of apps) {
    map[app.appid] = app;
  }
  return map;
}

function toOwnedGame(app: FamilyLibraryApp): OwnedGame {
  return {
    appid: app.appid,
    name: app.name?.trim() || `App ${app.appid}`,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

function persist(cache: FamilyCache) {
  saveAppData(STORAGE_KEY, JSON.stringify(cache)).catch(() => {});
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  apps: {},
  authUsed: null,
  ownerSteamId: null,
  lastFetched: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await loadAppData(STORAGE_KEY);
      if (raw) {
        const parsed: FamilyCache = JSON.parse(raw);
        set({
          apps: toMap(parsed.apps ?? []),
          authUsed: parsed.authUsed ?? null,
          ownerSteamId: parsed.ownerSteamId ?? null,
          lastFetched: parsed.lastFetched ?? null,
          hydrated: true,
        });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },

  setResult: (result) => {
    const lastFetched = Date.now();
    persist({
      apps: result.apps,
      authUsed: result.auth_used,
      ownerSteamId: result.owner_steamid,
      lastFetched,
    });
    set({
      apps: toMap(result.apps),
      authUsed: result.auth_used,
      ownerSteamId: result.owner_steamid,
      lastFetched,
      hydrated: true,
    });
  },

  clear: () => {
    persist({ apps: [], authUsed: null, ownerSteamId: null, lastFetched: null });
    set({ apps: {}, authUsed: null, ownerSteamId: null, lastFetched: null, hydrated: true });
  },

  isFamilyShared: (appId) => {
    const app = get().apps[appId];
    return !!app && app.is_family_shared && app.exclude_reason === 0;
  },

  sharedCount: () =>
    Object.values(get().apps).filter((app) => app.is_family_shared && app.exclude_reason === 0).length,

  sharedGamesAsOwned: () =>
    Object.values(get().apps)
      .filter((app) => app.is_family_shared && app.exclude_reason === 0)
      .map(toOwnedGame),
}));
