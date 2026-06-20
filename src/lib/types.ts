export interface SteamUser {
  id3: string;
  id64: string;
  persona_name: string;
  has_collections: boolean;
}

export interface SteamInfo {
  steam_path: string;
  users: SteamUser[];
}

export interface SteamCollection {
  id: string;
  key: string;
  name: string;
  added: number[];
  removed: number[];
  timestamp: number;
  is_deleted: boolean;
  is_dynamic: boolean;
}

export interface BackupInfo {
  filename: string;
  timestamp: string;
  size: number;
  description: string;
  is_pre_restore: boolean;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string | null;
  rtime_last_played: number;
  is_collection_only?: boolean;
}

export interface GameDetails {
  app_id: number;
  name: string;
  genres: string[];
  categories: string[];
  release_date: string | null;
  metacritic_score: number | null;
  developers: string[];
  publishers: string[];
  platforms: PlatformSupport;
  header_image: string | null;
  capsule_image: string | null;
  price_initial: number | null;
  price_final: number | null;
  price_currency: string | null;
  is_free: boolean;
}

export interface PlatformSupport {
  windows: boolean;
  mac: boolean;
  linux: boolean;
}

export interface AchievementInfo {
  api_name: string;
  name: string;
  description: string;
  achieved: boolean;
  unlock_time: number;
  icon: string | null;
  icon_gray: string | null;
}

export interface AchievementSummary {
  total: number;
  achieved: number;
  achievements: AchievementInfo[];
}

export interface SamBridgeCapability {
  id: string;
  label: string;
  status: "ready" | "blocked" | "locked" | "planned" | string;
  writesSteam: boolean;
  reason: string;
}

export interface SamBridgeProbe {
  appId: number;
  platform: string;
  source: string;
  referenceSource: string;
  sourceLicense: string;
  dataSource: "samLocalBridge" | string;
  available: boolean;
  readiness: string;
  bridgeInvoked: boolean;
  steamPathExists: boolean;
  steamRunning: boolean;
  steamClientLibraryFound: boolean;
  steamClientLibraryPath: string | null;
  localBridgeFound: boolean;
  localBridgePath: string | null;
  writesSteam: boolean;
  capabilities: SamBridgeCapability[];
  notes: string[];
}

export type SamAchievementAction =
  | "unlock"
  | "lock"
  | "unlock_all"
  | "lock_all"
  | "restore_backup";

export interface SamAchievementActionInput {
  steamPath: string;
  appId: number;
  action: SamAchievementAction;
  achievementIds: string[];
  backupPath: string | null;
}

export interface SamAchievementState {
  apiName: string;
  achieved: boolean;
  unlockTime: number;
  valid: boolean;
}

export interface SamAchievementBackup {
  version: number;
  appId: number;
  action: SamAchievementAction | string;
  phase: "before" | "after" | string;
  capturedAt: string;
  canRestoreUnlockTimes: boolean;
  note: string;
  achievements: SamAchievementState[];
}

export interface SamAchievementActionResult {
  appId: number;
  action: SamAchievementAction | string;
  changed: number;
  failed: string[];
  beforeBackupPath: string | null;
  afterBackupPath: string | null;
  before: SamAchievementBackup;
  after: SamAchievementBackup;
  storeStats: boolean;
  unlockTimesRestorable: boolean;
  message: string;
}

export type AppTheme = "dark" | "dim" | "light";
export type AppLocale = string;
export type AppStartupMode = "tray" | "window";
export type AutomationPublishLogStatus = "success" | "failed" | "skipped";

export interface AutomationPublishLogEntry {
  id: string;
  timestamp: string;
  status: AutomationPublishLogStatus;
  message: string;
  httpStatus: number;
}

export interface AppSettings {
  steamPath: string;
  steamId3: string;
  steamId64: string;
  steamPersonaName: string;
  apiKey: string;
  setupComplete: boolean;
  showDynamicCategories: boolean;
  pinFavorites: boolean;
  // Appearance
  accentColor: string;
  recentAccentColors: string[];
  sidebarWidth: number;
  theme: AppTheme;
  language: AppLocale;
  // Visibility
  showSmartLists: boolean;
  showEmptyLists: boolean;
  showNowPlaying: boolean;
  showFilterBar: boolean;
  showDetailHltb: boolean;
  showDetailMetacritic: boolean;
  showDetailPrice: boolean;
  // Fetch settings
  hltbConcurrency: number;
  achievementsConcurrency: number;
  // Steam Tools lab
  steamToolsEnabled: boolean;
  steamToolsAchievementWritesEnabled: boolean;
  steamToolsCardFarmingEnabled: boolean;
  steamToolsMaxConcurrentIdleApps: number;
  steamToolsMinPlaytimeMinutes: number;
  // Currency
  currency: string;
  // Onboarding
  onboardingComplete: boolean;
  // Category order
  categoryOrder: string[];
  // System tray
  minimizeToTray: boolean;
  trayCloseChoiceMade: boolean;
  startOnLogin: boolean;
  startOnLoginMode: AppStartupMode;
  desktopNotifications: boolean;
  checkUpdatesOnStartup: boolean;
  // Automation export
  automationPublishEnabled: boolean;
  automationPublishUrl: string;
  automationPublishBearerToken: string;
  automationPublishIntervalHours: number;
  automationPublishLastChecksum: string;
  automationPublishLastPublishedAt: string;
  automationPublishLastAttemptedAt: string;
  automationPublishLastStatus: "" | "success" | "failed" | "skipped";
  automationPublishLastMessage: string;
  automationPublishLastHttpStatus: number;
  automationPublishLogs: AutomationPublishLogEntry[];
  // Steam Family
  includeSteamFamilyNonGames: boolean;
}
