import { afterEach, describe, expect, it, vi } from "vitest";
import { createJournalEntry } from "../lib/entityJournal";

afterEach(() => {
  vi.doUnmock("../lib/tauri");
  vi.doUnmock("@tauri-apps/api/core");
  vi.resetModules();
});

async function setup(raw: string | null) {
  let release!: (value: string | null) => void;
  const pending = new Promise<string | null>((resolve) => { release = resolve; });
  let reject!: (error: Error) => void;
  const firstRead = new Promise<string | null>((resolve, fail) => { pending.then(resolve); reject = fail; });
  const read = vi.fn().mockImplementationOnce(() => firstRead).mockResolvedValue(raw);
  const writes: string[] = [];
  vi.doMock("../lib/tauri", () => ({
    loadAppData: read,
    saveAppData: vi.fn(async (_key: string, data: string) => { writes.push(data); }),
  }));
  const { useEntityJournalStore: store } = await import("./entityJournalStore");
  return { store, release: () => release(raw), reject, read, writes };
}

describe("entity journal hydration and import", () => {
  it("rebases an append made before hydration onto the persisted device sequence", async () => {
    const diskEntry = createJournalEntry({ deviceId: "disk-device", sequence: 5, entityType: "profile", entityId: "old", operation: "update", value: { old: true }, changedAt: 10 });
    const x = await setup(JSON.stringify({ version: 1, deviceId: "disk-device", nextSequence: 6, entries: [diskEntry] }));
    const hydration = x.store.getState().hydrate();
    const local = x.store.getState().append({ entityType: "profile", entityId: "new", operation: "update", value: { new: true } });
    x.release();
    await hydration;

    const state = x.store.getState();
    expect(state.deviceId).toBe("disk-device");
    expect(state.entries).toHaveLength(2);
    expect(state.entries.some((entry) => entry.id === local.id)).toBe(false);
    expect(state.entries.find((entry) => entry.entityId === "new")).toMatchObject({ deviceId: "disk-device", sequence: 6 });
    expect(state.nextSequence).toBe(7);
  });

  it("imports remote entries idempotently without consuming the local sequence", async () => {
    const x = await setup(null);
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    const remote = createJournalEntry({ deviceId: "remote-device", sequence: 9, entityType: "profile", entityId: "remote", operation: "update", value: { remote: true }, changedAt: 30 });
    expect(x.store.getState().importEntries([remote, remote])).toBe(1);
    expect(x.store.getState().importEntries([remote])).toBe(0);
    expect(x.store.getState().nextSequence).toBe(1);
    expect(x.store.getState().entries).toHaveLength(1);
  });
  it("auto-starts one read, preserves foreign imports, and never rereads after initialization", async () => {
    const disk = createJournalEntry({ deviceId: "disk-device", sequence: 8, entityType: "profile", entityId: "disk", operation: "update", value: {} });
    const remote = createJournalEntry({ deviceId: "remote", sequence: 20, entityType: "profile", entityId: "remote", operation: "update", value: {} });
    const x = await setup(JSON.stringify({ version: 1, deviceId: "disk-device", nextSequence: 9, entries: [disk] }));
    x.store.getState().importEntries([remote]);
    const hydration = x.store.getState().hydrate();
    expect(x.store.getState().hydrate()).toBe(hydration);
    await Promise.resolve();
    expect(x.read).toHaveBeenCalledTimes(1);
    expect(x.writes).toEqual([]);
    x.release();
    await hydration;
    expect(x.store.getState().deviceId).toBe("disk-device");
    expect(x.store.getState().nextSequence).toBe(9);
    expect(x.store.getState().entries).toEqual([disk, remote]);
    expect(x.store.getState().importEntries([remote])).toBe(0);
    await x.store.getState().hydrate();
    expect(x.read).toHaveBeenCalledTimes(1);
  });

  it("retains pending appends on a failed read and rebases them exactly once on retry", async () => {
    const disk = createJournalEntry({ deviceId: "disk-device", sequence: 4, entityType: "profile", entityId: "disk", operation: "update", value: {} });
    const x = await setup(JSON.stringify({ version: 1, deviceId: "disk-device", nextSequence: 5, entries: [disk] }));
    const local = x.store.getState().append({ entityType: "profile", entityId: "local", operation: "update", value: {} });
    const hydration = x.store.getState().hydrate();
    x.reject(new Error("read unavailable"));
    await hydration;
    expect(x.store.getState().hydrated).toBe(false);
    expect(x.store.getState().entries).toEqual([local]);
    expect(x.writes).toEqual([]);
    await x.store.getState().hydrate();
    expect(x.store.getState().entries).toHaveLength(2);
    expect(x.store.getState().entries[1]).toMatchObject({ entityId: "local", deviceId: "disk-device", sequence: 5 });
    expect(x.store.getState().nextSequence).toBe(6);
    await x.store.getState().hydrate();
    expect(x.read).toHaveBeenCalledTimes(2);
    expect(x.writes).toHaveLength(1);
  });

  it("rebases local appends after imported durable-device sequences while preserving imported IDs", async () => {
    const remote = createJournalEntry({ deviceId: "disk-device", sequence: 12, entityType: "profile", entityId: "import", operation: "update", value: {} });
    const x = await setup(JSON.stringify({ version: 1, deviceId: "disk-device", nextSequence: 9, entries: [] }));
    x.store.getState().append({ entityType: "profile", entityId: "local", operation: "update", value: {} });
    x.store.getState().importEntries([remote]);
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    expect(x.store.getState().entries[0]).toEqual(remote);
    expect(x.store.getState().entries[1]).toMatchObject({ entityId: "local", deviceId: "disk-device", sequence: 13 });
    expect(x.store.getState().nextSequence).toBe(14);
    expect(x.store.getState().importEntries([remote])).toBe(0);
  });

  it("refuses exhausted sequence appends without corrupting a reloadable journal", async () => {
    const x = await setup(JSON.stringify({ version: 1, deviceId: "disk-device", nextSequence: Number.MAX_SAFE_INTEGER - 2, entries: [] }));
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    x.store.getState().append({ entityType: "profile", entityId: "last", operation: "update", value: {} });
    expect(x.store.getState().nextSequence).toBe(Number.MAX_SAFE_INTEGER - 1);
    const state = x.store.getState();
    expect(() => state.append({ entityType: "profile", entityId: "overflow", operation: "update", value: {} })).toThrow("sequence exhausted");
    expect(x.store.getState()).toBe(state);
    await vi.waitFor(() => expect(x.writes).toHaveLength(1));
    vi.resetModules();
    const reopened = await setup(x.writes[0]);
    const rehydrate = reopened.store.getState().hydrate();
    reopened.release();
    await rehydrate;
    expect(reopened.store.getState().hydrated).toBe(true);
    expect(reopened.store.getState().deviceId).toBe("disk-device");
    expect(reopened.store.getState().entries).toHaveLength(1);
    expect(reopened.store.getState().nextSequence).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it("does not publish writes from a rejected persistence transaction or replay them later", async () => {
    vi.doUnmock("../lib/tauri");
    const diskWrites: string[] = [];
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async (command: string, args?: { data: string }) => {
      if (command === "save_app_data") diskWrites.push(args!.data);
      return null;
    }) }));
    const { useEntityJournalStore: store } = await import("./entityJournalStore");
    const { withPersistenceTransaction, flushPersistence } = await import("../lib/persistenceQueue");
    await store.getState().hydrate();
    const original = store.getState();
    expect(() => withPersistenceTransaction(() => {
      store.getState().append({ entityType: "profile", entityId: "rejected", operation: "update", value: {} });
      throw new Error("rollback");
    })).toThrow("rollback");
    store.setState(original, true);
    await flushPersistence();
    await store.getState().hydrate();
    expect(diskWrites).toEqual([]);
    store.getState().append({ entityType: "profile", entityId: "accepted", operation: "update", value: {} });
    await flushPersistence();
    expect(diskWrites).toHaveLength(1);
    expect(JSON.parse(diskWrites[0]).entries.map((entry: { entityId: string }) => entry.entityId)).toEqual(["accepted"]);
  });

  it("leaves an unreadable file untouched and keeps local edits pending", async () => {
    const x = await setup("{broken");
    x.store.getState().append({ entityType: "profile", entityId: "local", operation: "update", value: {} });
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    expect(x.store.getState().hydrated).toBe(false);
    expect(x.store.getState().entries).toHaveLength(1);
    expect(x.writes).toEqual([]);
  });

  it("does not advance local sequence for a rejected import ID collision", async () => {
    const x = await setup(null);
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    const local = x.store.getState().append({ entityType: "profile", entityId: "local", operation: "update", value: {} });
    const collision = { ...local, sequence: Number.MAX_SAFE_INTEGER - 2 };
    const remote = createJournalEntry({ deviceId: "remote", sequence: 3, entityType: "profile", entityId: "remote", operation: "update", value: {} });
    expect(x.store.getState().importEntries([collision, remote])).toBe(1);
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.store.getState().entries).toEqual([local, remote]);
  });

});
