import { create } from "zustand";
import type { SteamCollection } from "../lib/types";

interface CategoryState {
  collections: SteamCollection[];
  activeCategory: string | null;
  /** Multi-select in sidebar (Ctrl/Cmd+click); user collection keys only. */
  selectedCategoryKeys: string[];
  dirty: boolean;
  loading: boolean;

  // History for undo/redo
  _history: SteamCollection[][];
  _future: SteamCollection[][];
  _saved: SteamCollection[]; // snapshot at last save/load

  setCollections: (collections: SteamCollection[]) => void;
  setActiveCategory: (key: string | null) => void;
  toggleCategorySelection: (key: string) => void;
  clearCategorySelection: () => void;
  setSelectedCategoryKeys: (keys: string[]) => void;
  addCategory: (name: string) => void;
  removeCategory: (key: string) => void;
  removeCategories: (keys: string[]) => void;
  renameCategory: (key: string, newName: string) => void;
  addGameToCategory: (key: string, appId: number) => void;
  removeGameFromCategory: (key: string, appId: number) => void;
  addGamesToCategory: (key: string, appIds: number[]) => void;
  removeGamesFromCategory: (key: string, appIds: number[]) => void;
  mergeCategories: (sourceKey: string, targetKey: string) => void;
  /** Merge all keys in `selectedKeys` into `targetKey` (target remains; others removed). */
  mergeCategoriesIntoTarget: (selectedKeys: string[], targetKey: string) => void;
  /** Replace selected categories with one new category containing the union of games. */
  mergeSelectedIntoNewCategory: (selectedKeys: string[], newName: string) => void;
  duplicateCategory: (sourceKey: string, newName: string) => void;
  markClean: () => void;
  setLoading: (loading: boolean) => void;

  undo: () => void;
  redo: () => void;
  discardChanges: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  getGamesInCategory: (key: string) => number[];
  getCategoriesForGame: (appId: number) => SteamCollection[];
  getUncategorizedGameIds: (allGameIds: number[]) => number[];
}

// Push current state to history before making a change
function pushHistory(state: CategoryState): Partial<CategoryState> {
  return {
    _history: [...state._history, state.collections].slice(-50), // keep max 50
    _future: [], // clear redo on new action
    dirty: true,
  };
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  collections: [],
  activeCategory: "all",
  selectedCategoryKeys: [],
  dirty: false,
  loading: false,
  _history: [],
  _future: [],
  _saved: [],

  setCollections: (collections) =>
    set({
      collections,
      dirty: false,
      loading: false,
      _history: [],
      _future: [],
      _saved: structuredClone(collections),
      selectedCategoryKeys: [],
    }),

  setActiveCategory: (key) =>
    set({ activeCategory: key, selectedCategoryKeys: [] }),

  toggleCategorySelection: (key) =>
    set((state) => {
      const i = state.selectedCategoryKeys.indexOf(key);
      if (i === -1) {
        return { selectedCategoryKeys: [...state.selectedCategoryKeys, key] };
      }
      return {
        selectedCategoryKeys: state.selectedCategoryKeys.filter((k) => k !== key),
      };
    }),

  clearCategorySelection: () => set({ selectedCategoryKeys: [] }),

  setSelectedCategoryKeys: (keys) => set({ selectedCategoryKeys: keys }),

  addCategory: (name) =>
    set((state) => ({
      ...pushHistory(state),
      collections: [
        ...state.collections,
        {
          id: `uc-new-${Date.now()}`,
          key: `user-collections.uc-new-${Date.now()}`,
          name,
          added: [],
          removed: [],
          timestamp: Math.floor(Date.now() / 1000),
          is_deleted: false,
          is_dynamic: false,
        },
      ],
    })),

  removeCategory: (key) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.filter((c) => c.key !== key),
      activeCategory:
        state.activeCategory === key ? "all" : state.activeCategory,
      selectedCategoryKeys: state.selectedCategoryKeys.filter((k) => k !== key),
    })),

  removeCategories: (keys) =>
    set((state) => {
      const requestedKeys = new Set(keys);
      const removableKeys = new Set(
        state.collections
          .filter((c) => requestedKeys.has(c.key) && !c.is_dynamic)
          .map((c) => c.key)
      );
      if (removableKeys.size === 0) return state;
      return {
        ...pushHistory(state),
        collections: state.collections.filter((c) => !removableKeys.has(c.key)),
        activeCategory:
          state.activeCategory && removableKeys.has(state.activeCategory)
            ? "all"
            : state.activeCategory,
        selectedCategoryKeys: state.selectedCategoryKeys.filter(
          (k) => !removableKeys.has(k)
        ),
      };
    }),

  renameCategory: (key, newName) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.map((c) =>
        c.key === key ? { ...c, name: newName } : c
      ),
    })),

  addGameToCategory: (key, appId) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.map((c) =>
        c.key === key && !c.added.includes(appId)
          ? { ...c, added: [...c.added, appId] }
          : c
      ),
    })),

  removeGameFromCategory: (key, appId) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.map((c) =>
        c.key === key
          ? { ...c, added: c.added.filter((id) => id !== appId) }
          : c
      ),
    })),

  addGamesToCategory: (key, appIds) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.map((c) => {
        if (c.key !== key) return c;
        const existing = new Set(c.added);
        const newIds = appIds.filter((id) => !existing.has(id));
        return { ...c, added: [...c.added, ...newIds] };
      }),
    })),

  removeGamesFromCategory: (key, appIds) =>
    set((state) => ({
      ...pushHistory(state),
      collections: state.collections.map((c) =>
        c.key === key
          ? { ...c, added: c.added.filter((id) => !appIds.includes(id)) }
          : c
      ),
    })),

  mergeCategories: (sourceKey, targetKey) =>
    set((state) => {
      const source = state.collections.find((c) => c.key === sourceKey);
      if (!source) return state;
      return {
        ...pushHistory(state),
        collections: state.collections
          .map((c) => {
            if (c.key === targetKey) {
              const existing = new Set(c.added);
              const newIds = source.added.filter((id) => !existing.has(id));
              return { ...c, added: [...c.added, ...newIds] };
            }
            return c;
          })
          .filter((c) => c.key !== sourceKey),
        selectedCategoryKeys: state.selectedCategoryKeys.filter(
          (k) => k !== sourceKey
        ),
      };
    }),

  mergeCategoriesIntoTarget: (selectedKeys, targetKey) =>
    set((state) => {
      const target = state.collections.find((c) => c.key === targetKey);
      if (!target) return state;
      const sources = selectedKeys.filter((k) => k !== targetKey);
      const union = new Set(target.added);
      for (const k of sources) {
        const c = state.collections.find((x) => x.key === k);
        if (c) for (const id of c.added) union.add(id);
      }
      const removeKeys = new Set(sources);
      let activeCategory = state.activeCategory;
      if (activeCategory && removeKeys.has(activeCategory)) {
        activeCategory = targetKey;
      }
      return {
        ...pushHistory(state),
        collections: state.collections
          .filter((c) => !removeKeys.has(c.key))
          .map((c) =>
            c.key === targetKey ? { ...c, added: [...union] } : c
          ),
        selectedCategoryKeys: [],
        activeCategory,
      };
    }),

  mergeSelectedIntoNewCategory: (selectedKeys, newName) =>
    set((state) => {
      const trimmed = newName.trim();
      if (!trimmed || selectedKeys.length === 0) return state;
      const union = new Set<number>();
      for (const k of selectedKeys) {
        const c = state.collections.find((x) => x.key === k);
        if (c) for (const id of c.added) union.add(id);
      }
      const removeKeys = new Set(selectedKeys);
      const ts = Date.now();
      const newKey = `user-collections.uc-new-${ts}`;
      const newCol = {
        id: `uc-new-${ts}`,
        key: newKey,
        name: trimmed,
        added: [...union],
        removed: [] as number[],
        timestamp: Math.floor(Date.now() / 1000),
        is_deleted: false,
        is_dynamic: false,
      };
      let activeCategory = state.activeCategory;
      if (activeCategory && removeKeys.has(activeCategory)) {
        activeCategory = newKey;
      }
      return {
        ...pushHistory(state),
        collections: [
          ...state.collections.filter((c) => !removeKeys.has(c.key)),
          newCol,
        ],
        selectedCategoryKeys: [],
        activeCategory,
      };
    }),

  duplicateCategory: (sourceKey, newName) =>
    set((state) => {
      const source = state.collections.find((c) => c.key === sourceKey);
      const trimmed = newName.trim();
      if (!source || !trimmed) return state;
      const ts = Date.now();
      const newKey = `user-collections.uc-new-${ts}`;
      return {
        ...pushHistory(state),
        collections: [
          ...state.collections,
          {
            id: `uc-new-${ts}`,
            key: newKey,
            name: trimmed,
            added: [...source.added],
            removed: [],
            timestamp: Math.floor(Date.now() / 1000),
            is_deleted: false,
            is_dynamic: false,
          },
        ],
      };
    }),

  markClean: () =>
    set((state) => ({
      dirty: false,
      _saved: structuredClone(state.collections),
      _history: [],
      _future: [],
    })),

  setLoading: (loading) => set({ loading }),

  undo: () =>
    set((state) => {
      if (state._history.length === 0) return state;
      const prev = state._history[state._history.length - 1];
      return {
        collections: prev,
        _history: state._history.slice(0, -1),
        _future: [state.collections, ...state._future],
        dirty: JSON.stringify(prev) !== JSON.stringify(state._saved),
      };
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return state;
      const next = state._future[0];
      return {
        collections: next,
        _history: [...state._history, state.collections],
        _future: state._future.slice(1),
        dirty: JSON.stringify(next) !== JSON.stringify(state._saved),
      };
    }),

  discardChanges: () =>
    set((state) => ({
      collections: structuredClone(state._saved),
      dirty: false,
      _history: [],
      _future: [],
    })),

  canUndo: () => get()._history.length > 0,
  canRedo: () => get()._future.length > 0,

  getGamesInCategory: (key) => {
    const collection = get().collections.find((c) => c.key === key);
    return collection?.added ?? [];
  },

  getCategoriesForGame: (appId) => {
    return get().collections.filter((c) => c.added.includes(appId));
  },

  getUncategorizedGameIds: (allGameIds) => {
    const categorized = new Set(
      get().collections.flatMap((c) => c.added)
    );
    return allGameIds.filter((id) => !categorized.has(id));
  },
}));
