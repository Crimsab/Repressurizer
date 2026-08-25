import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));

import { useLibraryInboxStore } from "./libraryInboxStore";
import type { LibraryInboxEvent } from "../lib/libraryInbox";

function event(id: string): LibraryInboxEvent {
  return { id, kind: "games-added", category: "library", importance: "important", occurredAt: 1, lastObservedAt: 1, source: "Steam", confidence: "high", recommendedAction: "review", status: "unread", snoozedUntil: null, appIds: [1], count: 1 };
}

describe("libraryInboxStore", () => {
  beforeEach(() => useLibraryInboxStore.setState({ events: [event("one"), event("two")], history: [], disabledCategories: [], snapshot: null, hydrated: true }));

  it("records bulk transitions and can undo them", () => {
    useLibraryInboxStore.getState().transition(["one", "two"], "reviewed");
    expect(useLibraryInboxStore.getState().events.every((item) => item.status === "reviewed")).toBe(true);
    expect(useLibraryInboxStore.getState().undoLastAction()).toBe(true);
    expect(useLibraryInboxStore.getState().events.every((item) => item.status === "unread")).toBe(true);
  });

  it("deduplicates observations using stable event identifiers", () => {
    const input = {
      games: { 1: { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 } },
      steamLibraryAppIds: [1], installedAppIds: [1], familyAppIds: [], familyObservedAt: null,
      collections: [], details: {}, detailsMaxAgeDays: 30, hltbData: {}, hltbTimeMode: "main_story" as const,
      statuses: {}, diaryEntries: {}, observedAt: 10,
    };
    useLibraryInboxStore.setState({ events: [], snapshot: null });
    useLibraryInboxStore.getState().observe(input);
    useLibraryInboxStore.getState().observe({ ...input, observedAt: 20 });
    const ids = useLibraryInboxStore.getState().events.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reopens a stable aggregate only when its contents materially change", () => {
    const input = {
      games: { 1: { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 } },
      steamLibraryAppIds: [1], installedAppIds: [1], familyAppIds: [], familyObservedAt: null,
      collections: [], details: {}, detailsMaxAgeDays: 30, hltbData: {}, hltbTimeMode: "main_story" as const,
      statuses: {}, diaryEntries: {}, observedAt: 10,
    };
    useLibraryInboxStore.setState({ events: [], snapshot: null });
    useLibraryInboxStore.getState().observe(input);
    const metadataId = useLibraryInboxStore.getState().events.find((item) => item.kind === "metadata-missing")!.id;
    useLibraryInboxStore.getState().transition([metadataId], "reviewed");
    useLibraryInboxStore.getState().observe({ ...input, observedAt: 20 });
    expect(useLibraryInboxStore.getState().events.find((item) => item.id === metadataId)?.status).toBe("reviewed");

    useLibraryInboxStore.getState().observe({
      ...input,
      observedAt: 30,
      games: { ...input.games, 2: { appid: 2, name: "Two", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 } },
      steamLibraryAppIds: [1, 2],
    });
    expect(useLibraryInboxStore.getState().events.find((item) => item.id === metadataId)?.status).toBe("unread");
  });
});
