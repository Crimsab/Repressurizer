import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamCollection } from "../lib/types";

afterEach(() => { vi.doUnmock("@tauri-apps/api/core"); vi.resetModules(); });

async function setup() {
  vi.resetModules();
  const files = new Map<string, string>();
  vi.doMock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async (command: string, args?: { key?: string; data?: string }) => {
    if (command === "load_app_data") return files.get(args!.key!) ?? null;
    if (command === "save_app_data") files.set(args!.key!, args!.data!);
    return null;
  }) }));
  const runtime = await import("./profileRuntime");
  const { useCollectionTimeMachineStore: time } = await import("./collectionTimeMachineStore");
  const { useConflictResolverStore: conflicts } = await import("./conflictResolverStore");
  const { useEntityJournalStore: journal } = await import("./entityJournalStore");
  const { useNotesStore: notes } = await import("./notesStore");
  const { createRepressurizerProfile: profile } = await import("../lib/repressurizerProfile");
  const { flushPersistence } = await import("../lib/persistenceQueue");
  await runtime.ensureProfileHistoryReady();
  return { ...runtime, time, conflicts, journal, notes, profile, files, flushPersistence };
}

describe("profile history import", () => {
  it("round-trips all four history arrays without duplicates or changing local device identity", async () => {
    const x = await setup();
    const collection: SteamCollection = { id: "a", key: "user-collections.a", name: "A", added: [1], removed: [], timestamp: 0, is_deleted: false, is_dynamic: false };
    x.time.getState().recordTransition({ before: [collection], after: [{ ...collection, name: "Renamed" }], origin: "manual", steamAccountId: "123" });
    x.conflicts.getState().recordDecisions("merge-a", [{ identity: "a", kind: "name", choice: "steam" }]);
    x.journal.getState().append({ entityType: "profile", entityId: "p", operation: "create", value: {} });
    const history = x.captureProfileSections(true).history as Record<string, unknown[]>;
    for (const entries of Object.values(history)) expect(entries.length).toBeGreaterThan(0);
    const document = x.profile({ profileId: "p", name: "History", deviceId: "source", steamAccountId: "123", sections: { history } });
    x.time.setState({ snapshots: [], events: [], pinnedSnapshotIds: [] });
    x.conflicts.setState({ recentDecisions: [] });
    x.journal.setState({ entries: [], deviceId: "destination-device", nextSequence: 1 });
    x.applyProfileSections(document, new Set(["history"]));
    const first = x.captureProfileSections(true).history;
    x.applyProfileSections(document, new Set(["history"]));
    expect(x.captureProfileSections(true).history).toEqual(first);
    expect(first).toEqual(history);
    expect(x.journal.getState().deviceId).toBe("destination-device");
    expect(x.journal.getState().nextSequence).toBe(1);
    await x.flushPersistence();
    expect(JSON.parse(x.files.get("conflict-resolver.json")!).recentDecisions).toHaveLength(history.recentConflictDecisions.length);
    expect(JSON.parse(x.files.get("entity-journal.json")!).entries).toHaveLength(history.entityJournal.length);
  });

  it("rejects malformed history before applying another selected section", async () => {
    const x = await setup();
    x.notes.setState({ notes: { 1: "Keep this" } });
    const document = x.profile({ profileId: "bad", name: "Bad history", deviceId: "source", steamAccountId: null, sections: { preferences: { notes: { 1: "Changed" } }, history: { entityJournal: [{ id: "bad" }] } } });
    expect(() => x.applyProfileSections(document, new Set(["preferences", "history"]))).toThrow(/journal/i);
    expect(x.notes.getState().notes[1]).toBe("Keep this");
    await x.flushPersistence();
    expect(x.files.has("notes.json")).toBe(false);
  });
});
