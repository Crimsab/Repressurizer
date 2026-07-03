import { describe, expect, it } from "vitest";
import {
  compareCollectionAppIds,
  defaultCompareCategoryName,
} from "./collectionCompare";

describe("compareCollectionAppIds", () => {
  it("returns games in A but not B", () => {
    expect(compareCollectionAppIds([3, 1, 2, 2], [2, 4], "aNotB")).toEqual([1, 3]);
  });

  it("returns games in B but not A", () => {
    expect(compareCollectionAppIds([1, 2], [2, 3, 4], "bNotA")).toEqual([3, 4]);
  });

  it("returns intersection", () => {
    expect(compareCollectionAppIds([1, 2, 3], [2, 3, 4], "both")).toEqual([2, 3]);
  });

  it("returns symmetric difference", () => {
    expect(compareCollectionAppIds([1, 2, 3], [2, 4], "xor")).toEqual([1, 3, 4]);
  });
});

describe("defaultCompareCategoryName", () => {
  it("names missing-from-target results using the visible category names", () => {
    expect(defaultCompareCategoryName("(COUNT) #", "Moby Partial", "aNotB")).toBe("(COUNT) # - Moby Partial");
  });
});
