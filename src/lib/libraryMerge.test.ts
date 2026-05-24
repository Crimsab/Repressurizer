import { describe, expect, it } from "vitest";
import { isPlaceholderGameName, mergeCollectionOnlyGames } from "./libraryMerge";
import type { GameDetails, OwnedGame, SteamCollection } from "./types";

const baseGame: OwnedGame = {
  appid: 10,
  name: "Existing Game",
  playtime_forever: 60,
  img_icon_url: null,
  rtime_last_played: 0,
};

const collection: SteamCollection = {
  id: "rpg",
  key: "user-collections.rpg",
  name: "RPG",
  added: [10, 39140],
  removed: [],
  timestamp: 1,
  is_deleted: false,
  is_dynamic: false,
};

const ff7Details: GameDetails = {
  app_id: 39140,
  name: "FINAL FANTASY VII",
  genres: ["RPG"],
  categories: [],
  release_date: "Jul 24, 2013",
  metacritic_score: null,
  developers: [],
  publishers: [],
  platforms: { windows: true, mac: false, linux: false },
  header_image: null,
  capsule_image: null,
  price_initial: null,
  price_final: null,
  price_currency: null,
  is_free: false,
};

describe("libraryMerge", () => {
  it("adds collection-only placeholder games for appids missing from the Web API library", () => {
    const merged = mergeCollectionOnlyGames([baseGame], [collection]);

    expect(merged).toHaveLength(2);
    expect(merged.find((g) => g.appid === 39140)).toMatchObject({
      appid: 39140,
      name: "App 39140",
      is_collection_only: true,
    });
  });

  it("uses cached details to name collection-only games", () => {
    const merged = mergeCollectionOnlyGames([baseGame], [collection], { 39140: ff7Details });

    expect(merged.find((g) => g.appid === 39140)?.name).toBe("FINAL FANTASY VII");
  });

  it("uses the Steam app index to name collection-only games when details are missing", () => {
    const merged = mergeCollectionOnlyGames([baseGame], [collection], {}, {
      version: 1,
      fetchedAt: Date.now(),
      apps: {
        39140: { appid: 39140, name: "FINAL FANTASY VII" },
      },
    });

    expect(merged.find((g) => g.appid === 39140)?.name).toBe("FINAL FANTASY VII");
  });

  it("recognizes placeholder names", () => {
    expect(isPlaceholderGameName(39140, "App 39140")).toBe(true);
    expect(isPlaceholderGameName(39140, "Unknown (#39140)")).toBe(true);
    expect(isPlaceholderGameName(39140, "FINAL FANTASY VII")).toBe(false);
  });
});
