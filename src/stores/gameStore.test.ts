import { afterEach, describe, expect, it, vi } from "vitest";

const VIEW_MODE_STORAGE_KEY = "repressurizer-library-view-mode";

function makeDetails(appId = 10) {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    genres: ["Action"],
    categories: ["Single-player"],
    release_date: "Jan 1, 2020",
    metacritic_score: 80,
    developers: ["Studio"],
    publishers: ["Publisher"],
    supported_languages: ["English"],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: 1999,
    price_final: 999,
    price_currency: "EUR",
    is_free: false,
  };
}

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

describe("gameStore details cache metadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("marks newly stored details as current cache schema", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.resetModules();

    const {
      DETAILS_CACHE_SCHEMA_VERSION,
      isDetailsCacheCurrent,
      useGameStore,
    } = await import("./gameStore");

    useGameStore.getState().setDetails(10, makeDetails(10));

    const detail = useGameStore.getState().details[10];
    expect(detail?.cache_schema).toBe(DETAILS_CACHE_SCHEMA_VERSION);
    expect(detail?.fetched_at).toEqual(expect.any(Number));
    expect(isDetailsCacheCurrent(detail)).toBe(true);
  });

  it("treats legacy details without cache schema as needing refresh", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.resetModules();

    const { detailsCacheNeedsRefresh, isDetailsCacheCurrent } = await import("./gameStore");
    const legacyDetail = makeDetails(11);

    expect(isDetailsCacheCurrent(legacyDetail)).toBe(false);
    expect(detailsCacheNeedsRefresh(legacyDetail)).toBe(true);
    expect(detailsCacheNeedsRefresh(undefined)).toBe(true);
  });
});
