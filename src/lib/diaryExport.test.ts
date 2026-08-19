import { describe, expect, it } from "vitest";
import { buildDiaryBundle, serializeDiaryJson, serializeDiaryMarkdown, type DiaryExportData } from "./diaryExport";

const data: DiaryExportData = {
  games: [{ appid: 10, name: "Test Game", playtime_forever: 120, rtime_last_played: 100, img_icon_url: "" }],
  entries: { 10: { decision: "backlog", priority: "high", updatedAt: 1 } },
  ratings: { 10: 8 },
  notes: { 10: "## Overview\n\nRemember this." },
  journal: { 10: [{ id: "j1", body: "Reached the finale", createdAt: 1_700_000_000_000, playedMinutes: 120 }] },
  pages: [{ id: "p1", title: "Quotes", markdown: "> A quote", scope: "selected", appIds: [10], createdAt: 1, updatedAt: 1 }],
  revisions: [{ id: "r1", target: "overview", targetId: "overview:10", appId: 10, markdown: "Old", createdAt: 1 }],
  templates: [{ id: "t1", name: "My review", description: "", markdown: "# <game_title>", createdAt: 1, updatedAt: 1 }],
};

describe("Diary export", () => {
  it("serializes portable JSON including pages and revision history", () => {
    const parsed = JSON.parse(serializeDiaryJson(data));
    expect(parsed.games[0]).toMatchObject({ appId: 10, rating: 8, overview: expect.stringContaining("Remember") });
    expect(parsed.games[0].pages[0].title).toBe("Quotes");
    expect(parsed.revisions[0].markdown).toBe("Old");
    expect(parsed.templates[0].name).toBe("My review");
  });

  it("sanitizes dots in game names so bundle paths stay valid", () => {
    const dotted: DiaryExportData = { ...data, games: [{ appid: 512250, name: "Oh...Sir! The Insult Simulator", playtime_forever: 1, rtime_last_played: 0, img_icon_url: "" }] };
    const bundle = buildDiaryBundle(dotted);
    for (const key of Object.keys(bundle)) {
      expect(key.split("/").every((segment) => segment !== ".." && !segment.includes(".."))).toBe(true);
    }
  });

  it("builds a folder bundle with per-game files", () => {
    const bundle = buildDiaryBundle(data);
    expect(Object.keys(bundle)).toContain("index.json");
    expect(Object.keys(bundle)).toContain("Test Game (10)/Overview.md");
    expect(Object.keys(bundle)).toContain("Test Game (10)/Journal.md");
    expect(Object.keys(bundle)).toContain("Test Game (10)/Quotes.md");
    expect(bundle["Templates/My review.md"]).toContain("# <game_title>");
  });

  it("serializes a readable Markdown document", () => {
    const markdown = serializeDiaryMarkdown(data);
    expect(markdown).toContain("# Repressurizer Diary");
    expect(markdown).toContain("## Test Game");
    expect(markdown).toContain("### Quotes");
    expect(markdown).toContain("Reached the finale");
  });
});
