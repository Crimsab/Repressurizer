import { describe, expect, it } from "vitest";
import { parseHltbIgnored, serializeHltbIgnored } from "./hltbIgnoredStore";

describe("HLTB ignored persistence", () => {
  it("discards pre-fix not-found counters", () => {
    expect(parseHltbIgnored(JSON.stringify({ 220: 3, 4248: 3 }))).toEqual({});
  });

  it("restores counters written for the current provider revision", () => {
    const serialized = serializeHltbIgnored({ 220: 2, 1091500: 3 });

    expect(parseHltbIgnored(serialized)).toEqual({ 220: 2, 1091500: 3 });
  });

  it("rejects malformed counters without losing valid entries", () => {
    const serialized = JSON.stringify({
      version: 2,
      providerRevision: "site-search-v1",
      fails: { 220: 2, invalid: 3, 4248: -1 },
    });

    expect(parseHltbIgnored(serialized)).toEqual({ 220: 2 });
  });
});
