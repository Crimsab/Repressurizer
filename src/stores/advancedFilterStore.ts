import { create } from "zustand";
import type { SteamCollection } from "../lib/types";

export type AdvancedCategoryState = "any" | "allow" | "require" | "exclude";
export type AdvancedSpecialState = "any" | "require" | "exclude";

export interface SavedAdvancedFilter {
  id: string;
  name: string;
  allowCategoryKeys: string[];
  requireCategoryKeys: string[];
  excludeCategoryKeys: string[];
  hidden: AdvancedSpecialState;
  uncategorized: AdvancedSpecialState;
  createdAt: number;
  updatedAt: number;
}

interface AdvancedFilterState {
  filters: SavedAdvancedFilter[];
  activeFilterId: string | null;
  setFilters: (filters: SavedAdvancedFilter[]) => void;
  setActiveFilterId: (id: string | null) => void;
}

const STORAGE_KEY = "repressurizer-advanced-filters";

const defaults: Omit<AdvancedFilterState, "setFilters" | "setActiveFilterId"> = {
  filters: [],
  activeFilterId: null,
};

function load(): Omit<AdvancedFilterState, "setFilters" | "setActiveFilterId"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function save(state: Omit<AdvancedFilterState, "setFilters" | "setActiveFilterId">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export const useAdvancedFilterStore = create<AdvancedFilterState>((set) => ({
  ...load(),
  setFilters: (filters) =>
    set((state) => {
      const activeFilterId = state.activeFilterId && filters.some((filter) => filter.id === state.activeFilterId)
        ? state.activeFilterId
        : null;
      const next = { filters, activeFilterId };
      save(next);
      return next;
    }),
  setActiveFilterId: (activeFilterId) =>
    set((state) => {
      const next = { filters: state.filters, activeFilterId };
      save(next);
      return { activeFilterId };
    }),
}));

export function matchesSavedAdvancedFilter(
  appId: number,
  filter: SavedAdvancedFilter,
  collections: SteamCollection[]
): boolean {
  const hidden = collections.find((collection) => collection.key === "user-collections.hidden" || collection.id === "hidden");
  const isHidden = !!hidden?.added.includes(appId);
  if (filter.hidden === "require" && !isHidden) return false;
  if (filter.hidden === "exclude" && isHidden) return false;

  const userCategoryKeys = collections
    .filter((collection) => !collection.is_dynamic && !isSpecialCollection(collection))
    .filter((collection) => collection.added.includes(appId))
    .map((collection) => collection.key);
  const userCategorySet = new Set(userCategoryKeys);
  const isUncategorized = userCategorySet.size === 0;

  if (filter.uncategorized === "require" && !isUncategorized) return false;
  if (filter.uncategorized === "exclude" && isUncategorized) return false;

  if (
    filter.allowCategoryKeys.length > 0 &&
    !filter.allowCategoryKeys.some((key) => userCategorySet.has(key))
  ) {
    return false;
  }

  if (!filter.requireCategoryKeys.every((key) => userCategorySet.has(key))) {
    return false;
  }

  if (filter.excludeCategoryKeys.some((key) => userCategorySet.has(key))) {
    return false;
  }

  return true;
}

function isSpecialCollection(collection: SteamCollection): boolean {
  return (
    collection.key === "user-collections.hidden" ||
    collection.key === "user-collections.favorite" ||
    collection.id === "hidden" ||
    collection.id === "favorite"
  );
}
