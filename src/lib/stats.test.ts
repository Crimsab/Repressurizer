import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";
import type { GameDetails, OwnedGame } from "./types";

function game(appid: number, name: string, playtime = 0): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: playtime,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

function details(appId: number, name: string, price: number): GameDetails {
  return {
    app_id: appId,
    name,
    genres: [],
    categories: [],
    release_date: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: price,
    price_final: price,
    price_currency: "EUR",
    is_free: false,
  };
}

describe("computeStats", () => {
  it("ignores implausible Steam prices in value stats and shame wall", () => {
    const stats = computeStats(
      {
        1: game(1, "Normal Game"),
        2: game(2, "Bad Price Game"),
      },
      [],
      {
        1: details(1, "Normal Game", 1_999),
        2: details(2, "Bad Price Game", 14_200_000),
      }
    );

    expect(stats.libraryValue).toBe(1_999);
    expect(stats.pricedGamesCount).toBe(1);
    expect(stats.shameWall).toEqual([{ name: "Normal Game", price: 1_999 }]);
  });
});
