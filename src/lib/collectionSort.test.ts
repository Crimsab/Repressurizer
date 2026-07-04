import { describe, expect, it } from "vitest";
import {
  sidebarVisibleCollections,
  sortCollectionsForDisplay,
} from "./collectionSort";
import type { SteamCollection } from "./types";

function collection(
  key: string,
  name: string,
  added: number[] = [1],
  extra: Partial<SteamCollection> = {}
): SteamCollection {
  return {
    id: key,
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
    ...extra,
  };
}

describe("sortCollectionsForDisplay", () => {
  it("uses natural alphabetical ordering for collection pickers", () => {
    const sorted = sortCollectionsForDisplay([
      collection("z", "List 10"),
      collection("a", "List 2"),
      collection("b", "alpha"),
    ]);

    expect(sorted.map((item) => item.name)).toEqual(["alpha", "List 2", "List 10"]);
  });

  it("pins Favorites using the same rule as the sidebar", () => {
    const sorted = sortCollectionsForDisplay(
      [
        collection("rpg", "RPG"),
        collection("favorite", "Favorites"),
        collection("action", "Action"),
      ],
      { pinFavorites: true }
    );

    expect(sorted.map((item) => item.name)).toEqual(["Favorites", "Action", "RPG"]);
  });
});

describe("sidebarVisibleCollections", () => {
  it("matches sidebar visibility for special and dynamic collections", () => {
    const visible = sidebarVisibleCollections(
      [
        collection("hidden", "Hidden"),
        collection("favorite", "Favorites", []),
        collection("dynamic", "Dynamic", [1], { is_dynamic: true }),
        collection("rpg", "RPG"),
      ],
      { showDynamicCategories: false }
    );

    expect(visible.map((item) => item.name)).toEqual(["RPG"]);
  });
});
