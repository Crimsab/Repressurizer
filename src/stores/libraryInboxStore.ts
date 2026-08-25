import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  autoCatProposalInboxEvent,
  detectLibraryInboxEvents,
  detectFamilyInboxEvents,
  providerHealthInboxEvents,
  libraryCollectionsChecksum,
  type InboxCategory,
  type InboxEventStatus,
  type LibraryInboxEvent,
  type LibraryInboxObservation,
  type LibraryInboxSnapshot,
} from "../lib/libraryInbox";
import type { SteamCollection } from "../lib/types";
import type { MetadataProvider, ProviderHealthRecord } from "../lib/providerHealth";

const STORAGE_KEY = "library-inbox.json";
const SCHEMA_VERSION = 1;
const MAX_EVENTS = 500;

export interface InboxActionHistoryEntry {
  id: string;
  eventIds: string[];
  action: InboxEventStatus;
  previous: Array<{ id: string; status: InboxEventStatus; snoozedUntil: number | null }>;
  at: number;
}

interface PersistedLibraryInbox {
  version: number;
  events: LibraryInboxEvent[];
  snapshot: LibraryInboxSnapshot | null;
  disabledCategories: InboxCategory[];
  history: InboxActionHistoryEntry[];
}

interface LibraryInboxState extends PersistedLibraryInbox {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  observe: (input: LibraryInboxObservation) => void;
  observeProviderHealth: (providers: Partial<Record<MetadataProvider, ProviderHealthRecord>>) => void;
  addAutoCatProposal: (name: string, matchCount: number) => void;
  recordCollectionsBaseline: (collections: SteamCollection[]) => void;
  observeFamily: (appIds: number[], observedAt?: number) => void;
  transition: (eventIds: string[], status: InboxEventStatus, snoozedUntil?: number | null) => void;
  undoLastAction: () => boolean;
  setCategoryEnabled: (category: InboxCategory, enabled: boolean) => void;
  unreadCount: () => number;
}

let hydratePromise: Promise<void> | null = null;

function persist(state: Pick<LibraryInboxState, "events" | "snapshot" | "disabledCategories" | "history">) {
  const payload: PersistedLibraryInbox = { version: SCHEMA_VERSION, ...state };
  void saveAppData(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
}

function normalizeEvent(raw: LibraryInboxEvent): LibraryInboxEvent | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.kind !== "string") return null;
  return {
    ...raw,
    status: ["unread", "reviewed", "ignored", "accepted", "snoozed"].includes(raw.status) ? raw.status : "unread",
    snoozedUntil: Number.isFinite(raw.snoozedUntil) ? raw.snoozedUntil : null,
    appIds: Array.isArray(raw.appIds) ? raw.appIds.filter(Number.isFinite).map(Math.trunc) : [],
    count: Math.max(0, Number(raw.count) || 0),
  };
}

function parsePersisted(raw: string | null): PersistedLibraryInbox | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedLibraryInbox>;
    if (value.version !== SCHEMA_VERSION || !Array.isArray(value.events)) return null;
    return {
      version: SCHEMA_VERSION,
      events: value.events.map(normalizeEvent).filter((event): event is LibraryInboxEvent => !!event),
      snapshot: value.snapshot?.version === 1 ? value.snapshot : null,
      disabledCategories: Array.isArray(value.disabledCategories) ? value.disabledCategories : [],
      history: Array.isArray(value.history) ? value.history.slice(-100) : [],
    };
  } catch {
    return null;
  }
}

function mergeEvents(
  current: LibraryInboxEvent[],
  incoming: LibraryInboxEvent[],
  disabledCategories: InboxCategory[],
): LibraryInboxEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) {
    if (disabledCategories.includes(event.category)) continue;
    const previous = byId.get(event.id);
    if (!previous) {
      byId.set(event.id, event);
      continue;
    }
    const materiallyChanged = previous.count !== event.count
      || previous.context !== event.context
      || previous.appIds.join(",") !== event.appIds.join(",");
    const snoozeExpired = previous.status === "snoozed" && (previous.snoozedUntil ?? 0) <= event.lastObservedAt;
    byId.set(event.id, {
      ...previous,
      appIds: event.appIds,
      count: event.count,
      occurredAt: materiallyChanged ? event.occurredAt : previous.occurredAt,
      lastObservedAt: event.lastObservedAt,
      source: event.source,
      confidence: event.confidence,
      importance: event.importance,
      context: event.context,
      // Repeated identical observations keep their state. A materially new
      // occurrence or an expired snooze reopens the stable row for review.
      status: materiallyChanged || snoozeExpired ? "unread" : previous.status,
      snoozedUntil: materiallyChanged || snoozeExpired ? null : previous.snoozedUntil,
    });
  }
  return [...byId.values()]
    .sort((left, right) => right.lastObservedAt - left.lastObservedAt)
    .slice(0, MAX_EVENTS);
}

export const useLibraryInboxStore = create<LibraryInboxState>((set, get) => ({
  version: SCHEMA_VERSION,
  events: [],
  snapshot: null,
  disabledCategories: [],
  history: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      const loaded = parsePersisted(await loadAppData(STORAGE_KEY).catch(() => null));
      set(loaded ? { ...loaded, hydrated: true } : { hydrated: true });
      hydratePromise = null;
    })();
    return hydratePromise;
  },

  observe: (input) => set((state) => {
    const detected = detectLibraryInboxEvents(state.snapshot, input);
    const events = mergeEvents(state.events, detected.events, state.disabledCategories);
    const next = { events, snapshot: detected.snapshot };
    persist({ ...state, ...next });
    return next;
  }),

  observeProviderHealth: (providers) => set((state) => {
    const events = mergeEvents(state.events, providerHealthInboxEvents(providers), state.disabledCategories);
    persist({ ...state, events });
    return { events };
  }),

  addAutoCatProposal: (name, matchCount) => set((state) => {
    const events = mergeEvents(state.events, [autoCatProposalInboxEvent(name, matchCount)], state.disabledCategories);
    persist({ ...state, events });
    return { events };
  }),

  recordCollectionsBaseline: (collections) => set((state) => {
    if (!state.snapshot) return state;
    const snapshot = { ...state.snapshot, collectionsChecksum: libraryCollectionsChecksum(collections) };
    persist({ ...state, snapshot });
    return { snapshot };
  }),

  observeFamily: (appIds, observedAt = Date.now()) => set((state) => {
    if (!state.snapshot) return state;
    const currentIds = [...new Set(appIds.filter(Number.isFinite).map(Math.trunc))].sort((left, right) => left - right);
    const incoming = detectFamilyInboxEvents(state.snapshot.familyAppIds, currentIds, observedAt);
    const snapshot = { ...state.snapshot, familyAppIds: currentIds, familyObservedAt: observedAt };
    const events = mergeEvents(state.events, incoming, state.disabledCategories);
    persist({ ...state, events, snapshot });
    return { events, snapshot };
  }),

  transition: (eventIds, status, snoozedUntil = null) => set((state) => {
    const ids = new Set(eventIds);
    const previous = state.events
      .filter((event) => ids.has(event.id))
      .map((event) => ({ id: event.id, status: event.status, snoozedUntil: event.snoozedUntil }));
    if (!previous.length) return state;
    const events = state.events.map((event) => ids.has(event.id) ? {
      ...event,
      status,
      snoozedUntil: status === "snoozed" ? snoozedUntil : null,
    } : event);
    const history = [...state.history, {
      id: `${Date.now()}-${status}`,
      eventIds: previous.map((item) => item.id),
      action: status,
      previous,
      at: Date.now(),
    }].slice(-100);
    persist({ ...state, events, history });
    return { events, history };
  }),

  undoLastAction: () => {
    const state = get();
    const action = state.history.at(-1);
    if (!action) return false;
    const previousById = new Map(action.previous.map((item) => [item.id, item]));
    const events = state.events.map((event) => {
      const previous = previousById.get(event.id);
      return previous ? { ...event, status: previous.status, snoozedUntil: previous.snoozedUntil } : event;
    });
    const history = state.history.slice(0, -1);
    persist({ ...state, events, history });
    set({ events, history });
    return true;
  },

  setCategoryEnabled: (category, enabled) => set((state) => {
    const disabledCategories = enabled
      ? state.disabledCategories.filter((item) => item !== category)
      : [...new Set([...state.disabledCategories, category])];
    persist({ ...state, disabledCategories });
    return { disabledCategories };
  }),

  unreadCount: () => {
    const now = Date.now();
    return get().events.filter((event) => event.status === "unread" || (event.status === "snoozed" && (event.snoozedUntil ?? 0) <= now)).length;
  },
}));
