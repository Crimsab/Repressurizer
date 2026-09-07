import { afterEach, describe, expect, it, vi } from "vitest";
import { createRepressurizerProfile } from "../lib/repressurizerProfile";

afterEach(() => {
  vi.doUnmock("../lib/tauri");
  vi.doUnmock("./entityJournalStore");
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
  vi.doMock("./entityJournalStore", () => ({ useEntityJournalStore: { getState: () => ({ append: vi.fn() }) } }));
  const { useProfileStore: store } = await import("./profileStore");
  return { store, release: () => release(raw), reject, read, writes };
}

const profile = (id: string, name = id) => createRepressurizerProfile({
  profileId: id, name, deviceId: "device", steamAccountId: null, sections: { settings: { theme: name } },
});

describe("profile hydration races", () => {
  it("keeps an upsert, removal and backup made while disk is loading", async () => {
    const disk = profile("disk", "Disk");
    const x = await setup(JSON.stringify({ version: 1, profiles: [disk], backups: [] }));
    const hydration = x.store.getState().hydrate();
    const local = profile("local", "Local");
    x.store.getState().upsert(local);
    x.store.getState().remove("disk");
    x.store.getState().backup(local);
    x.release();
    await hydration;

    expect(x.store.getState().profiles.map((item) => item.manifest.profileId)).toEqual(["local"]);
    expect(x.store.getState().backups.map((item) => item.manifest.profileId)).toEqual(["local"]);
    expect(JSON.parse(x.writes.at(-1)!).profiles.map((item: { manifest: { profileId: string } }) => item.manifest.profileId)).toEqual(["local"]);
  });

  it("does not duplicate local backups when hydration is repeated", async () => {
    const x = await setup(null);
    const hydration = x.store.getState().hydrate();
    const local = profile("local");
    x.store.getState().backup(local);
    x.release();
    await hydration;
    await x.store.getState().hydrate();
    expect(x.store.getState().backups).toHaveLength(1);
  });
  it("starts a single initial read from a mutation and waits for disk before writing", async () => {
    const disk = profile("disk");
    const x = await setup(JSON.stringify({ version: 1, profiles: [disk], backups: [] }));
    x.store.getState().upsert(profile("local"));
    const first = x.store.getState().hydrate();
    expect(x.store.getState().hydrate()).toBe(first);
    await Promise.resolve();
    expect(x.read).toHaveBeenCalledTimes(1);
    expect(x.writes).toEqual([]);
    x.release();
    await first;
    expect(x.store.getState().profiles.map((p) => p.manifest.profileId)).toEqual(["local", "disk"]);
    await x.store.getState().hydrate();
    expect(x.read).toHaveBeenCalledTimes(1);
    expect(x.writes).toHaveLength(1);
  });

  it("keeps a failed read retryable without overwriting disk or losing pending operations", async () => {
    const disk = profile("disk");
    const x = await setup(JSON.stringify({ version: 1, profiles: [disk], backups: [] }));
    x.store.getState().upsert(profile("local"));
    const first = x.store.getState().hydrate();
    x.reject(new Error("read unavailable"));
    await first;
    expect(x.store.getState().hydrated).toBe(false);
    expect(x.writes).toEqual([]);
    expect(x.store.getState().profiles.map((p) => p.manifest.profileId)).toEqual(["local"]);
    await x.store.getState().hydrate();
    expect(x.store.getState().hydrated).toBe(true);
    expect(x.store.getState().profiles.map((p) => p.manifest.profileId)).toEqual(["local", "disk"]);
    expect(x.writes).toHaveLength(1);
  });

  it("preserves early deletion and backup beyond a thousand pending edits and clears replay after init", async () => {
    const disk = profile("disk");
    const x = await setup(JSON.stringify({ version: 1, profiles: [disk], backups: [] }));
    x.store.getState().remove("disk");
    x.store.getState().backup(disk);
    for (let i = 0; i < 1001; i += 1) x.store.getState().upsert(profile("local", `Edit ${i}`));
    const hydration = x.store.getState().hydrate();
    expect(x.writes).toEqual([]);
    x.release();
    await hydration;
    expect(x.store.getState().profiles.map((p) => p.manifest.profileId)).toEqual(["local"]);
    expect(x.store.getState().backups).toEqual([disk]);
    x.store.getState().remove("local");
    await x.store.getState().hydrate();
    expect(x.store.getState().profiles).toEqual([]);
    expect(x.read).toHaveBeenCalledTimes(1);
  });

  it("leaves an unreadable profile file untouched and keeps local edits pending", async () => {
    const x = await setup("{broken");
    x.store.getState().upsert(profile("local"));
    const hydration = x.store.getState().hydrate();
    x.release();
    await hydration;
    expect(x.store.getState().hydrated).toBe(false);
    expect(x.store.getState().profiles).toHaveLength(1);
    expect(x.writes).toEqual([]);
  });

});
