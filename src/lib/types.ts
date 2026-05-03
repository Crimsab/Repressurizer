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

export type AppTheme = "dark" | "dim" | "light";
export type AppLocale = "en" | "it";

export interface AppSettings {
  steamPath: string;
  steamId3: string;
  steamId64: string;
  apiKey: string;
  setupComplete: boolean;
  showDynamicCategories: boolean;
  pinFavorites: boolean;
  // Appearance
  accentColor: string;
  sidebarWidth: number;
  theme: AppTheme;
  language: AppLocale;
  // Visibility
  showSmartLists: boolean;
  showNowPlaying: boolean;
  showFilterBar: boolean;
  // Fetch settings
  hltbConcurrency: number;
  achievementsConcurrency: number;
  // Currency
  currency: string;
  // Onboarding
  onboardingComplete: boolean;
  // Category order
  categoryOrder: string[];
  // System tray
  minimizeToTray: boolean;
  // Steam Family
  includeSteamFamilyNonGames: boolean;
}
