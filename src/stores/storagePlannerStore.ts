import { create } from "zustand";
import {
  loadAppData,
  loadInstalledLibrary,
  loadStorageInventory,
  saveAppData,
} from "../lib/tauri";
import type { StorageInventory } from "../lib/types";
import type { StorageProtection } from "../lib/storagePlanner";
import { useProviderHealthStore } from "./providerHealthStore";

const KEY = "storage-planner.json";
const CACHE_VERSION = 2;

interface Protection {
  kind: StorageProtection;
  until: number | null;
}

interface PersistedStoragePlanner {
  version: typeof CACHE_VERSION;
  steamPath: string;
  inventory: StorageInventory | null;
  protections: Record<number, Protection>;
  uninstallList: number[];
}

interface StoragePlannerState {
  inventory: StorageInventory | null;
  cachedSteamPath: string;
  protections: Record<number, Protection>;
  uninstallList: number[];
  loading: boolean;
  checking: boolean;
  error: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  refresh: (steamPath: string) => Promise<void>;
  refreshIfChanged: (steamPath: string) => Promise<"cached" | "refreshed">;
  protect: (appId: number, kind: StorageProtection | null) => void;
  toggleUninstall: (appId: number) => void;
  clearList: () => void;
}

function normalizePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase();
}

function installedIds(inventory: StorageInventory): number[] {
  return [...new Set(inventory.installs.map((install) => install.appid))].sort((a, b) => a - b);
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((appId, index) => appId === right[index]);
}

function persistedState(state: StoragePlannerState): PersistedStoragePlanner {
  return {
    version: CACHE_VERSION,
    steamPath: state.cachedSteamPath,
    inventory: state.inventory,
    protections: state.protections,
    uninstallList: state.uninstallList,
  };
}

function persist(state: StoragePlannerState): void {
  void saveAppData(KEY, JSON.stringify(persistedState(state))).catch(() => {});
}

export const useStoragePlannerStore = create<StoragePlannerState>((set, get) => ({
  inventory: null,
  cachedSteamPath: "",
  protections: {},
  uninstallList: [],
  loading: false,
  checking: false,
  error: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await loadAppData(KEY);
      if (raw) {
        const value = JSON.parse(raw) as Partial<PersistedStoragePlanner> & {
          version?: number;
        };
        set({
          protections: value.protections ?? {},
          uninstallList: value.uninstallList ?? [],
          ...(value.version === CACHE_VERSION
            ? {
                inventory: value.inventory ?? null,
                cachedSteamPath: value.steamPath ?? "",
              }
            : {}),
        });
      }
    } catch {
      // A corrupt or legacy cache should never prevent a fresh scan.
    }
    set({ hydrated: true });
  },

  refresh: async (steamPath) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const inventory = await loadStorageInventory(steamPath);
      const health = useProviderHealthStore.getState();
      health.recordBatch("storage", [
        { outcome: "success" },
        ...inventory.installs.map((install) => ({
          outcome: install.totalBytes > 0 ? ("success" as const) : ("missing" as const),
          appId: install.appid,
        })),
      ]);
      set({ inventory, cachedSteamPath: steamPath, loading: false, error: null });
      persist(get());
    } catch (error) {
      useProviderHealthStore.getState().recordError("storage", error);
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  refreshIfChanged: async (steamPath) => {
    const current = get();
    if (current.loading || current.checking) return "cached";
    if (
      !current.inventory ||
      normalizePath(current.cachedSteamPath) !== normalizePath(steamPath)
    ) {
      await current.refresh(steamPath);
      return "refreshed";
    }

    set({ checking: true });
    try {
      const liveIds = [...new Set(await loadInstalledLibrary(steamPath))].sort((a, b) => a - b);
      if (!sameIds(installedIds(current.inventory), liveIds)) {
        set({ checking: false });
        await get().refresh(steamPath);
        return "refreshed";
      }
      set({ checking: false, error: null });
      return "cached";
    } catch {
      // Keep showing the last good inventory if the lightweight validation
      // cannot read Steam. A manual rescan remains available in the planner.
      set({ checking: false });
      return "cached";
    }
  },

  protect: (appId, kind) => {
    set((state) => {
      const protections = { ...state.protections };
      if (!kind) delete protections[appId];
      else {
        protections[appId] = {
          kind,
          until: kind === "30-days" ? Date.now() + 30 * 86_400_000 : null,
        };
      }
      return {
        protections,
        uninstallList: state.uninstallList.filter((id) => id !== appId),
      };
    });
    persist(get());
  },

  toggleUninstall: (appId) => {
    set((state) => ({
      uninstallList: state.uninstallList.includes(appId)
        ? state.uninstallList.filter((id) => id !== appId)
        : [...state.uninstallList, appId],
    }));
    persist(get());
  },

  clearList: () => {
    set({ uninstallList: [] });
    persist(get());
  },
}));
