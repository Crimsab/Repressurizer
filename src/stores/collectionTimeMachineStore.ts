import { enqueuePersistence } from "../lib/persistenceQueue";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { loadAppData } from "../lib/tauri";
import {
  createCollectionSnapshot,
  createTimelineEvent,
  parseCollectionSnapshot,
  parseCollectionTimelineEvent,
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
  importHistory: (snapshots: unknown[], events: unknown[]) => { snapshots: number; events: number };
  getSnapshot: (snapshotId: string) => CollectionSnapshot | null;
}

function stateData(state: CollectionTimeMachineState): PersistedTimeMachine {
  return { version: SCHEMA_VERSION, retention: state.retention, snapshots: state.snapshots, events: state.events, pinnedSnapshotIds: state.pinnedSnapshotIds };
}

let hydration: Promise<void> | null = null;
type HistoryMutation = (state: PersistedTimeMachine) => PersistedTimeMachine;
const pending: HistoryMutation[] = [];

function persist(data: PersistedTimeMachine) {
  return enqueuePersistence(STORAGE_KEY, () => JSON.stringify(data),
    (serialized) => invoke<void>("save_app_data", { key: STORAGE_KEY, data: serialized }), 300).catch(() => {});
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
      .map((event) => parseCollectionTimelineEvent(event, snapshotIds))
      .filter((event): event is CollectionTimelineEvent => Boolean(event));
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
    const pinnedSnapshotIds = Array.isArray(value.pinnedSnapshotIds)
      ? value.pinnedSnapshotIds.filter((id): id is string => typeof id === "string" && snapshotIds.has(id))
      : [];
    return prune({ version: SCHEMA_VERSION, retention, snapshots, events, pinnedSnapshotIds });
  } catch {
    return null;
  }
}

function mergeItems(state: PersistedTimeMachine, incomingSnapshots: CollectionSnapshot[], incomingEvents: CollectionTimelineEvent[]): PersistedTimeMachine {
  const snapshots = new Map(state.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  for (const snapshot of incomingSnapshots) if (!snapshots.has(snapshot.id)) snapshots.set(snapshot.id, snapshot);
  const events = new Map(state.events.map((event) => [event.id, event]));
  for (const event of incomingEvents) if (!events.has(event.id)) events.set(event.id, event);
  return prune({ ...state,
    snapshots: [...snapshots.values()].sort((a, b) => a.createdAt - b.createdAt),
    events: [...events.values()].sort((a, b) => a.occurredAt - b.occurredAt),
  });
}

function commit(operation: HistoryMutation): void {
  const state = useCollectionTimeMachineStore.getState();
  const next = operation(stateData(state));
  if (state.hydrated) void persist(next);
  else pending.push(operation);
  useCollectionTimeMachineStore.setState(next);
  if (!state.hydrated) void useCollectionTimeMachineStore.getState().hydrate();
}

export const useCollectionTimeMachineStore = create<CollectionTimeMachineState>((set, get) => ({
  version: SCHEMA_VERSION, retention: "100-snapshots", snapshots: [], events: [], pinnedSnapshotIds: [], hydrated: false,
  hydrate: () => {
    if (hydration) return hydration;
    if (get().hydrated) return Promise.resolve();
    hydration = (async () => {
      let raw: string | null;
      try { raw = await loadAppData(STORAGE_KEY); } catch { return; }
      const loaded = parsed(raw);
      if (raw !== null && !loaded) return;
      let next: PersistedTimeMachine = loaded ?? { version: SCHEMA_VERSION, retention: "100-snapshots", snapshots: [], events: [], pinnedSnapshotIds: [] };
      for (const operation of pending) next = operation(next);
      const write = pending.length ? persist(next) : Promise.resolve();
      pending.length = 0;
      set({ ...next, hydrated: true });
      await write;
    })().finally(() => { hydration = null; });
    return hydration;
  },
  recordTransition: ({ before, after, origin, steamAccountId, steamLibraryPath, deviceId, occurredAt }) => {
    const resolvedDeviceId = deviceId ?? useEntityJournalStore.getState().deviceId;
    const beforeSnapshot = createCollectionSnapshot({ collections: before, steamAccountId, steamLibraryPath, deviceId: resolvedDeviceId, createdAt: occurredAt });
    const afterSnapshot = createCollectionSnapshot({ collections: after, steamAccountId, steamLibraryPath, deviceId: resolvedDeviceId, createdAt: occurredAt });
    const event = createTimelineEvent({ before: beforeSnapshot, after: afterSnapshot, origin, occurredAt });
    if (!event) return null;
    const isDuplicate = (state: PersistedTimeMachine) => state.events.some((candidate) => candidate.beforeSnapshotId === event.beforeSnapshotId && candidate.afterSnapshotId === event.afterSnapshotId && candidate.origin === event.origin);
    if (isDuplicate(get())) return null;
    commit((state) => isDuplicate(state) ? state : mergeItems(state, [beforeSnapshot, afterSnapshot], [event]));
    useEntityJournalStore.getState().append({ entityType: "collection", entityId: "timeline", operation: "update", value: event, baseChecksum: beforeSnapshot.id });
    return event;
  },
  setRetention: (retention) => commit((state) => prune({ ...state, retention })),
  togglePinned: (snapshotId) => commit((state) => prune({ ...state, pinnedSnapshotIds: state.pinnedSnapshotIds.includes(snapshotId)
    ? state.pinnedSnapshotIds.filter((id) => id !== snapshotId) : [...state.pinnedSnapshotIds, snapshotId] })),
  addImportedSnapshot: (snapshot) => {
    const value = parseCollectionSnapshot(snapshot);
    if (!value || get().snapshots.some((candidate) => candidate.id === value.id)) return false;
    commit((state) => mergeItems(state, [value], []));
    return true;
  },
  importHistory: (incomingSnapshots, incomingEvents) => {
    const snapshots = new Map(get().snapshots.map((snapshot) => [snapshot.id, snapshot]));
    const addedSnapshots: CollectionSnapshot[] = [];
    for (const value of incomingSnapshots) {
      const snapshot = parseCollectionSnapshot(value);
      if (!snapshot || snapshots.has(snapshot.id)) continue;
      snapshots.set(snapshot.id, snapshot);
      addedSnapshots.push(snapshot);
    }
    const known = new Set(get().events.map((event) => event.id));
    const ids = new Set(snapshots.keys());
    const events: CollectionTimelineEvent[] = [];
    for (const value of incomingEvents) {
      const event = parseCollectionTimelineEvent(value, ids);
      if (!event || known.has(event.id)) continue;
      known.add(event.id);
      events.push(event);
    }
    if (addedSnapshots.length || events.length) commit((state) => mergeItems(state, addedSnapshots, events));
    return { snapshots: addedSnapshots.length, events: events.length };
  },
  getSnapshot: (snapshotId) => get().snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null,
}));
