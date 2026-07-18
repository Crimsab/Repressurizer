import { useBackgroundFetchStore } from "../stores/backgroundFetchStore";
import { isDetailsCacheCurrent, useGameStore } from "../stores/gameStore";
import { storeReleaseDateNeedsRefresh } from "./releaseDates";

/**
 * Schedule the Store/original release-date lookup after details were fetched
 * outside the background metadata worker (for example from an image or game
 * detail view). The background store de-duplicates active requests for us.
 */
export function scheduleOriginalReleaseDateFetch(appId: number, name?: string): void {
  const { details, games } = useGameStore.getState();
  const detail = details[appId];
  if (!isDetailsCacheCurrent(detail) || !storeReleaseDateNeedsRefresh(detail)) return;

  useBackgroundFetchStore.getState().startStoreReleaseDateFetch([{
    appId,
    name: name ?? games[appId]?.name ?? detail.name ?? `#${appId}`,
  }]);
}
