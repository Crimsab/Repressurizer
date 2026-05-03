import { create } from "zustand";
import { fetchGameDetails, fetchHltb, fetchAchievementsSummary, currencyToCountryCode } from "../lib/tauri";
import { useGameStore } from "./gameStore";
import { useHltbStore } from "./hltbStore";
import { useAchievementsStore } from "./achievementsStore";
import { useFailedGamesStore } from "./failedGamesStore";
import { useHltbIgnoredStore } from "./hltbIgnoredStore";
import { useSettingsStore } from "./settingsStore";
import { extractReleaseYear } from "../lib/search";
import type { GameDetails } from "../lib/types";

// ── Config ────────────────────────────────────────────────────────────────────
const DETAILS_BASE_DELAY_MS = 1200;    // base delay between Steam requests (~1 req/sec)
const DETAILS_RETRY_DELAY_MS = 2000;   // slower on retry pass

// Adaptive delay: only grows for UNEXPECTED failures (not known-removed games)
const DETAILS_FAIL_STEP_MS     = 400;  // +400ms per unexpected failure
const DETAILS_FAIL_MAX_MS      = 12_000;
const DETAILS_SLOWDOWN_THRESHOLD_MS = 3_000; // when to show "slowing down" indicator

// HLTB: concurrency controlled by settings (default 3), 500ms between batches
const HLTB_BATCH_DELAY_MS = 500;

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

  startDetailsFetch: (missingIds: number[]) => void;
  stopDetailsFetch: () => void;
  startHltbFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopHltbFetch: () => void;
  startAchievementsFetch: (items: Array<{ appId: number; name: string }>) => void;
  stopAchievementsFetch: () => void;
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

    startDetailsFetch: (missingIds) => {
      if (_detailsRunning || missingIds.length === 0) return;
      // Filter out games already permanently failed (removed from Steam)
      const { isIgnored } = useFailedGamesStore.getState();
      const ids = missingIds.filter((id) => !isIgnored(id));
      if (ids.length === 0) {
        console.log(`[Details] All ${missingIds.length} missing games are already ignored`);
        return;
      }
      const skipped = missingIds.length - ids.length;
      if (skipped > 0) console.log(`[Details] Skipping ${skipped} ignored games, fetching ${ids.length}`);

      _detailsRunning = true;
      _detailsAbort = false;
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
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function addToRecent(key: "detailsRecentNames" | "hltbRecentNames" | "achievementsRecentNames", label: string) {
  const prev = _getState()[key];
  _setState({ [key]: [label, ...prev].slice(0, MAX_RECENT) } as Partial<BackgroundFetchState>);
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
  let fetched = 0;
  let succeeded = 0;
  const cc = currencyToCountryCode(useSettingsStore.getState().currency ?? "EUR");

  console.log(`[Details] Starting fetch for ${missingIds.length} games`);

  // ---- Pass 1: main pass ----
  for (let i = 0; i < missingIds.length; i++) {
    if (_detailsAbort) break;

    const id = missingIds[i];
    const games = useGameStore.getState().games;
    const name = games[id]?.name ?? `#${id}`;
    _setState({ detailsCurrentName: name });

    let ok = false;
    try {
      const detail = await fetchGameDetails(id, cc);
      buffer.push(detail);
      addToRecent("detailsRecentNames", `✓ ${name}`);
      console.log(`[Details] ✓ ${name} (${id})`);
      onDetailsSuccess();
      ok = true;
      succeeded++;
    } catch (e) {
      console.warn(`[Details] ✗ ${name} (${id}): ${e}`);
      if (isPermanentError(e)) {
        // Game removed from Steam — record immediately, skip retry
        console.log(`[Details] Permanent failure for ${name} (${id}), skipping retry`);
        addToRecent("detailsRecentNames", `✗ ${name} (removed)`);
        useFailedGamesStore.getState().recordFailure(id);
        const failed = _getState().detailsFailed + 1;
        _setState({ detailsFailed: failed });
      } else {
        onDetailsFail(id);
        retryQueue.push(id);
        if (_extraDelayMs >= DETAILS_SLOWDOWN_THRESHOLD_MS) {
          addToRecent("detailsRecentNames", `⚠ Slowing down (${Math.round(_extraDelayMs / 1000)}s delay)`);
        }
      }
    }

    fetched++;
    _setState({ detailsFetched: fetched, detailsSucceeded: succeeded });

    if (buffer.length >= 25 || i === missingIds.length - 1) {
      if (buffer.length > 0) {
        useGameStore.getState().setBulkDetails([...buffer]);
        buffer.length = 0;
      }
    }

    if (!ok) {
      // Small delay on failure (just the adaptive portion if any)
      if (!_detailsAbort && i < missingIds.length - 1 && _extraDelayMs > 0) {
        await sleep(Math.min(_extraDelayMs, 3000)); // cap wait-on-fail at 3s
      }
      continue;
    }

    if (!_detailsAbort && i < missingIds.length - 1) {
      await sleep(DETAILS_BASE_DELAY_MS + _extraDelayMs);
    }
  }

  // ---- Pass 2: retry failed games ----
  if (!_detailsAbort && retryQueue.length > 0) {
    console.log(`[Details] Pass 2: retrying ${retryQueue.length} failed games`);
    addToRecent("detailsRecentNames", `↻ Retrying ${retryQueue.length} failed games…`);
    const failedGamesStore = useFailedGamesStore.getState();

    for (let i = 0; i < retryQueue.length; i++) {
      if (_detailsAbort) break;

      const id = retryQueue[i];
      const games = useGameStore.getState().games;
      const name = games[id]?.name ?? `#${id}`;
      _setState({ detailsCurrentName: `[retry] ${name}` });

      try {
        const detail = await fetchGameDetails(id, cc);
        buffer.push(detail);
        addToRecent("detailsRecentNames", `✓ ${name}`);
        console.log(`[Details] ✓ retry ${name} (${id})`);
        onDetailsSuccess();
        succeeded++;
        _setState({ detailsSucceeded: succeeded });
      } catch (e) {
        console.warn(`[Details] ✗ retry ${name} (${id}): ${e} — recording permanent failure`);
        onDetailsFail(id);
        const failed = _getState().detailsFailed + 1;
        _setState({ detailsFailed: failed });
        // Record permanent failure — after MAX_FAIL_RUNS, game will be skipped
        failedGamesStore.recordFailure(id);
      }

      if (buffer.length >= 10 || i === retryQueue.length - 1) {
        if (buffer.length > 0) {
          useGameStore.getState().setBulkDetails([...buffer]);
          buffer.length = 0;
        }
      }

      if (!_detailsAbort && i < retryQueue.length - 1) {
        await sleep(DETAILS_RETRY_DELAY_MS + Math.min(_extraDelayMs, 3000));
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
        const releaseYear = extractReleaseYear(details?.release_date);
        const result = await fetchHltb(name, appId, releaseYear);
        if (result) {
          useHltbStore.getState().setData(appId, result);
          const summary = result.main_story != null ? `${result.main_story}h` : "N/A";
          addToRecent("hltbRecentNames", `${name} · ${summary}`);
          console.log(`[HLTB] ✓ ${name}: main=${summary}`);
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
      await sleep(HLTB_BATCH_DELAY_MS);
    }
  }

  console.log(`[HLTB] Done: ${fetched} processed`);
  _hltbRunning = false;
  _setState({ hltbRunning: false, hltbCurrentName: "", hltbFetched: items.length });
}

// ── Achievements loop (concurrent batches, like HLTB) ─────────────────────────

const ACHIEVEMENTS_BATCH_DELAY_MS = 300;

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
      await sleep(ACHIEVEMENTS_BATCH_DELAY_MS);
    }
  }

  console.log(`[Achievements] Done: ${fetched} processed`);
  _achievementsRunning = false;
  _setState({ achievementsRunning: false, achievementsCurrentName: "", achievementsFetched: items.length });
}
