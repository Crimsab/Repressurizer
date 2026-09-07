import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("@tauri-apps/plugin-fs"); vi.doUnmock("./profileRuntime"); vi.doUnmock("../lib/tauri"); vi.resetModules(); vi.unstubAllGlobals(); });

async function setup(options: { files?: Map<string, string>; persisted?: Map<string, string> } = {}) {
  vi.resetModules();
  const files = options.files ?? new Map<string, string>();
  const persisted = options.persisted ?? new Map<string, string>();
  const sections = { preferences: { notes: { 1: "initial" } } };
  const apply = vi.fn();
  const readDir = vi.fn(async (_path: string): Promise<Array<{ name: string; isFile: boolean }>> => []);
  const writeTextFile = vi.fn(async (path: string, body: string) => { files.set(path, body); });
  const rename = vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); });
  vi.doMock("@tauri-apps/plugin-fs", () => ({ readDir, writeTextFile, rename,
    readTextFile: vi.fn(async (path: string) => files.get(path)!), remove: vi.fn(async (path: string) => { files.delete(path); }) }));
  vi.doMock("./profileRuntime", () => ({ captureProfileSections: () => sections, applyProfileSections: apply, ensureProfileHistoryReady: vi.fn(async () => {}) }));
  vi.doMock("../lib/tauri", () => ({
    loadAppData: vi.fn(async (key: string) => persisted.get(key) ?? null),
    saveAppData: vi.fn(async (key: string, data: string) => { persisted.set(key, data); }),
    configureHttpPolicy: vi.fn(),
  }));
  const { useProfileSyncStore } = await import("./profileSyncStore");
  const { useEntityJournalStore } = await import("./entityJournalStore");
  useProfileSyncStore.setState({ folder: "/sync", hydrated: true });
  return { store: useProfileSyncStore, journal: useEntityJournalStore, sections, apply, readDir, writeTextFile, rename, files, persisted };
}

describe("profile sync concurrent edits", () => {
  it("captures local edits made while reading the shared folder", async () => {
    const x = await setup();
    x.readDir.mockImplementationOnce(async () => { x.sections.preferences.notes[1] = "edited while reading"; return []; });
    await x.store.getState().syncNow();
    const body = JSON.parse(x.writeTextFile.mock.calls[0][1]);
    expect(body.profile.sections.preferences.notes[1]).toBe("edited while reading");
  });
  it("does not commit or apply a stale snapshot after a change during write", async () => {
    const x = await setup();
    x.writeTextFile.mockImplementationOnce(async (path, body) => { x.files.set(path, body); x.sections.preferences.notes[1] = "newer draft"; });
    await expect(x.store.getState().syncNow()).rejects.toThrow("Profile changed during sync");
    expect(x.rename).not.toHaveBeenCalled(); expect(x.apply).not.toHaveBeenCalled();
    expect(x.sections.preferences.notes[1]).toBe("newer draft");
    expect(x.store.getState().syncing).toBe(false);
  });
  it("keeps edits made during the final rename and records the written baseline", async () => {
    const x = await setup();
    x.rename.mockImplementationOnce(async () => { x.sections.preferences.notes[1] = "newest draft"; });
    await x.store.getState().syncNow();
    expect(x.apply).not.toHaveBeenCalled();
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.sections.preferences.notes[1]).toBe("newest draft");
  });
  it("rejects a changed sync folder without applying the old folder", async () => {
    const x = await setup();
    x.readDir.mockImplementationOnce(async () => { x.store.setState({ folder: "/other" }); return []; });
    await expect(x.store.getState().syncNow()).rejects.toThrow("Sync context changed");
    expect(x.writeTextFile).not.toHaveBeenCalled(); expect(x.apply).not.toHaveBeenCalled();
  });
  it("does not apply profile data when the final write fails", async () => {
    const x = await setup();
    x.rename.mockRejectedValueOnce(new Error("disk failure"));
    await expect(x.store.getState().syncNow()).rejects.toThrow("disk failure");
    expect(x.apply).not.toHaveBeenCalled();
    expect(x.store.getState().nextSequence).toBe(1);
  });
  it("records a committed snapshot after runtime invalidation and allows a retry", async () => {
    const x = await setup();
    x.readDir.mockImplementation(async (folder) => [...x.files.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => ({ name: path.slice(folder.length + 1), isFile: true })));
    const { invalidateRuntime } = await import("../lib/runtimeGeneration");
    x.rename.mockImplementationOnce(async (from, to) => {
      x.files.set(to, x.files.get(from)!);
      x.files.delete(from);
      invalidateRuntime();
    });

    await expect(x.store.getState().syncNow()).rejects.toThrow("Sync context changed");
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.store.getState().workingCopy).toBeNull();
    expect(x.apply).not.toHaveBeenCalled();

    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
    expect(x.store.getState().nextSequence).toBe(3);
    expect(x.apply).toHaveBeenCalledTimes(1);
  });
  it("records a commit when the folder changes and avoids the old profile after returning", async () => {
    const x = await setup();
    x.readDir.mockImplementation(async (folder) => [...x.files.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => ({ name: path.slice(folder.length + 1), isFile: true })));
    x.rename.mockImplementationOnce(async (from, to) => {
      x.files.set(to, x.files.get(from)!);
      x.files.delete(from);
      x.store.setState({ folder: "/other" });
    });

    await expect(x.store.getState().syncNow()).rejects.toThrow("Sync context changed");
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.store.getState().workingCopy).toBeNull();
    expect(x.apply).not.toHaveBeenCalled();

    x.store.setState({ folder: "/sync" });
    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
    expect(x.store.getState().nextSequence).toBe(3);
    expect(x.apply).toHaveBeenCalledTimes(1);
  });
  it("records a commit when paused during rename and retries after resume", async () => {
    const x = await setup();
    x.readDir.mockImplementation(async (folder) => [...x.files.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => ({ name: path.slice(folder.length + 1), isFile: true })));
    x.rename.mockImplementationOnce(async (from, to) => {
      x.files.set(to, x.files.get(from)!);
      x.files.delete(from);
      x.store.setState({ paused: true });
    });

    await expect(x.store.getState().syncNow()).rejects.toThrow("Sync context changed");
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.store.getState().workingCopy).not.toBeNull();
    expect(x.apply).not.toHaveBeenCalled();

    x.store.setState({ paused: false });
    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
    expect(x.store.getState().nextSequence).toBe(3);
    expect(x.apply).toHaveBeenCalledTimes(1);
  });
  it("does not retry a committed snapshot as a duplicate when cleanup cannot read the folder", async () => {
    const x = await setup();
    let reads = 0;
    x.readDir.mockImplementation(async (folder) => {
      reads += 1;
      if (reads === 2) throw new Error("cleanup unavailable");
      return [...x.files.keys()]
        .filter((path) => path.startsWith(`${folder}/`))
        .map((path) => ({ name: path.slice(folder.length + 1), isFile: true }));
    });

    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
    expect(x.store.getState().nextSequence).toBe(2);
    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
    expect(x.store.getState().nextSequence).toBe(3);
  });
  it("hydrates committed metadata across a restart before retrying", async () => {
    const files = new Map<string, string>();
    const persisted = new Map<string, string>();
    const first = await setup({ files, persisted });
    first.readDir.mockImplementation(async (folder) => [...files.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => ({ name: path.slice(folder.length + 1), isFile: true })));
    first.rename.mockImplementationOnce(async (from, to) => {
      files.set(to, files.get(from)!);
      files.delete(from);
      first.store.setState({ folder: "/other" });
    });

    await expect(first.store.getState().syncNow()).rejects.toThrow("Sync context changed");
    await Promise.resolve();
    const deviceId = first.journal.getState().deviceId;
    const restarted = await setup({ files, persisted });
    restarted.journal.setState({ deviceId });
    await restarted.store.getState().hydrate();
    restarted.store.setState({ folder: "/sync" });
    restarted.readDir.mockImplementation(async (folder) => [...files.keys()]
      .filter((path) => path.startsWith(`${folder}/`))
      .map((path) => ({ name: path.slice(folder.length + 1), isFile: true })));

    await expect(restarted.store.getState().syncNow()).resolves.toBe("synced");
    expect(restarted.store.getState().nextSequence).toBe(3);
    expect(restarted.store.getState().workingCopy).not.toBeNull();
  });
  it("records a conflict resolution committed during a context change and allows retry", async () => {
    const x = await setup();
    const { createRepressurizerProfile } = await import("../lib/repressurizerProfile");
    const { mergeProfileDocuments } = await import("../lib/profileSync");
    const { canonicalJson } = await import("../lib/entityJournal");
    const { runtimeGeneration, invalidateRuntime } = await import("../lib/runtimeGeneration");
    const { useSettingsStore } = await import("./settingsStore");
    const profile = (note: string) => createRepressurizerProfile({ profileId: "sync", name: "Sync", deviceId: x.journal.getState().deviceId,
      steamAccountId: useSettingsStore.getState().steamId64, sections: { preferences: { notes: { 1: note } } } });
    const merge = mergeProfileDocuments(profile("base"), profile("initial"), profile("remote"));
    expect(merge.conflicts).toHaveLength(1);
    x.store.setState({ pending: { merge, remoteDevice: "remote-device", generation: runtimeGeneration(),
      account: useSettingsStore.getState().steamId64, localChecksum: canonicalJson(x.sections) } });
    x.readDir.mockImplementation(async (folder) => [...x.files.keys()].filter(path => path.startsWith(`${folder}/`))
      .map(path => ({ name: path.slice(folder.length + 1), isFile: true })));
    x.rename.mockImplementationOnce(async (from, to) => { x.files.set(to, x.files.get(from)!); x.files.delete(from); invalidateRuntime(); });
    await expect(x.store.getState().resolvePending({ [merge.conflicts[0].path]: "remote" })).rejects.toThrow("Sync context changed");
    expect(x.apply).not.toHaveBeenCalled();
    expect(x.store.getState().nextSequence).toBe(2);
    expect(x.store.getState().pending).toBeNull();
    expect(x.store.getState().workingCopy).toBeNull();
    await expect(x.store.getState().syncNow()).resolves.toBe("synced");
  });

  it("still rejects an unrecognized envelope from another installation with the same device ID", async () => {
    const x = await setup();
    x.readDir.mockImplementation(async (folder) => [...x.files.keys()].filter(path => path.startsWith(`${folder}/`))
      .map(path => ({ name: path.slice(folder.length + 1), isFile: true })));
    await x.store.getState().syncNow();
    x.store.setState({ nextSequence: 1, lastEnvelopeChecksum: null });
    await expect(x.store.getState().syncNow()).rejects.toThrow("Another installation is using this device ID");
  });

});
