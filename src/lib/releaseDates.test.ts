import { describe, expect, it } from "vitest";
import {
  bestAvailableReleaseDate,
  STORE_RELEASE_DATE_TTL_MS,
  storeReleaseDateNeedsRefresh,
  yearCategorizationReleaseDate,
} from "./releaseDates";
import type { GameDetails } from "./types";

function details(overrides: Partial<GameDetails>): GameDetails {
  return {
    app_id: 260730,
    name: "Desperados: Wanted Dead or Alive",
    genres: [],
    tags: [],
    categories: [],
    release_date: null,
    store_release_date: null,
    store_release_date_fetched_at: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: false, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: null,
    price_country_code: null,
    is_free: false,
    ...overrides,
  };
}

describe("release date helpers", () => {
  it("prefers the Store page release date for display/search helpers", () => {
    expect(bestAvailableReleaseDate(details({
      release_date: "20 Nov, 2013",
      store_release_date: "23 Jul, 2001",
    }))).toBe("23 Jul, 2001");
  });

  it("does not use unchecked API release dates for year categorization", () => {
    expect(yearCategorizationReleaseDate(details({
      release_date: "20 Nov, 2013",
    }))).toBeNull();
  });

  it("falls back to API release dates after the Store page was checked", () => {
    expect(yearCategorizationReleaseDate(details({
      release_date: "5 Dec, 2020",
      store_release_date_fetched_at: 1,
    }))).toBe("5 Dec, 2020");
  });

  it("refreshes missing Store dates when the check is absent or stale", () => {
    const now = 20_000_000_000;

    expect(storeReleaseDateNeedsRefresh(details({}), now)).toBe(true);
    expect(storeReleaseDateNeedsRefresh(details({
      store_release_date_fetched_at: now - STORE_RELEASE_DATE_TTL_MS - 1,
    }), now)).toBe(true);
    expect(storeReleaseDateNeedsRefresh(details({
      store_release_date_fetched_at: now - STORE_RELEASE_DATE_TTL_MS + 1,
    }), now)).toBe(false);
    expect(storeReleaseDateNeedsRefresh(details({
      store_release_date: "23 Jul, 2001",
    }), now)).toBe(false);
  });
});
