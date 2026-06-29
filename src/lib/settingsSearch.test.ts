import { describe, expect, it } from "vitest";
import { normalizeSettingsSearchText, rankSettingsSearchSections, type SettingsSearchSection } from "./settingsSearch";

const sections: SettingsSearchSection[] = [
  {
    id: "language",
    tab: "appearance",
    label: "Language",
    keywords: ["language translation i18n lingua idioma"],
  },
  {
    id: "visibility",
    tab: "appearance",
    label: "Visibility",
    keywords: [
      "Hide local-only games",
      "Only local collection",
      "visibility panels local only local-only solo locali raccolta locale nascondi hide",
    ],
  },
  {
    id: "changelog",
    tab: "about",
    label: "Changelog",
    keywords: ["release notes novità aggiornamenti modifiche"],
  },
];

describe("settings search", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeSettingsSearchText(" Novità / LOCAL-only ")).toBe("novita local only");
  });

  it("ranks the local-only visibility setting above unrelated appearance sections", () => {
    const ranked = rankSettingsSearchSections("local", sections);

    expect(ranked[0]?.id).toBe("visibility");
    expect(ranked.some((section) => section.id === "language")).toBe(false);
  });

  it("tolerates a short transposed typo", () => {
    const ranked = rankSettingsSearchSections("lcoal", sections);

    expect(ranked[0]?.id).toBe("visibility");
  });

  it("matches translated multi-token settings terms", () => {
    const ranked = rankSettingsSearchSections("solo locali", sections);

    expect(ranked[0]?.id).toBe("visibility");
  });
});
