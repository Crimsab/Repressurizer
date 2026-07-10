import { describe, expect, it } from "vitest";
import type { OwnedGame, SteamCollection } from "../../../lib/types";
import { buildSidebarLibraryStats } from "./sidebarModel";

function game(
  appid: number,
  playtimeForever: number,
  lastPlayed: number
): OwnedGame {
  return {
    appid,
    name: `Game ${appid}`,
    playtime_forever: playtimeForever,
    img_icon_url: null,
    rtime_last_played: lastPlayed,
  };
}

function collection(id: string, added: number[]): SteamCollection {
  return {
    id,
    key: `user-collections.${id}`,
    name: id,
    added,
    removed: [],
    timestamp: 0,
    is_deleted: false,
    is_dynamic: false,
  };
}

describe("buildSidebarLibraryStats", () => {
  it("derives counts and the most recently active game in one pass boundary", () => {
    const now = 2_000_000;
    const games = {
      1: game(1, 0, now - 100),
      2: game(2, 120, now - 200),
      3: game(3, 60, now - 40 * 24 * 60 * 60),
    };
    const collections = [collection("rpg", [1]), collection("hidden", [2, 3])];

    expect(buildSidebarLibraryStats(games, collections, now)).toMatchObject({
      gameCount: 3,
      uncategorizedCount: 0,
      backlogCount: 1,
      recentlyPlayedCount: 2,
      nowPlayingGame: games[1],
      hiddenCount: 2,
    });
  });
});
