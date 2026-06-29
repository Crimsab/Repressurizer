import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { OwnedGame, GameDetails } from "../lib/types";
import type { GameStatus } from "./statusStore";
import { displayNameFromDetails, isPlaceholderGameName } from "../lib/libraryMerge";
import { useSteamAppIndexStore } from "./steamAppIndexStore";
import { sanitizeGameDetailsPrices } from "../lib/prices";

function persistDetailsCache(details: Record<number, GameDetails>) {
  invoke("save_details_cache", { data: JSON.stringify(details) }).catch(() => {});
}

export interface FilterState {
  minHours: number | null;
  maxHours: number | null;
  statuses: GameStatus[]; // empty = all statuses
  onlyUnplayed: boolean;
  tagFilter: string[];    // empty = all tags
  minHltbHours: number | null;
  maxHltbHours: number | null;
  minReleaseYear: number | null;
  maxReleaseYear: number | null;
  platforms: Array<"windows" | "mac" | "linux">;
  minMetacritic: number | null;
  maxMetacritic: number | null;
  minAchievementPct: number | null;
  maxAchievementPct: number | null;
  onlyFamilyShared: boolean;
  onlyPossibleDuplicates: boolean;
  onlyMissingDetails: boolean;
  onlyDelisted: boolean;
  onlyCollectionOnly: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  minHours: null,
  maxHours: null,
  statuses: [],
  onlyUnplayed: false,
  tagFilter: [],
  minHltbHours: null,
  maxHltbHours: null,
  minReleaseYear: null,
  maxReleaseYear: null,
  platforms: [],
  minMetacritic: null,
  maxMetacritic: null,
  minAchievementPct: null,
  maxAchievementPct: null,
  onlyFamilyShared: false,
  onlyPossibleDuplicates: false,
  onlyMissingDetails: false,
  onlyDelisted: false,
  onlyCollectionOnly: false,
};

export type SortBy = "name" | "playtime" | "lastPlayed" | "appid" | "metacritic" | "hltb" | "achievements" | "status";
export type ViewMode = "grid" | "list";

const VIEW_MODE_STORAGE_KEY = "repressurizer-library-view-mode";

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === "grid" || raw === "list") return raw;
  } catch {}
  return "grid";
}

function saveViewMode(viewMode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  } catch {}
}

interface GameState {
  games: Record<number, OwnedGame>;
  details: Record<number, GameDetails>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortBy;
  sortAsc: boolean;
  viewMode: ViewMode;
  selectedGameIds: Record<number, boolean>;
  filters: FilterState;

  setGames: (games: OwnedGame[]) => void;
  mergeGames: (games: OwnedGame[]) => void;
  setDetails: (appId: number, details: GameDetails) => void;
  setBulkDetails: (details: GameDetails[]) => void;
  clearDetailsCache: () => void;
  hydrateDetailsCache: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortBy) => void;
  toggleSortAsc: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleGameSelection: (appId: number) => void;
  rangeSelectGames: (fromId: number, toId: number, orderedIds: number[]) => void;
  selectAllGames: () => void;
  clearSelection: () => void;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;

  // Helpers
  gameList: () => OwnedGame[];
  gameCount: () => number;
  selectedCount: () => number;
  isSelected: (appId: number) => boolean;
  hasActiveFilters: () => boolean;
}

export const useGameStore = create<GameState>((set, get) => ({
  games: {},
  details: {},
  loading: false,
  error: null,
  searchQuery: "",
  sortBy: "name",
  sortAsc: true,
  viewMode: loadViewMode(),
  selectedGameIds: {},
  filters: { ...DEFAULT_FILTERS },

  setGames: (games) =>
    set((state) => {
      const map: Record<number, OwnedGame> = {};
      const appIndex = useSteamAppIndexStore.getState().data;
      for (const g of games) {
        map[g.appid] = {
          ...g,
          name: displayNameFromDetails(g, state.details[g.appid], appIndex),
        };
      }
      return { games: map, loading: false, error: null };
    }),

  mergeGames: (games) =>
    set((state) => {
      const map = { ...state.games };
      const appIndex = useSteamAppIndexStore.getState().data;
      for (const game of games) {
        const existing = map[game.appid];
        const merged = existing
          ? existing.is_collection_only && !game.is_collection_only
            ? {
                ...existing,
                ...game,
                img_icon_url: game.img_icon_url ?? existing.img_icon_url,
              }
            : {
                ...game,
                ...existing,
                name: existing.name || game.name,
                img_icon_url: existing.img_icon_url ?? game.img_icon_url,
              }
          : game;
        map[game.appid] = {
          ...merged,
          name: displayNameFromDetails(merged, state.details[game.appid], appIndex),
        };
      }
      return { games: map };
    }),

  setDetails: (appId, details) =>
    set((state) => {
      const cleanDetails = sanitizeGameDetailsPrices(details);
      const next = { ...state.details, [appId]: cleanDetails };
      const games = { ...state.games };
      const game = games[appId];
      if (game && (game.is_collection_only || isPlaceholderGameName(appId, game.name))) {
        games[appId] = { ...game, name: displayNameFromDetails(game, cleanDetails, useSteamAppIndexStore.getState().data) };
      }
      persistDetailsCache(next);
      return { details: next, games };
    }),

  setBulkDetails: (details) =>
    set((state) => {
      const next = { ...state.details };
      const games = { ...state.games };
      for (const rawDetails of details) {
        const d = sanitizeGameDetailsPrices(rawDetails);
        next[d.app_id] = d;
        const game = games[d.app_id];
        if (game && (game.is_collection_only || isPlaceholderGameName(d.app_id, game.name))) {
          games[d.app_id] = { ...game, name: displayNameFromDetails(game, d, useSteamAppIndexStore.getState().data) };
        }
      }
      persistDetailsCache(next);
      return { details: next, games };
    }),

  clearDetailsCache: () => {
    invoke("save_details_cache", { data: "{}" }).catch(() => {});
    set({ details: {} });
  },

  hydrateDetailsCache: async () => {
    try {
      const raw = await invoke<string | null>("load_details_cache");
      if (raw) {
        const parsed: Record<number, GameDetails> = JSON.parse(raw);
        const cleaned: Record<number, GameDetails> = {};
        let changed = false;
        for (const [id, details] of Object.entries(parsed)) {
          const cleanDetails = sanitizeGameDetailsPrices(details);
          cleaned[Number(id)] = cleanDetails;
          if (cleanDetails !== details) changed = true;
        }
        if (changed) persistDetailsCache(cleaned);
        set({ details: cleaned });
      }
    } catch {
      // cache miss or parse error — start fresh
    }
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortAsc: () => set((state) => ({ sortAsc: !state.sortAsc })),
  setViewMode: (viewMode) => {
    saveViewMode(viewMode);
    set({ viewMode });
  },

  toggleGameSelection: (appId) =>
    set((state) => {
      const next = { ...state.selectedGameIds };
      if (next[appId]) {
        delete next[appId];
      } else {
        next[appId] = true;
      }
      return { selectedGameIds: next };
    }),

  selectAllGames: () =>
    set((state) => {
      const next: Record<number, boolean> = {};
      for (const id of Object.keys(state.games)) {
        next[Number(id)] = true;
      }
      return { selectedGameIds: next };
    }),

  clearSelection: () => set({ selectedGameIds: {} }),

  rangeSelectGames: (fromId, toId, orderedIds) =>
    set((state) => {
      const fromIdx = orderedIds.indexOf(fromId);
      const toIdx = orderedIds.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const next = { ...state.selectedGameIds };
      for (let i = start; i <= end; i++) {
        next[orderedIds[i]] = true;
      }
      return { selectedGameIds: next };
    }),

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  gameList: () => Object.values(get().games),
  gameCount: () => Object.keys(get().games).length,
  selectedCount: () => Object.keys(get().selectedGameIds).length,
  isSelected: (appId) => !!get().selectedGameIds[appId],
  hasActiveFilters: () => {
    const f = get().filters;
    return (
      f.minHours !== null ||
      f.maxHours !== null ||
      f.statuses.length > 0 ||
      f.onlyUnplayed ||
      f.tagFilter.length > 0 ||
      f.minHltbHours !== null ||
      f.maxHltbHours !== null ||
      f.minReleaseYear !== null ||
      f.maxReleaseYear !== null ||
      f.platforms.length > 0 ||
      f.minMetacritic !== null ||
      f.maxMetacritic !== null ||
      f.minAchievementPct !== null ||
      f.maxAchievementPct !== null ||
      f.onlyFamilyShared ||
      f.onlyPossibleDuplicates ||
      f.onlyMissingDetails ||
      f.onlyDelisted ||
      f.onlyCollectionOnly
    );
  },
}));
