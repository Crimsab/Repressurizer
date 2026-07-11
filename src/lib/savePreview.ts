import type { GameDetails, OwnedGame, SteamCollection } from "./types";

export interface CollectionChangePreview {
  collection: string;
  added: string[];
  removed: string[];
}

export interface SavePreview {
  addedCollections: string[];
  removedCollections: string[];
  changedCollections: CollectionChangePreview[];
  addedGamesCount: number;
  removedGamesCount: number;
}

export function buildSavePreview(
  saved: SteamCollection[],
  current: SteamCollection[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails> = {}
): SavePreview {
  const savedStatic = saved.filter((c) => !c.is_dynamic);
  const currentStatic = current.filter((c) => !c.is_dynamic);
  const savedByKey = new Map(savedStatic.map((c) => [c.key, c]));
  const currentByKey = new Map(currentStatic.map((c) => [c.key, c]));
  const gameName = (id: number) => {
    const libraryName = games[id]?.name.trim();
    if (libraryName) return libraryName;

    const cachedName = details[id]?.name.trim();
    return cachedName || `#${id}`;
  };

  const addedCollections = currentStatic
    .filter((c) => !savedByKey.has(c.key))
    .map((c) => c.name);
  const removedCollections = savedStatic
    .filter((c) => !currentByKey.has(c.key))
    .map((c) => c.name);

  let addedGamesCount = 0;
  let removedGamesCount = 0;
  const changedCollections: CollectionChangePreview[] = [];

  for (const currentCollection of currentStatic) {
    const previous = savedByKey.get(currentCollection.key);
    if (!previous) continue;

    const before = new Set(previous.added);
    const after = new Set(currentCollection.added);
    const added = currentCollection.added.filter((id) => !before.has(id));
    const removed = previous.added.filter((id) => !after.has(id));

    if (added.length > 0 || removed.length > 0 || previous.name !== currentCollection.name) {
      addedGamesCount += added.length;
      removedGamesCount += removed.length;
      changedCollections.push({
        collection:
          previous.name === currentCollection.name
            ? currentCollection.name
            : `${previous.name} -> ${currentCollection.name}`,
        added: added.map(gameName),
        removed: removed.map(gameName),
      });
    }
  }

  return {
    addedCollections,
    removedCollections,
    changedCollections,
    addedGamesCount,
    removedGamesCount,
  };
}
