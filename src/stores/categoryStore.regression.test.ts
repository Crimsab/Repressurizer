import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SteamCollection } from "../lib/types";
import { useCategoryStore } from "./categoryStore";

function collection(key: string, added: number[], dynamic = false): SteamCollection {
  return {
    id: key, key, name: key, added, removed: [], timestamp: 1,
    is_deleted: false, is_dynamic: dynamic,
  };
}

const state = () => useCategoryStore.getState();
const games = (key: string) => state().collections.find((item) => item.key === key)?.added;

beforeEach(() => {
  state().setCollections([
    collection("source", [10, 20]),
    collection("target", [20, 30]),
    collection("dynamic", [40], true),
  ]);
  useCategoryStore.setState({ activeCategory: "all", selectedCategoryKeys: [] });
});

afterEach(() => vi.restoreAllMocks());

describe("collection mutation regressions", () => {
  it("does not delete a collection merged into itself", () => {
    const before = state();
    state().mergeCategories("source", "source");
    expect(state()).toBe(before);
  });

  it("does not delete a source when the merge target is missing", () => {
    const before = state();
    state().mergeCategories("source", "missing");
    expect(state()).toBe(before);
  });

  it("retargets the sidebar after merging the active source", () => {
    state().setActiveCategory("source");
    state().mergeCategories("source", "target");
    expect(games("target")).toEqual([20, 30, 10]);
    expect(state().activeCategory).toBe("target");
  });

  it("creates distinct, consistent IDs with a fixed clock", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890000);
    state().addCategory("one");
    state().addCategoryWithGames("two", [10]);
    state().duplicateCategory("source", "three");
    state().mergeSelectedIntoNewCategory(["source", "target"], "four");
    const created = state().collections.filter((item) => item.key.startsWith("user-collections."));
    expect(created).toHaveLength(4);
    expect(new Set(created.map((item) => item.id)).size).toBe(4);
    for (const item of created) expect(item.key).toBe(`user-collections.${item.id}`);
  });

  it("keeps id and key consistent if the clock advances between calls", () => {
    let now = 1234567890000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    state().addCategory("new");
    const created = state().collections.find((item) => item.name === "new")!;
    expect(created.key).toBe(`user-collections.${created.id}`);
  });

  it("does not reuse an imported generated identity", () => {
    const now = Date.now() + 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const imported = collection(`user-collections.uc-new-${now}`, [10]);
    imported.id = `uc-new-${now}`;
    state().setCollections([imported]);
    state().addCategory("new");
    expect(new Set(state().collections.map((item) => item.id)).size).toBe(2);
  });

  it("deduplicates within a bulk add, not just against existing membership", () => {
    state().addGamesToCategory("source", [20, 30, 30, 40, 40]);
    expect(games("source")).toEqual([10, 20, 30, 40]);
  });

  it("rejects invalid numeric IDs without truncating them", () => {
    state().addGamesToCategory("source", [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]);
    expect(games("source")).toEqual([10, 20]);
    expect(state().dirty).toBe(false);
  });

  it("keeps safely representable IDs above u32 for backend compatibility", () => {
    state().addGamesToCategory("source", [2 ** 32, Number.MAX_SAFE_INTEGER]);
    expect(games("source")).toEqual([10, 20, 2 ** 32, Number.MAX_SAFE_INTEGER]);
  });

  it("does not invent an app ID from a fractional input in a new collection", () => {
    state().addCategoryWithGames("new", [1.5, -1, 0, Infinity, 10, 10]);
    expect(state().collections.find((item) => item.name === "new")?.added).toEqual([10]);
  });

  it("rejects blank names and trims valid names", () => {
    const before = state();
    state().addCategory("   ");
    state().renameCategory("source", "  ");
    expect(state()).toBe(before);
    state().renameCategory("source", "  Renamed  ");
    expect(state().collections.find((item) => item.key === "source")?.name).toBe("Renamed");
  });

  it("does not dirty the library for missing targets or unchanged membership", () => {
    const before = state();
    state().removeCategory("missing");
    state().renameCategory("missing", "name");
    state().renameCategory("source", "source");
    state().addGameToCategory("source", 10);
    state().removeGameFromCategory("source", 999);
    state().addGamesToCategory("missing", [10]);
    state().removeGamesFromCategory("source", [999]);
    expect(state()).toBe(before);
    expect(state().canUndo()).toBe(false);
  });

  it("preserves redo when the requested edit changes nothing", () => {
    state().addGameToCategory("source", 30);
    state().undo();
    state().addGameToCategory("source", 10);
    expect(state().canRedo()).toBe(true);
    state().redo();
    expect(games("source")).toEqual([10, 20, 30]);
  });

  it("leaves Steam-managed dynamic collections unchanged", () => {
    const before = state();
    state().removeCategory("dynamic");
    state().renameCategory("dynamic", "renamed");
    state().addGameToCategory("dynamic", 10);
    state().removeGameFromCategory("dynamic", 40);
    state().addGamesToCategory("dynamic", [10]);
    state().removeGamesFromCategory("dynamic", [40]);
    state().mergeCategories("dynamic", "target");
    state().mergeCategories("source", "dynamic");
    expect(state()).toBe(before);
  });

  it("preserves dynamic collections in a mixed merge into an existing target", () => {
    state().mergeCategoriesIntoTarget(["source", "dynamic", "target"], "target");
    expect(games("dynamic")).toEqual([40]);
    expect(games("target")).toEqual([20, 30, 10]);
  });

  it("does not mutate a dynamic target during bulk merge", () => {
    const before = state();
    state().mergeCategoriesIntoTarget(["source", "dynamic"], "dynamic");
    expect(state()).toBe(before);
  });

  it("does not record a bulk merge without valid sources", () => {
    const before = state();
    state().mergeCategoriesIntoTarget(["missing", "target", "dynamic"], "target");
    expect(state()).toBe(before);
  });

  it("does not create an empty merged collection from missing selections", () => {
    const before = state();
    state().mergeSelectedIntoNewCategory(["missing"], "new");
    expect(state()).toBe(before);
  });

  it("preserves dynamic collections in a mixed merge into a new collection", () => {
    state().mergeSelectedIntoNewCategory(["source", "source", "dynamic", "missing"], "new");
    expect(games("dynamic")).toEqual([40]);
    expect(state().collections.find((item) => item.name === "new")?.added).toEqual([10, 20]);
  });

  it("cleans stale selection after undo", () => {
    state().addCategory("new");
    const key = state().collections.find((item) => item.name === "new")!.key;
    state().setActiveCategory(key);
    state().setSelectedCategoryKeys([key]);
    state().undo();
    expect(state().activeCategory).toBe("all");
    expect(state().selectedCategoryKeys).toEqual([]);
  });

  it("cleans stale selection after redo deletes a collection again", () => {
    state().removeCategory("source");
    state().undo();
    state().setActiveCategory("source");
    state().setSelectedCategoryKeys(["source"]);
    state().redo();
    expect(state().activeCategory).toBe("all");
    expect(state().selectedCategoryKeys).toEqual([]);
  });

  it("cleans stale selection after discard", () => {
    state().addCategory("new");
    const key = state().collections.find((item) => item.name === "new")!.key;
    state().setActiveCategory(key);
    state().setSelectedCategoryKeys([key]);
    state().discardChanges();
    expect(state().activeCategory).toBe("all");
    expect(state().selectedCategoryKeys).toEqual([]);
  });

  it("preserves a built-in view while replacing collections", () => {
    state().setActiveCategory("diary");
    state().setCollections([collection("other", [50])]);
    expect(state().activeCategory).toBe("diary");
  });

  it("clears an absent active collection while replacing collections", () => {
    state().setActiveCategory("source");
    state().setCollections([collection("other", [50])]);
    expect(state().activeCategory).toBe("all");
  });

  it("detaches loaded arrays from callers and from the saved snapshot", () => {
    const imported = [collection("imported", [10])];
    state().setCollections(imported);
    imported[0].added.push(20);
    expect(games("imported")).toEqual([10]);
    expect(state()._saved[0].added).toEqual([10]);
  });

  it("detaches imported arrays while preserving undo", () => {
    const imported = [collection("imported", [10])];
    state().applyImportedCollections(imported);
    imported[0].added.push(20);
    expect(games("imported")).toEqual([10]);
    state().undo();
    expect(games("source")).toEqual([10, 20]);
  });

  it("does not expose writable membership through getGamesInCategory", () => {
    state().getGamesInCategory("source").push(999);
    expect(games("source")).toEqual([10, 20]);
    expect(state().dirty).toBe(false);
  });

  it("normalizes category selection without retaining caller-owned arrays", () => {
    const selected = ["source", "source", "missing"];
    state().setSelectedCategoryKeys(selected);
    selected.push("target");
    expect(state().selectedCategoryKeys).toEqual(["source"]);
    state().toggleCategorySelection("missing");
    expect(state().selectedCategoryKeys).toEqual(["source"]);
  });

  it("keeps a real bulk edit as one undoable step", () => {
    state().addGamesToCategory("source", [30, 30, 40]);
    expect(state()._history).toHaveLength(1);
    state().undo();
    expect(games("source")).toEqual([10, 20]);
    expect(state().dirty).toBe(false);
    state().redo();
    expect(games("source")).toEqual([10, 20, 30, 40]);
  });

  it("limits history to 50 snapshots", () => {
    for (let id = 100; id < 175; id++) state().addGameToCategory("source", id);
    expect(state()._history).toHaveLength(50);
    for (let index = 0; index < 50; index++) state().undo();
    for (let index = 0; index < 50; index++) state().redo();
    expect(state()._history).toHaveLength(50);
  });

  it("copies a dynamic collection as static without modifying the source", () => {
    state().duplicateCategory("dynamic", "copy");
    expect(games("dynamic")).toEqual([40]);
    expect(state().collections.find((item) => item.name === "copy")?.is_dynamic).toBe(false);
  });

  it("removes large membership batches without changing unrelated collections", () => {
    const added = Array.from({ length: 10000 }, (_, index) => index + 1);
    state().setCollections([collection("large", added), collection("other", [11])]);
    state().removeGamesFromCategory("large", added.filter((id) => id % 2 === 0));
    expect(games("large")).toHaveLength(5000);
    expect(games("other")).toEqual([11]);
  });
});
