import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";

const STORAGE_KEY = "app_name_overrides.json";

interface AppNameEntry {
  appid: number;
  name?: string | null;
}

interface AppNameOverrideState {
  names: Record<number, string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  mergeNames: (entries: Iterable<AppNameEntry>) => void;
  resolveName: (appid: number) => string | null;
}

function placeholderName(appId: number): string {
  return `App ${appId}`;
}

function isUsableName(appId: number, name: string | null | undefined): name is string {
  const trimmed = String(name ?? "").trim();
  return !!trimmed && trimmed !== placeholderName(appId) && trimmed !== `Unknown (#${appId})`;
}

function normalize(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== "object") return {};
  const names: Record<number, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const appId = Number(key);
    if (!Number.isFinite(appId) || appId <= 0) continue;
    if (isUsableName(appId, String(value ?? ""))) {
      names[Math.trunc(appId)] = String(value).trim();
    }
  }
  return names;
}

function persist(names: Record<number, string>) {
  saveAppData(STORAGE_KEY, JSON.stringify(names)).catch(() => {});
}

export const useAppNameOverrideStore = create<AppNameOverrideState>((set, get) => ({
  names: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const pendingNames = get().names;
    const raw = await loadAppData(STORAGE_KEY).catch(() => null);
    if (!raw) {
      set({ hydrated: true });
      if (Object.keys(pendingNames).length > 0) persist(pendingNames);
      return;
    }

    try {
      const names = { ...normalize(JSON.parse(raw)), ...pendingNames };
      set({ names, hydrated: true });
      if (Object.keys(pendingNames).length > 0) persist(names);
    } catch {
      set({ hydrated: true });
      if (Object.keys(pendingNames).length > 0) persist(pendingNames);
    }
  },

  mergeNames: (entries) => {
    const state = get();
    const next = { ...state.names };
    let changed = false;

    for (const entry of entries) {
      const appId = Math.trunc(entry.appid);
      if (!Number.isFinite(appId) || appId <= 0 || !isUsableName(appId, entry.name)) continue;
      const name = entry.name.trim();
      if (next[appId] === name) continue;
      next[appId] = name;
      changed = true;
    }

    if (!changed) return;
    set({ names: next });
    if (state.hydrated) persist(next);
  },

  resolveName: (appid) => get().names[appid]?.trim() || null,
}));
