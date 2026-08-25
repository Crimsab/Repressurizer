import type { SteamCollection } from "./types";
import { canonicalJson, entityChecksum } from "./entityJournal";

export const COLLECTION_SNAPSHOT_VERSION = 1 as const;

export type CollectionChangeOrigin = "manual" | "autocat" | "import" | "restore" | "sync" | "steam";
export type SnapshotRetention = "all" | "30-days" | "100-snapshots";
export type SelectiveRestoreMode = "full" | "collection" | "added" | "removed" | "rename";

export interface CollectionSnapshot {
  version: typeof COLLECTION_SNAPSHOT_VERSION;
  id: string;
  createdAt: number;
  steamAccountId: string;
  deviceId: string;
  collections: SteamCollection[];
}

export interface CollectionFieldChange {
  identity: string;
  before: SteamCollection | null;
  after: SteamCollection | null;
  renamed: boolean;
  colorChanged: boolean;
  orderChanged: boolean;
  addedGameIds: number[];
  removedGameIds: number[];
}

export interface CollectionSnapshotDiff {
  changes: CollectionFieldChange[];
  created: number;
  deleted: number;
  renamed: number;
  colors: number;
  reordered: number;
  gamesAdded: number;
  gamesRemoved: number;
}

export interface CollectionTimelineEvent {
  id: string;
  occurredAt: number;
  steamAccountId: string;
  deviceId: string;
  origin: CollectionChangeOrigin;
  beforeSnapshotId: string;
  afterSnapshotId: string;
  diff: Omit<CollectionSnapshotDiff, "changes">;
}

function collectionBaseIdentity(collection: SteamCollection): string {
  if (collection.key) return `key:${collection.key}`;
  if (collection.id) return `id:${collection.id}`;
  return `anonymous:${entityChecksum(collection)}`;
}

function indexed(collections: SteamCollection[]): Map<string, { collection: SteamCollection; index: number }> {
  const seen = new Map<string, number>();
  const result = new Map<string, { collection: SteamCollection; index: number }>();
  collections.forEach((collection, index) => {
    const base = collectionBaseIdentity(collection);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    result.set(occurrence === 0 ? base : `${base}#${occurrence}`, { collection, index });
  });
  return result;
}

function collectionColor(collection: SteamCollection): unknown {
  const record = collection as SteamCollection & Record<string, unknown>;
  return record.color ?? record.color_hex ?? null;
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite).map(Math.trunc))].sort((left, right) => left - right);
}

export function collectionStateChecksum(collections: SteamCollection[]): string {
  return entityChecksum(collections);
}

export function createCollectionSnapshot(input: {
  collections: SteamCollection[];
  steamAccountId: string;
  deviceId: string;
  createdAt?: number;
}): CollectionSnapshot {
  const collections = structuredClone(input.collections);
  const checksum = collectionStateChecksum(collections);
  return {
    version: COLLECTION_SNAPSHOT_VERSION,
    id: `collection-snapshot:${checksum}`,
    createdAt: input.createdAt ?? Date.now(),
    steamAccountId: input.steamAccountId,
    deviceId: input.deviceId,
    collections,
  };
}

export function diffCollectionSnapshots(before: SteamCollection[], after: SteamCollection[]): CollectionSnapshotDiff {
  const left = indexed(before);
  const right = indexed(after);
  const identities = [...new Set([...left.keys(), ...right.keys()])];
  const changes: CollectionFieldChange[] = [];

  for (const identity of identities) {
    const previous = left.get(identity);
    const next = right.get(identity);
    const previousGames = new Set(previous?.collection.added ?? []);
    const nextGames = new Set(next?.collection.added ?? []);
    const addedGameIds = sortedUnique([...nextGames].filter((appId) => !previousGames.has(appId)));
    const removedGameIds = sortedUnique([...previousGames].filter((appId) => !nextGames.has(appId)));
    const renamed = Boolean(previous && next && previous.collection.name !== next.collection.name);
    const colorChanged = Boolean(previous && next && canonicalJson(collectionColor(previous.collection)) !== canonicalJson(collectionColor(next.collection)));
    const orderChanged = Boolean(previous && next && previous.index !== next.index);
    if (!previous || !next || renamed || colorChanged || orderChanged || addedGameIds.length || removedGameIds.length) {
      changes.push({
        identity,
        before: previous ? structuredClone(previous.collection) : null,
        after: next ? structuredClone(next.collection) : null,
        renamed,
        colorChanged,
        orderChanged,
        addedGameIds,
        removedGameIds,
      });
    }
  }

  return {
    changes,
    created: changes.filter((change) => !change.before && change.after).length,
    deleted: changes.filter((change) => change.before && !change.after).length,
    renamed: changes.filter((change) => change.renamed).length,
    colors: changes.filter((change) => change.colorChanged).length,
    reordered: changes.filter((change) => change.orderChanged).length,
    gamesAdded: changes.reduce((sum, change) => sum + change.addedGameIds.length, 0),
    gamesRemoved: changes.reduce((sum, change) => sum + change.removedGameIds.length, 0),
  };
}

export function summarizeCollectionDiff(diff: CollectionSnapshotDiff): Omit<CollectionSnapshotDiff, "changes"> {
  const { changes: _changes, ...summary } = diff;
  return summary;
}

export function createTimelineEvent(input: {
  before: CollectionSnapshot;
  after: CollectionSnapshot;
  origin: CollectionChangeOrigin;
  occurredAt?: number;
}): CollectionTimelineEvent | null {
  if (input.before.id === input.after.id) return null;
  const diff = diffCollectionSnapshots(input.before.collections, input.after.collections);
  const occurredAt = input.occurredAt ?? Date.now();
  return {
    id: `collection-event:${entityChecksum([input.before.id, input.after.id, input.origin, occurredAt])}`,
    occurredAt,
    steamAccountId: input.after.steamAccountId,
    deviceId: input.after.deviceId,
    origin: input.origin,
    beforeSnapshotId: input.before.id,
    afterSnapshotId: input.after.id,
    diff: summarizeCollectionDiff(diff),
  };
}

function replaceCollection(current: SteamCollection[], identity: string, target: SteamCollection | null): SteamCollection[] {
  const currentIndex = indexed(current).get(identity)?.index ?? -1;
  if (!target) return currentIndex < 0 ? current : current.filter((_, index) => index !== currentIndex);
  if (currentIndex < 0) return [...current, structuredClone(target)];
  return current.map((collection, index) => index === currentIndex ? structuredClone(target) : collection);
}

export function buildSelectiveRestore(input: {
  current: SteamCollection[];
  target: SteamCollection[];
  mode: SelectiveRestoreMode;
  identity?: string | null;
}): SteamCollection[] {
  if (input.mode === "full") return structuredClone(input.target);
  const diff = diffCollectionSnapshots(input.current, input.target);
  let result = structuredClone(input.current);
  const selected = input.identity ? diff.changes.filter((change) => change.identity === input.identity) : diff.changes;

  for (const change of selected) {
    if (input.mode === "collection") {
      result = replaceCollection(result, change.identity, change.after);
      continue;
    }
    const currentEntry = indexed(result).get(change.identity);
    if (!currentEntry || !change.after) continue;
    if (input.mode === "rename" && change.renamed) {
      result[currentEntry.index] = { ...currentEntry.collection, name: change.after.name };
    } else if (input.mode === "added") {
      result[currentEntry.index] = { ...currentEntry.collection, added: sortedUnique([...currentEntry.collection.added, ...change.addedGameIds]) };
    } else if (input.mode === "removed") {
      const removals = new Set(change.removedGameIds);
      result[currentEntry.index] = { ...currentEntry.collection, added: currentEntry.collection.added.filter((appId) => !removals.has(appId)) };
    }
  }
  return result;
}

export function parseCollectionSnapshot(value: unknown): CollectionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<CollectionSnapshot>;
  if (snapshot.version !== COLLECTION_SNAPSHOT_VERSION || !Array.isArray(snapshot.collections)) return null;
  if (typeof snapshot.steamAccountId !== "string" || typeof snapshot.deviceId !== "string") return null;
  return createCollectionSnapshot({
    collections: snapshot.collections,
    steamAccountId: snapshot.steamAccountId,
    deviceId: snapshot.deviceId,
    createdAt: Number.isFinite(snapshot.createdAt) ? snapshot.createdAt : Date.now(),
  });
}
