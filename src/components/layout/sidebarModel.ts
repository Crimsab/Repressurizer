import type { OwnedGame, SteamCollection } from "../../lib/types";

export interface SidebarLibraryStats {
  gameCount: number;
  uncategorizedCount: number;
  backlogCount: number;
  recentlyPlayedCount: number;
  nowPlayingGame: OwnedGame | null;
  hiddenCount: number;
}

export function buildSidebarLibraryStats(
  games: Record<number, OwnedGame>,
  collections: SteamCollection[],
  nowSeconds = Math.floor(Date.now() / 1000)
): SidebarLibraryStats {
  const gameValues = Object.values(games);
  const categorizedIds = new Set(collections.flatMap((collection) => collection.added));
  const thirtyDaysAgo = nowSeconds - 30 * 24 * 60 * 60;
  const oneDayAgo = nowSeconds - 24 * 60 * 60;
  const nowPlayingGame = gameValues.reduce<OwnedGame | null>((best, game) => {
    if (game.rtime_last_played <= oneDayAgo) return best;
    if (!best || game.rtime_last_played > best.rtime_last_played) return game;
    return best;
  }, null);

  return {
    gameCount: gameValues.length,
    uncategorizedCount: gameValues.filter((game) => !categorizedIds.has(game.appid)).length,
    backlogCount: gameValues.filter((game) => game.playtime_forever === 0).length,
    recentlyPlayedCount: gameValues.filter(
      (game) => game.rtime_last_played > thirtyDaysAgo
    ).length,
    nowPlayingGame,
    hiddenCount:
      collections.find((collection) => collection.id === "hidden")?.added.length ?? 0,
  };
}
