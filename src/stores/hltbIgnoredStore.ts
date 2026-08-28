import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "./gameStore";
import { HLTB_MAX_FAILS } from "../lib/fetchGuards";

const STORAGE_KEY = "repressurizer-hltb-ignored";
const PERSISTED_VERSION = 2;
const PROVIDER_REVISION = "site-search-v1";

interface PersistedHltbIgnored {
  version: typeof PERSISTED_VERSION;
  providerRevision: typeof PROVIDER_REVISION;
  fails: Record<number, number>;
}

export function parseHltbIgnored(raw: string | null): Record<number, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedHltbIgnored>;
    if (
      parsed.version !== PERSISTED_VERSION ||
      parsed.providerRevision !== PROVIDER_REVISION ||
      !parsed.fails ||
      typeof parsed.fails !== "object" ||
      Array.isArray(parsed.fails)
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.fails).filter(
        ([appId, count]) => /^\d+$/.test(appId) && Number.isFinite(count) && count > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function serializeHltbIgnored(fails: Record<number, number>): string {
  return JSON.stringify({
    version: PERSISTED_VERSION,
    providerRevision: PROVIDER_REVISION,
    fails,
  } satisfies PersistedHltbIgnored);
}

function loadIgnored(): Record<number, number> {
  try {
    return parseHltbIgnored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function saveIgnored(fails: Record<number, number>) {
  const data = serializeHltbIgnored(fails);
  try {
    localStorage.setItem(STORAGE_KEY, data);
  } catch {}
  invoke("save_app_data", { key: "hltb_ignored.json", data }).catch(() => {});
}

/** After this many confirmed "not found" results, auto-ignore the game */
export { HLTB_MAX_FAILS };

interface HltbIgnoredState {
  fails: Record<number, number>;
  recordNotFound: (appId: number) => void;
  resetGame: (appId: number) => void;
  resetAll: () => void;
  isIgnored: (appId: number) => boolean;
  ignoredIds: () => number[];
  hydrate: () => Promise<void>;
}

export const useHltbIgnoredStore = create<HltbIgnoredState>((set, get) => ({
  fails: loadIgnored(),

  recordNotFound: (appId) =>
    set((state) => {
      const count = (state.fails[appId] ?? 0) + 1;
      const next = { ...state.fails, [appId]: count };
      saveIgnored(next);
      return { fails: next };
    }),

  resetGame: (appId) =>
    set((state) => {
      const next = { ...state.fails };
      delete next[appId];
      saveIgnored(next);
      return { fails: next };
    }),

  resetAll: () => {
    saveIgnored({});
    set({ fails: {} });
  },

  isIgnored: (appId) => (get().fails[appId] ?? 0) >= HLTB_MAX_FAILS,

  ignoredIds: () =>
    Object.entries(get().fails)
      .filter(([, count]) => count >= HLTB_MAX_FAILS)
      .map(([id]) => Number(id)),

  hydrate: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "hltb_ignored.json" });
      if (raw) {
        const parsed = parseHltbIgnored(raw);
        const local = get().fails;
        const merged = { ...local };
        for (const [appId, count] of Object.entries(parsed)) {
          merged[Number(appId)] = Math.max(merged[Number(appId)] ?? 0, count);
        }
        set({ fails: merged });
        saveIgnored(merged);
      }
    } catch {}
  },
}));

/** Human-readable name for an ignored game, falls back to appId */
export function getHltbIgnoredGameName(appId: number): string {
  const games = useGameStore.getState().games;
  return String(games[appId]?.name ?? `App #${appId}`);
}
