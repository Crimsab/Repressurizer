import { detailsPriceNeedsCurrencyRefresh } from "./prices";
import { storeReleaseDateNeedsRefresh } from "./releaseDates";
import { isSteamRatingFresh } from "./steamRatings";
import type { HltbData } from "./tauri";
import type {
  AchievementSummary,
  GameDetails,
  OwnedGame,
  SteamCollection,
  SteamReviewSummary,
} from "./types";
import { detailsCacheNeedsRefresh, isDetailsCacheCurrent } from "./detailsCache";
import { HLTB_MAX_FAILS, MAX_FAIL_RUNS } from "./fetchGuards";

export interface MetadataRefreshOptions {
  includeDetails: boolean;
  forceDetails: boolean;
  includeRatings: boolean;
  forceRatings: boolean;
  includeHltb: boolean;
  forceHltb: boolean;
  includeReleaseDates: boolean;
  forceReleaseDates: boolean;
  includeAchievements: boolean;
  forceAchievements: boolean;
}

export interface MetadataRefreshPlan {
  appIds: number[];
  detailIds: number[];
  ratingItems: MetadataRefreshItem[];
  hltbItems: MetadataRefreshItem[];
  releaseDateItems: MetadataRefreshItem[];
  achievementItems: MetadataRefreshItem[];
}

export interface MetadataRefreshItem {
  appId: number;
  name: string;
}

export const DEFAULT_METADATA_REFRESH_OPTIONS: MetadataRefreshOptions = {
  includeDetails: true,
  forceDetails: true,
  includeRatings: true,
  forceRatings: false,
  includeHltb: true,
  forceHltb: false,
  includeReleaseDates: true,
  forceReleaseDates: false,
  includeAchievements: false,
  forceAchievements: false,
};

export function appIdsForCollections(collections: SteamCollection[]): number[] {
  const ids = new Set<number>();
  for (const collection of collections) {
    for (const appId of collection.added ?? []) {
      if (Number.isFinite(appId) && appId > 0) ids.add(appId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export function buildMetadataRefreshPlan({
  appIds,
  games,
  details,
  ratings,
  hltbData,
  achievements,
  ignoredDetailFails,
  ignoredHltbFails,
  currency,
  detailsMaxAgeDays,
  options,
}: {
  appIds: number[];
  games: Record<number, OwnedGame>;
  details: Record<number, GameDetails>;
  ratings: Record<number, SteamReviewSummary>;
  hltbData: Record<number, HltbData>;
  achievements: Record<number, AchievementSummary>;
  ignoredDetailFails: Record<number, number>;
  ignoredHltbFails: Record<number, number>;
  currency: string;
  detailsMaxAgeDays: number;
  options: MetadataRefreshOptions;
}): MetadataRefreshPlan {
  const uniqueIds = [...new Set(appIds.filter((id) => Number.isFinite(id) && id > 0))].sort((a, b) => a - b);
  const itemFor = (appId: number): MetadataRefreshItem => ({
    appId,
    name: games[appId]?.name || details[appId]?.name || `#${appId}`,
  });

  const detailIds = options.includeDetails
    ? uniqueIds.filter((id) => {
        if ((ignoredDetailFails[id] ?? 0) >= MAX_FAIL_RUNS) return false;
        if (options.forceDetails) return true;
        const detail = details[id];
        return detailsCacheNeedsRefresh(detail, detailsMaxAgeDays) || detailsPriceNeedsCurrencyRefresh(detail, currency);
      })
    : [];

  const ratingItems = options.includeRatings
    ? uniqueIds
        .filter((id) => options.forceRatings || !isSteamRatingFresh(ratings[id]))
        .map(itemFor)
    : [];

  const hltbItems = options.includeHltb
    ? uniqueIds
        .filter((id) => (ignoredHltbFails[id] ?? 0) < HLTB_MAX_FAILS)
        .filter((id) => options.forceHltb || !hltbData[id])
        .map(itemFor)
    : [];

  const releaseDateItems = options.includeReleaseDates
    ? uniqueIds
        .filter((id) => isDetailsCacheCurrent(details[id]))
        .filter((id) => options.forceReleaseDates || storeReleaseDateNeedsRefresh(details[id]))
        .map(itemFor)
    : [];

  const achievementItems = options.includeAchievements
    ? uniqueIds
        .filter((id) => options.forceAchievements || !achievements[id])
        .map(itemFor)
    : [];

  return {
    appIds: uniqueIds,
    detailIds,
    ratingItems,
    hltbItems,
    releaseDateItems,
    achievementItems,
  };
}

export function metadataRefreshPlanTotal(plan: MetadataRefreshPlan): number {
  return (
    plan.detailIds.length +
    plan.ratingItems.length +
    plan.hltbItems.length +
    plan.releaseDateItems.length +
    plan.achievementItems.length
  );
}
