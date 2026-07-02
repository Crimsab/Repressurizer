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
  showEmptyLists: false,
  showNowPlaying: true,
  showFilterBar: true,
  hideCollectionOnlyGames: false,
  showDetailHltb: true,
  showDetailMetacritic: true,
  showDetailPrice: true,
  hltbConcurrency: 5,
  hltbTimeMode: "main_story",
  achievementsConcurrency: 5,
  steamDetailsDelayMs: 1200,
  detailsCacheMaxAgeDays: 30,
  steamRatingsDelayMs: 1200,
  steamRatingsCooldownMinutes: 5,
  hltbBatchDelayMs: 500,
  achievementsBatchDelayMs: 300,
  autoFetchDetailsOnRefresh: true,
  autoFetchHltbOnRefresh: true,
  proxySettings: {
    enabled: false,
    mode: "roundRobin",
    activeProfileId: "",
    scopes: {
      steamApi: true,
      steamStore: true,
      hltb: true,
      automation: false,
    },
    profiles: [],
  },
  steamToolsEnabled: false,
  steamToolsAchievementWritesEnabled: false,
  steamToolsCardFarmingEnabled: false,
  steamToolsMaxConcurrentIdleApps: 8,
  steamToolsMinPlaytimeMinutes: 180,
  currency: "EUR",
  onboardingComplete: true,
  categoryColors: {},
  minimizeToTray: false,
  trayCloseChoiceMade: false,
  startOnLogin: false,
  startOnLoginMode: "tray",
  desktopNotifications: true,
  checkUpdatesOnStartup: true,
  updateAutoCheckIntervalHours: 12,
  autoRefreshLibraryEnabled: false,
  libraryAutoRefreshIntervalMinutes: 30,
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
  automationPublishPayload: {
    categoryMode: "all",
    categoryKeys: [],
    includeCollectionOnlyGames: true,
    requireDetails: false,
    requireHltb: false,
    minSteamHours: null,
    maxSteamHours: null,
    skipEmptyCollections: false,
    includeDetails: true,
    includeHltb: true,
    includeAchievements: true,
    includeWishlist: true,
    includeOwnership: true,
  },
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
