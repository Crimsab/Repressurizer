import { beforeEach, describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({ steamPath: "steam", steamId3: "123", steamId64: "76561198000000000" }));
vi.mock("../stores/settingsStore", () => ({ useSettingsStore: { getState: () => settings } }));
import { useCategoryStore } from "../stores/categoryStore";
import { acceptSavedCollections, canReplaceCollections, captureCollectionOperation, isCurrentProfile } from "./collectionOperations";
import { invalidateRuntime } from "./runtimeGeneration";
import type { SteamCollection } from "./types";
const initial: SteamCollection[] = [{ id: "a", key: "a", name: "A", added: [10], removed: [], timestamp: 1, is_dynamic: false, is_deleted: false }];
beforeEach(() => {
  settings.steamId3 = "123";
  invalidateRuntime();
  useCategoryStore.getState().setCollections(initial);
});
describe("collection operation revisions", () => {
  it("accepts a clean refresh only while its baseline and draft are unchanged", () => {
    const request = captureCollectionOperation();
    expect(canReplaceCollections(request)).toBe(true);
    useCategoryStore.getState().renameCategory("a", "local draft");
    expect(canReplaceCollections(request)).toBe(false);
    expect(useCategoryStore.getState().collections[0].name).toBe("local draft");
  });
  it("never replaces a draft that was already dirty before the refresh", () => {
    useCategoryStore.getState().renameCategory("a", "draft");
    expect(canReplaceCollections(captureCollectionOperation())).toBe(false);
  });
  it("advances only the saved baseline when editing continues during a write", () => {
    useCategoryStore.getState().renameCategory("a", "sent to disk");
    const operation = captureCollectionOperation();
    useCategoryStore.getState().renameCategory("a", "newer draft");
    const before = useCategoryStore.getState();
    expect(acceptSavedCollections(operation, operation.collections)).toBe(true);
    const after = useCategoryStore.getState();
    expect(after.collections).toBe(before.collections);
    expect(after._history).toBe(before._history);
    expect(after._saved[0].name).toBe("sent to disk");
    expect(after.collections[0].name).toBe("newer draft");
    expect(after.dirty).toBe(true);
  });
  it("rejects stale account or document completions, including account A-B-A", () => {
    const operation = captureCollectionOperation();
    settings.steamId3 = "456";
    expect(isCurrentProfile(operation)).toBe(false);
    settings.steamId3 = "123";
    invalidateRuntime();
    expect(acceptSavedCollections(operation, [])).toBe(false);
    expect(useCategoryStore.getState().collections).toHaveLength(1);
  });
  it("does not overwrite a newer baseline established by restore or load", () => {
    const operation = captureCollectionOperation();
    useCategoryStore.getState().setCollections([{ ...initial[0], name: "restored" }]);
    expect(acceptSavedCollections(operation, [])).toBe(false);
    expect(useCategoryStore.getState()._saved[0].name).toBe("restored");
  });
  it("marks an unchanged successfully saved draft clean", () => {
    useCategoryStore.getState().renameCategory("a", "new name");
    const operation = captureCollectionOperation();
    expect(acceptSavedCollections(operation, operation.collections)).toBe(true);
    expect(useCategoryStore.getState().dirty).toBe(false);
  });
});
