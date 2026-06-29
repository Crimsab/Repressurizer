import { afterEach, describe, expect, it, vi } from "vitest";

const VIEW_MODE_STORAGE_KEY = "repressurizer-library-view-mode";

function createStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: vi.fn(() => {
      for (const key of Object.keys(data)) delete data[key];
    }),
    getItem: vi.fn((key: string) => data[key] ?? null),
    key: vi.fn((index: number) => Object.keys(data)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete data[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      data[key] = value;
    }),
  } as Storage;
}

describe("gameStore view mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("hydrates the last saved library view mode", async () => {
    vi.stubGlobal("localStorage", createStorage({ [VIEW_MODE_STORAGE_KEY]: "list" }));
    vi.resetModules();

    const { useGameStore } = await import("./gameStore");

    expect(useGameStore.getState().viewMode).toBe("list");
  });

  it("saves view mode changes", async () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { useGameStore } = await import("./gameStore");
    useGameStore.getState().setViewMode("list");

    expect(storage.setItem).toHaveBeenCalledWith(VIEW_MODE_STORAGE_KEY, "list");
    expect(useGameStore.getState().viewMode).toBe("list");
  });
});
