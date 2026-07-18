import { afterEach, describe, expect, it, vi } from "vitest";

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

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function steamReviewSummary(appId: number) {
  return {
    app_id: appId,
    review_score: 8,
    review_score_desc: "Very Positive",
    total_positive: 90,
    total_negative: 10,
    total_reviews: 100,
    positive_percentage: 90,
    fetched_at: Date.now(),
  };
}

function gameDetails(appId: number, storeReleaseDate: string | null = null) {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    genres: ["Action"],
    tags: [],
    categories: ["Single-player"],
    release_date: "Jan 1, 2020",
    store_release_date: storeReleaseDate,
    store_release_date_fetched_at: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: ["English"],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: "EUR",
    is_free: false,
  };
}

afterEach(() => {
  vi.doUnmock("@tauri-apps/api/core");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("backgroundFetchStore details fetch", () => {
  it("force-fetches current details when requested", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const detailCalls: number[] = [];
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command === "fetch_game_details") {
        detailCalls.push(args?.appId ?? 0);
        return gameDetails(args?.appId ?? 0);
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useGameStore } = await import("./gameStore");
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setSettings({ steamDetailsDelayMs: 100 });
    useGameStore.getState().setGames([
      {
        appid: 1,
        name: "Cached",
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
      },
    ]);
    useGameStore.getState().setDetails(1, gameDetails(1));

    useBackgroundFetchStore.getState().startDetailsFetch([1]);
    expect(detailCalls).toEqual([]);

    useBackgroundFetchStore.getState().startDetailsFetch([1], { force: true });
    await waitFor(() => !useBackgroundFetchStore.getState().detailsRunning, "forced details fetch completion");

    expect(detailCalls).toEqual([1]);
  });

  it("queues details requested while another details run is active", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const detailCalls: number[] = [];
    let resolveFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command === "fetch_game_details") {
        const appId = args?.appId ?? 0;
        detailCalls.push(appId);
        if (appId === 1) await firstRequest;
        return gameDetails(appId, "Jan 1, 2020");
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useGameStore } = await import("./gameStore");
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setSettings({ steamDetailsDelayMs: 100 });
    useGameStore.getState().setGames([
      { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 2, name: "Two", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
    ]);

    useBackgroundFetchStore.getState().startDetailsFetch([1]);
    await waitFor(() => detailCalls.length === 1, "first details request");

    useBackgroundFetchStore.getState().startDetailsFetch([2]);
    expect(useBackgroundFetchStore.getState().detailsRunning).toBe(true);

    resolveFirst();
    await waitFor(
      () => detailCalls.length === 2 && !useBackgroundFetchStore.getState().detailsRunning,
      "queued details request completion"
    );

    expect(detailCalls).toEqual([1, 2]);
  });

  it("treats permanent Steam Store failures as unavailable without retrying or adaptive slowdown", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const detailCalls: number[] = [];
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command === "fetch_game_details") {
        detailCalls.push(args?.appId ?? 0);
        throw new Error(`Store API returned failure for app ${args?.appId}`);
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useFailedGamesStore } = await import("./failedGamesStore");
    const { useGameStore } = await import("./gameStore");
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setSettings({ steamDetailsDelayMs: 100 });
    useGameStore.getState().setGames(
      Array.from({ length: 10 }, (_, index) => {
        const appid = 10_000 + index;
        return {
          appid,
          name: `Unavailable ${appid}`,
          playtime_forever: 0,
          img_icon_url: null,
          rtime_last_played: 0,
        };
      })
    );

    const ids = Object.keys(useGameStore.getState().games).map(Number);
    useBackgroundFetchStore.getState().startDetailsFetch(ids);

    await waitFor(() => !useBackgroundFetchStore.getState().detailsRunning, "details fetch completion");

    const state = useBackgroundFetchStore.getState();
    expect(detailCalls).toEqual(ids);
    expect(state.detailsFetched).toBe(10);
    expect(state.detailsSucceeded).toBe(0);
    expect(state.detailsFailed).toBe(10);
    expect(state.detailsCoolingDown).toBe(false);
    expect(state.detailsCooldownSecs).toBe(0);
    expect(Object.values(useFailedGamesStore.getState().fails)).toEqual(Array(10).fill(1));
  });
});

describe("backgroundFetchStore release date fetch", () => {
  it("schedules original release dates after details are saved outside the background worker", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const releaseDateCalls: number[][] = [];
    const invoke = vi.fn(async (command: string, args?: { appIds?: number[] }) => {
      if (command === "fetch_store_release_dates") {
        const appIds = args?.appIds ?? [];
        releaseDateCalls.push(appIds);
        return appIds.map((appId) => ({ app_id: appId, release_date: "Jan 1, 2000" }));
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { scheduleOriginalReleaseDateFetch } = await import("../lib/releaseDateQueue");
    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useGameStore } = await import("./gameStore");

    useGameStore.getState().setGames([
      { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
    ]);
    useGameStore.getState().setDetails(1, gameDetails(1));

    scheduleOriginalReleaseDateFetch(1);
    await waitFor(
      () => releaseDateCalls.length === 1 && !useBackgroundFetchStore.getState().releaseDatesRunning,
      "direct details release date completion"
    );

    expect(releaseDateCalls).toEqual([[1]]);
    expect(useGameStore.getState().details[1]?.store_release_date).toBe("Jan 1, 2000");
  });

  it("queues release dates requested while another release date run is active", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const releaseDateCalls: number[][] = [];
    let resolveFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const invoke = vi.fn(async (command: string, args?: { appIds?: number[] }) => {
      if (command === "fetch_store_release_dates") {
        const appIds = args?.appIds ?? [];
        releaseDateCalls.push(appIds);
        if (releaseDateCalls.length === 1) await firstRequest;
        return appIds.map((appId) => ({ app_id: appId, release_date: "Jan 1, 2000" }));
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useGameStore } = await import("./gameStore");

    useGameStore.getState().setGames([
      { appid: 1, name: "One", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 2, name: "Two", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
    ]);
    useGameStore.getState().setDetails(1, gameDetails(1));
    useGameStore.getState().setDetails(2, gameDetails(2));

    useBackgroundFetchStore.getState().startStoreReleaseDateFetch([{ appId: 1, name: "One" }]);
    await waitFor(() => releaseDateCalls.length === 1, "first release date request");

    useBackgroundFetchStore.getState().startStoreReleaseDateFetch([{ appId: 2, name: "Two" }]);
    resolveFirst();
    await waitFor(
      () => releaseDateCalls.length === 2 && !useBackgroundFetchStore.getState().releaseDatesRunning,
      "queued release date request completion"
    );

    expect(releaseDateCalls).toEqual([[1], [2]]);
  });
});

describe("backgroundFetchStore ratings fetch", () => {
  it("keeps Steam review progress counters internally consistent during the run", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command === "fetch_steam_review_summary") {
        return steamReviewSummary(args?.appId ?? 0);
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setSettings({ steamRatingsDelayMs: 100 });

    const snapshots: Array<{ fetched: number; succeeded: number; failed: number }> = [];
    const unsubscribe = useBackgroundFetchStore.subscribe((state) => {
      snapshots.push({
        fetched: state.ratingsFetched,
        succeeded: state.ratingsSucceeded,
        failed: state.ratingsFailed,
      });
    });

    useBackgroundFetchStore.getState().startRatingsFetch([
      { appId: 1, name: "One" },
      { appId: 2, name: "Two" },
      { appId: 3, name: "Three" },
    ]);

    await waitFor(() => !useBackgroundFetchStore.getState().ratingsRunning, "ratings fetch completion");
    unsubscribe();

    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(snapshot.succeeded).toBeLessThanOrEqual(snapshot.fetched);
      expect(snapshot.failed).toBeLessThanOrEqual(snapshot.fetched);
      expect(snapshot.succeeded + snapshot.failed).toBeLessThanOrEqual(snapshot.fetched);
    }

    expect(useBackgroundFetchStore.getState()).toMatchObject({
      ratingsFetched: 3,
      ratingsSucceeded: 3,
      ratingsFailed: 0,
    });
  });
});

describe("backgroundFetchStore run lifecycle", () => {
  it("does not revive a stopped HLTB worker when a replacement run starts", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const hltbCalls: number[] = [];
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command === "fetch_hltb") {
        hltbCalls.push(args?.appId ?? 0);
        return null;
      }
      return null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    const { useSettingsStore } = await import("./settingsStore");

    useSettingsStore.getState().setSettings({ hltbConcurrency: 1, hltbBatchDelayMs: 100 });
    useBackgroundFetchStore.getState().startHltbFetch([
      { appId: 1, name: "Old one" },
      { appId: 2, name: "Old two" },
    ]);
    await waitFor(() => useBackgroundFetchStore.getState().hltbFetched === 1, "first HLTB batch");

    useBackgroundFetchStore.getState().stopHltbFetch();
    useBackgroundFetchStore.getState().startHltbFetch([{ appId: 3, name: "Replacement" }]);
    await waitFor(() => !useBackgroundFetchStore.getState().hltbRunning, "replacement HLTB run");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(hltbCalls).toEqual([1, 3]);
    expect(useBackgroundFetchStore.getState()).toMatchObject({
      hltbRunning: false,
      hltbFetched: 1,
      hltbTotal: 1,
    });
  });

  it("waits for an in-flight stopped worker before starting its replacement", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const hltbCalls: number[] = [];
    let resolveFirst: ((value: null) => void) | undefined;
    const firstRequest = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    const invoke = vi.fn(async (command: string, args?: { appId?: number }) => {
      if (command !== "fetch_hltb") return null;
      const appId = args?.appId ?? 0;
      hltbCalls.push(appId);
      return appId === 10 ? firstRequest : null;
    });
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useBackgroundFetchStore } = await import("./backgroundFetchStore");
    useBackgroundFetchStore.getState().startHltbFetch([{ appId: 10, name: "Retiring" }]);
    await waitFor(() => hltbCalls.length === 1, "first in-flight HLTB request");

    useBackgroundFetchStore.getState().stopHltbFetch();
    useBackgroundFetchStore.getState().startHltbFetch([{ appId: 20, name: "Replacement" }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(hltbCalls).toEqual([10]);

    resolveFirst?.(null);
    await waitFor(() => hltbCalls.length === 2, "replacement HLTB request");
    await waitFor(() => !useBackgroundFetchStore.getState().hltbRunning, "replacement completion");
    expect(hltbCalls).toEqual([10, 20]);
  });

  it("clamps persisted batch concurrency to the supported range", async () => {
    vi.stubGlobal("localStorage", createStorage());
    const invoke = vi.fn(async () => null);
    vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
    vi.resetModules();

    const { useSettingsStore } = await import("./settingsStore");
    useSettingsStore.getState().setSettings({
      hltbConcurrency: 0,
      achievementsConcurrency: Number.MAX_SAFE_INTEGER,
    });

    expect(useSettingsStore.getState()).toMatchObject({
      hltbConcurrency: 1,
      achievementsConcurrency: 10,
    });
  });
});
