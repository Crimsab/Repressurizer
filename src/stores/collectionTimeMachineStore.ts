import { create } from "zustand";
import { loadAppData, saveAppData } from "../lib/tauri";
import {
  createCollectionSnapshot,
  createTimelineEvent,
  parseCollectionSnapshot,
  type CollectionChangeOrigin,
  type CollectionSnapshot,
  type CollectionTimelineEvent,
  type SnapshotRetention,
} from "../lib/collectionTimeMachine";
import type { SteamCollection } from "../lib/types";
import { useEntityJournalStore } from "./entityJournalStore";

const STORAGE_KEY = "collection-time-machine.json";
const SCHEMA_VERSION = 1;
const HARD_EVENT_LIMIT = 1_000;

interface PersistedTimeMachine {
  version: number;
  retention: SnapshotRetention;
  snapshots: CollectionSnapshot[];
  events: CollectionTimelineEvent[];
  pinnedSnapshotIds: string[];
}

interface CollectionTimeMachineState extends PersistedTimeMachine {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  recordTransition: (input: {
    before: SteamCollection[];
    after: SteamCollection[];
    origin: CollectionChangeOrigin;
    steamAccountId: string;
    steamLibraryPath?: string;
    deviceId?: string;
    occurredAt?: number;
  }) => CollectionTimelineEvent | null;
  setRetention: (retention: SnapshotRetention) => void;
  togglePinned: (snapshotId: string) => void;
  addImportedSnapshot: (snapshot: CollectionSnapshot) => boolean;
  getSnapshot: (snapshotId: string) => CollectionSnapshot | null;
}

function stateData(state: CollectionTimeMachineState): PersistedTimeMachine {
  return { version: SCHEMA_VERSION, retention: state.retention, snapshots: state.snapshots, events: state.events, pinnedSnapshotIds: state.pinnedSnapshotIds };
}

function persist(data: PersistedTimeMachine) {
  void saveAppData(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
}

function prune(data: PersistedTimeMachine, now = Date.now()): PersistedTimeMachine {
  let events = data.events;
  if (data.retention === "30-days") events = events.filter((event) => event.occurredAt >= now - 30 * 86_400_000);
  if (data.retention === "100-snapshots") events = events.slice(-100);
  events = events.slice(-HARD_EVENT_LIMIT);
  const referenced = new Set(data.pinnedSnapshotIds);
  for (const event of events) {
    referenced.add(event.beforeSnapshotId);
    referenced.add(event.afterSnapshotId);
  }
  const newestIds = data.snapshots.slice(-2).map((snapshot) => snapshot.id);
  newestIds.forEach((id) => referenced.add(id));
  return { ...data, events, snapshots: data.snapshots.filter((snapshot) => referenced.has(snapshot.id)) };
}

function parsed(raw: string | null): PersistedTimeMachine | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedTimeMachine>;
    if (value.version !== SCHEMA_VERSION || !Array.isArray(value.snapshots) || !Array.isArray(value.events)) return null;
    const snapshots = value.snapshots.map(parseCollectionSnapshot).filter((snapshot): snapshot is CollectionSnapshot => Boolean(snapshot));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
    const parsedEvents = value.events
      .filter((event) => event && snapshotIds.has(event.beforeSnapshotId) && snapshotIds.has(event.afterSnapshotId))
      .map((event) => ({ ...event, steamLibraryPath: typeof event.steamLibraryPath === "string" ? event.steamLibraryPath : "unknown" }));
    const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    const uniqueTransitions = new Map<string, CollectionTimelineEvent>();
    for (const event of parsedEvents) {
      const before = snapshotsById.get(event.beforeSnapshotId);
      // An empty-to-full Steam event is startup discovery, not known history.
      if (event.origin === "steam" && before?.collections.length === 0) continue;
      uniqueTransitions.set(`${event.beforeSnapshotId}\u001f${event.afterSnapshotId}\u001f${event.origin}`, event);
    }
    const events = [...uniqueTransitions.values()].sort((left, right) => left.occurredAt - right.occurredAt);
    const retention: SnapshotRetention = ["all", "30-days", "100-snapshots"].includes(value.retention ?? "") ? value.retention! : "100-snapshots";
    return prune({ version: SCHEMA_VERSION, retention, snapshots, events, pinnedSnapshotIds: (value.pinnedSnapshotIds ?? []).filter((id) => snapshotIds.has(id)) });
  } catch {
    return null;
  }
}

export const useCollectionTimeMachineStore = create<CollectionTimeMachineState>((set, get) => ({
  version: SCHEMA_VERSION,
  retention: "100-snapshots",
  snapshots: [],
  events: [],
  pinnedSnapshotIds: [],
  hydrated: false,

  hydrate: async () => {
    const loaded = parsed(await loadAppData(STORAGE_KEY).catch(() => null));
    set(loaded ? { ...loaded, hydrated: true } : { hydrated: true });
  },

  recordTransition: ({ before, after, origin, steamAccountId, steamLibraryPath, deviceId, occurredAt }) => {
    const resolvedDeviceId = deviceId ?? useEntityJournalStore.getState().deviceId;
    const beforeSnapshot = createCollectionSnapshot({ collections: before, steamAccountId, steamLibraryPath, deviceId: resolvedDeviceId, createdAt: occurredAt });
    const afterSnapshot = createCollectionSnapshot({ collections: after, steamAccountId, steamLibraryPath, deviceId: resolvedDeviceId, createdAt: occurredAt });
    const event = createTimelineEvent({ before: beforeSnapshot, after: afterSnapshot, origin, occurredAt });
    if (!event) return null;
    const state = get();
    if (state.events.some((candidate) => candidate.beforeSnapshotId === event.beforeSnapshotId && candidate.afterSnapshotId === event.afterSnapshotId && candidate.origin === event.origin)) return null;
    const snapshotsById = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
    if (!snapshotsById.has(beforeSnapshot.id)) snapshotsById.set(beforeSnapshot.id, beforeSnapshot);
    if (!snapshotsById.has(afterSnapshot.id)) snapshotsById.set(afterSnapshot.id, afterSnapshot);
    const next = prune({ ...stateData(state), snapshots: [...snapshotsById.values()], events: [...state.events, event] }, occurredAt);
    persist(next);
    set(next);
    useEntityJournalStore.getState().append({ entityType: "collection", entityId: "timeline", operation: "update", value: event, baseChecksum: beforeSnapshot.id });
    return event;
  },

  setRetention: (retention) => set((state) => {
    const next = prune({ ...stateData(state), retention });
    persist(next);
    return next;
  }),

  togglePinned: (snapshotId) => set((state) => {
    const pinnedSnapshotIds = state.pinnedSnapshotIds.includes(snapshotId)
      ? state.pinnedSnapshotIds.filter((id) => id !== snapshotId)
      : [...state.pinnedSnapshotIds, snapshotId];
    const next = prune({ ...stateData(state), pinnedSnapshotIds });
    persist(next);
    return next;
  }),

  addImportedSnapshot: (snapshot) => {
    const parsedSnapshot = parseCollectionSnapshot(snapshot);
    if (!parsedSnapshot || get().snapshots.some((candidate) => candidate.id === parsedSnapshot.id)) return false;
    set((state) => {
      const next = prune({ ...stateData(state), snapshots: [...state.snapshots, parsedSnapshot] });
      persist(next);
      return next;
    });
    return true;
  },

  getSnapshot: (snapshotId) => get().snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null,
}));
