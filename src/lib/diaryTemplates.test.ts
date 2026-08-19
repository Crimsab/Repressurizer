import { describe, expect, it } from "vitest";
import { getDefaultDiaryTemplates, resolveDiaryTemplate, type DiaryTemplateContext } from "./diaryTemplates";

const context: DiaryTemplateContext = {
  gameTitle: "Disco Elysium",
  status: "Finished",
  playtime: "24h",
  hltb: "22h",
  rating: "9/10",
  genre: "RPG",
  developer: "ZA/UM",
  publisher: "ZA/UM",
  releaseDate: "Oct 15, 2019",
  lastPlayed: "Aug 17, 2026",
  today: "Aug 17, 2026",
};

describe("Diary templates", () => {
  it("ships basic and advanced defaults", () => {
    const templates = getDefaultDiaryTemplates("it");
    expect(templates.map((template) => template.id)).toEqual(["default-basic-review", "default-advanced-review", "default-quotes", "default-checklist"]);
    expect(templates[1].markdown).toContain("<last_played>");
    expect(templates[1].markdown).toContain("<rating>");
  });

  it("resolves known tags and preserves user-defined tags", () => {
    expect(resolveDiaryTemplate("# <game_title>\n<playtime> · <custom_tag>", context)).toBe("# Disco Elysium\n24h · <custom_tag>");
    expect(resolveDiaryTemplate("# <titolo_gioco>\n<voto>", context)).toBe("# Disco Elysium\n9/10");
  });
});
