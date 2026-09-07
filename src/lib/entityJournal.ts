import { stableEventId } from "./providerHealth";

export type JournalEntityType =
  | "collection"
  | "diary-entry"
  | "autocat-rule"
  | "planner-preset"
  | "tonight-queue"
  | "preference"
  | "profile";

export type JournalOperation = "create" | "update" | "delete";

export interface EntityJournalEntry {
  id: string;
  deviceId: string;
  sequence: number;
  entityType: JournalEntityType;
  entityId: string;
  operation: JournalOperation;
  changedAt: number;
  baseChecksum: string | null;
  checksum: string;
}

const JOURNAL_ENTITY_TYPES: JournalEntityType[] = [
  "collection",
  "diary-entry",
  "autocat-rule",
  "planner-preset",
  "tonight-queue",
  "preference",
  "profile",
];
const JOURNAL_OPERATIONS: JournalOperation[] = ["create", "update", "delete"];

/** Validate an entry before it is allowed into the durable journal. */
export function parseEntityJournalEntry(value: unknown): EntityJournalEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Partial<EntityJournalEntry>;
  const { id, deviceId, sequence, entityType, entityId, operation, changedAt, baseChecksum, checksum } = entry;
  if (typeof id !== "string" || !id || id.length > 512 ||
      typeof deviceId !== "string" || !deviceId || deviceId.length > 256 ||
      typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER - 1 ||
      !JOURNAL_ENTITY_TYPES.includes(entityType as JournalEntityType) ||
      typeof entityId !== "string" || !entityId || entityId.length > 2048 ||
      !JOURNAL_OPERATIONS.includes(operation as JournalOperation) ||
      typeof changedAt !== "number" || !Number.isFinite(changedAt) ||
      (baseChecksum !== null && typeof baseChecksum !== "string") ||
      typeof checksum !== "string" || !checksum) return null;
  return {
    id,
    deviceId,
    sequence,
    entityType: entityType as JournalEntityType,
    entityId,
    operation: operation as JournalOperation,
    changedAt,
    baseChecksum: baseChecksum ?? null,
    checksum,
  };
}

/**
 * Move a locally-created entry onto the durable device sequence discovered
 * during hydration. The value is intentionally not replayed: the journal is
 * an audit trail and does not contain enough data to safely reapply commands.
 */
export function rebaseJournalEntry(entry: EntityJournalEntry, deviceId: string, sequence: number): EntityJournalEntry {
  return {
    ...entry,
    deviceId,
    sequence,
    id: stableEventId([deviceId, sequence, entry.entityType, entry.entityId, entry.operation, entry.checksum]),
  };
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJson(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function entityChecksum(value: unknown): string {
  return stableEventId([canonicalJson(value)]).replace(/^evt_/, "sum_");
}

export function createJournalEntry({
  deviceId,
  sequence,
  entityType,
  entityId,
  operation,
  value,
  baseChecksum = null,
  changedAt = Date.now(),
}: {
  deviceId: string;
  sequence: number;
  entityType: JournalEntityType;
  entityId: string;
  operation: JournalOperation;
  value: unknown;
  baseChecksum?: string | null;
  changedAt?: number;
}): EntityJournalEntry {
  const checksum = operation === "delete" ? entityChecksum(null) : entityChecksum(value);
  return {
    id: stableEventId([deviceId, sequence, entityType, entityId, operation, checksum]),
    deviceId,
    sequence,
    entityType,
    entityId,
    operation,
    changedAt,
    baseChecksum,
    checksum,
  };
}

export function compactJournal(
  entries: EntityJournalEntry[],
  maxEntries: number,
): EntityJournalEntry[] {
  const limit = Math.max(1, Math.trunc(maxEntries));
  if (entries.length <= limit) return entries;
  const latestByEntity = new Map<string, EntityJournalEntry>();
  for (const entry of entries) {
    latestByEntity.set(`${entry.entityType}:${entry.entityId}`, entry);
  }
  const requiredIds = new Set([...latestByEntity.values()].map((entry) => entry.id));
  const retained = entries.slice(-limit);
  for (const entry of entries) {
    if (requiredIds.has(entry.id) && !retained.some((candidate) => candidate.id === entry.id)) {
      retained.push(entry);
    }
  }
  return retained.sort((left, right) => left.sequence - right.sequence);
}
