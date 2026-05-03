import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "repressurizer-game-tags";

function loadTags(): Record<number, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTags(tags: Record<number, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch {}
  invoke("save_app_data", { key: "tags.json", data: JSON.stringify(tags) }).catch(() => {});
}

interface TagsState {
  tags: Record<number, string[]>;
  addTag: (appId: number, tag: string) => void;
  removeTag: (appId: number, tag: string) => void;
  setTags: (appId: number, tags: string[]) => void;
  getAllTags: () => string[];
  hydrate: () => Promise<void>;
}

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: loadTags(),

  addTag: (appId, tag) =>
    set((state) => {
      const existing = state.tags[appId] ?? [];
      if (existing.includes(tag)) return state;
      const next = { ...state.tags, [appId]: [...existing, tag] };
      saveTags(next);
      return { tags: next };
    }),

  removeTag: (appId, tag) =>
    set((state) => {
      const existing = state.tags[appId] ?? [];
      const filtered = existing.filter((t) => t !== tag);
      const next = { ...state.tags };
      if (filtered.length === 0) {
        delete next[appId];
      } else {
        next[appId] = filtered;
      }
      saveTags(next);
      return { tags: next };
    }),

  setTags: (appId, tags) =>
    set((state) => {
      const next = { ...state.tags };
      if (tags.length === 0) {
        delete next[appId];
      } else {
        next[appId] = tags;
      }
      saveTags(next);
      return { tags: next };
    }),

  getAllTags: () => {
    const all = Object.values(get().tags).flat();
    return [...new Set(all)].sort();
  },

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "tags.json" });
      if (raw) {
        const parsed: Record<number, string[]> = JSON.parse(raw);
        const local = get().tags;
        const merged = { ...local, ...parsed };
        set({ tags: merged });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {}
  },
}));
