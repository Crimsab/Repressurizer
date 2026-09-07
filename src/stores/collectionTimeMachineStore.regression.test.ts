import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamCollection } from "../lib/types";

const key = "collection-time-machine.json";
const emptyHistory = JSON.stringify({
  version: 1, retention: "100-snapshots", snapshots: [], events: [], pinnedSnapshotIds: [],
});
const collection: SteamCollection = {
  id: "a", key: "user-collections.a", name: "A", added: [1], removed: [],
  timestamp: 0, is_deleted: false, is_dynamic: false,
};

afterEach(() => {
  vi.doUnmock("@tauri-apps/api/core");
  vi.resetModules();
});

async function setup() {
  const files = new Map([[key, emptyHistory]]);
  const read = vi.fn(async (name: string): Promise<string | null> => files.get(name) ?? null);
  const write = vi.fn(async (name: string, data: string) => { files.set(name, data); });
  vi.doMock("@tauri-apps/api/core", () => ({
    invoke: async (command: string, args: { key: string; data: string }) => {
      if (command === "load_app_data") return read(args.key);
      if (command === "save_app_data") return write(args.key, args.data);
    },
  }));
  const { useCollectionTimeMachineStore: store } = await import("./collectionTimeMachineStore");
  const { flushPersistence } = await import("../lib/persistenceQueue");
  const record = () => store.getState().recordTransition({
    before: [collection], after: [{ ...collection, added: [1, 2] }],
    origin: "manual", steamAccountId: "123",
  });
  return { store, files, read, write, record, flushPersistence };
}

describe("Time Machine persistence and hydration", () => {
  it("flushes a queued history snapshot before reading the same file", async () => {
    const x = await setup();
    x.record();
    x.store.getState().setRetention("all");
    await x.store.getState().hydrate();
    expect(x.store.getState().events).toHaveLength(1);
    expect(x.store.getState().retention).toBe("all");
    expect(JSON.parse(x.files.get(key)!).events).toHaveLength(1);
    expect(x.write.mock.calls.filter(([name]) => name === key)).toHaveLength(1);
    await x.flushPersistence();
  });

  it("keeps edits made while an older disk read is in flight", async () => {
    const x = await setup();
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    x.read.mockImplementationOnce(() => pending);
    const hydration = x.store.getState().hydrate();
    await vi.waitFor(() => expect(x.read).toHaveBeenCalled());
    x.record();
    x.store.getState().setRetention("all");
    release(emptyHistory);
    await hydration;
    expect(x.store.getState().hydrated).toBe(true);
    expect(x.store.getState().events).toHaveLength(1);
    expect(x.store.getState().retention).toBe("all");
    await x.flushPersistence();
    expect(JSON.parse(x.files.get(key)!).events).toHaveLength(1);
  });

  it("still loads existing history when there are no intervening edits", async () => {
    const x = await setup();
    x.record();
    await x.flushPersistence();
    x.store.setState({ events: [], snapshots: [], hydrated: false });
    await x.store.getState().hydrate();
    expect(x.store.getState().events).toHaveLength(1);
    expect(x.store.getState().snapshots).toHaveLength(2);
  });
});
