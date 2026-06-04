import { create } from "zustand";
import { loadFriendsCache, saveFriendsCache } from "../lib/tauri";

export interface SavedFriend {
  steamId64: string;
  displayName: string;
  avatar?: string;
  lastCompared: number; // unix ms
  gameCount: number;
}

const MAX_FRIENDS = 250;

function persist(friends: SavedFriend[]) {
  saveFriendsCache(JSON.stringify(friends)).catch(() => {});
}

interface FriendsState {
  friends: SavedFriend[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  saveFriend: (friend: SavedFriend) => void;
  saveFriends: (friends: SavedFriend[]) => void;
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
        for (const friend of parsed) {
          if (friend.lastCompared === 0 && friend.gameCount === 0) friend.gameCount = -1;
        }
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

  saveFriends: (friends) =>
    set((state) => {
      const merged = new Map<string, SavedFriend>();
      for (const friend of state.friends) merged.set(friend.steamId64, friend);
      for (const friend of friends) {
        const existing = merged.get(friend.steamId64);
        merged.set(friend.steamId64, {
          ...friend,
          lastCompared: existing?.lastCompared || friend.lastCompared,
          gameCount: existing?.gameCount != null && existing.gameCount >= 0 ? existing.gameCount : friend.gameCount,
        });
      }
      const next = [...merged.values()]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, MAX_FRIENDS);
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
