import { describe, expect, it } from "vitest";
import {
  detailsPriceMatchesCurrency,
  detailsPriceNeedsCurrencyRefresh,
  detailsWithPriceForCurrency,
  mergePriceSnapshotIntoDetails,
} from "./prices";
import type { GameDetails } from "./types";

function details(currency: string | null, final: number | null = 99): GameDetails {
  return {
    app_id: 508290,
    name: "$1 Ride",
    genres: [],
    categories: [],
    release_date: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: final,
    price_final: final,
    price_currency: currency,
    is_free: false,
  };
}

describe("details price currency matching", () => {
  it("marks priced details with a different currency as needing refresh", () => {
    expect(detailsPriceMatchesCurrency(details("EUR"), "EUR")).toBe(true);
    expect(detailsPriceMatchesCurrency(details("INR"), "EUR")).toBe(false);
    expect(detailsPriceNeedsCurrencyRefresh(details("INR"), "EUR")).toBe(true);
  });

  it("uses a matching cached price snapshot even when top-level price is another currency", () => {
    const cached = {
      ...details("INR", 2600),
      price_cache: {
        EUR: {
          price_initial: 199,
          price_final: 99,
          price_currency: "EUR",
          price_country_code: "IT",
          is_free: false,
        },
      },
    };

    expect(detailsPriceMatchesCurrency(cached, "EUR")).toBe(true);
    expect(detailsPriceNeedsCurrencyRefresh(cached, "EUR")).toBe(false);
    expect(detailsWithPriceForCurrency(cached, "EUR")?.price_final).toBe(99);
  });

  it("does not force refresh for free or unknown-price details", () => {
    expect(detailsPriceMatchesCurrency({ ...details("INR"), is_free: true }, "EUR")).toBe(true);
    expect(detailsPriceMatchesCurrency(details(null, null), "EUR")).toBe(true);
  });

  it("merges regional price snapshots without losing the previous currency", () => {
    const merged = mergePriceSnapshotIntoDetails(details("INR", 2600), {
      price_initial: 199,
      price_final: 99,
      price_currency: "EUR",
      price_country_code: "IT",
      is_free: false,
    });

    expect(merged.price_final).toBe(99);
    expect(merged.price_currency).toBe("EUR");
    expect(merged.price_cache?.INR.price_final).toBe(2600);
    expect(merged.price_cache?.EUR.price_final).toBe(99);
  });

  it("treats an explicit unavailable regional price snapshot as cached", () => {
    const merged = mergePriceSnapshotIntoDetails(details("INR", 2600), {
      price_initial: null,
      price_final: null,
      price_currency: "EUR",
      price_country_code: "IT",
      is_free: false,
    });

    expect(detailsPriceNeedsCurrencyRefresh(merged, "EUR")).toBe(false);
    expect(detailsWithPriceForCurrency(merged, "INR")?.price_final).toBe(2600);
  });
});
