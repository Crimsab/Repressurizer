import { describe, expect, it } from "vitest";
import {
  AUTO_CATEGORIZE_RESULT_SCOPE_VERSION,
  normalizeLoadedState,
} from "./autoCategorizeStore";

describe("normalizeLoadedState", () => {
  it("discards legacy previews with unsafe shared processed scopes", () => {
    const normalized = normalizeLoadedState({
      lastStep: "preview",
      lastResult: {
        assignments: { "(SCORE) Very Negative": [246090] },
        games_processed: 2,
        games_categorized: 1,
        processed_app_ids: [246090, 288220],
      },
      presets: [{
        id: "flags",
        name: "Store flags",
        type: "flags",
        config: { prefix: "(FLAGS) ", included_flags: [] },
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect(normalized.lastStep).toBe("choose");
    expect(normalized.lastResult).toBeNull();
    expect(normalized.presets).toHaveLength(1);
  });

  it("discards v2 previews created before conservative metadata scopes", () => {
    const normalized = normalizeLoadedState({
      resultScopeVersion: 2,
      lastStep: "preview",
      lastResult: {
        assignments: { "(FLAGS) LAN Co-op": [] },
        games_processed: 1,
        games_categorized: 0,
        processed_app_ids: [34330],
        processed_app_ids_by_category: { "(FLAGS) LAN Co-op": [34330] },
      },
    });

    expect(normalized.lastStep).toBe("choose");
    expect(normalized.lastResult).toBeNull();
  });

  it("keeps previews created with the category-scoped result format", () => {
    const lastResult = {
      assignments: { "(SCORE) Very Negative": [246090] },
      games_processed: 1,
      games_categorized: 1,
      processed_app_ids: [246090],
      processed_app_ids_by_category: { "(score) very negative": [246090] },
    };
    const normalized = normalizeLoadedState({
      resultScopeVersion: AUTO_CATEGORIZE_RESULT_SCOPE_VERSION,
      lastStep: "preview",
      lastResult,
    });

    expect(normalized.lastStep).toBe("preview");
    expect(normalized.lastResult).toEqual(lastResult);
  });
});
