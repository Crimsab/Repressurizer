import { describe, expect, test } from "vitest";
import { createRepressurizerProfile } from "./repressurizerProfile";
import { createProfileSyncEnvelope, mergeProfileDocuments, parseProfileSyncEnvelope, profileEntityChanges, resolveProfileSyncConflicts } from "./profileSync";

const profile = (deviceId: string, sections: Record<string, unknown>) => createRepressurizerProfile({ profileId: "sync", name: "Sync", deviceId, steamAccountId: null, sections });

describe("profile sync", () => {
  test("verifies envelopes and rejects partial or corrupted content", () => {
    const envelope = createProfileSyncEnvelope({ deviceId: "deck", sequence: 3, previousChecksum: null, profile: profile("deck", { preferences: { tags: { 1: ["deck"] } } }), journal: [] });
    expect(parseProfileSyncEnvelope(envelope)?.sequence).toBe(3);
    expect(parseProfileSyncEnvelope({ ...envelope, sequence: 4 })).toBeNull();
  });

  test("merges independent entities without relying on timestamps", () => {
    const base = profile("base", { preferences: { notes: { 1: "base" }, tags: { 2: ["rpg"] } } });
    const local = profile("pc", { preferences: { notes: { 1: "local" }, tags: { 2: ["rpg"] } } });
    const remote = profile("deck", { preferences: { notes: { 1: "base" }, tags: { 2: ["rpg", "deck"] } } });
    const result = mergeProfileDocuments(base, local, remote);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.sections.preferences).toEqual({ notes: { 1: "local" }, tags: { 2: ["rpg", "deck"] } });
  });

  test("surfaces concurrent edits and applies a selective decision", () => {
    const base = profile("base", { diary: { entries: { 10: { text: "base" } } } });
    const local = profile("pc", { diary: { entries: { 10: { text: "local" } } } });
    const remote = profile("deck", { diary: { entries: { 10: { text: "remote" } } } });
    const result = mergeProfileDocuments(base, local, remote);
    expect(result.conflicts.map((item) => item.path)).toEqual(["sections.diary.entries.10.text"]);
    expect((resolveProfileSyncConflicts(result, { "sections.diary.entries.10.text": "remote" }).sections.diary as any).entries[10].text).toBe("remote");
  });

  test("resolves conflicts inside stable entity arrays", () => {
    const base = profile("base", { collections: [{ key: "c", name: "Base", added: [] }] });
    const local = profile("pc", { collections: [{ key: "c", name: "Local", added: [] }] });
    const remote = profile("deck", { collections: [{ key: "c", name: "Remote", added: [] }] });
    const result = mergeProfileDocuments(base, local, remote);
    expect(result.conflicts[0].path).toBe("sections.collections[key:c].name");
    expect((resolveProfileSyncConflicts(result, { "sections.collections[key:c].name": "remote" }).sections.collections as any[])[0].name).toBe("Remote");
  });

  test("journals profile changes as individual entities", () => {
    const base = profile("pc", { diary: { entries: { 10: { priority: "normal" } } }, planner: { presets: [] } });
    const current = profile("pc", { diary: { entries: { 10: { priority: "high" } } }, planner: { presets: [{ id: "quick", name: "Quick" }] } });
    expect(profileEntityChanges(base, current).map((change) => `${change.entityType}:${change.operation}:${change.entityId}`)).toEqual(["diary-entry:update:entry:10", "planner-preset:create:preset:id:quick"]);
  });
});
