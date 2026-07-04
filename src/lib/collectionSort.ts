import type { SteamCollection } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface CollectionDisplayOptions {
  pinFavorites?: boolean;
}

export interface SidebarCollectionFilterOptions {
  showDynamicCategories: boolean;
}

export function sidebarVisibleCollections(
  collections: SteamCollection[],
  options: SidebarCollectionFilterOptions
): SteamCollection[] {
  return collections.filter(
    (collection) =>
      collection.id !== "hidden" &&
      (collection.id !== "favorite" || collection.added.length > 0) &&
      (options.showDynamicCategories || !collection.is_dynamic)
  );
}

export function sortCollectionsForDisplay(
  collections: SteamCollection[],
  options: CollectionDisplayOptions = {}
): SteamCollection[] {
  return [...collections].sort((a, b) => compareCollectionsForDisplay(a, b, options));
}

export function compareCollectionsForDisplay(
  a: SteamCollection,
  b: SteamCollection,
  options: CollectionDisplayOptions = {}
): number {
  if (options.pinFavorites) {
    const aFav = isFavoriteCollection(a);
    const bFav = isFavoriteCollection(b);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
  }

  return collator.compare(a.name, b.name) || collator.compare(a.key, b.key);
}

export function isFavoriteCollection(collection: SteamCollection): boolean {
  const name = collection.name.toLowerCase();
  return (
    collection.id === "favorite" ||
    collection.key === "favorite" ||
    name === "favorite" ||
    name === "favorites"
  );
}
