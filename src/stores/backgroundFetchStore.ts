import { create } from "zustand";
import { fetchGameDetails, fetchGamePriceOverviews, fetchHltb, fetchAchievementsSummary, fetchSteamReviewSummary, fetchStoreReleaseDates, currencyToCountryCode } from "../lib/tauri";
import { isDetailsCacheCurrent, useGameStore } from "./gameStore";
import { useHltbStore } from "./hltbStore";
import { useAchievementsStore } from "./achievementsStore";
import { useSteamRatingsStore } from "./steamRatingsStore";
import { useFailedGamesStore } from "./failedGamesStore";
import { useHltbIgnoredStore } from "./hltbIgnoredStore";
import { useSettingsStore } from "./settingsStore";
import { extractReleaseYear } from "../lib/search";
import { detailsPriceNeedsCurrencyRefresh } from "../lib/prices";
import { bestAvailableReleaseDate, storeReleaseDateNeedsRefresh } from "../lib/releaseDates";
import { isSteamRatingFresh, isSteamReviewRateLimitedError } from "../lib/steamRatings";
import { getHltbHours } from "../lib/hltb";
import type { GameDetails, GamePriceOverview, StoreReleaseDateResult } from "../lib/types";

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_DETAILS_BASE_DELAY_MS = 1200;    // base delay between Steam requests (~1 req/sec)
const DETAILS_RETRY_DELAY_MS = 2000;   // slower on retry pass

// Adaptive delay: only grows for UNEXPECTED failures (not known-removed games)
const DETAILS_FAIL_STEP_MS     = 400;  // +400ms per unexpected failure
const DETAILS_FAIL_MAX_MS      = 12_000;
const DETAILS_SLOWDOWN_THRESHOLD_MS = 3_000; // when to show "slowing down" indicator

// HLTB: concurrency controlled by settings (default 3), 500ms between batches
const DEFAULT_HLTB_BATCH_DELAY_MS = 500;
const DEFAULT_ACHIEVEMENTS_BATCH_DELAY_MS = 300;
const DEFAULT_RATINGS_BASE_DELAY_MS = 1200;
const DEFAULT_STORE_RELEASE_DATE_DELAY_MS = 1600;
const DEFAULT_STORE_RELEASE_DATE_BATCH_SIZE = 50;
const DEFAULT_RATINGS_RATE_LIMIT_COOLDOWN_MINUTES = 5;
const MIN_FETCH_DELAY_MS = 100;

function clampMs(value: number | undefined, fallback: number, min: number, max: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function detailsBaseDelayMs() {
  return clampMs(useSettingsStore.getState().steamDetailsDelayMs, DEFAULT_DETAILS_BASE_DELAY_MS, MIN_FETCH_DELAY_MS, 30_000);
}

function ratingsBaseDelayMs() {
  return clampMs(useSettingsStore.getState().steamRatingsDelayMs, DEFAULT_RATINGS_BASE_DELAY_MS, MIN_FETCH_DELAY_MS, 30_000);
}

function ratingsCooldownMinutes() {
  const minutes = Math.round(Number(useSettingsStore.getState().steamRatingsCooldownMinutes));
  return Number.isFinite(minutes) ? Math.max(1, Math.min(60, minutes)) : DEFAULT_RATINGS_RATE_LIMIT_COOLDOWN_MINUTES;
}

function hltbBatchDelayMs() {
  return clampMs(useSettingsStore.getState().hltbBatchDelayMs, DEFAULT_HLTB_BATCH_DELAY_MS, MIN_FETCH_DELAY_MS, 30_000);
}

function achievementsBatchDelayMs() {
  return clampMs(useSettingsStore.getState().achievementsBatchDelayMs, DEFAULT_ACHIEVEMENTS_BATCH_DELAY_MS, MIN_FETCH_DELAY_MS, 30_000);
}

/** True when the error is a permanent "game not on Steam" failure (not a network issue) */
function isPermanentError(e: unknown): boolean {
  const msg = String(e);
  return msg.includes("Store API returned failure") || msg.includes("App not found in response");
}

const MAX_RECENT = 8;

// Module-level flags — persist across React component lifecycles
let _detailsRunning = false;
let _detailsAbort = false;
let _hltbRunning = false;
let _hltbAbort = false;
let _achievementsRunning = false;
let _achievementsAbort = false;
let _ratingsRunning = false;
let _ratingsAbort = false;
let _releaseDatesRunning = false;
let _releaseDatesAbort = false;
// Adaptive per-request extra delay (only grows for unexpected failures)
let _extraDelayMs = 0;

interface BackgroundFetchState {
  // Game details
  detailsRunning: boolean;
  detailsFetched: number;
  detailsTotal: number;
  detailsSucceeded: number;
  detailsFailed: number;
  detailsCurrentName: string;
  detailsRecentNames: string[];
  detailsCoolingDown: boolean;
  detailsCooldownSecs: number;     // extra delay in seconds

  // HLTB
  hltbRunning: boolean;
  hltbFetched: number;
  hltbTotal: number;
  hltbCurrentName: string;
  hltbRecentNames: string[];

  // Achievements
  achievementsRunning: boolean;
  achievementsFetched: number;
  achievementsTotal: number;
  achievementsCurrentName: string;
  achievementsRecentNames: string[];

  // Steam ratings
  ratingsRunning: boolean;
  ratingsFetched: number;
  ratingsTotal: number;
  ratingsSucceeded: number;
  ratingsFailed: number;
  ratingsCurrentName: string;
  ratingsRecentNames: string[];
  ratingsCoolingDown: boolean;
  ratingsCooldownSecs: number;

  // Store/original release dates
  releaseDatesRunning: boolean;
  releaseDatesFetched: number;
  releaseDatesTotal: number;
  releaseDatesSucceeded: number;
  releaseDatesFailed: number;
  releaseDatesCurrentName: string;
  releaseDatesRecentNames: string[];

  startDetailsFetch: (missingIds: number[]) => void;
  stopDetailsFetch: () => void;
  startHltbFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopHltbFetch: () => void;
  startAchievementsFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopAchievementsFetch: () => void;
  startRatingsFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopRatingsFetch: () => void;
  startStoreReleaseDateFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopStoreReleaseDateFetch: () => void;
}

let _setState: (partial: Partial<BackgroundFetchState>) => void = () => {};
let _getState: () => BackgroundFetchState = () => ({} as BackgroundFetchState);

export const useBackgroundFetchStore = create<BackgroundFetchState>((set, get) => {
  _setState = set;
  _getState = get;
  return {
    detailsRunning: false,
    detailsFetched: 0,
    detailsTotal: 0,
    detailsSucceeded: 0,
    detailsFailed: 0,
    detailsCurrentName: "",
    detailsRecentNames: [],
    detailsCoolingDown: false,
    detailsCooldownSecs: 0,

    hltbRunning: false,
    hltbFetched: 0,
    hltbTotal: 0,
    hltbCurrentName: "",
    hltbRecentNames: [],

    achievementsRunning: false,
    achievementsFetched: 0,
    achievementsTotal: 0,
    achievementsCurrentName: "",
    achievementsRecentNames: [],

    ratingsRunning: false,
    ratingsFetched: 0,
    ratingsTotal: 0,
    ratingsSucceeded: 0,
    ratingsFailed: 0,
    ratingsCurrentName: "",
    ratingsRecentNames: [],
    ratingsCoolingDown: false,
    ratingsCooldownSecs: 0,
    releaseDatesRunning: false,
    releaseDatesFetched: 0,
    releaseDatesTotal: 0,
    releaseDatesSucceeded: 0,
    releaseDatesFailed: 0,
    releaseDatesCurrentName: "",
    releaseDatesRecentNames: [],

    startDetailsFetch: (missingIds) => {
      if (_detailsRunning || missingIds.length === 0) return;
      // Filter out games already permanently failed (removed from Steam)
      const { isIgnored } = useFailedGamesStore.getState();
      const details = useGameStore.getState().details;
      const currency = useSettingsStore.getState().currency ?? "EUR";
      const ids = missingIds.filter((id) => {
        if (isIgnored(id)) return false;
        const detail = details[id];
        return !isDetailsCacheCurrent(detail) || detailsPriceNeedsCurrencyRefresh(detail, currency);
      });
      if (ids.length === 0) {
        console.log(`[Details] All ${missingIds.length} requested games are already cached or ignored`);
        return;
      }
      const skipped = missingIds.length - ids.length;
      if (skipped > 0) console.log(`[Details] Skipping ${skipped} cached/ignored games, fetching ${ids.length}`);

      _detailsRunning = true;
      _detailsAbort = false;
      _extraDelayMs = 0;
      set({
        detailsRunning: true,
        detailsFetched: 0,
        detailsTotal: ids.length,
        detailsSucceeded: 0,
        detailsFailed: 0,
        detailsCurrentName: "",
        detailsRecentNames: [],
        detailsCoolingDown: false,
        detailsCooldownSecs: 0,
      });
      _runDetailsLoop(ids);
    },

    stopDetailsFetch: () => {
      _detailsAbort = true;
      _detailsRunning = false;
      _extraDelayMs = 0;
      set({ detailsRunning: false, detailsCurrentName: "", detailsCoolingDown: false, detailsCooldownSecs: 0 });
    },

    startHltbFetch: (items) => {
      if (_hltbRunning || items.length === 0) return;
      // Filter out HLTB-ignored games
      const { isIgnored } = useHltbIgnoredStore.getState();
      const filtered = items.filter((it) => !isIgnored(it.appId));
      const skipped = items.length - filtered.length;
      if (skipped > 0) console.log(`[HLTB] Skipping ${skipped} ignored games`);
      if (filtered.length === 0) {
        console.log(`[HLTB] All ${items.length} games are already ignored or cached`);
        return;
      }
      _hltbRunning = true;
      _hltbAbort = false;
      set({
        hltbRunning: true,
        hltbFetched: 0,
        hltbTotal: filtered.length,
        hltbCurrentName: "",
        hltbRecentNames: [],
      });
      _runHltbLoop(filtered);
    },

    stopHltbFetch: () => {
      _hltbAbort = true;
      _hltbRunning = false;
      set({ hltbRunning: false, hltbCurrentName: "" });
    },

    startAchievementsFetch: (items) => {
      if (_achievementsRunning || items.length === 0) return;
      _achievementsRunning = true;
      _achievementsAbort = false;
      set({
        achievementsRunning: true,
        achievementsFetched: 0,
        achievementsTotal: items.length,
        achievementsCurrentName: "",
        achievementsRecentNames: [],
      });
      _runAchievementsLoop(items);
    },

    stopAchievementsFetch: () => {
      _achievementsAbort = true;
      _achievementsRunning = false;
      set({ achievementsRunning: false, achievementsCurrentName: "" });
    },

    startRatingsFetch: (items) => {
      if (_ratingsRunning || items.length === 0) return;
      const ratings = useSteamRatingsStore.getState().ratings;
      const filtered = items.filter((item) => !isSteamRatingFresh(ratings[item.appId]));
      if (filtered.length === 0) return;
      _ratingsRunning = true;
      _ratingsAbort = false;
      set({
        ratingsRunning: true,
        ratingsFetched: 0,
        ratingsTotal: filtered.length,
        ratingsSucceeded: 0,
        ratingsFailed: 0,
        ratingsCurrentName: "",
        ratingsRecentNames: [],
        ratingsCoolingDown: false,
        ratingsCooldownSecs: 0,
      });
      _runRatingsLoop(filtered);
    },

    stopRatingsFetch: () => {
      _ratingsAbort = true;
      _ratingsRunning = false;
      set({ ratingsRunning: false, ratingsCurrentName: "", ratingsCoolingDown: false, ratingsCooldownSecs: 0 });
    },

    startStoreReleaseDateFetch: (items) => {
      if (_releaseDatesRunning || items.length === 0) return;
      const details = useGameStore.getState().details;
      const filtered = items.filter((item) =>
        isDetailsCacheCurrent(details[item.appId]) && storeReleaseDateNeedsRefresh(details[item.appId])
      );
      if (filtered.length === 0) return;

      _releaseDatesRunning = true;
      _releaseDatesAbort = false;
      set({
        releaseDatesRunning: true,
        releaseDatesFetched: 0,
        releaseDatesTotal: filtered.length,
        releaseDatesSucceeded: 0,
        releaseDatesFailed: 0,
        releaseDatesCurrentName: "",
        releaseDatesRecentNames: [],
      });
      _runStoreReleaseDateLoop(filtered);
    },

    stopStoreReleaseDateFetch: () => {
      _releaseDatesAbort = true;
      _releaseDatesRunning = false;
      set({ releaseDatesRunning: false, releaseDatesCurrentName: "" });
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function addToRecent(key: "detailsRecentNames" | "hltbRecentNames" | "achievementsRecentNames" | "ratingsRecentNames" | "releaseDatesRecentNames", label: string) {
  const prev = _getState()[key];
  _setState({ [key]: [label, ...prev.filter((item) => item !== label)].slice(0, MAX_RECENT) } as Partial<BackgroundFetchState>);
}

/**
 * Grow adaptive delay only for UNEXPECTED failures (not known-removed games).
 * Known-removed games (fails[id] > 0) won't escalate the delay.
 */
function onDetailsFail(id: number) {
  const knownFail = (useFailedGamesStore.getState().fails[id] ?? 0) > 0;
  if (!knownFail) {
    _extraDelayMs = Math.min(_extraDelayMs + DETAILS_FAIL_STEP_MS, DETAILS_FAIL_MAX_MS);
  }
  const slowing = _extraDelayMs >= DETAILS_SLOWDOWN_THRESHOLD_MS;
  _setState({
    detailsCoolingDown: slowing,
    detailsCooldownSecs: slowing ? Math.round(_extraDelayMs / 1000) : 0,
  });
}

function onDetailsSuccess() {
  _extraDelayMs = Math.max(0, _extraDelayMs - 500);
  if (_extraDelayMs < DETAILS_SLOWDOWN_THRESHOLD_MS) {
    _setState({ detailsCoolingDown: false, detailsCooldownSecs: 0 });
  }
}

// ── Steam details loop ────────────────────────────────────────────────────────

async function _runDetailsLoop(missingIds: number[]) {
  const buffer: GameDetails[] = [];
  const retryQueue: number[] = [];
  const successfulDetailIds = new Set<number>();
  let fetched = 0;
  let succeeded = 0;
  const currency = useSettingsStore.getState().currency ?? "EUR";
  const cc = currencyToCountryCode(currency);
  const currentDetails = useGameStore.getState().details;
  const failedGamesStore = useFailedGamesStore.getState();
  const priceOnlyIds = missingIds.filter((id) => {
    const detail = currentDetails[id];
    return isDetailsCacheCurrent(detail) && detailsPriceNeedsCurrencyRefresh(detail, currency);
  });
  const priceOnlyIdSet = new Set(priceOnlyIds);
  const fullDetailIds = missingIds.filter((id) => !priceOnlyIdSet.has(id));

  console.log(`[Details] Starting fetch for ${missingIds.length} games`);

  if (priceOnlyIds.length > 0 && !_detailsAbort) {
    _setState({ detailsCurrentName: `Price batch (${priceOnlyIds.length})` });
    try {
      const prices = await fetchGamePriceOverviews(priceOnlyIds, cc);
      const pricesById = new Set(prices.map((price) => price.app_id));
      const unavailablePrices: GamePriceOverview[] = priceOnlyIds
        .filter((id) => !pricesById.has(id))
        .map((id) => ({
          app_id: id,
          price_initial: null,
          price_final: null,
          price_currency: currency,
          price_country_code: cc?.toUpperCase() ?? null,
          is_free: false,
        }));

      useGameStore.getState().setBulkPriceSnapshots([...prices, ...unavailablePrices]);
      fetched += priceOnlyIds.length;
      succeeded += priceOnlyIds.length;
      _setState({ detailsFetched: fetched, detailsSucceeded: succeeded });
      addToRecent(
        "detailsRecentNames",
        `✓ Price batch ${prices.length}/${priceOnlyIds.length}`
      );
      console.log(`[Details] ✓ price batch: ${prices.length}/${priceOnlyIds.length} prices refreshed`);
    } catch (e) {
      console.warn(`[Details] ✗ price batch (${priceOnlyIds.length}): ${e}`);
      addToRecent("detailsRecentNames", `⚠ Price batch failed`);
      onDetailsFail(priceOnlyIds[0] ?? 0);
      retryQueue.push(...priceOnlyIds);
    }
  }

  // ---- Pass 1: main pass ----
  for (let i = 0; i < fullDetailIds.length; i++) {
    if (_detailsAbort) break;

    const id = fullDetailIds[i];
    const games = useGameStore.getState().games;
    const name = games[id]?.name ?? `#${id}`;
    _setState({ detailsCurrentName: name });

    let ok = false;
    try {
      const detail = await fetchGameDetails(id, cc);
      buffer.push(detail);
      successfulDetailIds.add(id);
      addToRecent("detailsRecentNames", `✓ ${name}`);
      console.log(`[Details] ✓ ${name} (${id})`);
      onDetailsSuccess();
      ok = true;
      succeeded++;
    } catch (e) {
      if (isPermanentError(e)) {
        const failed = _getState().detailsFailed + 1;
        _setState({ detailsFailed: failed });
        failedGamesStore.recordFailure(id);
        addToRecent("detailsRecentNames", `✗ ${name} (unavailable)`);
        console.warn(`[Details] ✗ ${name} (${id}): ${e} — confirmed unavailable`);
      } else {
        console.warn(`[Details] ✗ ${name} (${id}): ${e}`);
        onDetailsFail(id);
        retryQueue.push(id);
        if (_extraDelayMs >= DETAILS_SLOWDOWN_THRESHOLD_MS) {
          addToRecent("detailsRecentNames", `⚠ Slowing down (${Math.round(_extraDelayMs / 1000)}s delay)`);
        }
      }
    }

    fetched++;
    _setState({ detailsFetched: fetched, detailsSucceeded: succeeded });

    if (buffer.length >= 25 || i === fullDetailIds.length - 1) {
      if (buffer.length > 0) {
        useGameStore.getState().setBulkDetails([...buffer]);
        buffer.length = 0;
      }
    }

    if (!ok) {
      // Small delay on failure (just the adaptive portion if any)
      if (!_detailsAbort && i < fullDetailIds.length - 1 && _extraDelayMs > 0) {
        await sleep(Math.min(_extraDelayMs, 3000)); // cap wait-on-fail at 3s
      }
      continue;
    }

    if (!_detailsAbort && i < fullDetailIds.length - 1) {
      await sleep(detailsBaseDelayMs() + _extraDelayMs);
    }
  }

  // ---- Pass 2: retry failed games ----
  if (!_detailsAbort && retryQueue.length > 0) {
    console.log(`[Details] Pass 2: retrying ${retryQueue.length} failed games`);
    addToRecent("detailsRecentNames", `↻ Retrying ${retryQueue.length} failed games…`);

    for (let i = 0; i < retryQueue.length; i++) {
      if (_detailsAbort) break;

      const id = retryQueue[i];
      const games = useGameStore.getState().games;
      const name = games[id]?.name ?? `#${id}`;
      _setState({ detailsCurrentName: `[retry] ${name}` });

      try {
        const detail = await fetchGameDetails(id, cc);
        buffer.push(detail);
        successfulDetailIds.add(id);
        addToRecent("detailsRecentNames", `✓ ${name}`);
        console.log(`[Details] ✓ retry ${name} (${id})`);
        onDetailsSuccess();
        succeeded++;
        _setState({ detailsSucceeded: succeeded });
      } catch (e) {
        const failed = _getState().detailsFailed + 1;
        _setState({ detailsFailed: failed });
        if (isPermanentError(e)) {
          console.warn(`[Details] ✗ retry ${name} (${id}): ${e} — confirmed unavailable`);
          addToRecent("detailsRecentNames", `✗ ${name} (unavailable)`);
          failedGamesStore.recordFailure(id);
        } else {
          console.warn(`[Details] ✗ retry ${name} (${id}): ${e} — transient, will retry next run`);
          addToRecent("detailsRecentNames", `⚠ ${name} (retry later)`);
          onDetailsFail(id);
        }
      }

      if (buffer.length >= 10 || i === retryQueue.length - 1) {
        if (buffer.length > 0) {
          useGameStore.getState().setBulkDetails([...buffer]);
          buffer.length = 0;
        }
      }

      if (!_detailsAbort && i < retryQueue.length - 1) {
        await sleep(Math.max(DETAILS_RETRY_DELAY_MS, detailsBaseDelayMs()) + Math.min(_extraDelayMs, 3000));
      }
    }
  }

  console.log(`[Details] Done: ${succeeded} succeeded, ${_getState().detailsFailed} permanently failed`);

  _detailsRunning = false;
  _setState({
    detailsRunning: false,
    detailsCurrentName: "",
    detailsCoolingDown: false,
    detailsCooldownSecs: 0,
    detailsFetched: missingIds.length,
    detailsSucceeded: succeeded,
  });

  const detailsAfterFetch = useGameStore.getState().details;
  const releaseDateItems = [...successfulDetailIds]
    .filter((id) => isDetailsCacheCurrent(detailsAfterFetch[id]) && storeReleaseDateNeedsRefresh(detailsAfterFetch[id]))
    .map((appId) => ({ appId, name: useGameStore.getState().games[appId]?.name ?? `#${appId}` }));
  if (releaseDateItems.length > 0 && !_releaseDatesRunning) {
    _getState().startStoreReleaseDateFetch(releaseDateItems);
  }
}

async function _runStoreReleaseDateLoop(items: Array<{ appId: number; name: string }>) {
  const buffer: StoreReleaseDateResult[] = [];
  let fetched = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(`[ReleaseDates] Starting fetch for ${items.length} games`);

  for (let batchStart = 0; batchStart < items.length; batchStart += DEFAULT_STORE_RELEASE_DATE_BATCH_SIZE) {
    if (_releaseDatesAbort) break;

    const batch = items.slice(batchStart, batchStart + DEFAULT_STORE_RELEASE_DATE_BATCH_SIZE);
    const batchEnd = batchStart + batch.length;
    _setState({
      releaseDatesCurrentName:
        batch.length === 1
          ? batch[0].name
          : `${batch[0].name} +${batch.length - 1}`,
    });

    try {
      const results = await fetchStoreReleaseDates(batch.map((item) => item.appId));
      const resultsById = new Map(results.map((result) => [result.app_id, result]));

      for (const { appId, name } of batch) {
        const result = resultsById.get(appId);
        if (!result) {
          failed++;
          addToRecent("releaseDatesRecentNames", `⚠ ${name} (retry later)`);
          console.warn(`[ReleaseDates] ✗ ${name} (${appId}): no result returned`);
          continue;
        }

        buffer.push(result);
        const label = result.release_date ? `${name} · ${result.release_date}` : `${name} · no Store date`;
        addToRecent("releaseDatesRecentNames", label);
        console.log(`[ReleaseDates] ✓ ${name} (${appId}): ${result.release_date ?? "no Store date"}`);
        succeeded++;
      }
    } catch (e) {
      failed += batch.length;
      addToRecent("releaseDatesRecentNames", `⚠ Batch ${batchStart + 1}-${batchEnd} failed`);
      console.warn(`[ReleaseDates] ✗ batch ${batchStart + 1}-${batchEnd}: ${e}`);
    }

    fetched += batch.length;
    _setState({
      releaseDatesFetched: Math.min(fetched, items.length),
      releaseDatesSucceeded: succeeded,
      releaseDatesFailed: failed,
    });

    if (buffer.length >= DEFAULT_STORE_RELEASE_DATE_BATCH_SIZE || batchEnd >= items.length) {
      if (buffer.length > 0) {
        useGameStore.getState().setBulkStoreReleaseDates([...buffer]);
        buffer.length = 0;
      }
    }

    if (!_releaseDatesAbort && batchEnd < items.length) {
      await sleep(DEFAULT_STORE_RELEASE_DATE_DELAY_MS);
    }
  }

  _releaseDatesRunning = false;
  _setState({
    releaseDatesRunning: false,
    releaseDatesCurrentName: "",
    releaseDatesFetched: fetched,
    releaseDatesSucceeded: succeeded,
    releaseDatesFailed: failed,
  });
}

// ── HLTB loop (concurrent requests, count from settings) ─────────────────────

async function _runHltbLoop(items: Array<{ appId: number; name: string }>) {
  console.log(`[HLTB] Starting fetch for ${items.length} games`);
  let fetched = 0;
  let batchStart = 0;

  while (batchStart < items.length) {
    if (_hltbAbort) break;

    // Read concurrency on each batch so settings changes apply immediately
    const concurrency = useSettingsStore.getState().hltbConcurrency ?? 5;
    const batch = items.slice(batchStart, batchStart + concurrency);
    _setState({ hltbCurrentName: batch[0]?.name ?? "" });
    console.log(`[HLTB] Batch ${batchStart + 1}–${batchStart + batch.length} of ${items.length} (${concurrency} concurrent)`);

    await Promise.all(batch.map(async ({ name, appId }) => {
      try {
        const details = useGameStore.getState().details[appId];
        const releaseYear = extractReleaseYear(bestAvailableReleaseDate(details));
        const result = await fetchHltb(name, appId, releaseYear);
        if (result) {
          useHltbStore.getState().setData(appId, result);
          const selectedHours =
            getHltbHours(result, useSettingsStore.getState().hltbTimeMode) ??
            getHltbHours(result, "first_available");
          const summary = selectedHours != null ? `${selectedHours}h` : "N/A";
          addToRecent("hltbRecentNames", `${name} · ${summary}`);
          console.log(`[HLTB] ✓ ${name}: ${summary}`);
        } else {
          addToRecent("hltbRecentNames", `${name} · not found`);
          console.log(`[HLTB] Not found: ${name}`);
          // Record as "not found" so it gets ignored next run
          useHltbIgnoredStore.getState().recordNotFound(appId);
        }
      } catch (e) {
        console.error(`[HLTB] Error "${name}":`, e);
      }
    }));

    fetched += batch.length;
    batchStart += concurrency;
    _setState({ hltbFetched: Math.min(fetched, items.length) });

    if (!_hltbAbort && batchStart < items.length) {
      await sleep(hltbBatchDelayMs());
    }
  }

  console.log(`[HLTB] Done: ${fetched} processed`);
  _hltbRunning = false;
  _setState({ hltbRunning: false, hltbCurrentName: "", hltbFetched: items.length });
}

// ── Achievements loop (concurrent batches, like HLTB) ─────────────────────────

async function _runAchievementsLoop(items: Array<{ appId: number; name: string }>) {
  const { apiKey, steamId64 } = useSettingsStore.getState();
  if (!apiKey || !steamId64) {
    console.warn("[Achievements] No API key or Steam ID, aborting");
    _achievementsRunning = false;
    _setState({ achievementsRunning: false });
    return;
  }

  console.log(`[Achievements] Starting fetch for ${items.length} games`);
  let fetched = 0;
  let batchStart = 0;

  while (batchStart < items.length) {
    if (_achievementsAbort) break;

    // Read concurrency on each batch so settings changes apply immediately
    const concurrency = useSettingsStore.getState().achievementsConcurrency ?? 5;
    const batch = items.slice(batchStart, batchStart + concurrency);
    _setState({ achievementsCurrentName: batch[0]?.name ?? "" });

    await Promise.all(batch.map(async ({ appId, name }) => {
      try {
        const [total, achieved] = await fetchAchievementsSummary(apiKey, steamId64, appId);
        useAchievementsStore.getState().setSummary(appId, { total, achieved, achievements: [] });
        const label = total > 0 ? `${name} · ${achieved}/${total}` : `${name} · no achievements`;
        addToRecent("achievementsRecentNames", `✓ ${label}`);
        console.log(`[Achievements] ✓ ${name}: ${achieved}/${total}`);
      } catch (e) {
        console.warn(`[Achievements] ✗ ${name} (${appId}): ${e}`);
        addToRecent("achievementsRecentNames", `✗ ${name}`);
      }
    }));

    fetched += batch.length;
    batchStart += concurrency;
    _setState({ achievementsFetched: Math.min(fetched, items.length) });

    if (!_achievementsAbort && batchStart < items.length) {
      await sleep(achievementsBatchDelayMs());
    }
  }

  console.log(`[Achievements] Done: ${fetched} processed`);
  _achievementsRunning = false;
  _setState({ achievementsRunning: false, achievementsCurrentName: "", achievementsFetched: items.length });
}

// ── Steam ratings loop (sequential to avoid hammering Steam Store) ─────────────

async function _runRatingsLoop(items: Array<{ appId: number; name: string }>) {
  console.log(`[Ratings] Starting fetch for ${items.length} games`);
  let fetched = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    if (_ratingsAbort) break;

    const { appId, name } = items[i];
    _setState({ ratingsCurrentName: name });

    let processed = false;
    let rateLimitRetries = 0;

    while (!_ratingsAbort && !processed) {
      try {
        const summary = await fetchSteamReviewSummary(appId);
        useSteamRatingsStore.getState().setRating(appId, summary);
        const label = summary.total_reviews > 0
          ? `${name} · ${summary.review_score_desc || `${summary.positive_percentage ?? 0}%`}`
          : `${name} · no reviews`;
        addToRecent("ratingsRecentNames", `✓ ${label}`);
        console.log(`[Ratings] ✓ ${name} (${appId})`);
        succeeded++;
        processed = true;
      } catch (e) {
        if (isSteamReviewRateLimitedError(e)) {
          console.warn(`[Ratings] rate-limited while fetching ${name} (${appId}): ${e}`);
          rateLimitRetries++;
          const cooldownMinutes = ratingsCooldownMinutes();
          addToRecent(
            "ratingsRecentNames",
            rateLimitRetries === 1
              ? `⏳ Steam rate limit; waiting ${cooldownMinutes}m`
              : `⏳ Steam still rate-limited; waiting ${cooldownMinutes}m (${rateLimitRetries})`
          );
          const shouldContinue = await waitRatingsCooldown(cooldownMinutes * 60 * 1000);
          if (!shouldContinue) break;
          _setState({ ratingsCurrentName: `[retry] ${name}` });
          continue;
        }

        failed++;
        addToRecent("ratingsRecentNames", `✗ ${name}`);
        console.warn(`[Ratings] ✗ ${name} (${appId}): ${e}`);
        processed = true;
      }
    }

    if (!processed) break;

    if (_ratingsAbort && failed > 0) break;

    fetched++;
    _setState({ ratingsFetched: fetched, ratingsSucceeded: succeeded, ratingsFailed: failed });

    if (!_ratingsAbort && i < items.length - 1) {
      await sleep(ratingsBaseDelayMs());
    }
  }

  console.log(`[Ratings] Done: ${fetched} processed`);
  _ratingsRunning = false;
  _setState({
    ratingsRunning: false,
    ratingsCurrentName: "",
    ratingsFetched: fetched,
    ratingsSucceeded: succeeded,
    ratingsFailed: failed,
    ratingsCoolingDown: false,
    ratingsCooldownSecs: 0,
  });
}

async function waitRatingsCooldown(totalMs: number): Promise<boolean> {
  const deadline = Date.now() + totalMs;
  _setState({
    ratingsCoolingDown: true,
    ratingsCooldownSecs: Math.ceil(totalMs / 1000),
  });

  while (!_ratingsAbort) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    _setState({ ratingsCooldownSecs: Math.ceil(remainingMs / 1000) });
    await sleep(Math.min(1000, remainingMs));
  }

  _setState({ ratingsCoolingDown: false, ratingsCooldownSecs: 0 });
  return !_ratingsAbort;
}
