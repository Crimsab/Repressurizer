import { describe, expect, it } from "vitest";
import { categorizeByHltb, hltbProcessedAppIds, hltbUnknownCategoryName } from "./hltbCategorizer";
import type { HoursConfig } from "./tauri";
import type { OwnedGame } from "./types";

const games: OwnedGame[] = [
  { appid: 10, name: "Known Short", playtime_forever: 0, img_icon_url: "", rtime_last_played: 0 },
  { appid: 20, name: "Known Long", playtime_forever: 0, img_icon_url: "", rtime_last_played: 0 },
  { appid: 30, name: "Missing Once", playtime_forever: 0, img_icon_url: "", rtime_last_played: 0 },
  { appid: 40, name: "Confirmed Missing", playtime_forever: 0, img_icon_url: "", rtime_last_played: 0 },
];

const config: HoursConfig = {
  rules: [
    { name: "Short", min_hours: 0, max_hours: 5 },
    { name: "Long", min_hours: 5, max_hours: 0 },
  ],
  hltb_time_mode: "main_story",
  include_unknown: true,
  unknown_text: "HLTB: Unknown",
};

describe("categorizeByHltb", () => {
  it("places confirmed HLTB not-found games in the unknown bucket", () => {
    const result = categorizeByHltb(
      games,
      {
        10: { main_story: 2, main_extra: null, completionist: null },
        20: { main_story: 12, main_extra: null, completionist: null },
      },
      { 30: 1, 40: 3 },
      config
    );

    expect(result.assignments).toEqual({
      Short: [10],
      Long: [20],
      "HLTB: Unknown": [40],
    });
    expect(result.games_categorized).toBe(3);
  });

  it("keeps unknown games out unless the option is enabled", () => {
    const result = categorizeByHltb(games, {}, { 40: 3 }, { ...config, include_unknown: false });

    expect(result.assignments).toEqual({});
    expect(result.games_categorized).toBe(0);
  });

  it("marks confirmed unknown games as processed when included", () => {
    expect(hltbProcessedAppIds(games, {}, { 40: 3 }, config)).toEqual([40]);
  });

  it("uses a stable default unknown name", () => {
    expect(hltbUnknownCategoryName({ unknown_text: "  " })).toBe("HLTB: Unknown");
  });
});
