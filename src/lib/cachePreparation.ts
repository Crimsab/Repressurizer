import { detailsCacheNeedsRefresh, isDetailsCacheCurrent, useGameStore } from "../stores/gameStore";
import { useBackgroundFetchStore } from "../stores/backgroundFetchStore";
import { MAX_FAIL_RUNS, useFailedGamesStore } from "../stores/failedGamesStore";
import { HLTB_MAX_FAILS, useHltbIgnoredStore } from "../stores/hltbIgnoredStore";
import { useHltbStore } from "../stores/hltbStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSteamRatingsStore } from "../stores/steamRatingsStore";
import { detailsPriceNeedsCurrencyRefresh } from "./prices";
import { storeReleaseDateNeedsRefresh } from "./releaseDates";
import { steamRatingIdsNeedingFetch } from "./steamRatings";
import type { LibraryRefreshCacheMode } from "./types";

export interface CachePreparationPlan {
  detailIds: number[];
  hltbItems: Array<{ appId: number; name: string }>;
  releaseDateItems: Array<{ appId: number; name: string }>;
  ratingItems: Array<{ appId: number; name: string }>;
  missingCount: number;
}

export function buildCachePreparationPlan(mode: LibraryRefreshCacheMode): CachePreparationPlan {
  if (mode === "none") {
    return { detailIds: [], hltbItems: [], releaseDateItems: [], ratingItems: [], missingCount: 0 };
  }

  const games = useGameStore.getState().games;
  const details = useGameStore.getState().details;
  const hltbData = useHltbStore.getState().data;
  const failedDetails = useFailedGamesStore.getState().fails;
  const failedHltb = useHltbIgnoredStore.getState().fails;
  const settings = useSettingsStore.getState();
  const gameIds = Object.keys(games).map(Number);
  const gameItem = (appId: number) => ({ appId, name: games[appId]?.name ?? `#${appId}` });

  const detailIds = gameIds.filter((id) => {
    if ((failedDetails[id] ?? 0) >= MAX_FAIL_RUNS) return false;
    const detail = details[id];
    return detailsCacheNeedsRefresh(detail, settings.detailsCacheMaxAgeDays) || detailsPriceNeedsCurrencyRefresh(detail, settings.currency);
  });

  const hltbItems = gameIds
    .filter((id) => !hltbData[id] && (failedHltb[id] ?? 0) < HLTB_MAX_FAILS)
    .map(gameItem);

  const releaseDateItems = mode === "full"
    ? gameIds
      .filter((id) => isDetailsCacheCurrent(details[id]) && storeReleaseDateNeedsRefresh(details[id]))
      .map(gameItem)
    : [];

  const ratingsStore = useSteamRatingsStore.getState();
  const ratingItems = mode === "full" && ratingsStore.hydrated
    ? steamRatingIdsNeedingFetch(games, ratingsStore.ratings).map(gameItem)
    : [];

  return {
    detailIds,
    hltbItems,
    releaseDateItems,
    ratingItems,
    missingCount: detailIds.length + hltbItems.length + releaseDateItems.length + ratingItems.length,
  };
}

export async function startCachePreparation(mode: LibraryRefreshCacheMode): Promise<CachePreparationPlan> {
  if (mode === "full" && !useSteamRatingsStore.getState().hydrated) {
    await useSteamRatingsStore.getState().hydrateCache().catch(() => {});
  }

  const plan = buildCachePreparationPlan(mode);
  const background = useBackgroundFetchStore.getState();

  // The background store queues requests when the corresponding worker is
  // already running. Calling every starter here prevents a concurrent
  // library refresh from silently losing newly discovered games.
  if (plan.detailIds.length > 0) background.startDetailsFetch(plan.detailIds);
  if (plan.hltbItems.length > 0) background.startHltbFetch(plan.hltbItems);
  if (plan.releaseDateItems.length > 0) background.startStoreReleaseDateFetch(plan.releaseDateItems);
  if (plan.ratingItems.length > 0) background.startRatingsFetch(plan.ratingItems);

  return plan;
}
