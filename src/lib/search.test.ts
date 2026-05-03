import { describe, expect, it } from "vitest";
import { hasAdvancedFilters, matchesFilter, parseSearchQuery } from "./search";
import type { GameDetails, OwnedGame } from "./types";

const game: OwnedGame = {
  appid: 39140,
  name: "FINAL FANTASY VII",
  playtime_forever: 180,
  img_icon_url: null,
  rtime_last_played: 0,
};

const details: GameDetails = {
  app_id: 39140,
  name: "FINAL FANTASY VII",
  genres: ["RPG"],
  categories: ["Single-player", "Steam Achievements"],
  release_date: "Jul 24, 2013",
  metacritic_score: 92,
  developers: ["Square Enix"],
  publishers: ["Square Enix"],
  platforms: { windows: true, mac: false, linux: false },
  header_image: null,
  capsule_image: null,
  price_initial: null,
  price_final: null,
  price_currency: null,
  is_free: false,
};

function match(query: string, overrides: Partial<Parameters<typeof matchesFilter>[6]> = {}) {
  return matchesFilter(
    game,
    details,
    { 39140: "playing" },
    { 39140: ["classic", "jrpg"] },
    { 39140: { rating: 9, updatedAt: 1 } },
    parseSearchQuery(query),
    {
      hltbData: { 39140: { main_story: 36, main_extra: 48, completionist: 80 } },
      achievements: { 39140: { total: 36, achieved: 18, achievements: [] } },
      duplicateAppIds: new Set([39140]),
      familyApps: {},
      delistedAppIds: new Set([39140]),
      ...overrides,
    }
  );
}

describe("search", () => {
  it("matches free text and regex names", () => {
    expect(match("fantasy")).toBe(true);
    expect(match("/final.*vii/i")).toBe(true);
    expect(match("/dragon.*quest/i")).toBe(false);
  });

  it("does not crash on invalid regex", () => {
    expect(hasAdvancedFilters("/final[/")).toBe(true);
    expect(match("/final[/")).toBe(false);
  });

  it("matches numeric hours and appid filters", () => {
    expect(match("hours:>2")).toBe(true);
    expect(match("playtime:<2")).toBe(false);
    expect(match("appid:39140")).toBe(true);
    expect(match("id:>50000")).toBe(false);
  });

  it("matches metadata fields", () => {
    expect(match("genre:rpg category:achievement")).toBe(true);
    expect(match('dev:"Square Enix" pub:square')).toBe(true);
    expect(match("platform:windows")).toBe(true);
    expect(match("platform:linux")).toBe(false);
  });

  it("matches release years from Steam date strings", () => {
    expect(match("year:2013")).toBe(true);
    expect(match("released:2010..2020")).toBe(true);
    expect(match("release:<2010")).toBe(false);
  });

  it("matches full release date ranges", () => {
    expect(match("released:>=2013-07-01")).toBe(true);
    expect(match("date:2013-07-01..2013-08-01")).toBe(true);
    expect(match("release:<2013-01-01")).toBe(false);
  });

  it("matches rating, metacritic, hltb, achievements, duplicate and delisted filters", () => {
    expect(match("rating:>8 meta:>90 hltb:30..40 achievements:50")).toBe(true);
    expect(match("duplicate:true delisted:true")).toBe(true);
    expect(match("duplicate:false")).toBe(false);
  });

  it("matches missing metadata when details are unavailable", () => {
    const filter = parseSearchQuery("missing:true");
    expect(matchesFilter(game, undefined, {}, {}, {}, filter)).toBe(true);
    expect(matchesFilter(game, details, {}, {}, {}, filter)).toBe(false);
  });
});
