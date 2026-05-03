import { create } from "zustand";
import { loadAchievementsCache, saveAchievementsCache } from "../lib/tauri";
import type { AchievementSummary } from "../lib/types";

// Only persist summary counts (total/achieved) — full achievement lists are large
// and fetched on demand in GameDetailPage. This avoids localStorage overflow.
interface PersistedSummary {
  total: number;
  achieved: number;
}

function persist(summaries: Record<number, AchievementSummary>) {
  // Strip full achievement arrays for persistence — only keep counts
  const slim: Record<number, PersistedSummary> = {};
  for (const [id, s] of Object.entries(summaries)) {
    slim[Number(id)] = { total: s.total, achieved: s.achieved };
  }
  saveAchievementsCache(JSON.stringify(slim)).catch(() => {});
}

interface AchievementsState {
  summaries: Record<number, AchievementSummary>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSummary: (appId: number, summary: AchievementSummary) => void;
  getSummary: (appId: number) => AchievementSummary | null;
}

export const useAchievementsStore = create<AchievementsState>((set, get) => ({
  summaries: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await loadAchievementsCache();
      if (raw) {
        const parsed: Record<string, PersistedSummary> = JSON.parse(raw);
        // Restore as AchievementSummary with empty achievements array
        const summaries: Record<number, AchievementSummary> = {};
        for (const [id, s] of Object.entries(parsed)) {
          summaries[Number(id)] = { total: s.total, achieved: s.achieved, achievements: [] };
        }
        set({ summaries, hydrated: true });
        return;
      }
    } catch {}
    // Also try migrating from localStorage
    try {
      const raw = localStorage.getItem("repressurizer-achievements");
      if (raw) {
        const parsed = JSON.parse(raw);
        const summaries: Record<number, AchievementSummary> = {};
        for (const [id, s] of Object.entries(parsed) as [string, any][]) {
          summaries[Number(id)] = { total: s.total, achieved: s.achieved, achievements: [] };
        }
        set({ summaries, hydrated: true });
        persist(summaries);
        localStorage.removeItem("repressurizer-achievements");
        return;
      }
    } catch {}
    set({ hydrated: true });
  },

  setSummary: (appId, summary) =>
    set((state) => {
      const next = { ...state.summaries, [appId]: summary };
      persist(next);
      return { summaries: next };
    }),

  getSummary: (appId) => get().summaries[appId] ?? null,
}));
