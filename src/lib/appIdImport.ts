import type { SteamCollection } from "./types";

export const MAX_STEAM_APP_ID = 0xffff_ffff;
export const MAX_APP_ID_IMPORT_ENTRIES = 250_000;
export const LARGE_APP_ID_IMPORT_THRESHOLD = 10_000;

export type AppIdImportScope = "owned" | "reference" | "local";
export type AppIdImportOperation = "append" | "replace" | "subtract" | "intersect";
export type AppIdImportMetadataPolicy = "none" | "cached" | "on-demand" | "background";

export interface AppIdImportParseResult {
  appIds: number[];
  duplicateCount: number;
  invalidEntries: string[];
  truncatedCount: number;
}

export interface AppIdImportPlan {
  applicableIds: number[];
  referenceIds: number[];
  resultIds: number[];
  addedIds: number[];
  removedIds: number[];
  alreadyPresentCount: number;
  outsideLibraryCount: number;
}

export interface AppIdImportBatch {
  id: string;
  name: string;
  sourceName: string;
  sourceHash: string;
  appIds: number[];
  targetKey: string;
  targetName: string;
  scope: AppIdImportScope;
  operation: AppIdImportOperation;
  metadataPolicy: AppIdImportMetadataPolicy;
  backgroundLimit: number;
  autoUpdate: boolean;
  beforeIds: number[];
  afterIds: number[];
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

export function parseAppIdImportText(text: string): AppIdImportParseResult {
  const seen = new Set<number>();
  const appIds: number[] = [];
  const invalidEntries: string[] = [];
  let duplicateCount = 0;
  let truncatedCount = 0;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+(?:#|\/\/).*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    for (const token of line.split(/[\s,;]+/).filter(Boolean)) {
      if (!/^\d+$/.test(token)) {
        invalidEntries.push(token);
        continue;
      }
      const appId = Number(token);
      if (!Number.isSafeInteger(appId) || appId < 1 || appId > MAX_STEAM_APP_ID) {
        invalidEntries.push(token);
        continue;
      }
      if (seen.has(appId)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(appId);
      if (appIds.length >= MAX_APP_ID_IMPORT_ENTRIES) {
        truncatedCount += 1;
        continue;
      }
      appIds.push(appId);
    }
  }

  return { appIds, duplicateCount, invalidEntries, truncatedCount };
}

export function createAppIdImportPlan({
  sourceIds,
  ownedIds,
  targetIds,
  scope,
  operation,
}: {
  sourceIds: number[];
  ownedIds: Iterable<number>;
  targetIds: number[];
  scope: AppIdImportScope;
  operation: AppIdImportOperation;
}): AppIdImportPlan {
  const source = uniqueSortedIds(sourceIds);
  const owned = new Set(uniqueSortedIds(ownedIds));
  const current = uniqueSortedIds(targetIds);
  const currentSet = new Set(current);
  const applicableIds = scope === "local" ? source : source.filter((id) => owned.has(id));
  const resultIds = applyAppIdSetOperation(current, applicableIds, operation);
  const resultSet = new Set(resultIds);

  return {
    applicableIds,
    referenceIds: scope === "reference" ? source : [],
    resultIds,
    addedIds: resultIds.filter((id) => !currentSet.has(id)),
    removedIds: current.filter((id) => !resultSet.has(id)),
    alreadyPresentCount: applicableIds.filter((id) => currentSet.has(id)).length,
    outsideLibraryCount: source.filter((id) => !owned.has(id)).length,
  };
}

export function applyAppIdSetOperation(
  targetIds: Iterable<number>,
  sourceIds: Iterable<number>,
  operation: AppIdImportOperation,
): number[] {
  const target = uniqueSortedIds(targetIds);
  const source = uniqueSortedIds(sourceIds);
  const targetSet = new Set(target);
  const sourceSet = new Set(source);

  if (operation === "replace") return source;
  if (operation === "subtract") return target.filter((id) => !sourceSet.has(id));
  if (operation === "intersect") return target.filter((id) => sourceSet.has(id));
  for (const id of source) targetSet.add(id);
  return [...targetSet].sort((left, right) => left - right);
}

export function undoAppIdImportBatch(currentIds: number[], batch: AppIdImportBatch): number[] {
  const before = new Set(batch.beforeIds);
  const after = new Set(batch.afterIds);
  const addedByBatch = batch.afterIds.filter((id) => !before.has(id));
  const removedByBatch = batch.beforeIds.filter((id) => !after.has(id));
  const restored = new Set(currentIds);
  for (const id of addedByBatch) restored.delete(id);
  for (const id of removedByBatch) restored.add(id);
  return [...restored].sort((left, right) => left - right);
}

export function reconcileLinkedAppIdImports(
  collections: SteamCollection[],
  ownedIds: Iterable<number>,
  batches: AppIdImportBatch[],
): SteamCollection[] {
  const owned = new Set(uniqueSortedIds(ownedIds));
  const active = batches
    .filter((batch) => batch.active && batch.autoUpdate && batch.scope === "reference")
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  if (active.length === 0) return collections;

  let changed = false;
  let next = collections;
  for (const batch of active) {
    const index = next.findIndex((collection) => collection.key === batch.targetKey && !collection.is_deleted);
    if (index < 0) continue;
    const collection = next[index];
    const applicable = batch.appIds.filter((id) => owned.has(id));
    const result = applyAppIdSetOperation(collection.added, applicable, batch.operation);
    if (sameIds(collection.added, result)) continue;
    if (!changed) next = [...next];
    changed = true;
    next[index] = { ...collection, added: result, timestamp: Math.floor(Date.now() / 1000) };
  }
  return next;
}

export function appIdImportChecksum(appIds: Iterable<number>): string {
  let hash = 0x811c9dc5;
  for (const id of uniqueSortedIds(appIds)) {
    const value = String(id);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 10;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function shouldAutoUpdateLinkedImport(
  scope: AppIdImportScope,
  operation: AppIdImportOperation,
  requested: boolean,
): boolean {
  return requested && scope === "reference" && operation !== "replace" && operation !== "intersect";
}

export function uniqueSortedIds(ids: Iterable<number>): number[] {
  return [...new Set([...ids].filter((id) => Number.isFinite(id) && id > 0).map(Math.trunc))]
    .sort((left, right) => left - right);
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const normalized = uniqueSortedIds(left);
  return normalized.every((id, index) => id === right[index]);
}
