import { describe, expect, it } from "vitest";
import {
  applyAppIdSetOperation,
  createAppIdImportPlan,
  MAX_STEAM_APP_ID,
  parseAppIdImportText,
  reconcileLinkedAppIdImports,
  shouldAutoUpdateLinkedImport,
  undoAppIdImportBatch,
  type AppIdImportBatch,
} from "./appIdImport";
import type { SteamCollection } from "./types";

describe("parseAppIdImportText", () => {
  it("parses newline, whitespace, comma and semicolon separated IDs", () => {
    expect(parseAppIdImportText("10\n20, 30;40 50")).toEqual({
      appIds: [10, 20, 30, 40, 50],
      duplicateCount: 0,
      invalidEntries: [],
      truncatedCount: 0,
    });
  });

  it("deduplicates IDs and reports invalid entries without rejecting valid rows", () => {
    expect(parseAppIdImportText(`\uFEFF10\n10\nnope\n0\n${MAX_STEAM_APP_ID + 1}\n20 # exported`)).toEqual({
      appIds: [10, 20],
      duplicateCount: 1,
      invalidEntries: ["nope", "0", String(MAX_STEAM_APP_ID + 1)],
      truncatedCount: 0,
    });
  });

  it("ignores blank and comment-only rows", () => {
    expect(parseAppIdImportText("\n# SteamDB export\n// second note\n632470\n")).toEqual({
      appIds: [632470],
      duplicateCount: 0,
      invalidEntries: [],
      truncatedCount: 0,
    });
  });
});

describe("App ID import planning", () => {
  it("allows automatic matching only for non-destructive linked operations", () => {
    expect(shouldAutoUpdateLinkedImport("reference", "append", true)).toBe(true);
    expect(shouldAutoUpdateLinkedImport("reference", "subtract", true)).toBe(true);
    expect(shouldAutoUpdateLinkedImport("reference", "replace", true)).toBe(false);
    expect(shouldAutoUpdateLinkedImport("reference", "intersect", true)).toBe(false);
    expect(shouldAutoUpdateLinkedImport("owned", "append", true)).toBe(false);
    expect(shouldAutoUpdateLinkedImport("reference", "append", false)).toBe(false);
  });

  it("keeps external references out of the visible library by default", () => {
    expect(createAppIdImportPlan({
      sourceIds: [10, 20, 30],
      ownedIds: [10, 30],
      targetIds: [5, 10],
      scope: "reference",
      operation: "append",
    })).toEqual({
      applicableIds: [10, 30],
      referenceIds: [10, 20, 30],
      resultIds: [5, 10, 30],
      addedIds: [30],
      removedIds: [],
      alreadyPresentCount: 1,
      outsideLibraryCount: 1,
    });
  });

  it("supports replace, subtract and intersect operations", () => {
    expect(applyAppIdSetOperation([1, 2, 3], [2, 4], "replace")).toEqual([2, 4]);
    expect(applyAppIdSetOperation([1, 2, 3], [2, 4], "subtract")).toEqual([1, 3]);
    expect(applyAppIdSetOperation([1, 2, 3], [2, 4], "intersect")).toEqual([2]);
  });

  it("undoes only the batch diff and preserves later manual additions", () => {
    const batch = {
      beforeIds: [1, 2],
      afterIds: [2, 3],
    } as AppIdImportBatch;
    expect(undoAppIdImportBatch([2, 3, 4], batch)).toEqual([1, 2, 4]);
  });

  it("reconciles linked references only with newly owned games", () => {
    const collection: SteamCollection = {
      id: "test",
      key: "user-collections.test",
      name: "Test",
      added: [10],
      removed: [],
      timestamp: 0,
      is_deleted: false,
      is_dynamic: false,
    };
    const batch = {
      id: "batch",
      targetKey: collection.key,
      scope: "reference",
      operation: "append",
      appIds: [10, 20, 30],
      active: true,
      autoUpdate: true,
      createdAt: 1,
    } as AppIdImportBatch;
    expect(reconcileLinkedAppIdImports([collection], [10, 20], [batch])[0].added).toEqual([10, 20]);
  });
});
