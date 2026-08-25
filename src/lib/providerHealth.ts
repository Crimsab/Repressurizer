export type MetadataProvider =
  | "steam-library"
  | "steam-details"
  | "steam-reviews"
  | "steam-achievements"
  | "steam-family"
  | "steam-release-dates"
  | "hltb";

export type ProviderOutcome =
  | "success"
  | "missing"
  | "private"
  | "unavailable"
  | "rate-limited"
  | "transient-error";

export interface ProviderHealthRecord {
  provider: MetadataProvider;
  lastAttemptAt: number;
  lastSuccessAt: number | null;
  lastOutcome: ProviderOutcome;
  consecutiveFailures: number;
  successCount: number;
  missingCount: number;
  failureCount: number;
}

export type ProviderDataState =
  | "fresh"
  | "stale"
  | "missing"
  | "private"
  | "unavailable"
  | "rate-limited"
  | "error"
  | "unknown";

export function classifyProviderError(error: unknown): ProviderOutcome {
  const message = String(error).toLowerCase();
  if (message.includes("429") || message.includes("rate limit")) return "rate-limited";
  if (message.includes("private") || message.includes("profile is not public")) return "private";
  if (
    message.includes("not found") ||
    message.includes("no achievements") ||
    message.includes("unavailable")
  ) {
    return "unavailable";
  }
  return "transient-error";
}

export function recordProviderObservation(
  current: ProviderHealthRecord | undefined,
  provider: MetadataProvider,
  outcome: ProviderOutcome,
  observedAt = Date.now(),
): ProviderHealthRecord {
  const success = outcome === "success";
  const missing = outcome === "missing";
  const failure = !success && !missing;
  return {
    provider,
    lastAttemptAt: observedAt,
    lastSuccessAt: success ? observedAt : current?.lastSuccessAt ?? null,
    lastOutcome: outcome,
    consecutiveFailures: success || missing ? 0 : (current?.consecutiveFailures ?? 0) + 1,
    successCount: (current?.successCount ?? 0) + (success ? 1 : 0),
    missingCount: (current?.missingCount ?? 0) + (missing ? 1 : 0),
    failureCount: (current?.failureCount ?? 0) + (failure ? 1 : 0),
  };
}

export function providerDataState(
  record: ProviderHealthRecord | undefined,
  maxAgeMs: number,
  now = Date.now(),
): ProviderDataState {
  if (!record) return "unknown";
  if (record.lastOutcome === "missing") return "missing";
  if (record.lastOutcome === "private") return "private";
  if (record.lastOutcome === "unavailable") return "unavailable";
  if (record.lastOutcome === "rate-limited") return "rate-limited";
  if (record.lastOutcome === "transient-error") return "error";
  return now - record.lastAttemptAt > Math.max(0, maxAgeMs) ? "stale" : "fresh";
}

export function stableEventId(parts: Array<string | number | boolean | null | undefined>): string {
  const input = parts.map((part) => String(part ?? "")).join("\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `evt_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
