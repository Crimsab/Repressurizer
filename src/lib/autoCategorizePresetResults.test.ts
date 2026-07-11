import { describe, expect, it } from "vitest";
import { combineAutoCategorizePresetResults } from "./autoCategorizePresetResults";

describe("combineAutoCategorizePresetResults", () => {
  it("keeps processed scopes isolated between preset categories", () => {
    const combined = combineAutoCategorizePresetResults([
      {
        assignments: { "(FLAGS) Captions available": [1] },
        games_processed: 2,
        games_categorized: 1,
        processed_app_ids: [1, 2],
      },
      {
        assignments: { "(SCORE) Overwhelmingly Negative": [10] },
        games_processed: 1,
        games_categorized: 1,
        processed_app_ids: [10],
      },
    ]);

    expect(combined.processed_app_ids).toEqual([1, 2, 10]);
    expect(combined.processed_app_ids_by_category).toEqual({
      "(FLAGS) Captions available": [1, 2],
      "(SCORE) Overwhelmingly Negative": [10],
    });
  });
});
