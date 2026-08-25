import { describe, expect, it } from "vitest";
import {
  classifyProviderError,
  providerDataState,
  recordProviderObservation,
  stableEventId,
} from "./providerHealth";

describe("provider health", () => {
  it("distinguishes rate limits, private data, unavailable data, and transient errors", () => {
    expect(classifyProviderError("HTTP 429 rate limit exceeded")).toBe("rate-limited");
    expect(classifyProviderError("Profile is not public")).toBe("private");
    expect(classifyProviderError("App not found")).toBe("unavailable");
    expect(classifyProviderError("connection reset")).toBe("transient-error");
  });

  it("keeps the last success while tracking later failures", () => {
    const healthy = recordProviderObservation(undefined, "hltb", "success", 1_000);
    const failed = recordProviderObservation(healthy, "hltb", "transient-error", 2_000);

    expect(failed).toMatchObject({
      lastSuccessAt: 1_000,
      lastAttemptAt: 2_000,
      consecutiveFailures: 1,
      successCount: 1,
      failureCount: 1,
    });
    expect(providerDataState(failed, 10_000, 3_000)).toBe("error");
  });

  it("marks successful observations stale only after their freshness window", () => {
    const record = recordProviderObservation(undefined, "steam-details", "success", 1_000);
    expect(providerDataState(record, 5_000, 5_999)).toBe("fresh");
    expect(providerDataState(record, 5_000, 6_001)).toBe("stale");
  });

  it("builds stable event ids from normalized identity fields", () => {
    expect(stableEventId(["installed", 1623730, "device-a"])).toBe(
      stableEventId(["installed", 1623730, "device-a"]),
    );
    expect(stableEventId(["installed", 1623730, "device-a"])).not.toBe(
      stableEventId(["uninstalled", 1623730, "device-a"]),
    );
  });
});
