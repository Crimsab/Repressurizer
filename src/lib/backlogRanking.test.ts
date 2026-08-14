import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANKING_WEIGHTS,
  rankBacklogCandidates,
  sanitizeRankingWeights,
  type RankingMode,
  type RankingWeights,
} from "./backlogRanking";
import type { GameDetails, OwnedGame } from "./types";

function game(appid: number, name: string, extra: Partial<OwnedGame> = {}): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
    ...extra,
  };
}

function details(appid: number, extra: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appid,
    name: `Game ${appid}`,
    genres: ["RPG"],
    categories: [],
    release_date: null,
    metacritic_score: 80,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: true, mac: false, linux: true },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: null,
    is_free: false,
    ...extra,
  };
}

function rank({
  games,
  mode = "smart",
  weights = DEFAULT_RANKING_WEIGHTS,
  hiddenAppIds,
  excludedAppIds,
}: {
  games: OwnedGame[];
  mode?: RankingMode;
  weights?: RankingWeights;
  hiddenAppIds?: ReadonlySet<number>;
  excludedAppIds?: ReadonlySet<number>;
}) {
  return rankBacklogCandidates({
    games,
    details: Object.fromEntries(games.map((item) => [item.appid, details(item.appid)])),
    hltbData: {
      1: { main_story: 8, main_extra: 12, completionist: 20 },
      2: { main_story: 45, main_extra: 60, completionist: 80 },
    },
    achievements: {
      1: { total: 20, achieved: 10, achievements: [] },
      2: { total: 20, achieved: 20, achievements: [] },
    },
    wishlistItems: [{ appid: 1, priority: 1, date_added: 1_700_000_000 }],
    hiddenAppIds,
    excludedAppIds,
    genreAffinity: new Map([[1, 1], [2, 0.1]]),
    mode,
    weights,
    nowSeconds: 1_800_000_000,
  });
}

describe("smart backlog ranking", () => {
  it("combines explainable local signals", () => {
    const ranked = rank({ games: [game(2, "Long Game"), game(1, "Short Game")] });

    expect(ranked.map((item) => item.game.appid)).toEqual([1, 2]);
    expect(ranked[0].contributions.map((item) => item.signal)).toEqual(
      expect.arrayContaining(["playtime", "wishlist", "hltb", "achievements", "quality", "genre"]),
    );
    expect(ranked[0].contributions.every((item) => Number.isFinite(item.points))).toBe(true);
  });

  it("excludes hidden and explicitly excluded games before scoring", () => {
    const ranked = rank({
      games: [game(1, "Hidden"), game(2, "Excluded"), game(3, "Eligible")],
      hiddenAppIds: new Set([1]),
      excludedAppIds: new Set([2]),
    });

    expect(ranked.map((item) => item.game.appid)).toEqual([3]);
  });

  it("treats missing metadata as a neutral contribution", () => {
    const sparse = game(4, "Sparse");
    const ranked = rankBacklogCandidates({
      games: [sparse],
      details: {},
      hltbData: {},
      achievements: {},
      wishlistItems: [],
      mode: "smart",
      weights: DEFAULT_RANKING_WEIGHTS,
      nowSeconds: 1_800_000_000,
    });

    expect(ranked[0].score).toBe(18);
    expect(ranked[0].missingSignals).toEqual(["hltb", "achievements", "quality", "genre"]);
  });

  it("can disable a major signal without leaving a hidden contribution", () => {
    const withoutWishlist = rank({
      games: [game(1, "Wishlisted")],
      weights: { ...DEFAULT_RANKING_WEIGHTS, wishlist: 0 },
    });

    expect(withoutWishlist[0].contributions.some((item) => item.signal === "wishlist")).toBe(false);
  });

  it("uses a stable name and app-id tie-break without random sorting", () => {
    const weights = sanitizeRankingWeights(Object.fromEntries(
      Object.keys(DEFAULT_RANKING_WEIGHTS).map((signal) => [signal, 0]),
    ));
    const input = [game(9, "Beta"), game(3, "Alpha"), game(2, "Alpha")];

    expect(rank({ games: input, weights }).map((item) => item.game.appid)).toEqual([2, 3, 9]);
    expect(rank({ games: [...input].reverse(), weights }).map((item) => item.game.appid)).toEqual([2, 3, 9]);
  });

  it("sanitizes persisted weights into the supported range", () => {
    expect(sanitizeRankingWeights({ playtime: -1, wishlist: 3, hltb: "bad" })).toMatchObject({
      playtime: 0,
      wishlist: 2,
      hltb: 1,
    });
  });
});
