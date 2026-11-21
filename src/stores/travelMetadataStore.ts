import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  EMPTY_TRAVEL_METADATA,
  mergeTravelMetadata,
  normalizeTravelAppId,
  normalizeTravelMetadataPatch,
  parseTravelMetadata,
  parseTravelMetadataRecords,
  serializeTravelMetadata,
  type TravelMetadataPatch,
  type TravelMetadataRecord,
} from "../lib/travelMetadata";

const STORAGE_KEY = "travel_metadata.json";
const LOCAL_STORAGE_KEY = "repressurizer-travel-metadata";

interface TravelMetadataState {
  records: Record<number, TravelMetadataRecord>;
  hydrated: boolean;
  hydrating: boolean;
  saving: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setMetadata: (appId: number, patch: TravelMetadataPatch) => void;
  clearMetadata: (appId: number) => void;
  restoreAll: (records: unknown) => void;
}

/** Keep a local mirror for environments where app-data is not yet available. */
function readLocalStorage(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalStorage(data: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LOCAL_STORAGE_KEY, data);
  } catch {
    // Storage can be unavailable in private browsing or a restricted webview.
  }
}

function persist(records: Record<number, TravelMetadataRecord>): Promise<void> {
  const data = serializeTravelMetadata(records);
  writeLocalStorage(data);
  // saveAppData already serializes per-file writes. Enqueue synchronously so
  // profile transactions can discard this write if another section fails.
  return saveAppData(STORAGE_KEY, data);
}

let hydratePromise: Promise<void> | null = null;

// Edits made while the durable file is loading must be replayed over its data.
// Keep patches (rather than a whole record) so a pre-hydration edit cannot
// erase another field that was already present in durable storage. A null
// value is a tombstone, so clearMetadata cannot be undone by hydration.
const pendingChanges = new Map<number, TravelMetadataPatch | null>();

function applyPending(
  records: Record<number, TravelMetadataRecord>,
): Record<number, TravelMetadataRecord> {
  const next = { ...records };
  for (const [appId, patch] of pendingChanges) {
    if (patch === null) delete next[appId];
    else next[appId] = mergeTravelMetadata(next[appId], patch);
  }
  return next;
}

export const useTravelMetadataStore = create<TravelMetadataState>((set, get) => {
  let outstandingWrites = 0;

  const schedulePersist = (records: Record<number, TravelMetadataRecord>): void => {
    outstandingWrites += 1;
    set({ saving: true });
    void persist(records)
      .then(
        () => set({ error: null }),
        () => set({ error: "Unable to save travel metadata." }),
      )
      .finally(() => {
        outstandingWrites -= 1;
        if (outstandingWrites === 0) set({ saving: false });
      });
  };

  return {
    records: {},
    hydrated: false,
    hydrating: false,
    saving: false,
    error: null,

    hydrate: async () => {
      if (get().hydrated) return;
      if (hydratePromise) return hydratePromise;

      set({ hydrating: true, error: null });
      hydratePromise = (async () => {
        let raw: string | null;
        try {
          raw = await loadAppData(STORAGE_KEY);
        } catch {
          // A failed read must not be treated as an empty file: doing so could
          // overwrite the user's durable metadata with only pending edits.
          set({ hydrating: false, error: "Unable to load travel metadata." });
          return;
        }

        try {
          const restored = parseTravelMetadata(raw ?? readLocalStorage());
          const merged = applyPending(restored);
          const hadPendingChanges = pendingChanges.size > 0;
          const shouldMirrorLocalStorage = !readLocalStorage();
          pendingChanges.clear();
          if (hadPendingChanges || shouldMirrorLocalStorage) schedulePersist(merged);
          set({ records: merged, hydrated: true, hydrating: false, error: null });
        } catch {
          // Parsing is intentionally defensive, but preserve the same invariant
          // if a future parser becomes fallible.
          set({ hydrating: false, error: "Unable to load travel metadata." });
        }
      })().finally(() => {
        set({ hydrating: false });
        hydratePromise = null;
      });

      return hydratePromise;
    },

    restoreAll: (value) => {
      if (!get().hydrated) throw new Error("Load travel metadata before applying a profile");
      const records = parseTravelMetadataRecords(value);
      // Empty maps explicitly clear metadata; absent fields never call this.
      schedulePersist(records);
      set({ records });
    },

    setMetadata: (appId, patch) => {
      const normalizedAppId = normalizeTravelAppId(appId);
      if (normalizedAppId === null) return;
      const normalizedPatch = normalizeTravelMetadataPatch(patch);
      if (Object.keys(normalizedPatch).length === 0) return;

      const state = get();
      const current = state.records[normalizedAppId] ?? EMPTY_TRAVEL_METADATA;
      const nextRecord = mergeTravelMetadata(current, normalizedPatch);
      const next = { ...state.records, [normalizedAppId]: nextRecord };
      if (!state.hydrated) {
        const pending = pendingChanges.get(normalizedAppId);
        pendingChanges.set(normalizedAppId, {
          ...pending,
          ...normalizedPatch,
        });
      }
      set({ records: next });
      if (state.hydrated) schedulePersist(next);
    },

    clearMetadata: (appId) => {
      const normalizedAppId = normalizeTravelAppId(appId);
      if (normalizedAppId === null) return;

      const state = get();
      if (!state.hydrated) pendingChanges.set(normalizedAppId, null);
      const next = { ...state.records };
      delete next[normalizedAppId];
      set({ records: next });
      if (state.hydrated) schedulePersist(next);
    },
  };
});

export type { TravelMetadataPatch, TravelMetadataRecord } from "../lib/travelMetadata";
