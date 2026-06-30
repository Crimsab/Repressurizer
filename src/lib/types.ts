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

export interface DepressurizerProfileImport {
  sourcePath: string | null;
  steamId64: string | null;
  steamId3: string | null;
  steamWebApiKey: string | null;
  settings: DepressurizerProfileSettings;
  games: DepressurizerImportedGame[];
  collections: SteamCollection[];
  filters: DepressurizerImportedFilter[];
  autoCats: DepressurizerImportedAutoCat[];
  ignoredAppIds: number[];
  stats: DepressurizerImportStats;
}

export interface DepressurizerProfileSettings {
  autoUpdate: boolean;
  autoImport: boolean;
  localUpdate: boolean;
  webUpdate: boolean;
  exportDiscard: boolean;
  autoIgnore: boolean;
  includeUnknown: boolean;
  bypassIgnoreOnImport: boolean;
  overwriteNames: boolean;
  includeShortcuts: boolean;
}

export interface DepressurizerImportedGame {
  appid: number;
  name: string | null;
  hidden: boolean;
  hoursPlayed: number;
  lastPlayed: number | null;
  executable: string | null;
  source: string | null;
  categories: string[];
  nonSteam: boolean;
}

export interface DepressurizerImportedFilter {
  name: string;
  allow: string[];
  require: string[];
  exclude: string[];
  game: number;
  modState: number;
  software: number;
  uncategorized: number;
  hidden: number;
  vr: number;
}

export interface DepressurizerImportedAutoCat {
  name: string;
  typeId: string;
  normalizedType: string;
  prefix: string | null;
  filter: string | null;
  supported: boolean;
  rawConfig: unknown;
}

export interface DepressurizerImportStats {
  totalGames: number;
  steamGames: number;
  nonSteamGames: number;
  hiddenGames: number;
  favoriteGames: number;
  categories: number;
  filters: number;
  autoCats: number;
  supportedAutoCats: number;
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
  cache_schema?: number;
  fetched_at?: number;
  genres: string[];
  categories: string[];
  release_date: string | null;
  metacritic_score: number | null;
  developers: string[];
  publishers: string[];
  supported_languages: string[];
  platforms: PlatformSupport;
  header_image: string | null;
  capsule_image: string | null;
  price_initial: number | null;
  price_final: number | null;
  price_currency: string | null;
  price_country_code?: string | null;
  price_cache?: Record<string, GamePriceSnapshot>;
  is_free: boolean;
}

export interface GamePriceSnapshot {
  price_initial: number | null;
  price_final: number | null;
  price_currency: string | null;
  price_country_code?: string | null;
  is_free: boolean;
  fetched_at?: number;
}

export interface GamePriceOverview extends GamePriceSnapshot {
  app_id: number;
}

export interface SteamReviewSummary {
  app_id: number;
  review_score: number;
  review_score_desc: string;
  total_positive: number;
  total_negative: number;
  total_reviews: number;
  positive_percentage: number | null;
  fetched_at: number;
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
  permission?: number | null;
  protected_achievement?: boolean;
  protection_source?: string | null;
  protection_flags?: string[];
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

export interface SamAchievementSchemaItem {
  apiName: string;
  permission: number;
  protectedAchievement: boolean;
  flags: string[];
}

export type SamAchievementAction =
  | "unlock"
  | "lock"
  | "unlock_selected"
  | "lock_selected"
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

export interface SamBackupInfo {
  filename: string;
  path: string;
  appId: number;
  action: string;
  phase: string;
  capturedAt: string;
  achievementCount: number;
  unlockedCount: number;
  canRestoreUnlockTimes: boolean;
}

export interface SamAchievementActionResult {
  appId: number;
  action: SamAchievementAction | string;
  changed: number;
  failed: string[];
  diagnostics: string[];
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
export type ProxyType = "http" | "https" | "socks5";
export type ProxyRotationMode = "fixed" | "roundRobin" | "batch" | "random";
export type HltbTimeMode = "main_story" | "main_extra" | "completionist" | "first_available";

export interface ProxyProfile {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username: string;
  password: string;
  enabled: boolean;
  batchSize: number;
  lastTestStatus?: "ok" | "failed" | "";
  lastTestMessage?: string;
  lastTestLatencyMs?: number;
  lastTestAt?: number;
}

export interface ProxyScopes {
  steamApi: boolean;
  steamStore: boolean;
  hltb: boolean;
  automation: boolean;
}

export interface ProxySettings {
  enabled: boolean;
  mode: ProxyRotationMode;
  activeProfileId: string;
  scopes: ProxyScopes;
  profiles: ProxyProfile[];
}

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
  hideCollectionOnlyGames: boolean;
  showDetailHltb: boolean;
  showDetailMetacritic: boolean;
  showDetailPrice: boolean;
  // Fetch settings
  hltbConcurrency: number;
  achievementsConcurrency: number;
  steamDetailsDelayMs: number;
  steamRatingsDelayMs: number;
  steamRatingsCooldownMinutes: number;
  hltbBatchDelayMs: number;
  achievementsBatchDelayMs: number;
  hltbTimeMode: HltbTimeMode;
  autoFetchDetailsOnRefresh: boolean;
  autoFetchHltbOnRefresh: boolean;
  proxySettings: ProxySettings;
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
  updateAutoCheckIntervalHours: number;
  autoRefreshLibraryEnabled: boolean;
  libraryAutoRefreshIntervalMinutes: number;
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
