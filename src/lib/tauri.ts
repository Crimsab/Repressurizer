import { invoke } from "@tauri-apps/api/core";
import type {
  SteamInfo,
  SteamCollection,
  OwnedGame,
  GameDetails,
  SteamReviewSummary,
  BackupInfo,
  DepressurizerProfileImport,
  AchievementSummary,
  SamBridgeProbe,
  SamAchievementSchemaItem,
  SamAchievementActionInput,
  SamAchievementActionResult,
  SamBackupInfo,
} from "./types";

export async function detectSteam(): Promise<SteamInfo> {
  return invoke<SteamInfo>("detect_steam");
}

export async function detectSteamAt(path: string): Promise<SteamInfo> {
  return invoke<SteamInfo>("detect_steam_at", { path });
}

export async function loadCollections(
  steamPath: string,
  steamId3: string
): Promise<SteamCollection[]> {
  return invoke<SteamCollection[]>("load_collections", {
    steamPath,
    steamId3,
  });
}

export async function saveCollections(
  steamPath: string,
  steamId3: string,
  collections: SteamCollection[]
): Promise<void> {
  return invoke<void>("save_collections", {
    steamPath,
    steamId3,
    collections,
  });
}

export async function listBackups(
  steamPath: string,
  steamId3: string
): Promise<BackupInfo[]> {
  return invoke<BackupInfo[]>("list_backups", { steamPath, steamId3 });
}

export async function restoreBackup(
  steamPath: string,
  steamId3: string,
  backupFilename: string
): Promise<void> {
  return invoke<void>("restore_backup", {
    steamPath,
    steamId3,
    backupFilename,
  });
}

export async function deleteBackup(
  steamPath: string,
  steamId3: string,
  backupFilename: string
): Promise<void> {
  return invoke<void>("delete_backup", {
    steamPath,
    steamId3,
    backupFilename,
  });
}

export async function createManualBackup(
  steamPath: string,
  steamId3: string,
  description: string
): Promise<void> {
  return invoke<void>("create_manual_backup", {
    steamPath,
    steamId3,
    description,
  });
}

export interface SteamShortcut {
  appid: number;
  appname: string;
  exe: string;
  startDir: string;
  icon: string;
  shortcutPath: string;
  launchOptions: string;
  hidden: boolean;
  lastPlayTime: number;
  tags: string[];
}

export async function loadShortcuts(
  steamPath: string,
  steamId3: string
): Promise<SteamShortcut[]> {
  return invoke<SteamShortcut[]>("load_shortcuts", { steamPath, steamId3 });
}

export async function saveShortcuts(
  steamPath: string,
  steamId3: string,
  collections: SteamCollection[]
): Promise<number> {
  return invoke<number>("save_shortcuts", { steamPath, steamId3, collections });
}

export interface LegacySharedConfigGame {
  appid: number;
  hidden: boolean;
  lastPlayed: number;
  tags: string[];
}

export async function loadLegacySharedConfig(
  steamPath: string,
  steamId3: string
): Promise<LegacySharedConfigGame[]> {
  return invoke<LegacySharedConfigGame[]>("load_legacy_sharedconfig", { steamPath, steamId3 });
}

export interface LocalLicenseApp {
  appid: number;
  packageId: number;
}

export async function loadLocalLicenseLibrary(
  steamPath: string,
  steamId3: string
): Promise<LocalLicenseApp[]> {
  return invoke<LocalLicenseApp[]>("load_local_license_library", { steamPath, steamId3 });
}

export async function importDepressurizerProfile(
  path: string
): Promise<DepressurizerProfileImport> {
  return invoke<DepressurizerProfileImport>("import_depressurizer_profile", { path });
}

export async function fetchLibrary(
  apiKey: string,
  steamId64: string
): Promise<OwnedGame[]> {
  return invoke<OwnedGame[]>("fetch_library", { apiKey, steamId64 });
}

export interface SteamAppListItem {
  appid: number;
  name: string;
}

export async function fetchSteamAppList(apiKey: string): Promise<SteamAppListItem[]> {
  return invoke<SteamAppListItem[]>("fetch_steam_app_list", { apiKey });
}

// Map currency setting to Steam country code for regional pricing
const CURRENCY_TO_CC: Record<string, string> = {
  EUR: "de", USD: "us", GBP: "gb", JPY: "jp", CAD: "ca",
  AUD: "au", CHF: "ch", BRL: "br", PLN: "pl", RUB: "ru",
};

export function currencyToCountryCode(currency: string): string | undefined {
  return CURRENCY_TO_CC[currency];
}

export async function fetchGameDetails(
  appId: number,
  countryCode?: string
): Promise<GameDetails> {
  return invoke<GameDetails>("fetch_game_details", { appId, countryCode: countryCode ?? null });
}

export async function fetchSteamReviewSummary(appId: number): Promise<SteamReviewSummary> {
  return invoke<SteamReviewSummary>("fetch_steam_review_summary", { appId });
}

export function getHeaderImageUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function getCapsuleImageUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`;
}

export async function fetchAchievements(
  apiKey: string,
  steamId64: string,
  appId: number
): Promise<AchievementSummary> {
  return invoke<AchievementSummary>("fetch_achievements", {
    apiKey,
    steamId64,
    appId,
  });
}

/** Light fetch: only counts (total, achieved), no schema. For bulk listing. */
export async function fetchAchievementsSummary(
  apiKey: string,
  steamId64: string,
  appId: number
): Promise<[number, number]> {
  return invoke<[number, number]>("fetch_achievements_summary", {
    apiKey,
    steamId64,
    appId,
  });
}

export async function probeSamBridge(steamPath: string, appId: number): Promise<SamBridgeProbe> {
  return invoke<SamBridgeProbe>("probe_sam_bridge", { steamPath, appId });
}

export async function loadSamAchievementSchema(
  steamPath: string,
  appId: number
): Promise<SamAchievementSchemaItem[]> {
  return invoke<SamAchievementSchemaItem[]>("load_sam_achievement_schema", {
    steamPath,
    appId,
  });
}

export async function runSamAchievementAction(
  input: SamAchievementActionInput
): Promise<SamAchievementActionResult> {
  return invoke<SamAchievementActionResult>("sam_achievement_action", { input });
}

export async function getSamBackupDir(appId: number): Promise<string> {
  return invoke<string>("sam_backup_dir", { appId });
}

export async function listSamBackups(appId: number): Promise<SamBackupInfo[]> {
  return invoke<SamBackupInfo[]>("list_sam_backups", { appId });
}

export async function openSamBackupDir(appId: number): Promise<void> {
  return invoke<void>("open_sam_backup_dir", { appId });
}

export interface WishlistItem {
  appid: number;
  priority: number;
  date_added: number;
}

export async function fetchWishlist(steamId64: string): Promise<WishlistItem[]> {
  return invoke<WishlistItem[]>("fetch_wishlist", { steamId64 });
}

export async function resolveVanityUrl(apiKey: string, vanityUrl: string): Promise<string> {
  return invoke<string>("resolve_vanity_url", { apiKey, vanityUrl });
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatar: string;
  avatarmedium: string;
}

export async function fetchPlayerSummary(apiKey: string, steamId64: string): Promise<PlayerSummary> {
  return invoke<PlayerSummary>("fetch_player_summary", { apiKey, steamId64 });
}

export interface FriendSummary extends PlayerSummary {
  friend_since: number;
}

export async function fetchFriendList(apiKey: string, steamId64: string): Promise<FriendSummary[]> {
  return invoke<FriendSummary[]>("fetch_friend_list", { apiKey, steamId64 });
}

export interface HltbData {
  main_story: number | null;
  main_extra: number | null;
  completionist: number | null;
  game_id?: number | null;
  game_name?: string | null;
  confidence?: number | null;
}

export async function fetchHltb(
  gameName: string,
  appId?: number,
  releaseYear?: number | null
): Promise<HltbData | null> {
  const payload: Record<string, unknown> = { gameName };
  if (appId != null) payload.appId = appId;
  if (releaseYear != null) payload.releaseYear = releaseYear;
  return invoke<HltbData | null>("fetch_hltb", payload);
}

// --- Auto-Categorizer types and commands ---

export interface CategorizeResult {
  assignments: Record<string, number[]>;
  games_processed: number;
  games_categorized: number;
}

export interface HoursRule {
  name: string;
  min_hours: number;
  max_hours: number; // 0 = unlimited
}

export interface HoursConfig {
  prefix?: string;
  rules: HoursRule[];
}

export interface GenreConfig {
  prefix?: string;
  max_categories?: number;
  ignored_genres: string[];
}

export interface TagsConfig {
  prefix?: string;
  max_tags?: number;
  included_tags: string[];
}

export type YearGrouping = "None" | "HalfDecade" | "Decade";

export interface YearConfig {
  prefix?: string;
  grouping: YearGrouping;
  include_unknown: boolean;
  unknown_text?: string;
}

export interface DevPubConfig {
  prefix?: string;
  include_developers: boolean;
  include_publishers: boolean;
  selected: string[];
  min_games?: number;
}

export interface FlagsConfig {
  prefix?: string;
  max_flags?: number;
  included_flags: string[];
}

export interface LanguageConfig {
  prefix?: string;
  max_languages?: number;
  included_languages: string[];
}

export interface PlatformConfig {
  prefix?: string;
  include_windows: boolean;
  include_mac: boolean;
  include_linux: boolean;
}

export interface NameConfig {
  prefix?: string;
  skip_leading_the: boolean;
  group_numbers: boolean;
  group_other: boolean;
}

export interface SteamRatingConfig {
  prefix?: string;
  use_wilson_score?: boolean;
}

export async function runHoursCategorizer(
  games: OwnedGame[],
  config: HoursConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_hours_categorizer", { games, config });
}

export async function runGenreCategorizer(
  gameDetails: GameDetails[],
  config: GenreConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_genre_categorizer", { gameDetails, config });
}

export async function runTagsCategorizer(
  gameDetails: GameDetails[],
  config: TagsConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_tags_categorizer", { gameDetails, config });
}

export async function runYearCategorizer(
  gameDetails: GameDetails[],
  config: YearConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_year_categorizer", { gameDetails, config });
}

export async function runDevPubCategorizer(
  gameDetails: GameDetails[],
  config: DevPubConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_devpub_categorizer", { gameDetails, config });
}

export async function runFlagsCategorizer(
  gameDetails: GameDetails[],
  config: FlagsConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_flags_categorizer", { gameDetails, config });
}

export async function runLanguageCategorizer(
  gameDetails: GameDetails[],
  config: LanguageConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_language_categorizer", { gameDetails, config });
}

export async function runPlatformCategorizer(
  gameDetails: GameDetails[],
  config: PlatformConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_platform_categorizer", { gameDetails, config });
}

export async function runNameCategorizer(
  games: OwnedGame[],
  config: NameConfig
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_name_categorizer", { games, config });
}

export async function loadDetailsCache(): Promise<string | null> {
  return invoke<string | null>("load_details_cache");
}

export async function saveDetailsCache(data: string): Promise<void> {
  return invoke<void>("save_details_cache", { data });
}

export async function loadHltbCache(): Promise<string | null> {
  return invoke<string | null>("load_hltb_cache");
}

export async function saveHltbCache(data: string): Promise<void> {
  return invoke<void>("save_hltb_cache", { data });
}

export async function loadFailedCache(): Promise<string | null> {
  return invoke<string | null>("load_failed_cache");
}

export async function saveFailedCache(data: string): Promise<void> {
  return invoke<void>("save_failed_cache", { data });
}

export async function loadAchievementsCache(): Promise<string | null> {
  return invoke<string | null>("load_achievements_cache");
}

export async function saveAchievementsCache(data: string): Promise<void> {
  return invoke<void>("save_achievements_cache", { data });
}

export async function loadFriendsCache(): Promise<string | null> {
  return invoke<string | null>("load_friends_cache");
}

export async function saveFriendsCache(data: string): Promise<void> {
  return invoke<void>("save_friends_cache", { data });
}

export async function loadWishlistCache(): Promise<string | null> {
  return invoke<string | null>("load_wishlist_cache");
}

export async function saveWishlistCache(data: string): Promise<void> {
  return invoke<void>("save_wishlist_cache", { data });
}

export interface CacheInfo {
  path: string;
  details_bytes: number;
  hltb_bytes: number;
  failed_bytes: number;
}

export async function getCacheInfo(): Promise<CacheInfo | null> {
  return invoke<CacheInfo | null>("get_cache_info");
}

export async function exportDiagnostics(
  steamPath: string,
  steamId3: string,
  steamId64: string
): Promise<string> {
  return invoke<string>("export_diagnostics", { steamPath, steamId3, steamId64 });
}

export interface FamilyLibraryApp {
  appid: number;
  name: string | null;
  owner_steamids: string[];
  exclude_reason: number;
  playtime_forever: number;
  rtime_last_played: number;
  img_icon_hash: string | null;
  app_type: number;
  is_non_game: boolean;
  is_owned_by_current_user: boolean;
  is_family_shared: boolean;
}

export interface FamilyLibraryResult {
  auth_used: "web_api_key" | "access_token" | string;
  family_groupid: string | null;
  owner_steamid: string | null;
  total_apps: number;
  owned_apps: number;
  shared_apps: number;
  excluded_apps: number;
  non_game_apps: number;
  playtime_entries: number;
  playtime_unavailable_reason: string | null;
  apps: FamilyLibraryApp[];
}

export async function fetchFamilyLibrary(
  apiKey: string,
  accessToken?: string,
  steamId64?: string,
  includeNonGames = false
): Promise<FamilyLibraryResult> {
  return invoke<FamilyLibraryResult>("fetch_family_library", {
    apiKey,
    accessToken: accessToken || null,
    steamId64: steamId64 || null,
    includeNonGames,
  });
}

export async function runScoreCategorizer(
  gameDetails: GameDetails[],
  useDefault: boolean
): Promise<CategorizeResult> {
  return invoke<CategorizeResult>("run_score_categorizer", {
    gameDetails,
    useDefault,
    config: null,
  });
}

// --- Generic app data persistence ---

export async function loadAppData(key: string): Promise<string | null> {
  return invoke<string | null>("load_app_data", { key });
}

export async function saveAppData(key: string, data: string): Promise<void> {
  return invoke<void>("save_app_data", { key, data });
}

export async function hideMainWindow(): Promise<void> {
  return invoke<void>("hide_main_window");
}

export async function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

export interface StartupContext {
  launchedFromAutostart: boolean;
  mainWindowCreated: boolean;
}

export async function getStartupContext(): Promise<StartupContext> {
  return invoke<StartupContext>("get_startup_context");
}

export interface HttpPublishResult {
  status: number;
  response_preview: string;
}

export async function postJsonExport(
  url: string,
  body: string,
  bearerToken?: string
): Promise<HttpPublishResult> {
  return invoke<HttpPublishResult>("post_json_export", {
    input: {
      url,
      body,
      bearerToken: bearerToken?.trim() || null,
    },
  });
}
