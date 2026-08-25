import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  compactJournal,
  createJournalEntry,
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
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(state: Pick<EntityJournalState, "deviceId" | "nextSequence" | "entries">) {
  const payload: PersistedJournal = { version: SCHEMA_VERSION, ...state };
  void saveAppData(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
}

function parsePersisted(raw: string | null): PersistedJournal | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedJournal>;
    if (
      value.version !== SCHEMA_VERSION ||
      typeof value.deviceId !== "string" ||
      !Number.isInteger(value.nextSequence) ||
      !Array.isArray(value.entries)
    ) {
      return null;
    }
    return value as PersistedJournal;
  } catch {
    return null;
  }
}

export const useEntityJournalStore = create<EntityJournalState>((set, get) => ({
  version: SCHEMA_VERSION,
  deviceId: createDeviceId(),
  nextSequence: 1,
  entries: [],
  hydrated: false,

  hydrate: async () => {
    const loaded = parsePersisted(await loadAppData(STORAGE_KEY).catch(() => null));
    set(loaded ? { ...loaded, hydrated: true } : { hydrated: true });
  },

  append: (input) => {
    const state = get();
    const entry = createJournalEntry({
      ...input,
      deviceId: state.deviceId,
      sequence: state.nextSequence,
    });
    const entries = compactJournal([...state.entries, entry], MAX_JOURNAL_ENTRIES);
    const nextSequence = state.nextSequence + 1;
    persist({ deviceId: state.deviceId, nextSequence, entries });
    set({ entries, nextSequence });
    return entry;
  },

  entriesAfter: (sequence, deviceId) =>
    get().entries.filter(
      (entry) => entry.sequence > sequence && (!deviceId || entry.deviceId === deviceId),
    ),

  compact: (maxEntries = MAX_JOURNAL_ENTRIES) =>
    set((state) => {
      const entries = compactJournal(state.entries, maxEntries);
      persist({ deviceId: state.deviceId, nextSequence: state.nextSequence, entries });
      return { entries };
    }),
}));
