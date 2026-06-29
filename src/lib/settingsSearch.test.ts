import { describe, expect, it } from "vitest";
import { normalizeSettingsSearchText, rankSettingsSearchSections, type SettingsSearchSection } from "./settingsSearch";

const sections: SettingsSearchSection[] = [
  {
    id: "family",
    tab: "steam",
    label: "Steam Family",
    keywords: ["family sharing shared library access token store token webapi owner household"],
  },
  {
    id: "steamtools",
    tab: "tools",
    label: "Steam Tools",
    keywords: ["sam achievement achievements achievement manager bridge steam tools lab unlock lock schema preflight"],
  },
  {
    id: "api",
    tab: "steam",
    label: "Steam Web API Key",
    keywords: ["api key steam web api credential credentials token developer"],
  },
  {
    id: "performance",
    tab: "data",
    label: "Fetch speed",
    keywords: [
      "hltb achievements speed concurrency requests delay cooldown throttle batch details ratings reviews auto fetch refresh",
      "proxy proxies http https socks socks5 rotation round robin per request random fixed profile validator test host port username password scope steam store automation",
    ],
  },
  {
    id: "data",
    tab: "data",
    label: "Game Details Cache",
    keywords: ["cache index data steam apps details metadata hltb ignored failed size path clear refresh"],
  },
  {
    id: "maintenance",
    tab: "data",
    label: "Maintenance",
    keywords: [
      "diagnostics maintenance import export depressurizer profile shortcuts non steam sharedconfig local license licensecache packageinfo categories favorites hidden filters autocat",
    ],
  },
  {
    id: "automation",
    tab: "automation",
    label: "Automation export",
    keywords: ["automation export snapshot publish endpoint webhook bearer token game vault http hltb guide logs interval schedule"],
  },
  {
    id: "updates",
    tab: "about",
    label: "Updates",
    keywords: ["about version update updater updates install release latest automatic manifest github"],
  },
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
    id: "accent",
    tab: "appearance",
    label: "Accent Color",
    keywords: ["color accent theme palette hex custom highlight"],
  },
  {
    id: "background",
    tab: "general",
    label: "Background",
    keywords: ["tray close background startup autostart login boot window notifications"],
  },
  {
    id: "libraryRefresh",
    tab: "steam",
    label: "Library auto-refresh",
    keywords: ["steam library refresh games polling new games interval automatic startup fetch"],
  },
  {
    id: "backups",
    tab: "backups",
    label: "Backups",
    keywords: ["backup backups restore delete manual snapshot collections history"],
  },
  {
    id: "ignored",
    tab: "ignored",
    label: "Ignored",
    keywords: ["ignored failed retry skipped skip steam details hltb errors"],
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

  it.each([
    ["socks5 proxy", "performance"],
    ["proxy batch", "performance"],
    ["hltb delay", "performance"],
    ["apii key", "api"],
    ["webook token", "automation"],
    ["depresurizer profile", "maintenance"],
    ["achievment manager", "steamtools"],
    ["famly token", "family"],
    ["release notes", "changelog"],
    ["auto updater", "updates"],
    ["hex color", "accent"],
    ["backup restore", "backups"],
    ["ignored hltb", "ignored"],
    ["tray startup", "background"],
    ["libray refresh", "libraryRefresh"],
    ["lingua", "language"],
  ])("ranks %s as %s", (query, expectedId) => {
    const ranked = rankSettingsSearchSections(query, sections);

    expect(ranked[0]?.id).toBe(expectedId);
  });
});
