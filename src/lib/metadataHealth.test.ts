import { describe, expect, test } from "vitest";
import { gameMetadataOverall, metadataRefreshIds, summarizeProvider } from "./metadataHealth";
import { recordProviderObservation, providerRefreshAllowed } from "./providerHealth";
describe("metadata health", () => {
  test("distinguishes missing, stale, temporary errors, and complete data", () => { expect(gameMetadataOverall(["fresh", "fresh"])).toBe("complete"); expect(gameMetadataOverall(["fresh", "missing"])).toBe("partial"); expect(gameMetadataOverall(["fresh", "stale"])).toBe("stale"); expect(gameMetadataOverall(["fresh", "error"])).toBe("error"); expect(gameMetadataOverall(["missing", "unknown"])).toBe("unavailable"); });
  test("summarizes provider counts and refresh scopes", () => { const fresh = recordProviderObservation(undefined, "hltb", "success", 900); const missing = recordProviderObservation(undefined, "hltb", "missing", 900); const summary = summarizeProvider("hltb", fresh, { 1: fresh, 2: missing }, 200, 1000); expect(summary.updatedGames).toBe(1); expect(summary.missing).toBe(1); expect(metadataRefreshIds("missing", [1, 2, 3], { 1: fresh, 2: missing }, 200, 1000)).toEqual([2, 3]); });
  test("backs off transient and rate-limited providers without using clock order for data", () => { const record = recordProviderObservation(undefined, "steam-reviews", "rate-limited", 1000); expect(providerRefreshAllowed(record, 1001).allowed).toBe(false); expect(providerRefreshAllowed(record, 302_000).allowed).toBe(true); });
});
