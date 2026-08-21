import { describe, expect, it } from "vitest";
import { cloneDefaultCustomConfig } from "./customAutoCategorize";
import {
  describeConditionText,
  describeRuleExpression,
  formatRuleRange,
  ruleConnectorLabel,
  ruleSourceLabel,
} from "./customRuleText";
import en from "./translations/en.json";

const t = (key: keyof typeof en, params?: Record<string, string | number>): string => {
  let text = en[key];
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
};

describe("formatRuleRange", () => {
  it("renders bounded, open-ended, and empty ranges", () => {
    expect(formatRuleRange(2020, 2024)).toBe("2020–2024");
    expect(formatRuleRange(80, null)).toBe("≥ 80");
    expect(formatRuleRange(null, 15, { maxExclusive: true })).toBe("< 15");
    expect(formatRuleRange(null, 15)).toBe("≤ 15");
    expect(formatRuleRange(1, 9, { maxExclusive: true, unit: "h" })).toBe("1–9h");
    expect(formatRuleRange(null, null)).toBe("");
  });
});

describe("ruleConnectorLabel", () => {
  it("follows the configured AND/OR logic", () => {
    const config = cloneDefaultCustomConfig();
    expect(ruleConnectorLabel(config, t)).toBe("AND");
    config.logic.op = "any";
    expect(ruleConnectorLabel(config, t)).toBe("OR");
  });
});

describe("describeConditionText", () => {
  it("describes title operations including regex", () => {
    expect(
      describeConditionText({ id: "c1", kind: "title", op: "startsWith", value: "Hades" }, t)
    ).toBe("Title starts with “Hades”");
    expect(
      describeConditionText({ id: "c2", kind: "title", op: "contains", value: "Souls" }, t)
    ).toBe("Title contains “Souls”");
    expect(
      describeConditionText({ id: "c3", kind: "title", op: "regex", value: "^F" }, t)
    ).toBe("Title matches regex “^F”");
  });

  it("describes hour ranges with exclusive upper bounds", () => {
    expect(
      describeConditionText({ id: "c4", kind: "hltb", mode: "main_story", maxHoursExclusive: 15 }, t)
    ).toBe("Main Story length < 15h");
    expect(
      describeConditionText({ id: "c5", kind: "playtime", minHours: 20 }, t)
    ).toBe("Steam playtime ≥ 20h");
  });

  it("describes category, metadata, platform, and numeric conditions", () => {
    expect(
      describeConditionText(
        { id: "c6", kind: "category", mode: "notIn", categories: [{ key: "k", nameSnapshot: "Backlog" }] },
        t
      )
    ).toBe("Not in: Backlog");
    expect(
      describeConditionText(
        { id: "c7", kind: "metadataText", field: "genre", mode: "any", values: ["RPG"], match: "contains" },
        t
      )
    ).toBe("Genre is any of: RPG");
    expect(
      describeConditionText(
        { id: "c8", kind: "platform", mode: "any", values: ["windows"] },
        t
      )
    ).toBe("Runs on any of: Windows");
    expect(
      describeConditionText(
        { id: "c9", kind: "metadataNumber", field: "releaseYear", min: 2020 },
        t
      )
    ).toBe("Release year ≥ 2020");
  });

  it("describes diary conditions", () => {
    expect(
      describeConditionText({ id: "c10", kind: "diary", field: "status", status: "finished" }, t)
    ).toBe("Diary status is Finished");
    expect(
      describeConditionText({ id: "c11", kind: "diary", field: "rating", minRating: 7 }, t)
    ).toBe("Your rating ≥ 7");
    expect(
      describeConditionText({ id: "c12", kind: "diary", field: "hasJournal", state: "exclude" }, t)
    ).toBe("No journal entries");
  });
});

describe("describeRuleExpression", () => {
  it("joins all enabled conditions with explicit connectors", () => {
    const config = cloneDefaultCustomConfig();
    config.logic.conditions = [
      { id: "c1", kind: "title", op: "contains", value: "Souls" },
      { id: "c2", kind: "hltb", mode: "main_story", maxHoursExclusive: 15 },
    ];
    expect(describeRuleExpression(config, t)).toContain("AND");
    expect(describeRuleExpression(config, t)).toContain("Souls");

    config.logic.op = "any";
    expect(describeRuleExpression(config, t)).toContain(" OR ");

    config.logic.conditions[1] = { ...config.logic.conditions[1], enabled: false };
    expect(describeRuleExpression(config, t)).not.toContain("Main Story");
  });

  it("renders an explicit mixed AND/OR sequence", () => {
    const config = cloneDefaultCustomConfig();
    config.logic.conditions = [
      { id: "c1", kind: "title", op: "contains", value: "Night" },
      { id: "c2", kind: "hltb", mode: "main_story", maxHoursExclusive: 10 },
      { id: "c3", kind: "playtime", minHours: 20 },
    ];
    config.logic.connectors = ["and", "or"];
    const expression = describeRuleExpression(config, t);
    expect(expression).toContain("AND");
    expect(expression).toContain("OR");
    expect(expression.indexOf("AND")).toBeLessThan(expression.indexOf("OR"));
  });

  it("falls back to an explicit empty-state copy", () => {
    expect(describeRuleExpression(cloneDefaultCustomConfig(), t)).toBe("No enabled conditions yet");
  });
});

describe("ruleSourceLabel", () => {
  it("maps source types to localized labels", () => {
    expect(ruleSourceLabel("name", t)).toBe("By Name");
    expect(ruleSourceLabel("custom", t)).toBe("Custom rule");
    expect(ruleSourceLabel("mystery", t)).toBe("mystery");
  });
});
