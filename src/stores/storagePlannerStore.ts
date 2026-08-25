import { create } from "zustand";
import { loadStorageInventory, loadAppData, saveAppData } from "../lib/tauri";
import type { StorageInventory } from "../lib/types";
import type { StorageProtection } from "../lib/storagePlanner";
import { useProviderHealthStore } from "./providerHealthStore";

const KEY = "storage-planner.json";
interface Protection { kind: StorageProtection; until: number | null; }
interface StoragePlannerState { inventory: StorageInventory | null; protections: Record<number, Protection>; uninstallList: number[]; loading: boolean; error: string | null; hydrated: boolean; hydrate: () => Promise<void>; refresh: (steamPath: string) => Promise<void>; protect: (appId: number, kind: StorageProtection | null) => void; toggleUninstall: (appId: number) => void; clearList: () => void; }
function persist(state: Pick<StoragePlannerState, "protections" | "uninstallList">) { void saveAppData(KEY, JSON.stringify({ version: 1, ...state })).catch(() => {}); }
export const useStoragePlannerStore = create<StoragePlannerState>((set, get) => ({ inventory: null, protections: {}, uninstallList: [], loading: false, error: null, hydrated: false,
  hydrate: async () => { try { const raw = await loadAppData(KEY); if (raw) { const value = JSON.parse(raw); if (value.version === 1) set({ protections: value.protections ?? {}, uninstallList: value.uninstallList ?? [] }); } } catch {} set({ hydrated: true }); },
  refresh: async (steamPath) => { set({ loading: true, error: null }); try { const inventory = await loadStorageInventory(steamPath); const health = useProviderHealthStore.getState(); health.record("storage", "success"); for (const install of inventory.installs) health.record("storage", install.totalBytes > 0 ? "success" : "missing", install.appid); set({ inventory, loading: false }); } catch (error) { useProviderHealthStore.getState().recordError("storage", error); set({ loading: false, error: String(error) }); throw error; } },
  protect: (appId, kind) => set((state) => { const protections = { ...state.protections }; if (!kind) delete protections[appId]; else protections[appId] = { kind, until: kind === "30-days" ? Date.now() + 30 * 86_400_000 : null }; const next = { protections, uninstallList: state.uninstallList.filter((id) => id !== appId) }; persist(next); return next; }),
  toggleUninstall: (appId) => set((state) => { const uninstallList = state.uninstallList.includes(appId) ? state.uninstallList.filter((id) => id !== appId) : [...state.uninstallList, appId]; persist({ protections: state.protections, uninstallList }); return { uninstallList }; }),
  clearList: () => { const state = get(); persist({ protections: state.protections, uninstallList: [] }); set({ uninstallList: [] }); },
}));
