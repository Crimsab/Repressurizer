import { create } from "zustand";
import { loadWishlistCache, saveWishlistCache } from "../lib/tauri";
import type { WishlistItem } from "../lib/tauri";

interface WishlistData {
  items: WishlistItem[];
  lastFetched: number | null;
}

function persist(data: WishlistData) {
  saveWishlistCache(JSON.stringify(data)).catch(() => {});
}

interface WishlistState {
  items: WishlistItem[];
  lastFetched: number | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setItems: (items: WishlistItem[]) => void;
}

export const useWishlistStore = create<WishlistState>((set) => ({
  items: [],
  lastFetched: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await loadWishlistCache();
      if (raw) {
        const parsed: WishlistData = JSON.parse(raw);
        set({ items: parsed.items, lastFetched: parsed.lastFetched, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },

  setItems: (items) => {
    const lastFetched = Date.now();
    persist({ items, lastFetched });
    set({ items, lastFetched });
  },
}));
