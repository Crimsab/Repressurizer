import { describe, expect, it } from "vitest";
import {
  DIARY_COLUMN_NAME_MAX,
  diaryGroupColumnLabel,
  normalizeDiaryColumnName,
  sanitizeDiaryColumnLabel,
  suggestDiaryRuleColumnName,
  uniquifyDiaryColumnLabel,
} from "./diaryAutoCatNaming";
import { cloneDefaultCustomConfig } from "./customAutoCategorize";

describe("sanitizeDiaryColumnLabel", () => {
  it("trims and collapses whitespace and control characters", () => {
    expect(sanitizeDiaryColumnLabel("  Short   games \u0007 ")).toBe("Short games");
    expect(sanitizeDiaryColumnLabel("A\nB\tC")).toBe("A B C");
  });

  it("caps to the Kanban column length limit", () => {
    const label = sanitizeDiaryColumnLabel("An extremely long diary column name");
    expect(label.length).toBeLessThanOrEqual(DIARY_COLUMN_NAME_MAX);
    expect(label).toBe("An extremely long diary");
  });

  it("falls back when nothing usable remains", () => {
    expect(sanitizeDiaryColumnLabel("   ")).toBe("Kanban column");
    expect(sanitizeDiaryColumnLabel("", "Fallback")).toBe("Fallback");
  });
});

describe("uniquifyDiaryColumnLabel", () => {
  it("returns the base label when free", () => {
    expect(uniquifyDiaryColumnLabel("Short", ["Other"])).toBe("Short");
  });

  it("appends deterministic numeric suffixes on collision, case-insensitive", () => {
    const taken = ["short", "SHORT 2"];
    expect(uniquifyDiaryColumnLabel("Short", taken)).toBe("Short 3");
  });

  it("keeps suffixed variants inside the length cap", () => {
    const long = "x".repeat(DIARY_COLUMN_NAME_MAX);
    const next = uniquifyDiaryColumnLabel(long, [long]);
    expect(next.length).toBeLessThanOrEqual(DIARY_COLUMN_NAME_MAX);
    expect(next.endsWith(" 2")).toBe(true);
    expect(uniquifyDiaryColumnLabel(long, [long, `${long.slice(0, -2)} 2`])).toBe(
      `${"x".repeat(DIARY_COLUMN_NAME_MAX - 2)} 3`
    );
  });
});

describe("diaryGroupColumnLabel", () => {
  it("uses the exact meaningful group name with an optional prefix", () => {
    expect(diaryGroupColumnLabel("RPG", "")).toBe("RPG");
    expect(diaryGroupColumnLabel("RPG", "Auto")).toBe("Auto · RPG");
    expect(diaryGroupColumnLabel("(Name) D", "Auto")).toBe("Auto · D");
    expect(diaryGroupColumnLabel("(Genre) Role Playing", "")).toBe("Role Playing");
  });

  it("sanitizes messy group names into short labels", () => {
    const label = diaryGroupColumnLabel("  Very   Long Genre Name For Groups ", "");
    expect(label.length).toBeLessThanOrEqual(DIARY_COLUMN_NAME_MAX);
    expect(label.startsWith("Very Long Genre")).toBe(true);
  });

  it("is collision-safe against existing columns and sibling groups", () => {
    const taken = ["Auto · RPG"];
    expect(diaryGroupColumnLabel("RPG", "Auto", taken)).toBe("Auto · RPG 2");
    const run = [
      diaryGroupColumnLabel("Indie", "", []),
      diaryGroupColumnLabel("Indie", "", [normalizeDiaryColumnName("Indie")]),
    ];
    expect(run[0]).toBe("Indie");
    expect(run[1]).not.toBe(run[0]);
  });

  it("falls back to a neutral name for empty groups", () => {
    expect(diaryGroupColumnLabel("   ", "")).toBe("Group");
  });
});

describe("suggestDiaryRuleColumnName", () => {
  it("prefers the explicit rule label", () => {
    const config = cloneDefaultCustomConfig();
    config.output.categoryName = "Hades to backlog";
    expect(suggestDiaryRuleColumnName({ type: "custom", config })).toBe("Hades to backlog");
  });

  it("derives a readable default from title conditions when no rule label exists", () => {
    const config = cloneDefaultCustomConfig();
    config.logic.conditions = [
      { id: "c1", kind: "title", op: "startsWith", value: "Hades" },
    ];
    expect(suggestDiaryRuleColumnName({ type: "custom", config })).toBe("Starts Hades");
  });

  it("combines up to two condition descriptions", () => {
    const config = cloneDefaultCustomConfig();
    config.logic.conditions = [
      { id: "c1", kind: "title", op: "contains", value: "Souls" },
      { id: "c2", kind: "hltb", mode: "main_story", maxHoursExclusive: 15 },
    ];
    expect(suggestDiaryRuleColumnName({ type: "custom", config })).toBe("Souls + HLTB <15");
  });

  it("describes playtime, year and diary conditions deterministically", () => {
    const playtime = cloneDefaultCustomConfig();
    playtime.logic.conditions = [
      { id: "c1", kind: "playtime", minHours: 20 },
    ];
    expect(suggestDiaryRuleColumnName({ type: "custom", config: playtime })).toBe("Played 20+");

    const year = cloneDefaultCustomConfig();
    year.logic.conditions = [
      { id: "c1", kind: "metadataNumber", field: "releaseYear", min: 2020 },
    ];
    expect(suggestDiaryRuleColumnName({ type: "custom", config: year })).toBe("2020+");

    const diaryStatus = cloneDefaultCustomConfig();
    diaryStatus.logic.conditions = [
      { id: "c1", kind: "diary", field: "status", status: "finished", state: "require" },
    ];
    expect(suggestDiaryRuleColumnName({ type: "custom", config: diaryStatus })).toBe(
      "Finished games"
    );
  });

  it("falls back to the source label, then a neutral default", () => {
    expect(suggestDiaryRuleColumnName({ type: "genre", sourceLabel: "By Genre" })).toBe("By Genre");
    const empty = cloneDefaultCustomConfig();
    expect(suggestDiaryRuleColumnName({ type: "genre", config: empty })).toBe("Kanban picks");
  });

  it("is stable across repeated calls (no clock or randomness)", () => {
    const config = cloneDefaultCustomConfig();
    config.logic.conditions = [{ id: "c1", kind: "title", op: "contains", value: "Rogue" }];
    const first = suggestDiaryRuleColumnName({ type: "custom", config, sourceLabel: "By Genre" });
    const second = suggestDiaryRuleColumnName({ type: "custom", config, sourceLabel: "By Genre" });
    expect(first).toBe(second);
  });
});
