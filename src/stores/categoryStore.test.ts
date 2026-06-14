import { beforeEach, describe, expect, it } from "vitest";
import { useCategoryStore } from "./categoryStore";
import type { SteamCollection } from "../lib/types";

function collection(key: string, name: string, added: number[]): SteamCollection {
  return {
    id: key,
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
  };
}

describe("categoryStore", () => {
  beforeEach(() => {
    useCategoryStore.getState().setCollections([
      collection("rpg", "RPG", [10]),
      collection("coop", "Co-op", [20]),
    ]);
    useCategoryStore.setState({ activeCategory: "all", selectedCategoryKeys: [] });
  });

  it("deduplicates bulk game adds and records undo/redo history", () => {
    const store = useCategoryStore.getState();

    store.addGamesToCategory("rpg", [10, 20, 30]);

    expect(useCategoryStore.getState().collections.find((c) => c.key === "rpg")?.added).toEqual([10, 20, 30]);
    expect(useCategoryStore.getState().dirty).toBe(true);

    useCategoryStore.getState().undo();
    expect(useCategoryStore.getState().collections.find((c) => c.key === "rpg")?.added).toEqual([10]);

    useCategoryStore.getState().redo();
    expect(useCategoryStore.getState().collections.find((c) => c.key === "rpg")?.added).toEqual([10, 20, 30]);
  });

  it("merges selected categories into a new category without duplicate game IDs", () => {
    const store = useCategoryStore.getState();
    store.mergeSelectedIntoNewCategory(["rpg", "coop"], "Together");

    const state = useCategoryStore.getState();
    expect(state.collections.map((c) => c.name)).toContain("Together");
    expect(state.collections.find((c) => c.name === "Together")?.added.sort()).toEqual([10, 20]);
    expect(state.collections.some((c) => c.key === "rpg")).toBe(false);
    expect(state.collections.some((c) => c.key === "coop")).toBe(false);
  });

  it("removes multiple selected categories in one undoable change", () => {
    const store = useCategoryStore.getState();
    store.setActiveCategory("rpg");
    store.setSelectedCategoryKeys(["rpg", "coop"]);

    store.removeCategories(["rpg", "coop"]);

    let state = useCategoryStore.getState();
    expect(state.collections).toEqual([]);
    expect(state.activeCategory).toBe("all");
    expect(state.selectedCategoryKeys).toEqual([]);
    expect(state.dirty).toBe(true);

    state.undo();

    state = useCategoryStore.getState();
    expect(state.collections.map((c) => c.key)).toEqual(["rpg", "coop"]);
  });
});
