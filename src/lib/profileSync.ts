import { parseTravelMetadataRecords } from "./travelMetadata";
import { canonicalJson, entityChecksum, type EntityJournalEntry, type JournalEntityType, type JournalOperation } from "./entityJournal";
import { createRepressurizerProfile, parseRepressurizerProfile, type RepressurizerProfileDocument } from "./repressurizerProfile";

export const PROFILE_SYNC_SCHEMA = 1 as const;

export interface ProfileSyncEnvelope {
  schemaVersion: typeof PROFILE_SYNC_SCHEMA;
  deviceId: string;
  sequence: number;
  writtenAt: number;
  previousChecksum: string | null;
  profile: RepressurizerProfileDocument;
  journal: EntityJournalEntry[];
  checksum: string;
}

export interface ProfileSyncConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

export interface ProfileSyncMerge {
  merged: RepressurizerProfileDocument;
  conflicts: ProfileSyncConflict[];
  changedItems: number;
}

export interface ProfileEntityChange { entityType: JournalEntityType; entityId: string; operation: JournalOperation; value: unknown; baseChecksum: string | null; }

const MISSING = Symbol("missing");

function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function stableArrayKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  for (const key of ["id", "key", "appId", "appid"]) {
    if (typeof item[key] === "string" || typeof item[key] === "number") return `${key}:${String(item[key])}`;
  }
  return null;
}

function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, conflicts: ProfileSyncConflict[]): unknown {
  if (equal(local, remote)) return structuredClone(local);
  if (equal(local, base)) return structuredClone(remote);
  if (equal(remote, base)) return structuredClone(local);

  if (Array.isArray(local) && Array.isArray(remote) && (Array.isArray(base) || base === undefined)) {
    const arrays = [base ?? [], local, remote] as unknown[][];
    const keyed = arrays.every((items) => items.every((item) => stableArrayKey(item) !== null));
    if (keyed) {
      const maps = arrays.map((items) => new Map(items.map((item) => [stableArrayKey(item)!, item])));
      const keys = [...new Set(arrays.flatMap((items) => items.map((item) => stableArrayKey(item)!)))];
      return keys.flatMap((key) => {
        const b = maps[0].get(key) ?? MISSING; const l = maps[1].get(key) ?? MISSING; const r = maps[2].get(key) ?? MISSING;
        const value = mergeValue(b === MISSING ? undefined : b, l === MISSING ? undefined : l, r === MISSING ? undefined : r, `${path}[${key}]`, conflicts);
        return value === undefined ? [] : [value];
      });
    }
  }

  const objects = [base, local, remote].every((value) => value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value)));
  if (objects && local !== undefined && remote !== undefined) {
    const baseObject = (base ?? {}) as Record<string, unknown>; const localObject = local as Record<string, unknown>; const remoteObject = remote as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(baseObject), ...Object.keys(localObject), ...Object.keys(remoteObject)])) {
      const value = mergeValue(baseObject[key], localObject[key], remoteObject[key], path ? `${path}.${key}` : key, conflicts);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  conflicts.push({ path, base: structuredClone(base), local: structuredClone(local), remote: structuredClone(remote) });
  return structuredClone(local);
}

function travelRecords(sections: RepressurizerProfileDocument["sections"]): unknown {
  return (sections.preferences as Record<string, unknown> | undefined)?.travel;
}

function withTravelRecords(sections: RepressurizerProfileDocument["sections"], fallback: unknown): RepressurizerProfileDocument["sections"] {
  const own = travelRecords(sections);
  const value = own === undefined ? fallback : own;
  if (value === undefined) return sections;
  return { ...sections, preferences: { ...(sections.preferences as Record<string, unknown> | undefined), travel: parseTravelMetadataRecords(value) } };
}

export function mergeProfileDocuments(base: RepressurizerProfileDocument | null, local: RepressurizerProfileDocument, remote: RepressurizerProfileDocument): ProfileSyncMerge {
  const conflicts: ProfileSyncConflict[] = [];
  const baseSections = base?.sections ?? {};
  const baseTravel = travelRecords(baseSections);
  const localTravel = travelRecords(local.sections);
  const remoteTravel = travelRecords(remote.sections);
  // Older clients/profiles omit this optional extension: omission is not a
  // deletion. An explicit empty map still participates in three-way deletes.
  const fallback = baseTravel !== undefined ? baseTravel : localTravel !== undefined ? localTravel : remoteTravel;
  const mergedSections = mergeValue(withTravelRecords(baseSections, undefined),
    withTravelRecords(local.sections, fallback), withTravelRecords(remote.sections, fallback),
    "sections", conflicts) as RepressurizerProfileDocument["sections"];
  const merged = createRepressurizerProfile({
    profileId: local.manifest.profileId,
    name: local.manifest.name,
    deviceId: local.manifest.deviceId,
    steamAccountId: local.manifest.steamAccountId ?? remote.manifest.steamAccountId,
    sections: mergedSections,
  });
  return { merged, conflicts, changedItems: countChangedLeaves(local.sections, merged.sections) };
}

export function resolveProfileSyncConflicts(merge: ProfileSyncMerge, choices: Record<string, "local" | "remote" | "base">): RepressurizerProfileDocument {
  const sections = structuredClone(merge.merged.sections) as Record<string, unknown>;
  for (const conflict of merge.conflicts) {
    const choice = choices[conflict.path] ?? "local";
    setAtPath(sections, conflict.path.replace(/^sections\.?/, ""), conflict[choice]);
  }
  // Selecting an absent base field restores "unknown", not an invalid record.
  return createRepressurizerProfile({ ...merge.merged.manifest, sections: withTravelRecords(sections, undefined) });
}

function setAtPath(root: Record<string, unknown>, path: string, value: unknown) {
  const tokens = [...path.matchAll(/([^.[]+)|\[([^\]]+)\]/g)].map((match) => match[1] ?? match[2]);
  let target: unknown = root;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(target)) target = target.find((item) => stableArrayKey(item) === token);
    else if (target && typeof target === "object") target = (target as Record<string, unknown>)[token];
    if (target === undefined) return;
  }
  const last = tokens.at(-1); if (!last) return;
  if (Array.isArray(target)) {
    const index = target.findIndex((item) => stableArrayKey(item) === last);
    if (value === undefined && index >= 0) target.splice(index, 1); else if (index >= 0) target[index] = structuredClone(value); else if (value !== undefined) target.push(structuredClone(value));
  } else if (target && typeof target === "object") {
    if (value === undefined) delete (target as Record<string, unknown>)[last]; else (target as Record<string, unknown>)[last] = structuredClone(value);
  }
}

function countChangedLeaves(left: unknown, right: unknown): number {
  if (equal(left, right)) return 0;
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    const l = left as Record<string, unknown>; const r = right as Record<string, unknown>;
    return [...new Set([...Object.keys(l), ...Object.keys(r)])].reduce((sum, key) => sum + countChangedLeaves(l[key], r[key]), 0);
  }
  return 1;
}

export function createProfileSyncEnvelope(input: Omit<ProfileSyncEnvelope, "schemaVersion" | "checksum" | "writtenAt"> & { writtenAt?: number }): ProfileSyncEnvelope {
  const payload = { schemaVersion: PROFILE_SYNC_SCHEMA, deviceId: input.deviceId, sequence: input.sequence, writtenAt: input.writtenAt ?? Date.now(), previousChecksum: input.previousChecksum, profile: input.profile, journal: input.journal };
  return { ...payload, checksum: entityChecksum(payload) };
}

export function parseProfileSyncEnvelope(value: unknown): ProfileSyncEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as ProfileSyncEnvelope; const { checksum, ...payload } = envelope;
  if (envelope.schemaVersion !== PROFILE_SYNC_SCHEMA || typeof envelope.deviceId !== "string" || !Number.isInteger(envelope.sequence) || envelope.sequence < 1 || !Array.isArray(envelope.journal) || checksum !== entityChecksum(payload)) return null;
  if (!parseRepressurizerProfile(envelope.profile).document) return null;
  return envelope;
}

export function syncEnvelopeFilename(deviceId: string, sequence: number): string {
  return `.repressurizer-sync-${deviceId.replace(/[^a-z0-9-]/gi, "-")}-${sequence}.json`;
}

function recordMap(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.fromEntries(value.flatMap((item) => { const key = stableArrayKey(item); return key ? [[key, item]] : []; }));
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function profileEntityChanges(base: RepressurizerProfileDocument | null, current: RepressurizerProfileDocument): ProfileEntityChange[] {
  const before = base?.sections as Record<string, any> | undefined; const after = current.sections as Record<string, any>;
  const sources: Array<[JournalEntityType, string, unknown, unknown]> = [
    ["diary-entry", "entry", before?.diary?.entries, after.diary?.entries],
    ["autocat-rule", "preset", before?.autocat?.presets, after.autocat?.presets],
    ["planner-preset", "preset", before?.planner?.presets, after.planner?.presets],
    ["tonight-queue", "current", { current: before?.planner?.queue }, { current: after.planner?.queue }],
    ["preference", "status", before?.preferences?.statuses, after.preferences?.statuses],
    ["preference", "note", before?.preferences?.notes, after.preferences?.notes],
    ["preference", "tag", before?.preferences?.tags, after.preferences?.tags],
    ["preference", "review", before?.preferences?.reviews, after.preferences?.reviews],
    ["preference", "travel", before?.preferences?.travel, after.preferences?.travel === undefined ? before?.preferences?.travel : after.preferences.travel],
    ["preference", "setting", before?.settings, after.settings],
  ];
  return sources.flatMap(([entityType, prefix, oldValue, newValue]) => {
    const oldItems = recordMap(oldValue); const newItems = recordMap(newValue);
    return [...new Set([...Object.keys(oldItems), ...Object.keys(newItems)])].flatMap((id) => equal(oldItems[id], newItems[id]) ? [] : [{ entityType, entityId: `${prefix}:${id}`, operation: newItems[id] === undefined ? "delete" as const : oldItems[id] === undefined ? "create" as const : "update" as const, value: newItems[id], baseChecksum: oldItems[id] === undefined ? null : entityChecksum(oldItems[id]) }]);
  });
}
