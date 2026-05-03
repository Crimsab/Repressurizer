import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { OwnedGame, GameDetails } from "../lib/types";
import type { GameStatus } from "./statusStore";

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
}

const DEFAULT_FILTERS: FilterState = {
  minHours: null,
  maxHours: null,
  statuses: [],
  onlyUnplayed: false,
  tagFilter: [],
  minHltbHours: null,
  maxHltbHours: null,
};

export type SortBy = "name" | "playtime" | "lastPlayed" | "appid" | "metacritic" | "hltb" | "achievements" | "status";

interface GameState {
  games: Record<number, OwnedGame>;
  details: Record<number, GameDetails>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: SortBy;
  sortAsc: boolean;
  viewMode: "grid" | "list";
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
  setViewMode: (mode: "grid" | "list") => void;
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
  viewMode: "grid",
  selectedGameIds: {},
  filters: { ...DEFAULT_FILTERS },

  setGames: (games) => {
    const map: Record<number, OwnedGame> = {};
    for (const g of games) {
      map[g.appid] = g;
    }
    set({ games: map, loading: false, error: null });
  },

  mergeGames: (games) =>
    set((state) => {
      const map = { ...state.games };
      for (const game of games) {
        const existing = map[game.appid];
        map[game.appid] = existing
          ? {
              ...game,
              ...existing,
              name: existing.name || game.name,
              img_icon_url: existing.img_icon_url ?? game.img_icon_url,
            }
          : game;
      }
      return { games: map };
    }),

  setDetails: (appId, details) =>
    set((state) => {
      const next = { ...state.details, [appId]: details };
      persistDetailsCache(next);
      return { details: next };
    }),

  setBulkDetails: (details) =>
    set((state) => {
      const next = { ...state.details };
      for (const d of details) {
        next[d.app_id] = d;
      }
      persistDetailsCache(next);
      return { details: next };
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
        set({ details: parsed });
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
  setViewMode: (viewMode) => set({ viewMode }),

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
    return f.minHours !== null || f.maxHours !== null || f.statuses.length > 0 || f.onlyUnplayed || f.tagFilter.length > 0;
  },
}));
