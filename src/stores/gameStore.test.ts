import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@tauri-apps/api/core");
});

const VIEW_MODE_STORAGE_KEY = "repressurizer-library-view-mode";

function makeDetails(appId = 10, currency: string | null = "EUR", price: number | null = 999) {
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
    price_initial: price,
    price_final: price,
    price_currency: currency,
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

  it("uses persisted app name overrides to repair collection-only placeholders", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (command: string, args?: { key?: string }) => {
        if (command === "load_app_data" && args?.key === "app_name_overrides.json") {
          return JSON.stringify({ 39140: "FINAL FANTASY VII" });
        }
        return null;
      }),
    }));
    vi.resetModules();

    const { useAppNameOverrideStore } = await import("./appNameOverrideStore");
    const { useGameStore } = await import("./gameStore");

    await useAppNameOverrideStore.getState().hydrate();
    useGameStore.getState().setGames([
      {
        appid: 39140,
        name: "App 39140",
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
        is_collection_only: true,
      },
    ]);

    expect(useGameStore.getState().games[39140]?.name).toBe("FINAL FANTASY VII");
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

  it("treats current-schema details as stale after the configured age", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.resetModules();

    const { DETAILS_CACHE_SCHEMA_VERSION, detailsCacheNeedsRefresh } = await import("./gameStore");
    const now = Date.now();
    const fresh = {
      ...makeDetails(10),
      cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
      fetched_at: now - 29 * 24 * 60 * 60 * 1000,
    };
    const stale = {
      ...makeDetails(11),
      cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
      fetched_at: now - 31 * 24 * 60 * 60 * 1000,
    };
    const missingTimestamp = {
      ...makeDetails(12),
      cache_schema: DETAILS_CACHE_SCHEMA_VERSION,
    };

    expect(detailsCacheNeedsRefresh(fresh, 30, now)).toBe(false);
    expect(detailsCacheNeedsRefresh(stale, 30, now)).toBe(true);
    expect(detailsCacheNeedsRefresh(missingTimestamp, 30, now)).toBe(true);
    expect(detailsCacheNeedsRefresh(stale, 0, now)).toBe(false);
  });

  it("promotes usable legacy details during hydration but keeps empty entries stale", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const emptyLegacy = {
      ...makeDetails(11, null, null),
      name: "",
      genres: [],
      categories: [],
      release_date: null,
      metacritic_score: null,
      developers: [],
      publishers: [],
      supported_languages: [],
      platforms: { windows: false, mac: false, linux: false },
      price_initial: null,
      price_final: null,
      price_currency: null,
      is_free: false,
    };
    const saved: string[] = [];

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn(async (command: string, args?: { data?: string }) => {
        if (command === "load_details_cache") {
          return JSON.stringify({
            10: makeDetails(10),
            11: emptyLegacy,
          });
        }
        if (command === "save_details_cache" && args?.data) {
          saved.push(args.data);
        }
        return null;
      }),
    }));
    vi.resetModules();

    const { DETAILS_CACHE_SCHEMA_VERSION, detailsCacheNeedsRefresh, useGameStore } = await import("./gameStore");

    await useGameStore.getState().hydrateDetailsCache();

    const hydrated = useGameStore.getState().details;
    expect(hydrated[10]?.cache_schema).toBe(DETAILS_CACHE_SCHEMA_VERSION);
    expect(hydrated[10]?.fetched_at).toEqual(expect.any(Number));
    expect(detailsCacheNeedsRefresh(hydrated[10])).toBe(false);
    expect(detailsCacheNeedsRefresh(hydrated[11])).toBe(true);
    expect(saved.length).toBe(1);
  });

  it("keeps price snapshots for multiple currencies on the same details record", async () => {
    vi.stubGlobal("localStorage", createStorage());
    vi.resetModules();

    const { useGameStore } = await import("./gameStore");

    useGameStore.getState().setDetails(10, makeDetails(10, "EUR", 99));
    useGameStore.getState().setDetails(10, makeDetails(10, "INR", 2600));

    const detail = useGameStore.getState().details[10];
    expect(detail?.price_currency).toBe("INR");
    expect(detail?.price_cache?.EUR?.price_final).toBe(99);
    expect(detail?.price_cache?.INR?.price_final).toBe(2600);
  });
});
