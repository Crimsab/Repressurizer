import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { OwnedGame, GameDetails, GamePriceOverview, StoreReleaseDateResult } from "../lib/types";
import type { GameStatus } from "./statusStore";
import { displayNameFromDetails, isPlaceholderGameName } from "../lib/libraryMerge";
import { useSteamAppIndexStore } from "./steamAppIndexStore";
import { useAppNameOverrideStore } from "./appNameOverrideStore";
import { mergeDetailsPriceCache, mergePriceSnapshotIntoDetails, sanitizeGameDetailsPrices } from "../lib/prices";
import {
  DETAILS_CACHE_SCHEMA_VERSION,
  detailsCacheNeedsRefresh,
  isDetailsCacheCurrent,
} from "../lib/detailsCache";

export {
  DETAILS_CACHE_SCHEMA_VERSION,
  detailsCacheNeedsRefresh,
  isDetailsCacheCurrent,
};

function persistDetailsCache(details: Record<number, GameDetails>) {
  invoke("save_details_cache", { data: JSON.stringify(details) }).catch(() => {});
}

function normalizeDetailsForCache(details: GameDetails): GameDetails {
  const cleanDetails = sanitizeGameDetailsPrices(details);
  return {
    ...cleanDetails,
    genres: Array.isArray(cleanDetails.genres) ? cleanDetails.genres : [],
    tags: Array.isArray(cleanDetails.tags) ? cleanDetails.tags : [],
    categories: Array.isArray(cleanDetails.categories) ? cleanDetails.categories : [],
    developers: Array.isArray(cleanDetails.developers) ? cleanDetails.developers : [],
    publishers: Array.isArray(cleanDetails.publishers) ? cleanDetails.publishers : [],
    supported_languages: Array.isArray(cleanDetails.supported_languages) ? cleanDetails.supported_languages : [],
    platforms: {
      windows: !!cleanDetails.platforms?.windows,
      mac: !!cleanDetails.platforms?.mac,
      linux: !!cleanDetails.platforms?.linux,
    },
    price_cache:
      cleanDetails.price_cache && typeof cleanDetails.price_cache === "object"
        ? cleanDetails.price_cache
        : undefined,
    store_release_date:
      typeof cleanDetails.store_release_date === "string"
        ? cleanDetails.store_release_date.trim() || null
        : cleanDetails.store_release_date ?? null,
    store_release_date_fetched_at:
      typeof cleanDetails.store_release_date_fetched_at === "number" && Number.isFinite(cleanDetails.store_release_date_fetched_at)
        ? cleanDetails.store_release_date_fetched_at
        : null,
  };
}

function hasUsableLegacyDetails(details: GameDetails): boolean {
  const name = String(details.name ?? "").trim();
  const hasRealName = !!name && !isPlaceholderGameName(details.app_id, name);
  const hasListData =
    (details.genres ?? []).length > 0 ||
    (details.tags ?? []).length > 0 ||
    (details.categories ?? []).length > 0 ||
    (details.developers ?? []).length > 0 ||
    (details.publishers ?? []).length > 0 ||
    (details.supported_languages ?? []).length > 0;
  const hasPlatform =
    !!details.platforms &&
    (details.platforms.windows || details.platforms.mac || details.platforms.linux);
  const hasPrice =
    details.is_free ||
    details.price_initial != null ||
    details.price_final != null ||
    !!details.price_currency ||
    !!details.price_cache;

  return (
    hasRealName ||
    hasListData ||
    hasPlatform ||
    hasPrice ||
    !!details.release_date ||
    !!details.store_release_date ||
    details.metacritic_score != null ||
    !!details.header_image ||
    !!details.capsule_image
  );
}

function markDetailsCacheFresh(details: GameDetails, previous?: GameDetails): GameDetails {
  const fetchedAt = Date.now();
  return {
    ...mergeDetailsPriceCache(normalizeDetailsForCache(details), previous, fetchedAt),
    cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
    fetched_at: fetchedAt,
  };
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

export type SortBy =
  | "name"
  | "playtime"
  | "lastPlayed"
  | "appid"
  | "metacritic"
  | "hltb"
  | "achievements"
  | "status"
  | "steamReviews"
  | "reviewCount"
  | "releaseDate"
  | "price"
  | "userRating";
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

function bestMergedName(appId: number, existingName: string | null | undefined, incomingName: string | null | undefined): string {
  const existing = String(existingName ?? "").trim();
  const incoming = String(incomingName ?? "").trim();
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (isPlaceholderGameName(appId, existing) && !isPlaceholderGameName(appId, incoming)) {
    return incoming;
  }
  return existing;
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
  setBulkPriceSnapshots: (prices: GamePriceOverview[]) => void;
  setBulkStoreReleaseDates: (dates: StoreReleaseDateResult[]) => void;
  clearDetailsCache: () => void;
  hydrateDetailsCache: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortBy) => void;
  toggleSortAsc: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleGameSelection: (appId: number) => void;
  setSelectedGameIds: (appIds: number[]) => void;
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
      const nameStore = useAppNameOverrideStore.getState();
      nameStore.mergeNames(games);
      for (const g of games) {
        map[g.appid] = {
          ...g,
          name: displayNameFromDetails(g, state.details[g.appid], appIndex, nameStore.resolveName),
        };
      }
      return { games: map, loading: false, error: null };
    }),

  mergeGames: (games) =>
    set((state) => {
      const map = { ...state.games };
      const appIndex = useSteamAppIndexStore.getState().data;
      const nameStore = useAppNameOverrideStore.getState();
      nameStore.mergeNames(games);
      for (const game of games) {
        const existing = map[game.appid];
        const merged = existing
          ? existing.is_collection_only && !game.is_collection_only
            ? {
                ...existing,
                ...game,
                name: bestMergedName(game.appid, existing.name, game.name),
                img_icon_url: game.img_icon_url ?? existing.img_icon_url,
              }
            : {
                ...game,
                ...existing,
                name: bestMergedName(game.appid, existing.name, game.name),
                img_icon_url: existing.img_icon_url ?? game.img_icon_url,
              }
          : game;
        map[game.appid] = {
          ...merged,
          name: displayNameFromDetails(merged, state.details[game.appid], appIndex, nameStore.resolveName),
        };
      }
      return { games: map };
    }),

  setDetails: (appId, details) =>
    set((state) => {
      const cleanDetails = markDetailsCacheFresh(details, state.details[appId]);
      const next = { ...state.details, [appId]: cleanDetails };
      const games = { ...state.games };
      const game = games[appId];
      useAppNameOverrideStore.getState().mergeNames([{ appid: cleanDetails.app_id, name: cleanDetails.name }]);
      if (game && (game.is_collection_only || isPlaceholderGameName(appId, game.name))) {
        games[appId] = {
          ...game,
          name: displayNameFromDetails(
            game,
            cleanDetails,
            useSteamAppIndexStore.getState().data,
            useAppNameOverrideStore.getState().resolveName
          ),
        };
      }
      persistDetailsCache(next);
      return { details: next, games };
    }),

  setBulkDetails: (details) =>
    set((state) => {
      const next = { ...state.details };
      const games = { ...state.games };
      const nameEntries: Array<{ appid: number; name: string | null }> = [];
      for (const rawDetails of details) {
        const d = markDetailsCacheFresh(rawDetails, next[rawDetails.app_id]);
        next[d.app_id] = d;
        nameEntries.push({ appid: d.app_id, name: d.name });
        const game = games[d.app_id];
        if (game && (game.is_collection_only || isPlaceholderGameName(d.app_id, game.name))) {
          games[d.app_id] = {
            ...game,
            name: displayNameFromDetails(
              game,
              d,
              useSteamAppIndexStore.getState().data,
              useAppNameOverrideStore.getState().resolveName
            ),
          };
        }
      }
      useAppNameOverrideStore.getState().mergeNames(nameEntries);
      persistDetailsCache(next);
      return { details: next, games };
    }),

  setBulkPriceSnapshots: (prices) =>
    set((state) => {
      if (prices.length === 0) return state;

      const next = { ...state.details };
      const fetchedAt = Date.now();
      let changed = false;

      for (const price of prices) {
        const existing = next[price.app_id];
        if (!existing) continue;

        next[price.app_id] = {
          ...mergePriceSnapshotIntoDetails(existing, price, fetchedAt),
          cache_schema: existing.cache_schema,
          fetched_at: existing.fetched_at,
        };
        changed = true;
      }

      if (!changed) return state;
      persistDetailsCache(next);
      return { details: next };
    }),

  setBulkStoreReleaseDates: (dates) =>
    set((state) => {
      if (dates.length === 0) return state;

      const next = { ...state.details };
      const fetchedAt = Date.now();
      let changed = false;

      for (const result of dates) {
        const existing = next[result.app_id];
        if (!existing) continue;

        const releaseDate = typeof result.release_date === "string"
          ? result.release_date.trim() || null
          : null;
        next[result.app_id] = {
          ...existing,
          store_release_date: releaseDate,
          store_release_date_fetched_at: fetchedAt,
        };
        changed = true;
      }

      if (!changed) return state;
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
        const cleaned: Record<number, GameDetails> = {};
        let changed = false;
        const migratedAt = Date.now();
        for (const [id, details] of Object.entries(parsed)) {
          let cleanDetails = normalizeDetailsForCache(details);
          if (!isDetailsCacheCurrent(cleanDetails) && hasUsableLegacyDetails(cleanDetails)) {
            cleanDetails = {
              ...mergeDetailsPriceCache(cleanDetails, undefined, cleanDetails.fetched_at ?? migratedAt),
              cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
              fetched_at: cleanDetails.fetched_at ?? migratedAt,
            };
          }
          cleaned[Number(id)] = cleanDetails;
          if (JSON.stringify(cleanDetails) !== JSON.stringify(details)) changed = true;
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

  setSelectedGameIds: (appIds) =>
    set(() => {
      const next: Record<number, boolean> = {};
      for (const id of appIds) {
        if (Number.isFinite(id)) next[Math.trunc(id)] = true;
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
