import { describe, expect, it } from "vitest";
import {
  applyAutoCategorizeAssignments,
  expectedAutoCategoryNames,
  withExpectedAutoCategories,
} from "./autoCategorizeApply";
import type { SteamCollection } from "./types";

function collection(
  key: string,
  name: string,
  added: number[],
  extra: Partial<SteamCollection> = {}
): SteamCollection {
  return {
    id: key.replace(/^user-collections\./, ""),
    key,
    name,
    added,
    removed: [999],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
    ...extra,
  };
}

describe("applyAutoCategorizeAssignments", () => {
  it("replaces existing static category contents instead of appending", () => {
    const next = applyAutoCategorizeAssignments(
      [
        collection("user-collections.rpg", "RPG", [1, 2, 3]),
        collection("user-collections.manual", "Manual", [7]),
      ],
      { RPG: [2, 4, 4, 1] },
      123
    );

    expect(next.find((item) => item.name === "RPG")).toMatchObject({
      added: [1, 2, 4],
      removed: [],
      timestamp: 123,
      is_deleted: false,
    });
    expect(next.find((item) => item.name === "Manual")?.added).toEqual([7]);
  });

  it("preserves existing games that were not processed by the categorizer", () => {
    const next = applyAutoCategorizeAssignments(
      [
        collection("user-collections.rpg", "RPG", [1, 2, 3, 99]),
      ],
      { RPG: [2, 4] },
      123,
      { processedAppIds: [1, 2, 3, 4] }
    );

    expect(next.find((item) => item.name === "RPG")?.added).toEqual([2, 4, 99]);
  });

  it("uses each category's own processed scope when applying combined presets", () => {
    const next = applyAutoCategorizeAssignments(
      [
        collection("user-collections.flags", "(FLAGS) Captions available", [1, 2]),
        collection("user-collections.score", "(SCORE) Overwhelmingly Negative", [10, 20]),
      ],
      {
        "(FLAGS) Captions available": [1],
        "(SCORE) Overwhelmingly Negative": [10],
      },
      123,
      {
        processedAppIds: [1, 2, 10, 20],
        processedAppIdsByCategory: {
          "(FLAGS) Captions available": [1, 2],
          "(SCORE) Overwhelmingly Negative": [10],
        },
      }
    );

    expect(next.find((item) => item.name === "(FLAGS) Captions available")?.added).toEqual([1]);
    expect(next.find((item) => item.name === "(SCORE) Overwhelmingly Negative")?.added).toEqual([10, 20]);
  });

  it("preserves dynamic collections and creates a static category for the assignment", () => {
    const next = applyAutoCategorizeAssignments(
      [
        collection("user-collections.dynamic", "Deck", [], {
          is_dynamic: true,
        }),
      ],
      { Deck: [10] },
      123
    );

    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ name: "Deck", is_dynamic: true, added: [] });
    expect(next[1]).toMatchObject({
      name: "Deck",
      added: [10],
      removed: [],
      is_dynamic: false,
    });
    expect(next[1].key).toMatch(/^user-collections\.uc-auto-/);
  });

  it("adds expected fixed buckets before applying", () => {
    const result = withExpectedAutoCategories(
      {
        assignments: { "Played 1-10h": [1] },
        games_processed: 1,
        games_categorized: 1,
      },
      "hours",
      {
        prefix: "Played ",
        rules: [
          { name: "0h", min_hours: 0, max_hours: 0.01 },
          { name: "1-10h", min_hours: 1, max_hours: 10 },
        ],
      }
    );

    expect(result.assignments).toEqual({
      "Played 1-10h": [1],
      "Played 0h": [],
    });
  });
});

describe("expectedAutoCategoryNames", () => {
  it("returns fixed score, platform, and explicit tag buckets", () => {
    expect(expectedAutoCategoryNames("score", {})).toEqual([
      "Must-Play",
      "Great",
      "Good",
      "Mixed",
      "Poor",
    ]);
    expect(expectedAutoCategoryNames("rating", { prefix: "Steam: " })).toEqual([
      "Steam: Overwhelmingly Positive",
      "Steam: Very Positive",
      "Steam: Positive",
      "Steam: Mostly Positive",
      "Steam: Mixed",
      "Steam: Mostly Negative",
      "Steam: Overwhelmingly Negative",
      "Steam: Very Negative",
      "Steam: Negative",
    ]);
    expect(
      expectedAutoCategoryNames("platform", {
        prefix: "(Platform) ",
        include_windows: true,
        include_mac: false,
        include_linux: true,
      })
    ).toEqual(["(Platform) Windows", "(Platform) Linux"]);
    expect(
      expectedAutoCategoryNames("tags", {
        prefix: "#",
        included_tags: ["Souls-like", "Roguelike"],
      })
    ).toEqual(["#Souls-like", "#Roguelike"]);
    expect(
      expectedAutoCategoryNames("custom", {
        output: { categoryName: "Short RPG not Backlog" },
      })
    ).toEqual(["Short RPG not Backlog"]);
  });

  it("adds the optional HLTB unknown bucket", () => {
    expect(
      expectedAutoCategoryNames("hltb", {
        rules: [{ name: "Short", min_hours: 0, max_hours: 5 }],
        include_unknown: true,
        unknown_text: "HLTB: Unknown",
      })
    ).toEqual(["Short", "HLTB: Unknown"]);
  });
});
