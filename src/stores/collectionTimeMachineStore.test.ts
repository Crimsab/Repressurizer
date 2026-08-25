import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));
vi.mock("./entityJournalStore", () => ({ useEntityJournalStore: { getState: () => ({ deviceId: "device", append: vi.fn() }) } }));

import { useCollectionTimeMachineStore } from "./collectionTimeMachineStore";
import type { SteamCollection } from "../lib/types";

const collection = (added: number[]): SteamCollection => ({ id: "a", key: "a", name: "A", added, removed: [], timestamp: 1, is_deleted: false, is_dynamic: false });

describe("collectionTimeMachineStore", () => {
  beforeEach(() => useCollectionTimeMachineStore.setState({ version: 1, retention: "100-snapshots", snapshots: [], events: [], pinnedSnapshotIds: [], hydrated: true }));

  it("records deduplicated before/after snapshots", () => {
    const store = useCollectionTimeMachineStore.getState();
    expect(store.recordTransition({ before: [collection([1])], after: [collection([1, 2])], origin: "manual", steamAccountId: "account", occurredAt: 10 })).not.toBeNull();
    expect(useCollectionTimeMachineStore.getState().snapshots).toHaveLength(2);
    useCollectionTimeMachineStore.getState().recordTransition({ before: [collection([1])], after: [collection([1, 2])], origin: "autocat", steamAccountId: "account", occurredAt: 20 });
    expect(useCollectionTimeMachineStore.getState().snapshots).toHaveLength(2);
    expect(useCollectionTimeMachineStore.getState().events).toHaveLength(2);
  });

  it("retains pinned content when pruning old events", () => {
    const store = useCollectionTimeMachineStore.getState();
    store.recordTransition({ before: [collection([1])], after: [collection([2])], origin: "manual", steamAccountId: "account", occurredAt: 1 });
    const snapshotId = useCollectionTimeMachineStore.getState().snapshots[0].id;
    useCollectionTimeMachineStore.getState().togglePinned(snapshotId);
    useCollectionTimeMachineStore.getState().setRetention("30-days");
    expect(useCollectionTimeMachineStore.getState().snapshots.some((snapshot) => snapshot.id === snapshotId)).toBe(true);
  });
});
