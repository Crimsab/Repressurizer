import type { SteamCollection } from "./types";
const EMPTY: readonly SteamCollection[] = Object.freeze([]);
let source: readonly SteamCollection[] | undefined;
let index = new Map<number, readonly SteamCollection[]>();

export function collectionMembershipIndex(collections: readonly SteamCollection[]) {
  if (source === collections) return index;
  const next = new Map<number, SteamCollection[]>();
  for (const collection of collections) {
    if (collection.is_dynamic) continue;
    for (const appId of new Set(collection.added)) {
      const memberships = next.get(appId);
      if (memberships) memberships.push(collection);
      else next.set(appId, [collection]);
    }
  }
  const stable = new Map<number, readonly SteamCollection[]>();
  for (const [appId, memberships] of next) {
    const previous = index.get(appId);
    stable.set(appId, previous && previous.length === memberships.length &&
      previous.every((entry, position) => entry === memberships[position]) ? previous : memberships);
  }
  // Cache only the current snapshot, not every undo/history snapshot.
  source = collections;
  index = stable;
  return index;
}
export function categoriesForGame(collections: readonly SteamCollection[], appId: number) {
  return collectionMembershipIndex(collections).get(appId) ?? EMPTY;
}
