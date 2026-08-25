import { describe, expect, it } from "vitest";
import { compactLibraryInboxEvents, createLibraryInboxSnapshot, detectFamilyInboxEvents, detectLibraryInboxEvents, providerHealthInboxEvents, type LibraryInboxEvent, type LibraryInboxObservation } from "./libraryInbox";

function observation(patch: Partial<LibraryInboxObservation> = {}): LibraryInboxObservation {
  return {
    observedAt: 2_000,
    games: {
      1: { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      2: { appid: 2, name: "Two", playtime_forever: 180, img_icon_url: null, rtime_last_played: 0 },
    },
    steamLibraryAppIds: [1, 2],
    installedAppIds: [1],
    familyAppIds: [],
    familyObservedAt: null,
    collections: [{ id: "x", key: "user-collections.x", name: "X", added: [1], removed: [], timestamp: 1, is_deleted: false, is_dynamic: false }],
    details: {},
    detailsMaxAgeDays: 30,
    hltbData: {},
    hltbTimeMode: "main_story",
    statuses: {},
    diaryEntries: {},
    ...patch,
  };
}

describe("detectLibraryInboxEvents", () => {
  it("detects library and local install changes after a successful snapshot", () => {
    const previousInput = observation({ observedAt: 1_000, steamLibraryAppIds: [1], installedAppIds: [2] });
    const result = detectLibraryInboxEvents(createLibraryInboxSnapshot(previousInput), observation());
    expect(result.events.map((event) => event.kind)).toEqual(expect.arrayContaining(["games-added", "games-installed", "games-uninstalled"]));
  });

  it("never infers an uninstall when local installation data is unavailable", () => {
    const previous = createLibraryInboxSnapshot(observation({ installedAppIds: [1, 2] }));
    const result = detectLibraryInboxEvents(previous, observation({ installedAppIds: null }));
    expect(result.events.some((event) => event.kind === "games-uninstalled")).toBe(false);
  });

  it("never infers Family removals from a cache read with the same observation time", () => {
    const previous = createLibraryInboxSnapshot(observation({ familyAppIds: [9], familyObservedAt: 500 }));
    const result = detectLibraryInboxEvents(previous, observation({ familyAppIds: [], familyObservedAt: 500 }));
    expect(result.events.some((event) => event.kind === "family-removed")).toBe(false);
  });

  it("reports Family changes from a confirmed fresh observation", () => {
    expect(detectFamilyInboxEvents([8], [9], 3_000).map((event) => event.kind)).toEqual(["family-added", "family-removed"]);
  });

  it("aggregates noisy metadata and collection anomalies", () => {
    const result = detectLibraryInboxEvents(null, observation());
    expect(result.events.filter((event) => event.kind === "metadata-missing")).toHaveLength(1);
    expect(result.events.find((event) => event.kind === "metadata-missing")?.count).toBe(2);
    expect(result.events.filter((event) => event.kind === "uncategorized")).toHaveLength(1);
  });

  it("creates stable provider errors without storing raw error messages", () => {
    const events = providerHealthInboxEvents({
      hltb: { provider: "hltb", lastAttemptAt: 1, lastSuccessAt: null, lastOutcome: "rate-limited", consecutiveFailures: 1, successCount: 0, missingCount: 0, failureCount: 1 },
    }, 3_000);
    expect(events).toMatchObject([{ kind: "provider-error", provider: "hltb", context: "rate-limited" }]);
    expect(JSON.stringify(events)).not.toContain("429");
  });

  it("aggregates diary conditions instead of creating one notification per game", () => {
    const result = detectLibraryInboxEvents(null, observation({
      statuses: { 1: "completed", 2: "beaten" },
      diaryEntries: { 1: { decision: "next" }, 2: { decision: "next" } },
    }));
    const rows = result.events.filter((event) => event.kind === "diary-finished-playing");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appIds: [1, 2], count: 2 });
  });

  it("compacts legacy per-game rows during migration", () => {
    const legacy = [1, 2].map((appId): LibraryInboxEvent => ({
      id: `legacy-${appId}`, kind: "diary-finished-playing", category: "diary", importance: "important",
      occurredAt: appId, lastObservedAt: appId, source: "Diary", confidence: "high", recommendedAction: "fix-diary",
      status: "unread", snoozedUntil: null, appIds: [appId], count: 1, context: String(appId),
    }));
    expect(compactLibraryInboxEvents(legacy)).toMatchObject([{ appIds: [1, 2], count: 2, context: undefined }]);
  });
});
