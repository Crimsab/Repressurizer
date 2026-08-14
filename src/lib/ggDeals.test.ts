import { describe, expect, it } from "vitest";
import {
  GG_DEALS_CACHE_TTL_MS,
  bestCurrentGgDealsPrice,
  formatGgDealsPrice,
  ggDealsRegionForCurrency,
  isFreshGgDealsRecord,
  safeGgDealsUrl,
} from "./ggDeals";
import type { GgDealsPrice } from "./types";

const fixture: GgDealsPrice = {
  appId: 620,
  url: "https://gg.deals/game/portal-2/",
  currency: "€",
  currentRetail: 1.95,
  currentKeyshops: 1.37,
  historicalRetail: 0.97,
  historicalKeyshops: 0.82,
};

describe("GG.deals pricing", () => {
  it("selects the lowest current offer without hiding its source", () => {
    expect(bestCurrentGgDealsPrice(fixture)).toEqual({ price: 1.37, source: "keyshop" });
    expect(bestCurrentGgDealsPrice({ ...fixture, currentKeyshops: null })).toEqual({
      price: 1.95,
      source: "retail",
    });
  });

  it("keeps the cache fresh for 24 hours", () => {
    const fetchedAt = 10_000;
    const record = { data: fixture, fetchedAt };
    expect(isFreshGgDealsRecord(record, fetchedAt + GG_DEALS_CACHE_TTL_MS - 1)).toBe(true);
    expect(isFreshGgDealsRecord(record, fetchedAt + GG_DEALS_CACHE_TTL_MS)).toBe(false);
    expect(isFreshGgDealsRecord(record, fetchedAt - 1)).toBe(false);
  });

  it("formats prices and only allows official offer links", () => {
    expect(formatGgDealsPrice(1.5, "€")).toBe("1.50€");
    expect(formatGgDealsPrice(1.5, "$")).toBe("$1.50");
    expect(safeGgDealsUrl(fixture.url)).toBe("https://gg.deals/game/portal-2/");
    expect(safeGgDealsUrl("https://example.com/?key=secret")).toBeNull();
  });

  it("maps supported currencies to bounded regions and falls back safely", () => {
    expect(ggDealsRegionForCurrency("EUR")).toBe("it");
    expect(ggDealsRegionForCurrency("JPY")).toBe("us");
    expect(ggDealsRegionForCurrency("unknown")).toBe("us");
  });
});
