import { create } from "zustand";
import { loadFriendsCache, saveFriendsCache } from "../lib/tauri";

export interface SavedFriend {
  steamId64: string;
  displayName: string;
  avatar?: string;
  lastCompared: number; // unix ms
  gameCount: number;
}

const MAX_FRIENDS = 10;

function persist(friends: SavedFriend[]) {
  saveFriendsCache(JSON.stringify(friends)).catch(() => {});
}

interface FriendsState {
  friends: SavedFriend[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  saveFriend: (friend: SavedFriend) => void;
  removeFriend: (steamId64: string) => void;
}

export const useFriendsStore = create<FriendsState>((set) => ({
  friends: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await loadFriendsCache();
      if (raw) {
        const parsed: SavedFriend[] = JSON.parse(raw);
        set({ friends: parsed, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },

  saveFriend: (friend) =>
    set((state) => {
      const filtered = state.friends.filter((f) => f.steamId64 !== friend.steamId64);
      const next = [friend, ...filtered].slice(0, MAX_FRIENDS);
      persist(next);
      return { friends: next };
    }),

  removeFriend: (steamId64) =>
    set((state) => {
      const next = state.friends.filter((f) => f.steamId64 !== steamId64);
      persist(next);
      return { friends: next };
    }),
}));
