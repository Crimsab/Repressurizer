import { describe, expect, it } from "vitest";
import { buildSavePreview } from "./savePreview";
import type { OwnedGame, SteamCollection } from "./types";

function collection(
  key: string,
  name: string,
  added: number[],
  isDynamic = false
): SteamCollection {
  return {
    id: key,
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: isDynamic,
  };
}

const games: Record<number, OwnedGame> = {
  10: { appid: 10, name: "Disco Elysium", playtime_forever: 120, img_icon_url: null, rtime_last_played: 0 },
  20: { appid: 20, name: "Hades", playtime_forever: 240, img_icon_url: null, rtime_last_played: 0 },
  30: { appid: 30, name: "Outer Wilds", playtime_forever: 60, img_icon_url: null, rtime_last_played: 0 },
};

describe("buildSavePreview", () => {
  it("summarizes collection and game changes while ignoring dynamic collections", () => {
    const saved = [
      collection("rpg", "RPG", [10, 20]),
      collection("old", "Old", [30]),
      collection("dynamic", "~Recent", [10], true),
    ];
    const current = [
      collection("rpg", "Story Games", [10, 30]),
      collection("new", "Co-op", [20]),
      collection("dynamic", "~Recent Renamed", [], true),
    ];

    const preview = buildSavePreview(saved, current, games);

    expect(preview.addedCollections).toEqual(["Co-op"]);
    expect(preview.removedCollections).toEqual(["Old"]);
    expect(preview.addedGamesCount).toBe(1);
    expect(preview.removedGamesCount).toBe(1);
    expect(preview.changedCollections).toEqual([
      {
        collection: "RPG -> Story Games",
        added: ["Outer Wilds"],
        removed: ["Hades"],
      },
    ]);
  });

  it("falls back to app IDs when game names are not loaded", () => {
    const preview = buildSavePreview(
      [collection("favorites", "Favorites", [999])],
      [collection("favorites", "Favorites", [999, 1000])],
      {}
    );

    expect(preview.changedCollections[0]?.added).toEqual(["#1000"]);
  });
});
