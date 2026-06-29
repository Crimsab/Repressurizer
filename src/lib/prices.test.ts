import { describe, expect, it } from "vitest";
import { detailsPriceMatchesCurrency, detailsPriceNeedsCurrencyRefresh } from "./prices";
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

  it("does not force refresh for free or unknown-price details", () => {
    expect(detailsPriceMatchesCurrency({ ...details("INR"), is_free: true }, "EUR")).toBe(true);
    expect(detailsPriceMatchesCurrency(details(null, null), "EUR")).toBe(true);
  });
});
