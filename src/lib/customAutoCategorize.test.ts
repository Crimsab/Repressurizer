import { describe, expect, it } from "vitest";
import {
  conditionIssue,
  evaluateCustomAutoCat,
  findIncompleteConditionIds,
  type CustomAutoCatConfigV1,
  type CustomRuleConditionV1,
} from "./customAutoCategorize";
import type { GameDetails, OwnedGame, SteamCollection } from "./types";

function game(appid: number, name: string, hours = 0): OwnedGame {
  return {
    appid,
    name,
    playtime_forever: hours * 60,
    img_icon_url: null,
    rtime_last_played: 0,
  };
}

function detail(appId: number, patch: Partial<GameDetails> = {}): GameDetails {
  return {
    app_id: appId,
    name: `Game ${appId}`,
    cache_schema: 2,
    fetched_at: Date.now(),
    genres: [],
    tags: [],
    categories: [],
    release_date: null,
    metacritic_score: null,
    developers: [],
    publishers: [],
    supported_languages: [],
    platforms: { windows: true, mac: false, linux: false },
    header_image: null,
    capsule_image: null,
    price_initial: null,
    price_final: null,
    price_currency: null,
    is_free: false,
    ...patch,
  };
}

function collection(key: string, name: string, added: number[]): SteamCollection {
  return {
    id: key.replace(/^user-collections\./, ""),
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
  };
}

function config(categoryName: string, conditions: CustomRuleConditionV1[], op: "all" | "any" = "all"): CustomAutoCatConfigV1 {
  return {
    schema: "repressurizer.customAutoCat",
    version: 1,
    output: { categoryName },
    logic: { op, conditions },
    defaults: { missingData: "skipPreserve" },
  };
}

const games = {
  1: game(1, "A Short RPG", 2),
  2: game(2, "B Long RPG", 20),
  3: game(3, "A Short Backlog", 1),
  4: game(4, "A Missing HLTB", 0),
};

describe("evaluateCustomAutoCat", () => {
  it("combines HLTB, title, and category include/exclude conditions", () => {
    const result = evaluateCustomAutoCat({
      config: config("Short A RPG not Backlog", [
        { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 5 },
        { id: "title", kind: "title", op: "startsWith", value: "A" },
        {
          id: "rpg",
          kind: "category",
          mode: "inAny",
          categories: [{ key: "user-collections.rpg", nameSnapshot: "RPG" }],
        },
        {
          id: "backlog",
          kind: "category",
          mode: "notIn",
          categories: [{ key: "user-collections.backlog", nameSnapshot: "Backlog" }],
        },
      ]),
      games,
      details: {},
      collections: [
        collection("user-collections.rpg", "RPG", [1, 2, 3]),
        collection("user-collections.backlog", "Backlog", [3]),
      ],
      hltbData: {
        1: { main_story: 3, main_extra: null, completionist: null },
        2: { main_story: 30, main_extra: null, completionist: null },
        3: { main_story: 2, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments).toEqual({ "Short A RPG not Backlog": [1] });
    expect(result.processed_app_ids).toEqual([1, 2, 3]);
    expect(result.custom_diagnostics?.skippedMissingHltb).toBe(1);
  });

  it("treats missing HLTB as skipped and preserved by default", () => {
    const result = evaluateCustomAutoCat({
      config: config("Short", [
        { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 5 },
      ]),
      games,
      details: {},
      collections: [],
      hltbData: {
        1: { main_story: 3, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments.Short).toEqual([1]);
    expect(result.processed_app_ids).toEqual([1]);
    expect(result.custom_diagnostics).toMatchObject({
      evaluated: 1,
      skippedMissingHltb: 3,
    });
  });

  it("treats the HLTB max hour as an exclusive upper bound", () => {
    const result = evaluateCustomAutoCat({
      config: config("Under 10h", [
        { id: "hltb", kind: "hltb", mode: "main_story", minHours: 1, maxHoursExclusive: 10 },
      ]),
      games: {
        10: game(10, "Nine Hours", 0),
        11: game(11, "Exactly Ten", 0),
      },
      details: {},
      collections: [],
      hltbData: {
        10: { main_story: 9.9, main_extra: null, completionist: null },
        11: { main_story: 10, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments["Under 10h"]).toEqual([10]);
  });

  it("combines title, HLTB, and Steam playtime for a Kanban-style match", () => {
    const result = evaluateCustomAutoCat({
      config: config("Ready to finish", [
        { id: "title", kind: "title", op: "startsWith", value: "N" },
        { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 10 },
        { id: "playtime", kind: "playtime", minHours: 20 },
      ]),
      games: {
        20: game(20, "Night in the Woods", 20),
        21: game(21, "Night Call", 19),
        22: game(22, "Outer Wilds", 30),
      },
      details: {},
      collections: [],
      hltbData: {
        20: { main_story: 9, main_extra: null, completionist: null },
        21: { main_story: 8, main_extra: null, completionist: null },
        22: { main_story: 8, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments["Ready to finish"]).toEqual([20]);
  });

  it("supports OR rules without letting a missing branch hide a known match", () => {
    const result = evaluateCustomAutoCat({
      config: config("A or short", [
        { id: "title", kind: "title", op: "startsWith", value: "A" },
        { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 5 },
      ], "any"),
      games: {
        30: game(30, "Alpha", 0),
        31: game(31, "Beta", 0),
        32: game(32, "Gamma", 0),
      },
      details: {},
      collections: [],
      hltbData: {
        31: { main_story: 3, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments["A or short"]).toEqual([30, 31]);
  });

  it("supports mixed AND/OR connectors with AND precedence", () => {
    const result = evaluateCustomAutoCat({
      config: {
        ...config("Mixed rule", [
          { id: "title", kind: "title", op: "startsWith", value: "Night" },
          { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 10 },
          { id: "playtime", kind: "playtime", minHours: 20 },
        ]),
        logic: {
          op: "all",
          connectors: ["and", "or"],
          conditions: [
            { id: "title", kind: "title", op: "startsWith", value: "Night" },
            { id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 10 },
            { id: "playtime", kind: "playtime", minHours: 20 },
          ],
        },
      },
      games: {
        40: game(40, "Night in the Woods", 2),
        41: game(41, "Night Call", 20),
        42: game(42, "Outer Wilds", 20),
      },
      details: {},
      collections: [],
      hltbData: {
        40: { main_story: 9, main_extra: null, completionist: null },
        41: { main_story: 12, main_extra: null, completionist: null },
        42: { main_story: 9, main_extra: null, completionist: null },
      },
      ratings: {},
      hltbTimeMode: "main_story",
    });

    // (Night AND under 10h) OR at least 20h played.
    expect(result.assignments["Mixed rule"]).toEqual([40, 41, 42]);
  });

  it("matches uncategorized games while ignoring the custom output category itself", () => {
    const result = evaluateCustomAutoCat({
      config: config("Uncategorized short", [
        { id: "uncat", kind: "special", field: "uncategorized", state: "require" },
      ]),
      games,
      details: {},
      collections: [
        collection("user-collections.output", "Uncategorized short", [1]),
        collection("user-collections.rpg", "RPG", [2]),
      ],
      hltbData: {},
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments["Uncategorized short"]).toEqual([1, 3, 4]);
  });

  it("matches cached metadata text and platform conditions", () => {
    const result = evaluateCustomAutoCat({
      config: config("Windows RPG", [
        { id: "genre", kind: "metadataText", field: "genre", mode: "any", values: ["RPG"], match: "exact" },
        { id: "platform", kind: "platform", mode: "any", values: ["windows"] },
      ]),
      games,
      details: {
        1: detail(1, { genres: ["RPG"], platforms: { windows: true, mac: false, linux: false } }),
        2: detail(2, { genres: ["RPG"], platforms: { windows: false, mac: true, linux: false } }),
      },
      collections: [],
      hltbData: {},
      ratings: {},
      hltbTimeMode: "main_story",
    });

    expect(result.assignments["Windows RPG"]).toEqual([1]);
    expect(result.custom_diagnostics?.skippedMissingDetails).toBe(2);
  });

  it("matches Diary status, rating, journal, and page conditions", () => {
    const result = evaluateCustomAutoCat({
      config: config("Finished journaled favorites", [
        { id: "status", kind: "diary", field: "status", status: "finished" },
        { id: "rating", kind: "diary", field: "rating", minRating: 8 },
        { id: "journal", kind: "diary", field: "hasJournal", state: "require" },
        { id: "pages", kind: "diary", field: "hasPages", state: "require" },
      ]),
      games,
      details: {},
      collections: [],
      hltbData: {},
      ratings: {},
      hltbTimeMode: "main_story",
      diary: {
        entries: {},
        statuses: { 1: "completed", 2: "completed" },
        ratings: { 1: { rating: 9 }, 2: { rating: 7 } },
        journal: { 1: [{}], 2: [{}] },
        pageAppIds: new Set([1, 2]),
      },
    });

    expect(result.assignments["Finished journaled favorites"]).toEqual([1]);
  });

  it("treats a marked-backlog played game as backlog", () => {
    const playedGames = [game(10, "Played unmarked", 5), game(11, "Played marked backlog", 6), game(12, "Unplayed", 0)];
    const result = evaluateCustomAutoCat({
      config: config("Explicit backlog", [{ id: "status", kind: "diary", field: "status", status: "backlog" }]),
      games: playedGames,
      details: {},
      collections: [],
      hltbData: {},
      ratings: {},
      hltbTimeMode: "main_story",
      diary: {
        entries: { 11: { decision: "backlog", markedBacklog: true } },
        statuses: {},
        ratings: {},
        journal: {},
        pageAppIds: new Set<number>(),
      },
    });

    expect(result.assignments["Explicit backlog"]).toEqual([11, 12]);
  });
});

describe("findIncompleteConditionIds", () => {
  it("flags empty title, category, metadata, platform, and invalid regex conditions", () => {
    const ids = findIncompleteConditionIds(
      config("X", [
        { id: "t", kind: "title", op: "contains", value: "   " },
        { id: "r", kind: "title", op: "regex", value: "[" },
        { id: "c", kind: "category", mode: "inAny", categories: [] },
        { id: "m", kind: "metadataText", field: "genre", mode: "any", values: [], match: "contains" },
        { id: "p", kind: "platform", mode: "any", values: [] },
        { id: "ok", kind: "playtime", minHours: 1, maxHoursExclusive: 5 },
      ])
    );
    expect(ids).toEqual(["t", "r", "c", "m", "p"]);
  });

  it("ignores disabled and complete conditions", () => {
    const ids = findIncompleteConditionIds(
      config("X", [
        { id: "off", kind: "title", op: "contains", value: "", enabled: false },
        { id: "ok", kind: "title", op: "startsWith", value: "Hades" },
      ])
    );
    expect(ids).toEqual([]);
  });
});

describe("conditionIssue", () => {
  it("reports the specific reason a row is incomplete", () => {
    expect(conditionIssue({ id: "t", kind: "title", op: "contains", value: " " })).toBe("titleEmpty");
    expect(conditionIssue({ id: "r", kind: "title", op: "regex", value: "[" })).toBe("regexInvalid");
    expect(conditionIssue({ id: "r2", kind: "title", op: "regex", value: "^H" })).toBeNull();
    expect(conditionIssue({ id: "c", kind: "category", mode: "inAny", categories: [] })).toBe("categoriesEmpty");
    expect(
      conditionIssue({ id: "p", kind: "platform", mode: "any", values: [] })
    ).toBe("valuesEmpty");
    expect(conditionIssue({ id: "ok", kind: "playtime", minHours: 1, maxHoursExclusive: 5 })).toBeNull();
  });
});
