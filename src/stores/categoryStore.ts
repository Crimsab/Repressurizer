import { create } from "zustand";
import type { SteamCollection } from "../lib/types";
import type { CollectionChangeOrigin } from "../lib/collectionTimeMachine";

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
  _lastChangeOrigin: CollectionChangeOrigin;

  setCollections: (collections: SteamCollection[], origin?: CollectionChangeOrigin) => void;
  applyImportedCollections: (collections: SteamCollection[], origin?: CollectionChangeOrigin) => void;
  setActiveCategory: (key: string | null) => void;
  toggleCategorySelection: (key: string) => void;
  clearCategorySelection: () => void;
  setSelectedCategoryKeys: (keys: string[]) => void;
  addCategory: (name: string) => void;
  addCategoryWithGames: (name: string, appIds: number[]) => void;
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
    _lastChangeOrigin: "manual",
  };
}

// Use one monotonic value for both fields. Date.now() alone can collide during
// bulk actions; imported collections can already contain the next candidate.
let lastCollectionSequence = 0;

function createStaticCollection(
  collections: SteamCollection[],
  name: string,
  added: number[],
): SteamCollection {
  const existingIds = new Set(collections.map((collection) => collection.id));
  const existingKeys = new Set(collections.map((collection) => collection.key));
  let sequence = Math.max(Date.now(), lastCollectionSequence + 1);
  while (
    existingIds.has(`uc-new-${sequence}`) ||
    existingKeys.has(`user-collections.uc-new-${sequence}`)
  ) sequence += 1;
  lastCollectionSequence = sequence;
  const id = `uc-new-${sequence}`;
  return {
    id,
    key: `user-collections.${id}`,
    name,
    added,
    removed: [],
    timestamp: Math.floor(Date.now() / 1000),
    is_deleted: false,
    is_dynamic: false,
  };
}

function validAppIds(appIds: number[]): number[] {
  // The backend accepts u64 IDs, including shortcuts. Do not impose a u32
  // limit, but reject numbers JavaScript cannot represent exactly.
  return [...new Set(appIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function reconcileSelection(
  state: CategoryState,
  collections: SteamCollection[],
): Pick<CategoryState, "activeCategory" | "selectedCategoryKeys"> {
  const keys = new Set(collections.map((collection) => collection.key));
  const active = state.activeCategory;
  const wasCollection = active !== null && (
    active.startsWith("user-collections.") ||
    state.collections.some((collection) => collection.key === active)
  );
  return {
    // Built-in views such as All and Diary are not collection keys.
    activeCategory: wasCollection && !keys.has(active!) ? "all" : active,
    selectedCategoryKeys: state.selectedCategoryKeys.filter((key) => keys.has(key)),
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
  _lastChangeOrigin: "steam",

  setCollections: (collections, origin = "steam") =>
    set((state) => ({
      ...reconcileSelection(state, collections),
      collections: structuredClone(collections),
      dirty: false,
      loading: false,
      _history: [],
      _future: [],
      _saved: structuredClone(collections),
      selectedCategoryKeys: [],
      _lastChangeOrigin: origin,
    })),

  applyImportedCollections: (collections, origin = "import") =>
    set((state) => ({
      ...pushHistory(state),
      collections: structuredClone(collections),
      activeCategory: "all",
      selectedCategoryKeys: [],
      _lastChangeOrigin: origin,
    })),

  setActiveCategory: (key) =>
    set({ activeCategory: key, selectedCategoryKeys: [] }),

  toggleCategorySelection: (key) =>
    set((state) => {
      if (!state.collections.some((collection) => collection.key === key)) return state;
      return {
        selectedCategoryKeys: state.selectedCategoryKeys.includes(key)
          ? state.selectedCategoryKeys.filter((selected) => selected !== key)
          : [...state.selectedCategoryKeys, key],
      };
    }),

  clearCategorySelection: () => set({ selectedCategoryKeys: [] }),

  setSelectedCategoryKeys: (keys) =>
    set((state) => {
      const existing = new Set(state.collections.map((collection) => collection.key));
      return { selectedCategoryKeys: [...new Set(keys)].filter((key) => existing.has(key)) };
    }),

  addCategory: (name) => get().addCategoryWithGames(name, []),

  addCategoryWithGames: (name, appIds) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      const added = validAppIds(appIds).sort((a, b) => a - b);
      return {
        ...pushHistory(state),
        collections: [
          ...state.collections,
          createStaticCollection(state.collections, trimmed, added),
        ],
      };
    }),

  removeCategory: (key) => get().removeCategories([key]),

  removeCategories: (keys) =>
    set((state) => {
      const requestedKeys = new Set(keys);
      const removableKeys = new Set(
        state.collections
          .filter((collection) => requestedKeys.has(collection.key) && !collection.is_dynamic)
          .map((collection) => collection.key),
      );
      if (removableKeys.size === 0) return state;
      const collections = state.collections.filter((collection) => !removableKeys.has(collection.key));
      return {
        ...pushHistory(state),
        ...reconcileSelection(state, collections),
        collections,
      };
    }),

  renameCategory: (key, newName) =>
    set((state) => {
      const trimmed = newName.trim();
      const target = state.collections.find((collection) => collection.key === key);
      if (!target || target.is_dynamic || !trimmed || target.name === trimmed) return state;
      return {
        ...pushHistory(state),
        collections: state.collections.map((collection) =>
          collection === target ? { ...collection, name: trimmed } : collection,
        ),
      };
    }),

  addGameToCategory: (key, appId) => get().addGamesToCategory(key, [appId]),

  removeGameFromCategory: (key, appId) => get().removeGamesFromCategory(key, [appId]),

  addGamesToCategory: (key, appIds) =>
    set((state) => {
      const target = state.collections.find((collection) => collection.key === key);
      if (!target || target.is_dynamic) return state;
      const existing = new Set(target.added);
      const newIds = validAppIds(appIds).filter((id) => !existing.has(id));
      if (newIds.length === 0) return state;
      return {
        ...pushHistory(state),
        collections: state.collections.map((collection) =>
          collection === target ? { ...collection, added: [...collection.added, ...newIds] } : collection,
        ),
      };
    }),

  removeGamesFromCategory: (key, appIds) =>
    set((state) => {
      const target = state.collections.find((collection) => collection.key === key);
      if (!target || target.is_dynamic) return state;
      const removed = new Set(appIds);
      const added = target.added.filter((id) => !removed.has(id));
      if (added.length === target.added.length) return state;
      return {
        ...pushHistory(state),
        collections: state.collections.map((collection) =>
          collection === target ? { ...collection, added } : collection,
        ),
      };
    }),

  mergeCategories: (sourceKey, targetKey) =>
    set((state) => {
      if (sourceKey === targetKey) return state;
      const source = state.collections.find((collection) => collection.key === sourceKey);
      const target = state.collections.find((collection) => collection.key === targetKey);
      if (!source || !target || source.is_dynamic || target.is_dynamic) return state;
      const added = [...new Set([...target.added, ...source.added])];
      return {
        ...pushHistory(state),
        collections: state.collections
          .filter((collection) => collection.key !== sourceKey)
          .map((collection) => collection === target ? { ...collection, added } : collection),
        activeCategory: state.activeCategory === sourceKey ? targetKey : state.activeCategory,
        selectedCategoryKeys: state.selectedCategoryKeys.filter((key) => key !== sourceKey),
      };
    }),

  mergeCategoriesIntoTarget: (selectedKeys, targetKey) =>
    set((state) => {
      const target = state.collections.find((collection) => collection.key === targetKey);
      if (!target || target.is_dynamic) return state;
      const byKey = new Map(state.collections.map((collection) => [collection.key, collection]));
      const sources = [...new Set(selectedKeys)]
        .filter((key) => key !== targetKey)
        .map((key) => byKey.get(key))
        .filter((collection): collection is SteamCollection => !!collection && !collection.is_dynamic);
      if (sources.length === 0) return state;
      const union = new Set(target.added);
      for (const source of sources) for (const id of source.added) union.add(id);
      const removeKeys = new Set(sources.map((collection) => collection.key));
      return {
        ...pushHistory(state),
        collections: state.collections
          .filter((collection) => !removeKeys.has(collection.key))
          .map((collection) => collection === target ? { ...collection, added: [...union] } : collection),
        selectedCategoryKeys: [],
        activeCategory: state.activeCategory && removeKeys.has(state.activeCategory)
          ? targetKey : state.activeCategory,
      };
    }),

  mergeSelectedIntoNewCategory: (selectedKeys, newName) =>
    set((state) => {
      const trimmed = newName.trim();
      if (!trimmed) return state;
      const byKey = new Map(state.collections.map((collection) => [collection.key, collection]));
      const sources = [...new Set(selectedKeys)]
        .map((key) => byKey.get(key))
        .filter((collection): collection is SteamCollection => !!collection && !collection.is_dynamic);
      if (sources.length === 0) return state;
      const union = new Set<number>();
      for (const source of sources) for (const id of source.added) union.add(id);
      const removeKeys = new Set(sources.map((collection) => collection.key));
      const newCollection = createStaticCollection(state.collections, trimmed, [...union]);
      return {
        ...pushHistory(state),
        collections: [
          ...state.collections.filter((collection) => !removeKeys.has(collection.key)),
          newCollection,
        ],
        selectedCategoryKeys: [],
        activeCategory: state.activeCategory && removeKeys.has(state.activeCategory)
          ? newCollection.key : state.activeCategory,
      };
    }),

  duplicateCategory: (sourceKey, newName) =>
    set((state) => {
      const source = state.collections.find((collection) => collection.key === sourceKey);
      const trimmed = newName.trim();
      if (!source || !trimmed) return state;
      return {
        ...pushHistory(state),
        collections: [
          ...state.collections,
          createStaticCollection(state.collections, trimmed, [...new Set(source.added)]),
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
        ...reconcileSelection(state, prev),
        collections: prev,
        _history: state._history.slice(0, -1),
        _future: [state.collections, ...state._future],
        dirty: JSON.stringify(prev) !== JSON.stringify(state._saved),
        _lastChangeOrigin: "manual",
      };
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return state;
      const next = state._future[0];
      return {
        ...reconcileSelection(state, next),
        collections: next,
        _history: [...state._history, state.collections].slice(-50),
        _future: state._future.slice(1),
        dirty: JSON.stringify(next) !== JSON.stringify(state._saved),
        _lastChangeOrigin: "manual",
      };
    }),

  discardChanges: () =>
    set((state) => ({
      ...reconcileSelection(state, state._saved),
      collections: structuredClone(state._saved),
      dirty: false,
      _history: [],
      _future: [],
      _lastChangeOrigin: "manual",
    })),

  canUndo: () => get()._history.length > 0,
  canRedo: () => get()._future.length > 0,

  getGamesInCategory: (key) => {
    const collection = get().collections.find((c) => c.key === key);
    return collection ? [...collection.added] : [];
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
