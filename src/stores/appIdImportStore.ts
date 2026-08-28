import { create } from "zustand";
import {
  MAX_APP_ID_IMPORT_ENTRIES,
  type AppIdImportBatch,
  type AppIdImportMetadataPolicy,
  type AppIdImportOperation,
  type AppIdImportScope,
  uniqueSortedIds,
} from "../lib/appIdImport";
import { loadAppData, saveAppData } from "../lib/tauri";

const STORAGE_KEY = "app-id-imports.json";
const SCHEMA_VERSION = 1;
const MAX_SAVED_IMPORTS = 20;

interface AppIdImportState {
  batches: AppIdImportBatch[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsert: (batch: AppIdImportBatch) => void;
  deactivate: (id: string) => void;
  remove: (id: string) => void;
}

function persist(batches: AppIdImportBatch[]) {
  void saveAppData(STORAGE_KEY, JSON.stringify({
    version: SCHEMA_VERSION,
    batches: batches.slice(0, MAX_SAVED_IMPORTS),
  })).catch(() => {});
}

function parseBatch(value: unknown): AppIdImportBatch | null {
  if (!value || typeof value !== "object") return null;
  const batch = value as Partial<AppIdImportBatch>;
  const scopes = new Set<AppIdImportScope>(["owned", "reference", "local"]);
  const operations = new Set<AppIdImportOperation>(["append", "replace", "subtract", "intersect"]);
  const metadataPolicies = new Set<AppIdImportMetadataPolicy>(["none", "cached", "on-demand", "background"]);
  if (
    typeof batch.id !== "string" || !batch.id ||
    typeof batch.name !== "string" ||
    typeof batch.targetKey !== "string" || !batch.targetKey ||
    typeof batch.targetName !== "string" ||
    !scopes.has(batch.scope as AppIdImportScope) ||
    !operations.has(batch.operation as AppIdImportOperation) ||
    !metadataPolicies.has(batch.metadataPolicy as AppIdImportMetadataPolicy) ||
    !Array.isArray(batch.appIds) || batch.appIds.length > MAX_APP_ID_IMPORT_ENTRIES
  ) return null;

  const appIds = uniqueSortedIds(batch.appIds);
  return {
    id: batch.id,
    name: batch.name.slice(0, 120),
    sourceName: String(batch.sourceName ?? "").slice(0, 260),
    sourceHash: String(batch.sourceHash ?? ""),
    appIds,
    targetKey: batch.targetKey,
    targetName: batch.targetName.slice(0, 120),
    scope: batch.scope as AppIdImportScope,
    operation: batch.operation as AppIdImportOperation,
    metadataPolicy: batch.metadataPolicy as AppIdImportMetadataPolicy,
    backgroundLimit: Math.max(1, Math.min(500, Math.trunc(Number(batch.backgroundLimit) || 50))),
    autoUpdate: batch.autoUpdate === true,
    beforeIds: uniqueSortedIds(Array.isArray(batch.beforeIds) ? batch.beforeIds : []),
    afterIds: uniqueSortedIds(Array.isArray(batch.afterIds) ? batch.afterIds : []),
    createdAt: Number(batch.createdAt) || Date.now(),
    updatedAt: Number(batch.updatedAt) || Number(batch.createdAt) || Date.now(),
    active: batch.active !== false,
  };
}

function parsePersisted(raw: string | null): AppIdImportBatch[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { version?: number; batches?: unknown[] };
    if (value.version !== SCHEMA_VERSION || !Array.isArray(value.batches)) return [];
    return value.batches.flatMap((batch) => {
      const parsed = parseBatch(batch);
      return parsed ? [parsed] : [];
    }).slice(0, MAX_SAVED_IMPORTS);
  } catch {
    return [];
  }
}

export const useAppIdImportStore = create<AppIdImportState>((set, get) => ({
  batches: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const batches = parsePersisted(await loadAppData(STORAGE_KEY).catch(() => null));
    set({ batches, hydrated: true });
  },
  upsert: (batch) => set((state) => {
    const batches = [batch, ...state.batches.filter((item) => item.id !== batch.id)]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_SAVED_IMPORTS);
    persist(batches);
    return { batches };
  }),
  deactivate: (id) => set((state) => {
    const batches = state.batches.map((batch) => batch.id === id
      ? { ...batch, active: false, autoUpdate: false, updatedAt: Date.now() }
      : batch);
    persist(batches);
    return { batches };
  }),
  remove: (id) => set((state) => {
    const batches = state.batches.filter((batch) => batch.id !== id);
    persist(batches);
    return { batches };
  }),
}));
