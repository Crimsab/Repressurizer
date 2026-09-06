import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("@tauri-apps/plugin-fs"); vi.doUnmock("./profileRuntime"); vi.doUnmock("../lib/tauri"); vi.resetModules(); vi.unstubAllGlobals(); });

async function setup() {
  vi.resetModules();
  const files = new Map<string, string>();
  const sections = { preferences: { notes: { 1: "initial" } } };
  const apply = vi.fn();
  const readDir = vi.fn(async (_path: string): Promise<Array<{ name: string; isFile: boolean }>> => []);
  const writeTextFile = vi.fn(async (path: string, body: string) => { files.set(path, body); });
  const rename = vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); });
  vi.doMock("@tauri-apps/plugin-fs", () => ({ readDir, writeTextFile, rename,
    readTextFile: vi.fn(async (path: string) => files.get(path)!), remove: vi.fn(async (path: string) => { files.delete(path); }) }));
  vi.doMock("./profileRuntime", () => ({ captureProfileSections: () => sections, applyProfileSections: apply }));
  vi.doMock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => {}), configureHttpPolicy: vi.fn() }));
  const { useProfileSyncStore } = await import("./profileSyncStore");
  useProfileSyncStore.setState({ folder: "/sync", hydrated: true });
  return { store: useProfileSyncStore, sections, apply, readDir, writeTextFile, rename, files };
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
});
