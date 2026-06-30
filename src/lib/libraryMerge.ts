import type { GameDetails, OwnedGame, SteamCollection } from "./types";
import type { SteamAppIndexData } from "./steamAppIndex";

export type AppNameResolver = (appid: number) => string | null;

function placeholderName(appId: number): string {
  return `App ${appId}`;
}

export function isPlaceholderGameName(appId: number, name: string | null | undefined): boolean {
  const trimmed = String(name ?? "").trim();
  return !trimmed || trimmed === placeholderName(appId) || trimmed === `Unknown (#${appId})`;
}

export function displayNameFromDetails(
  game: OwnedGame,
  details: GameDetails | undefined,
  appIndex?: SteamAppIndexData,
  appNameResolver?: AppNameResolver,
): string {
  const detailName = details?.name?.trim();
  if (detailName && (game.is_collection_only || isPlaceholderGameName(game.appid, game.name))) {
    return detailName;
  }
  const indexedName = appIndex?.apps[game.appid]?.name?.trim();
  if (indexedName && (game.is_collection_only || isPlaceholderGameName(game.appid, game.name))) {
    return indexedName;
  }
  const cachedName = appNameResolver?.(game.appid)?.trim();
  if (cachedName && (game.is_collection_only || isPlaceholderGameName(game.appid, game.name))) {
    return cachedName;
  }
  return game.name;
}

export function mergeCollectionOnlyGames(
  games: OwnedGame[],
  collections: SteamCollection[],
  details: Record<number, GameDetails> = {},
  appIndex?: SteamAppIndexData,
  appNameResolver?: AppNameResolver,
): OwnedGame[] {
  const byId = new Map<number, OwnedGame>();
  for (const game of games) {
    byId.set(game.appid, {
      ...game,
      name: displayNameFromDetails(game, details[game.appid], appIndex, appNameResolver),
    });
  }

  for (const collection of collections) {
    for (const appId of collection.added) {
      if (!Number.isFinite(appId) || appId <= 0 || byId.has(appId)) continue;
      byId.set(appId, {
        appid: appId,
        name:
          details[appId]?.name?.trim() ||
          appIndex?.apps[appId]?.name?.trim() ||
          appNameResolver?.(appId)?.trim() ||
          placeholderName(appId),
        playtime_forever: 0,
        img_icon_url: null,
        rtime_last_played: 0,
        is_collection_only: true,
      });
    }
  }

  return [...byId.values()];
}
