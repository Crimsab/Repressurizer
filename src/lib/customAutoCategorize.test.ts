import { describe, expect, it } from "vitest";
import {
  evaluateCustomAutoCat,
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

function config(categoryName: string, conditions: CustomRuleConditionV1[]): CustomAutoCatConfigV1 {
  return {
    schema: "repressurizer.customAutoCat",
    version: 1,
    output: { categoryName },
    logic: { op: "all", conditions },
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
});
