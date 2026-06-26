import { describe, expect, it } from "vitest";
import { matchesSavedAdvancedFilter, type SavedAdvancedFilter } from "./advancedFilterStore";
import type { SteamCollection } from "../lib/types";

const collections: SteamCollection[] = [
  {
    id: "hidden",
    key: "user-collections.hidden",
    name: "Hidden",
    added: [4],
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  },
  {
    id: "rpg",
    key: "user-collections.rpg",
    name: "RPG",
    added: [1, 2],
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  },
  {
    id: "deck",
    key: "user-collections.deck",
    name: "Steam Deck",
    added: [2],
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  },
  {
    id: "done",
    key: "user-collections.done",
    name: "Done",
    added: [3],
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  },
];

function filter(patch: Partial<SavedAdvancedFilter>): SavedAdvancedFilter {
  return {
    id: "filter",
    name: "Filter",
    allowCategoryKeys: [],
    requireCategoryKeys: [],
    excludeCategoryKeys: [],
    hidden: "any",
    uncategorized: "any",
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("matchesSavedAdvancedFilter", () => {
  it("matches allow, require and exclude category states", () => {
    const saved = filter({
      allowCategoryKeys: ["user-collections.rpg"],
      requireCategoryKeys: ["user-collections.deck"],
      excludeCategoryKeys: ["user-collections.done"],
    });

    expect(matchesSavedAdvancedFilter(2, saved, collections)).toBe(true);
    expect(matchesSavedAdvancedFilter(1, saved, collections)).toBe(false);
    expect(matchesSavedAdvancedFilter(3, saved, collections)).toBe(false);
  });

  it("matches hidden and uncategorized special states", () => {
    expect(matchesSavedAdvancedFilter(4, filter({ hidden: "require" }), collections)).toBe(true);
    expect(matchesSavedAdvancedFilter(1, filter({ hidden: "require" }), collections)).toBe(false);
    expect(matchesSavedAdvancedFilter(5, filter({ uncategorized: "require" }), collections)).toBe(true);
    expect(matchesSavedAdvancedFilter(2, filter({ uncategorized: "exclude" }), collections)).toBe(true);
    expect(matchesSavedAdvancedFilter(5, filter({ uncategorized: "exclude" }), collections)).toBe(false);
  });
});
