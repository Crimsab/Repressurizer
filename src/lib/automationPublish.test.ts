import { describe, expect, it } from "vitest";
import { automationPublishDue } from "./automationPublish";
import type { AppSettings } from "./types";

const settings: AppSettings = {
  steamPath: "",
  steamId3: "",
  steamId64: "",
  steamPersonaName: "",
  apiKey: "",
  setupComplete: true,
  showDynamicCategories: false,
  pinFavorites: true,
  accentColor: "",
  recentAccentColors: [],
  sidebarWidth: 224,
  theme: "dark",
  language: "en",
  showSmartLists: true,
  showNowPlaying: true,
  showFilterBar: true,
  showDetailHltb: true,
  showDetailMetacritic: true,
  showDetailPrice: true,
  hltbConcurrency: 5,
  achievementsConcurrency: 5,
  currency: "EUR",
  onboardingComplete: true,
  categoryOrder: [],
  minimizeToTray: false,
  trayCloseChoiceMade: false,
  checkUpdatesOnStartup: true,
  automationPublishEnabled: true,
  automationPublishUrl: "https://example.test/import",
  automationPublishBearerToken: "",
  automationPublishIntervalHours: 24,
  automationPublishLastChecksum: "",
  automationPublishLastPublishedAt: "",
  automationPublishLastAttemptedAt: "",
  automationPublishLastStatus: "",
  automationPublishLastMessage: "",
  automationPublishLastHttpStatus: 0,
  automationPublishLogs: [],
  includeSteamFamilyNonGames: false,
};

describe("automationPublishDue", () => {
  it("is due when never published", () => {
    expect(automationPublishDue(settings, Date.UTC(2026, 0, 2))).toBe(true);
  });

  it("uses the configured interval", () => {
    const base = {
      ...settings,
      automationPublishIntervalHours: 12,
      automationPublishLastPublishedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(automationPublishDue(base, Date.parse("2026-01-01T11:00:00.000Z"))).toBe(false);
    expect(automationPublishDue(base, Date.parse("2026-01-01T12:00:00.000Z"))).toBe(true);
  });
});
