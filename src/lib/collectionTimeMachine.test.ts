import { describe, expect, it } from "vitest";
import { buildSelectiveRestore, createCollectionSnapshot, createTimelineEvent, diffCollectionSnapshots, parseCollectionSnapshot } from "./collectionTimeMachine";
import type { SteamCollection } from "./types";

function collection(key: string, name: string, added: number[], extra: Record<string, unknown> = {}): SteamCollection {
  return { id: key, key, name, added, removed: [], timestamp: 1, is_deleted: false, is_dynamic: false, ...extra } as SteamCollection;
}

describe("collection time machine", () => {
  it("detects identity-safe structural and membership changes", () => {
    const before = [collection("a", "Same", [1, 2], { color: "red" }), collection("b", "Same", [3])];
    const after = [collection("b", "Same", [3, 4]), collection("a", "Renamed", [2], { color: "blue" })];
    const diff = diffCollectionSnapshots(before, after);
    expect(diff).toMatchObject({ renamed: 1, colors: 1, reordered: 2, gamesAdded: 1, gamesRemoved: 1 });
  });

  it("deduplicates snapshots by content and records a before/after event", () => {
    const before = createCollectionSnapshot({ collections: [collection("a", "A", [1])], steamAccountId: "account", deviceId: "device", createdAt: 1 });
    const duplicate = createCollectionSnapshot({ collections: [collection("a", "A", [1])], steamAccountId: "account", deviceId: "other", createdAt: 2 });
    const after = createCollectionSnapshot({ collections: [collection("a", "A", [1, 2])], steamAccountId: "account", deviceId: "device", createdAt: 3 });
    expect(before.id).toBe(duplicate.id);
    expect(createTimelineEvent({ before, after, origin: "manual", occurredAt: 4 })?.diff.gamesAdded).toBe(1);
    expect(createTimelineEvent({ before, after: duplicate, origin: "manual" })).toBeNull();
  });

  it("ignores timestamp-only observations", () => {
    const before = createCollectionSnapshot({ collections: [collection("a", "A", [1])], steamAccountId: "account", deviceId: "device" });
    const after = createCollectionSnapshot({ collections: [{ ...collection("a", "A", [1]), timestamp: 999 }], steamAccountId: "account", deviceId: "device" });
    expect(createTimelineEvent({ before, after, origin: "steam" })).toBeNull();
  });

  it("previews full and selective restores without mutating the source", () => {
    const current = [collection("a", "Current", [1, 3]), collection("b", "B", [9])];
    const target = [collection("a", "Target", [1, 2])];
    expect(buildSelectiveRestore({ current, target, mode: "rename" })[0].name).toBe("Target");
    expect(buildSelectiveRestore({ current, target, mode: "added" })[0].added).toEqual([1, 2, 3]);
    expect(buildSelectiveRestore({ current, target, mode: "removed" })[0].added).toEqual([1]);
    expect(buildSelectiveRestore({ current, target, mode: "full" })).toEqual(target);
    expect(current[0].name).toBe("Current");
  });

  it("rejects incompatible snapshots and preserves unknown collection fields", () => {
    expect(parseCollectionSnapshot({ version: 99, collections: [] })).toBeNull();
    const parsed = parseCollectionSnapshot({ version: 1, collections: [collection("a", "A", [], { future_field: { ok: true } })], steamAccountId: "a", deviceId: "d", createdAt: 1 });
    expect((parsed?.collections[0] as SteamCollection & { future_field: unknown }).future_field).toEqual({ ok: true });
  });
});
