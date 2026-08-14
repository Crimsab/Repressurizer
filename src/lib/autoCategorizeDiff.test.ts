import { describe, expect, it } from "vitest";
import { buildAutoCategorizeDiff, serializeAutoCategorizeDiff } from "./autoCategorizeDiff";
import type { SteamCollection } from "./types";

const collections: SteamCollection[] = [
  {
    id: "rpg",
    key: "user-collections.rpg",
    name: "RPG",
    added: [1, 2, 99],
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
  },
];

describe("AutoCat preview diff", () => {
  it("exports deterministic membership changes with preview-consistent totals", () => {
    const input = {
      assignments: { RPG: [2, 3], Chill: [4] },
      games_processed: 4,
      games_categorized: 3,
      processed_app_ids: [1, 2, 3, 4],
    };
    const rules = [{ type: "genre" as const, name: "Genre pass", config: { prefix: "", max_categories: 2 } }];
    const document = buildAutoCategorizeDiff(collections, input, rules);

    expect(document.preview).toEqual({ categories: 2, gamesCategorized: 3, gamesProcessed: 4 });
    expect(document.changes).toEqual({
      categoriesChanged: 2,
      membershipsAdded: 2,
      membershipsRemoved: 1,
    });
    expect(document.categories).toEqual([
      { name: "Chill", created: true, addedAppIds: [4], removedAppIds: [] },
      { name: "RPG", created: false, addedAppIds: [3], removedAppIds: [1] },
    ]);
    expect(serializeAutoCategorizeDiff(document)).toBe(
      serializeAutoCategorizeDiff(buildAutoCategorizeDiff(collections, input, rules)),
    );
  });

  it("preserves unprocessed memberships for category-scoped metadata runs", () => {
    const document = buildAutoCategorizeDiff(
      collections,
      {
        assignments: { RPG: [2] },
        games_processed: 1,
        games_categorized: 1,
        processed_app_ids_by_category: { RPG: [2] },
      },
      [{ type: "tags", config: { included_tags: ["RPG"] } }],
    );

    expect(document.categories[0]).toEqual({
      name: "RPG",
      created: false,
      addedAppIds: [],
      removedAppIds: [],
    });
  });

  it("drops credentials, paths, cookies, and volatile identifiers from rule metadata", () => {
    const serialized = serializeAutoCategorizeDiff(buildAutoCategorizeDiff(
      collections,
      { assignments: { RPG: [1] }, games_processed: 1, games_categorized: 1 },
      [{
        type: "custom",
        config: {
          id: "random-id",
          output: { categoryName: "Review" },
          apiKey: "raw-api-key",
          bearerToken: "raw-token",
          cookie: "raw-cookie",
          steamPath: "C:\\private\\Steam",
          nested: { password: "raw-password", condition: "title contains RPG" },
        },
      }],
    ));

    expect(serialized).toContain("title contains RPG");
    expect(serialized).not.toMatch(/raw-api-key|raw-token|raw-cookie|raw-password|private|random-id/);
  });
});
