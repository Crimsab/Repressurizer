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

afterEach(() => {
  vi.doUnmock("@tauri-apps/api/core");
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("backgroundFetchStore details fetch", () => {
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
