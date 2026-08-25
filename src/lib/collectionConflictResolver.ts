import { canonicalJson, entityChecksum } from "./entityJournal";
import type { SteamCollection } from "./types";

export type CollectionConflictKind = "name" | "color" | "deletion" | "creation" | "membership" | "order" | "metadata";
export type ConflictResolutionChoice = "steam" | "repressurizer" | "merge" | "manual";

export interface CollectionConflict {
  id: string;
  identity: string;
  collectionName: string;
  kind: CollectionConflictKind;
  field: string;
  appId: number | null;
  baseValue: unknown;
  steamValue: unknown;
  repressurizerValue: unknown;
  explanation: string;
}

export interface ConflictResolution {
  choice: ConflictResolutionChoice;
  manualValue?: unknown;
}

export interface ThreeWayMergeAnalysis {
  base: SteamCollection[];
  steam: SteamCollection[];
  proposed: SteamCollection[];
  autoMerged: SteamCollection[];
  conflicts: CollectionConflict[];
  orderByIdentity: Record<string, number>;
  steamChanged: boolean;
}

function identity(collection: SteamCollection): string {
  return collection.key ? `key:${collection.key}` : collection.id ? `id:${collection.id}` : `anonymous:${entityChecksum(collection)}`;
}

function mapCollections(collections: SteamCollection[]): Map<string, SteamCollection> {
  return new Map(collections.map((collection) => [identity(collection), collection]));
}

function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function changed(base: unknown, value: unknown): boolean {
  return !equal(base, value);
}

function semanticCollections(collections: SteamCollection[]): unknown[] {
  return collections.map((collection) => {
    const { timestamp: _timestamp, ...semantic } = collection;
    return semantic;
  });
}

function conflict(input: Omit<CollectionConflict, "id">): CollectionConflict {
  return { ...input, id: `collection-conflict:${entityChecksum(input)}` };
}

function resolveValue(input: {
  base: unknown;
  steam: unknown;
  proposed: unknown;
  makeConflict: () => CollectionConflict;
  conflicts: CollectionConflict[];
}): unknown {
  if (equal(input.steam, input.proposed)) return structuredClone(input.steam);
  if (!changed(input.base, input.steam)) return structuredClone(input.proposed);
  if (!changed(input.base, input.proposed)) return structuredClone(input.steam);
  input.conflicts.push(input.makeConflict());
  return structuredClone(input.proposed);
}

function setMembership(collection: SteamCollection, field: "added" | "removed", appId: number, included: boolean): SteamCollection {
  const values = new Set(collection[field]);
  if (included) values.add(appId); else values.delete(appId);
  return { ...collection, [field]: [...values].sort((left, right) => left - right) };
}

function mergeExistingCollection(base: SteamCollection, steam: SteamCollection, proposed: SteamCollection, collectionIdentity: string, conflicts: CollectionConflict[]): SteamCollection {
  const result = { ...structuredClone(base) } as SteamCollection & Record<string, unknown>;
  const steamRecord = steam as SteamCollection & Record<string, unknown>;
  const proposedRecord = proposed as SteamCollection & Record<string, unknown>;
  const baseRecord = base as SteamCollection & Record<string, unknown>;
  const name = proposed.name || steam.name || base.name;

  const fields = new Set([...Object.keys(baseRecord), ...Object.keys(steamRecord), ...Object.keys(proposedRecord)]);
  fields.delete("added"); fields.delete("removed"); fields.delete("timestamp"); fields.delete("id"); fields.delete("key");
  for (const field of fields) {
    const kind: CollectionConflictKind = field === "name" ? "name" : field === "color" || field === "color_hex" ? "color" : field === "is_deleted" ? "deletion" : "metadata";
    result[field] = resolveValue({
      base: baseRecord[field], steam: steamRecord[field], proposed: proposedRecord[field], conflicts,
      makeConflict: () => conflict({ identity: collectionIdentity, collectionName: name, kind, field, appId: null, baseValue: baseRecord[field], steamValue: steamRecord[field], repressurizerValue: proposedRecord[field], explanation: `${name}: Steam and Repressurizer changed ${field} differently.` }),
    });
  }
  result.timestamp = Math.max(base.timestamp ?? 0, steam.timestamp ?? 0, proposed.timestamp ?? 0);

  for (const field of ["added", "removed"] as const) {
    const ids = new Set([...base[field], ...steam[field], ...proposed[field]]);
    let merged = { ...result } as SteamCollection;
    for (const appId of ids) {
      const baseValue = base[field].includes(appId);
      const steamValue = steam[field].includes(appId);
      const proposedValue = proposed[field].includes(appId);
      const included = resolveValue({
        base: baseValue, steam: steamValue, proposed: proposedValue, conflicts,
        makeConflict: () => conflict({ identity: collectionIdentity, collectionName: name, kind: "membership", field, appId, baseValue, steamValue, repressurizerValue: proposedValue, explanation: `${name}: Steam and Repressurizer made opposite membership changes for app ${appId}.` }),
      }) as boolean;
      merged = setMembership(merged, field, appId, included);
    }
    Object.assign(result, merged);
  }
  return result;
}

export function analyzeThreeWayCollectionMerge(input: { base: SteamCollection[]; steam: SteamCollection[]; proposed: SteamCollection[] }): ThreeWayMergeAnalysis {
  const baseMap = mapCollections(input.base);
  const steamMap = mapCollections(input.steam);
  const proposedMap = mapCollections(input.proposed);
  const identities = [...new Set([...baseMap.keys(), ...steamMap.keys(), ...proposedMap.keys()])];
  const conflicts: CollectionConflict[] = [];
  const merged = new Map<string, SteamCollection>();
  const orderByIdentity: Record<string, number> = {};

  for (const collectionIdentity of identities) {
    const base = baseMap.get(collectionIdentity) ?? null;
    const steam = steamMap.get(collectionIdentity) ?? null;
    const proposed = proposedMap.get(collectionIdentity) ?? null;
    const name = proposed?.name ?? steam?.name ?? base?.name ?? collectionIdentity;
    if (!base) {
      if (steam && proposed && !equal(steam, proposed)) {
        conflicts.push(conflict({ identity: collectionIdentity, collectionName: name, kind: "creation", field: "collection", appId: null, baseValue: null, steamValue: steam, repressurizerValue: proposed, explanation: `${name}: both sides created this collection differently.` }));
        merged.set(collectionIdentity, structuredClone(proposed));
      } else if (steam || proposed) merged.set(collectionIdentity, structuredClone((steam ?? proposed)!));
      continue;
    }
    if (!steam && !proposed) continue;
    if (!steam || !proposed) {
      const survivor = (steam ?? proposed)!;
      const survivorChanged = changed(base, survivor);
      if (survivorChanged) {
        conflicts.push(conflict({ identity: collectionIdentity, collectionName: name, kind: "deletion", field: "collection", appId: null, baseValue: base, steamValue: steam, repressurizerValue: proposed, explanation: `${name}: one side deleted the collection while the other modified it.` }));
        merged.set(collectionIdentity, structuredClone(survivor));
      }
      continue;
    }
    merged.set(collectionIdentity, mergeExistingCollection(base, steam, proposed, collectionIdentity, conflicts));
  }

  const baseOrder = Object.fromEntries(input.base.map((collection, index) => [identity(collection), index]));
  const steamOrder = Object.fromEntries(input.steam.map((collection, index) => [identity(collection), index]));
  const proposedOrder = Object.fromEntries(input.proposed.map((collection, index) => [identity(collection), index]));
  for (const collectionIdentity of merged.keys()) {
    const baseValue = baseOrder[collectionIdentity] ?? Number.MAX_SAFE_INTEGER;
    const steamValue = steamOrder[collectionIdentity] ?? Number.MAX_SAFE_INTEGER;
    const proposedValue = proposedOrder[collectionIdentity] ?? Number.MAX_SAFE_INTEGER;
    orderByIdentity[collectionIdentity] = resolveValue({
      base: baseValue, steam: steamValue, proposed: proposedValue, conflicts,
      makeConflict: () => conflict({ identity: collectionIdentity, collectionName: merged.get(collectionIdentity)?.name ?? collectionIdentity, kind: "order", field: "order", appId: null, baseValue, steamValue, repressurizerValue: proposedValue, explanation: `${merged.get(collectionIdentity)?.name ?? collectionIdentity}: both sides moved this collection to different positions.` }),
    }) as number;
  }

  const autoMerged = [...merged.entries()].sort(([left], [right]) => orderByIdentity[left] - orderByIdentity[right] || left.localeCompare(right)).map(([, collection]) => collection);
  return { ...input, autoMerged, conflicts, orderByIdentity, steamChanged: !equal(semanticCollections(input.base), semanticCollections(input.steam)) };
}

function mergedChoice(conflictItem: CollectionConflict): unknown {
  if (conflictItem.kind === "membership") return Boolean(conflictItem.steamValue) || Boolean(conflictItem.repressurizerValue);
  if (conflictItem.kind === "deletion") return conflictItem.steamValue ?? conflictItem.repressurizerValue;
  if (conflictItem.kind === "creation") {
    const steam = (conflictItem.steamValue ?? {}) as Record<string, unknown>;
    const proposed = (conflictItem.repressurizerValue ?? {}) as Record<string, unknown>;
    return { ...steam, ...proposed, added: [...new Set([...(steam.added as number[] ?? []), ...(proposed.added as number[] ?? [])])], removed: [...new Set([...(steam.removed as number[] ?? []), ...(proposed.removed as number[] ?? [])])] };
  }
  if (conflictItem.steamValue && conflictItem.repressurizerValue && typeof conflictItem.steamValue === "object" && typeof conflictItem.repressurizerValue === "object") return { ...(conflictItem.steamValue as object), ...(conflictItem.repressurizerValue as object) };
  return conflictItem.repressurizerValue;
}

function selectedValue(conflictItem: CollectionConflict, resolution: ConflictResolution): unknown {
  if (resolution.choice === "steam") return structuredClone(conflictItem.steamValue);
  if (resolution.choice === "repressurizer") return structuredClone(conflictItem.repressurizerValue);
  if (resolution.choice === "merge") return structuredClone(mergedChoice(conflictItem));
  return structuredClone(resolution.manualValue);
}

export function resolveThreeWayCollectionMerge(analysis: ThreeWayMergeAnalysis, resolutions: Record<string, ConflictResolution>): SteamCollection[] {
  const collections = mapCollections(structuredClone(analysis.autoMerged));
  const order = { ...analysis.orderByIdentity };
  for (const conflictItem of analysis.conflicts) {
    const resolution = resolutions[conflictItem.id];
    if (!resolution) throw new Error(`Unresolved collection conflict: ${conflictItem.id}`);
    const value = selectedValue(conflictItem, resolution);
    if (conflictItem.kind === "creation" || conflictItem.kind === "deletion") {
      if (value == null) collections.delete(conflictItem.identity); else collections.set(conflictItem.identity, value as SteamCollection);
      continue;
    }
    if (conflictItem.kind === "order") { order[conflictItem.identity] = Number(value); continue; }
    const collection = collections.get(conflictItem.identity);
    if (!collection) continue;
    if (conflictItem.kind === "membership" && conflictItem.appId != null) {
      collections.set(conflictItem.identity, setMembership(collection, conflictItem.field as "added" | "removed", conflictItem.appId, Boolean(value)));
    } else {
      collections.set(conflictItem.identity, { ...collection, [conflictItem.field]: value });
    }
  }
  return [...collections.entries()].sort(([left], [right]) => (order[left] ?? Number.MAX_SAFE_INTEGER) - (order[right] ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)).map(([, collection]) => collection);
}
