import { describe, expect, it } from "vitest";
import { normalizeGameTitleForIdentity, possibleDuplicateAppIds } from "./gameIdentity";
import type { OwnedGame } from "./types";

function game(appid: number, name: string): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

describe("gameIdentity", () => {
  it("normalizes edition suffixes for same-title detection", () => {
    expect(normalizeGameTitleForIdentity("Grand Theft Auto III")).toBe("grand theft auto iii");
    expect(normalizeGameTitleForIdentity("Grand Theft Auto III – The Definitive Edition")).toBe(
      "grand theft auto iii"
    );
  });

  it("marks same normalized titles as possible duplicates", () => {
    const ids = possibleDuplicateAppIds([
      game(12100, "Grand Theft Auto III"),
      game(1546970, "Grand Theft Auto III – The Definitive Edition"),
      game(39140, "FINAL FANTASY VII"),
      game(1462040, "FINAL FANTASY VII REMAKE INTERGRADE"),
    ]);

    expect(ids.has(12100)).toBe(true);
    expect(ids.has(1546970)).toBe(true);
    expect(ids.has(39140)).toBe(false);
    expect(ids.has(1462040)).toBe(false);
  });
});
