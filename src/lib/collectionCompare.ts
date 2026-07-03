import type { SteamCollection } from "./types";

export type CollectionCompareMode = "aNotB" | "bNotA" | "both" | "xor";

export interface CollectionCompareResult {
  mode: CollectionCompareMode;
  appIds: number[];
}

export function compareCollectionAppIds(
  aIds: Iterable<number>,
  bIds: Iterable<number>,
  mode: CollectionCompareMode
): number[] {
  const a = toFiniteSet(aIds);
  const b = toFiniteSet(bIds);
  const out: number[] = [];

  if (mode === "aNotB") {
    for (const id of a) if (!b.has(id)) out.push(id);
  } else if (mode === "bNotA") {
    for (const id of b) if (!a.has(id)) out.push(id);
  } else if (mode === "both") {
    for (const id of a) if (b.has(id)) out.push(id);
  } else {
    for (const id of a) if (!b.has(id)) out.push(id);
    for (const id of b) if (!a.has(id)) out.push(id);
  }

  return out.sort((x, y) => x - y);
}

export function compareCollections(
  a: SteamCollection,
  b: SteamCollection,
  mode: CollectionCompareMode
): CollectionCompareResult {
  return {
    mode,
    appIds: compareCollectionAppIds(a.added, b.added, mode),
  };
}

export function defaultCompareCategoryName(
  aName: string,
  bName: string,
  mode: CollectionCompareMode
): string {
  switch (mode) {
    case "aNotB":
      return `${aName} - ${bName}`;
    case "bNotA":
      return `${bName} - ${aName}`;
    case "both":
      return `${aName} & ${bName}`;
    case "xor":
      return `${aName} xor ${bName}`;
  }
}

function toFiniteSet(ids: Iterable<number>): Set<number> {
  const set = new Set<number>();
  for (const id of ids) {
    if (Number.isFinite(id)) set.add(Math.trunc(id));
  }
  return set;
}
