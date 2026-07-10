import { describe, expect, it } from "vitest";
import type { GameDetails } from "../../../lib/types";
import {
  buildAutoCatMetadata,
  categorizerRequirement,
  categorizerNeedsDetails,
  categorizerNeedsRatings,
  withProcessedAppIds,
} from "./autoCategorizeModel";

function detail(appId: number, patch: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    cache_schema: 2,
    fetched_at: Date.now(),
    genres: [],
    tags: [],
    categories: [],
    release_date: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: null,
    is_free: false,
    ...patch,
  };
}

describe("autoCategorizeModel", () => {
  it("keeps categorizer requirements in one domain mapping", () => {
    expect(categorizerNeedsDetails("genre")).toBe(true);
    expect(categorizerNeedsDetails("platform")).toBe(true);
    expect(categorizerNeedsDetails("hours")).toBe(false);
    expect(categorizerNeedsRatings("rating")).toBe(true);
    expect(categorizerNeedsRatings("score")).toBe(false);
    expect(categorizerRequirement("genre")).toBe("details");
    expect(categorizerRequirement("year")).toBe("releaseDates");
    expect(categorizerRequirement("rating")).toBe("ratings");
    expect(categorizerRequirement("hltb")).toBe("hltb");
    expect(categorizerRequirement("hours")).toBeNull();
  });

  it("builds sorted metadata suggestions and preserves tag fallback behavior", () => {
    const metadata = buildAutoCatMetadata([
      detail(1, {
        categories: ["Steam Cloud", "Single-player"],
        genres: ["RPG"],
        supported_languages: ["Italian"],
        developers: ["Studio 10"],
      }),
      detail(2, {
        categories: ["Co-op"],
        genres: ["Action"],
        publishers: ["Studio 2"],
      }),
    ]);

    expect(metadata.tagValues).toEqual(["Co-op", "Single-player", "Steam Cloud"]);
    expect(metadata.genreValues).toEqual(["Action", "RPG"]);
    expect(metadata.studioValues).toEqual(["Studio 2", "Studio 10"]);
    expect(metadata.gamesWithTags).toBe(2);
  });

  it("normalizes processed app ids without mutating the categorizer result", () => {
    const result = {
      assignments: { RPG: [1] },
      games_processed: 1,
      games_categorized: 1,
    };
    const withIds = withProcessedAppIds(result, [2.9, 2, Number.NaN, 4]);

    expect(withIds).not.toBe(result);
    expect(withIds.processed_app_ids).toEqual([2, 4]);
    expect(result).not.toHaveProperty("processed_app_ids");
  });
});
