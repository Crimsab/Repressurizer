import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  compactJournal,
  createJournalEntry,
  parseEntityJournalEntry,
  rebaseJournalEntry,
  type EntityJournalEntry,
  type JournalEntityType,
  type JournalOperation,
} from "../lib/entityJournal";

const STORAGE_KEY = "entity-journal.json";
const SCHEMA_VERSION = 1;
const MAX_JOURNAL_ENTRIES = 5_000;

interface PersistedJournal {
  version: number;
  deviceId: string;
  nextSequence: number;
  entries: EntityJournalEntry[];
}

interface EntityJournalState extends PersistedJournal {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  append: (input: {
    entityType: JournalEntityType;
    entityId: string;
    operation: JournalOperation;
    value: unknown;
    baseChecksum?: string | null;
  }) => EntityJournalEntry;
  entriesAfter: (sequence: number, deviceId?: string) => EntityJournalEntry[];
  compact: (maxEntries?: number) => void;
  importEntries: (entries: unknown[]) => number;
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(state: Pick<EntityJournalState, "deviceId" | "nextSequence" | "entries">) {
  const payload: PersistedJournal = { version: SCHEMA_VERSION, deviceId: state.deviceId, nextSequence: state.nextSequence, entries: state.entries };
  return saveAppData(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
}

function parsePersisted(raw: string | null): PersistedJournal | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedJournal>;
    const nextSequence = value.nextSequence;
    if (
      value.version !== SCHEMA_VERSION ||
      typeof value.deviceId !== "string" || !value.deviceId || value.deviceId.length > 256 ||
      typeof nextSequence !== "number" || !Number.isSafeInteger(nextSequence) || nextSequence < 1 || nextSequence > Number.MAX_SAFE_INTEGER - 1 ||
      !Array.isArray(value.entries)
    ) {
      return null;
    }
    const entries = value.entries.map(parseEntityJournalEntry).filter((entry): entry is EntityJournalEntry => Boolean(entry));
    return {
      version: SCHEMA_VERSION,
      deviceId: value.deviceId,
      nextSequence,
      entries: compactJournal(entries, MAX_JOURNAL_ENTRIES),
    };
  } catch {
    return null;
  }
}

function mergeEntries(
  loaded: PersistedJournal,
  current: PersistedJournal,
): PersistedJournal {
  const deviceId = loaded.deviceId;
  const byId = new Map<string, EntityJournalEntry>();
  const occupied = new Set<string>();
  const add = (entry: EntityJournalEntry) => {
    const key = `${entry.deviceId}\u001f${entry.sequence}`;
    const existing = byId.get(entry.id);
    if (existing) return;
    // A device/sequence pair is an identity even if a malformed or imported
    // entry carries a different ID. Keep the first verified entry and discard
    // the collision instead of allowing a future sync replay ambiguity.
    if (occupied.has(key)) return;
    byId.set(entry.id, entry);
    occupied.add(key);
  };
  for (const entry of loaded.entries) add(entry);
  for (const entry of current.entries) add(entry);
  const entries = compactJournal([...byId.values()], MAX_JOURNAL_ENTRIES);
  const nextSequence = entries.reduce((next, entry) =>
    entry.deviceId === deviceId ? Math.max(next, entry.sequence + 1) : next, loaded.nextSequence);
  return { version: SCHEMA_VERSION, deviceId, nextSequence, entries };
}

export const useEntityJournalStore = create<EntityJournalState>((set, get) => {
  let hydration: Promise<void> | null = null;
  const pendingAppends: EntityJournalEntry[] = [];
  let pendingChange = false;
  const changed = () => {
    const state = get();
    if (state.hydrated) void persist(state);
    else {
      pendingChange = true;
      void get().hydrate();
    }
  };
  return {
    version: SCHEMA_VERSION,
    deviceId: createDeviceId(),
    nextSequence: 1,
    entries: [],
    hydrated: false,

    hydrate: () => {
      if (hydration) return hydration;
      if (get().hydrated) return Promise.resolve();
      hydration = Promise.resolve().then(async () => {
        let raw: string | null;
        try { raw = await loadAppData(STORAGE_KEY); } catch { return; }
        const current = get();
        const parsed = parsePersisted(raw);
        if (raw !== null && !parsed) return;
        const loaded = parsed ?? {
          version: SCHEMA_VERSION, deviceId: current.deviceId, nextSequence: 1, entries: [],
        };
        const pendingIds = new Set(pendingAppends.map((entry) => entry.id));
        // Imported entries keep their original identity; only this session's
        // appends need sequences allocated after the durable device's tail.
        const merged = mergeEntries(loaded, {
          ...current, entries: current.entries.filter((entry) => !pendingIds.has(entry.id)),
        });
        let sequence = merged.nextSequence;
        if (pendingAppends.length > Number.MAX_SAFE_INTEGER - 1 - sequence) return;
        const rebased = pendingAppends.map((entry) => rebaseJournalEntry(entry, merged.deviceId, sequence++));
        merged.entries = compactJournal([...merged.entries, ...rebased], MAX_JOURNAL_ENTRIES);
        merged.nextSequence = sequence;
        const saved = pendingChange ? persist(merged) : Promise.resolve();
        pendingAppends.length = 0;
        pendingChange = false;
        set({ ...merged, hydrated: true });
        await saved;
      }).finally(() => { hydration = null; });
      return hydration;
    },

    append: (input) => {
      const state = get();
      if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence >= Number.MAX_SAFE_INTEGER - 1) {
        throw new Error("Entity journal sequence exhausted");
      }
      const entry = createJournalEntry({ ...input, deviceId: state.deviceId, sequence: state.nextSequence });
      if (!state.hydrated) pendingAppends.push(entry);
      const entries = compactJournal([...state.entries, entry], MAX_JOURNAL_ENTRIES);
      set({ entries, nextSequence: state.nextSequence + 1 });
      changed();
      return entry;
    },

    entriesAfter: (sequence, deviceId) =>
      get().entries.filter(
        (entry) => entry.sequence > sequence && (!deviceId || entry.deviceId === deviceId),
      ),

    compact: (maxEntries = MAX_JOURNAL_ENTRIES) => {
      set({ entries: compactJournal(get().entries, maxEntries) });
      changed();
    },

    importEntries: (incoming) => {
      const parsed = incoming.map(parseEntityJournalEntry).filter((entry): entry is EntityJournalEntry => Boolean(entry));
      if (parsed.length === 0) return 0;
      let imported = 0;
      set((state) => {
        const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
        const occupied = new Set(state.entries.map((entry) => `${entry.deviceId}\u001f${entry.sequence}`));
        let nextSequence = state.nextSequence;
        for (const entry of parsed) {
          if (byId.has(entry.id)) continue;
          const key = `${entry.deviceId}\u001f${entry.sequence}`;
          if (occupied.has(key)) continue;
          byId.set(entry.id, entry);
          occupied.add(key);
          if (entry.deviceId === state.deviceId) nextSequence = Math.max(nextSequence, entry.sequence + 1);
          imported += 1;
        }
        if (imported === 0) return state;
        const entries = compactJournal([...byId.values()], MAX_JOURNAL_ENTRIES);
        return { entries, nextSequence };
      });
      if (imported > 0) changed();
      return imported;
    },
  };
});
