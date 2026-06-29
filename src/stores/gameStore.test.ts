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

describe("gameStore game merging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("replaces an existing placeholder name when a later source has the real name", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.resetModules();

    const { useGameStore } = await import("./gameStore");

    useGameStore.getState().setGames([
      {
        appid: 1467450,
        name: "App 1467450",
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
        is_collection_only: true,
      },
    ]);

    useGameStore.getState().mergeGames([
      {
        appid: 1467450,
        name: "The Chronicles Of Myrtana: Archolos",
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
        is_collection_only: true,
      },
    ]);

    expect(useGameStore.getState().games[1467450]?.name).toBe("The Chronicles Of Myrtana: Archolos");
  });
});
