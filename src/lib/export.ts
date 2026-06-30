import { computeStats } from "./stats";
import { generateLibrarySnapshotJson } from "./automationExport";
import { getHltbHours, hltbModeLabel } from "./hltb";
import type { AchievementSummary, GameDetails, HltbTimeMode, OwnedGame, SteamCollection } from "./types";
import type { FamilyLibraryApp, HltbData, WishlistItem } from "./tauri";
import type { GameStatus } from "../stores/statusStore";

export type ExportScope = "all" | "category" | "categories" | "categories_pick" | "stats" | "snapshot";
export type ExportFormat = "json" | "csv" | "txt" | "md";
export type ExportPresenceFilter = "all" | "with" | "without";
export type ExportCollectionOnlyFilter = "include" | "exclude" | "only";
export type ExportPlayedFilter = "all" | "played" | "unplayed";

export type ExportFieldKey =
  | "appid"
  | "name"
  | "playtime"
  | "lastPlayed"
  | "status"
  | "hltb"
  | "categories"
  | "genres"
  | "features"
  | "releaseDate"
  | "metacritic"
  | "developers"
  | "publishers"
  | "platforms"
  | "price"
  | "collectionOnly";

export interface ExportFilters {
  minSteamHours?: number | null;
  maxSteamHours?: number | null;
  minHltbHours?: number | null;
  maxHltbHours?: number | null;
  statuses?: readonly GameStatus[];
  hltbPresence?: ExportPresenceFilter;
  detailsPresence?: ExportPresenceFilter;
  collectionOnly?: ExportCollectionOnlyFilter;
  played?: ExportPlayedFilter;
}

export interface ExportOptions {
  scope: ExportScope;
  format: ExportFormat;
  titlesOnly?: boolean;
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  activeCategory?: string;
  /** For scope `categories_pick`: collection keys to include (structured + flat union). */
  categoryKeys?: readonly string[];
  /** User status map, used for status fields and status filters. */
  statuses?: Record<number, GameStatus>;
  details?: Record<number, GameDetails>;
  hltbData?: Record<number, HltbData>;
  achievements?: Record<number, AchievementSummary>;
  wishlistItems?: WishlistItem[];
  wishlistLastFetched?: number | null;
  familyApps?: Record<number, FamilyLibraryApp>;
  familyAuthUsed?: string | null;
  familyOwnerSteamId?: string | null;
  familyLastFetched?: number | null;
  appVersion?: string;
  steamId64?: string;
  steamPersonaName?: string;
  hltbTimeMode?: HltbTimeMode;
  fields?: readonly ExportFieldKey[];
  filters?: ExportFilters;
  excludedCategoryKeys?: readonly string[];
  skipEmptyCategories?: boolean;
  /**
   * For `categories_pick` only: `structured` = one section per category (default).
   * `flat_unique` = single deduplicated list; CSV adds a Categories column when enabled.
   */
  pickLayout?: "structured" | "flat_unique";
}

export interface ExportPreview {
  gameCount: number;
  categoryCount: number;
  skippedGameCount: number;
  skippedCategoryCount: number;
  fieldCount: number;
}

interface ExportGameRecord {
  appid: number;
  name: string;
  playtime_hours: number;
  playtime_minutes: number;
  last_played: string | null;
  last_played_timestamp: number | null;
  status: GameStatus;
  hltb_hours: number | null;
  hltb_mode: HltbTimeMode;
  hltb: {
    hours: number | null;
    mode: HltbTimeMode;
    mode_label: string;
    main_story: number | null;
    main_extra: number | null;
    completionist: number | null;
    game_id?: number | null;
    game_name?: string | null;
    confidence?: number | null;
  } | null;
  categories: string[];
  genres: string[];
  features: string[];
  release_date: string | null;
  metacritic_score: number | null;
  developers: string[];
  publishers: string[];
  platforms: string[];
  price: {
    display: string | null;
    initial: number | null;
    final: number | null;
    currency: string | null;
    country_code?: string | null;
    is_free: boolean;
  } | null;
  collection_only: boolean;
  has_details: boolean;
}

interface ExportCategoryRecord {
  name: string;
  key: string;
  is_dynamic: boolean;
  game_count: number;
  source_game_count: number;
  skipped_game_count: number;
  missing_appids: number[];
  games: ExportGameRecord[];
}

interface ExportDataset {
  games: ExportGameRecord[];
  categories: ExportCategoryRecord[];
  fieldDefinitions: ExportFieldDefinition[];
  skippedGameCount: number;
  skippedCategoryCount: number;
}

interface ExportFieldDefinition {
  key: ExportFieldKey;
  label: string;
  jsonKey: string;
  jsonValue: (record: ExportGameRecord) => unknown;
  cellValue: (record: ExportGameRecord) => string;
}

export const DEFAULT_EXPORT_FIELDS: ExportFieldKey[] = [
  "appid",
  "name",
  "playtime",
  "lastPlayed",
  "status",
  "hltb",
  "categories",
];

const FIELD_DEFINITIONS: ExportFieldDefinition[] = [
  {
    key: "appid",
    label: "App ID",
    jsonKey: "appid",
    jsonValue: (r) => r.appid,
    cellValue: (r) => String(r.appid),
  },
  {
    key: "name",
    label: "Name",
    jsonKey: "name",
    jsonValue: (r) => r.name,
    cellValue: (r) => r.name,
  },
  {
    key: "playtime",
    label: "Steam Hours",
    jsonKey: "playtime",
    jsonValue: (r) => ({ hours: r.playtime_hours, minutes: r.playtime_minutes }),
    cellValue: (r) => r.playtime_hours.toFixed(1),
  },
  {
    key: "lastPlayed",
    label: "Last Played",
    jsonKey: "last_played",
    jsonValue: (r) => r.last_played,
    cellValue: (r) => r.last_played ?? "Never",
  },
  {
    key: "status",
    label: "Status",
    jsonKey: "status",
    jsonValue: (r) => r.status,
    cellValue: (r) => (r.status === "none" ? "" : r.status),
  },
  {
    key: "hltb",
    label: "HLTB Hours",
    jsonKey: "hltb",
    jsonValue: (r) => r.hltb,
    cellValue: (r) => (r.hltb_hours == null ? "" : r.hltb_hours.toFixed(1)),
  },
  {
    key: "categories",
    label: "Categories",
    jsonKey: "categories",
    jsonValue: (r) => r.categories,
    cellValue: (r) => r.categories.join("; "),
  },
  {
    key: "genres",
    label: "Genres",
    jsonKey: "genres",
    jsonValue: (r) => r.genres,
    cellValue: (r) => r.genres.join("; "),
  },
  {
    key: "features",
    label: "Steam Features",
    jsonKey: "steam_features",
    jsonValue: (r) => r.features,
    cellValue: (r) => r.features.join("; "),
  },
  {
    key: "releaseDate",
    label: "Release Date",
    jsonKey: "release_date",
    jsonValue: (r) => r.release_date,
    cellValue: (r) => r.release_date ?? "",
  },
  {
    key: "metacritic",
    label: "Metacritic",
    jsonKey: "metacritic_score",
    jsonValue: (r) => r.metacritic_score,
    cellValue: (r) => (r.metacritic_score == null ? "" : String(r.metacritic_score)),
  },
  {
    key: "developers",
    label: "Developers",
    jsonKey: "developers",
    jsonValue: (r) => r.developers,
    cellValue: (r) => r.developers.join("; "),
  },
  {
    key: "publishers",
    label: "Publishers",
    jsonKey: "publishers",
    jsonValue: (r) => r.publishers,
    cellValue: (r) => r.publishers.join("; "),
  },
  {
    key: "platforms",
    label: "Platforms",
    jsonKey: "platforms",
    jsonValue: (r) => r.platforms,
    cellValue: (r) => r.platforms.join("; "),
  },
  {
    key: "price",
    label: "Price",
    jsonKey: "price",
    jsonValue: (r) => r.price,
    cellValue: (r) => r.price?.display ?? "",
  },
  {
    key: "collectionOnly",
    label: "Local Only",
    jsonKey: "collection_only",
    jsonValue: (r) => r.collection_only,
    cellValue: (r) => (r.collection_only ? "yes" : "no"),
  },
];

function isCategoriesStructured(opts: ExportOptions): boolean {
  if (opts.scope === "categories") return true;
  if (opts.scope === "categories_pick") return opts.pickLayout !== "flat_unique";
  return false;
}

function selectedFields(opts: ExportOptions): ExportFieldDefinition[] {
  if (opts.titlesOnly && opts.scope !== "stats" && opts.scope !== "snapshot") {
    return FIELD_DEFINITIONS.filter((field) => field.key === "name");
  }
  const keys = new Set(opts.fields?.length ? opts.fields : DEFAULT_EXPORT_FIELDS);
  keys.add("name");
  return FIELD_DEFINITIONS.filter((field) => keys.has(field.key));
}

function normalizeFilters(filters: ExportFilters | undefined): Required<ExportFilters> {
  return {
    minSteamHours: filters?.minSteamHours ?? null,
    maxSteamHours: filters?.maxSteamHours ?? null,
    minHltbHours: filters?.minHltbHours ?? null,
    maxHltbHours: filters?.maxHltbHours ?? null,
    statuses: filters?.statuses ?? [],
    hltbPresence: filters?.hltbPresence ?? "all",
    detailsPresence: filters?.detailsPresence ?? "all",
    collectionOnly: filters?.collectionOnly ?? "include",
    played: filters?.played ?? "all",
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function filenameTimestamp(now: Date | number = Date.now()): string {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function formatHours(minutes: number): number {
  return Number((minutes / 60).toFixed(1));
}

function formatIsoDate(timestampSeconds: number | null | undefined): string | null {
  if (!timestampSeconds) return null;
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function asList(values: string[] | null | undefined): string[] {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function platformList(details: GameDetails | undefined): string[] {
  if (!details?.platforms) return [];
  const platforms: string[] = [];
  if (details.platforms.windows) platforms.push("Windows");
  if (details.platforms.mac) platforms.push("macOS");
  if (details.platforms.linux) platforms.push("Linux");
  return platforms;
}

function priceDisplay(details: GameDetails | undefined): ExportGameRecord["price"] {
  if (!details) return null;
  if (details.is_free) {
    return {
      display: "Free",
      initial: details.price_initial,
      final: details.price_final,
      currency: details.price_currency,
      country_code: details.price_country_code,
      is_free: true,
    };
  }
  const display =
    details.price_final != null && details.price_currency
      ? `${(details.price_final / 100).toFixed(2)} ${details.price_currency}`
      : null;
  return {
    display,
    initial: details.price_initial,
    final: details.price_final,
    currency: details.price_currency,
    country_code: details.price_country_code,
    is_free: false,
  };
}

function categoryNamesForApp(appid: number, cols: SteamCollection[]): string[] {
  return cols.filter((c) => c.added.includes(appid)).map((c) => c.name);
}

function exportableCollections(opts: ExportOptions): SteamCollection[] {
  const excluded = new Set(opts.excludedCategoryKeys ?? []);
  return opts.collections.filter((c) => !c.is_deleted && !excluded.has(c.key));
}

function pickCollections(opts: ExportOptions): SteamCollection[] {
  const collections = exportableCollections(opts);
  if (opts.scope === "categories_pick" && opts.categoryKeys?.length) {
    const keys = new Set(opts.categoryKeys);
    return collections.filter((c) => keys.has(c.key));
  }
  if (opts.scope === "categories") {
    return collections.filter((c) => c.id !== "hidden");
  }
  if (opts.scope === "category" && opts.activeCategory) {
    return collections.filter((c) => c.key === opts.activeCategory);
  }
  return [];
}

function gamesFromIds(ids: number[], games: Record<number, OwnedGame>): OwnedGame[] {
  const result: OwnedGame[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const game = games[id];
    if (!game) continue;
    seen.add(id);
    result.push(game);
  }
  return result;
}

function getGamesForScope(opts: ExportOptions, pickedCollections = pickCollections(opts)): OwnedGame[] {
  const all = Object.values(opts.games);
  if (opts.scope === "all") return all;
  if (opts.scope === "category" && opts.activeCategory) {
    const col = pickedCollections.find((c) => c.key === opts.activeCategory);
    return col ? gamesFromIds(col.added, opts.games) : [];
  }
  if (opts.scope === "categories_pick" && opts.categoryKeys?.length) {
    return gamesFromIds(pickedCollections.flatMap((c) => c.added), opts.games);
  }
  if (opts.scope === "categories") {
    return gamesFromIds(pickedCollections.flatMap((c) => c.added), opts.games);
  }
  return all;
}

function buildRecord(
  game: OwnedGame,
  opts: ExportOptions,
  categoryCollections: SteamCollection[]
): ExportGameRecord {
  const hltbMode = opts.hltbTimeMode ?? "main_story";
  const hltb = opts.hltbData?.[game.appid];
  const details = opts.details?.[game.appid];
  const hltbHours = getHltbHours(hltb, hltbMode);
  const status = opts.statuses?.[game.appid] ?? "none";

  return {
    appid: game.appid,
    name: String(game.name ?? ""),
    playtime_hours: formatHours(game.playtime_forever),
    playtime_minutes: game.playtime_forever,
    last_played: formatIsoDate(game.rtime_last_played),
    last_played_timestamp: game.rtime_last_played || null,
    status,
    hltb_hours: hltbHours,
    hltb_mode: hltbMode,
    hltb: hltb
      ? {
          hours: hltbHours,
          mode: hltbMode,
          mode_label: hltbModeLabel(hltbMode),
          main_story: hltb.main_story ?? null,
          main_extra: hltb.main_extra ?? null,
          completionist: hltb.completionist ?? null,
          game_id: hltb.game_id,
          game_name: hltb.game_name,
          confidence: hltb.confidence,
        }
      : null,
    categories: categoryNamesForApp(game.appid, categoryCollections),
    genres: asList(details?.genres),
    features: asList(details?.categories),
    release_date: details?.release_date ?? null,
    metacritic_score: details?.metacritic_score ?? null,
    developers: asList(details?.developers),
    publishers: asList(details?.publishers),
    platforms: platformList(details),
    price: priceDisplay(details),
    collection_only: Boolean(game.is_collection_only),
    has_details: Boolean(details),
  };
}

function matchesExportFilters(record: ExportGameRecord, filters: Required<ExportFilters>): boolean {
  if (filters.minSteamHours != null && record.playtime_hours < filters.minSteamHours) return false;
  if (filters.maxSteamHours != null && record.playtime_hours > filters.maxSteamHours) return false;
  if (filters.minHltbHours != null && (record.hltb_hours == null || record.hltb_hours < filters.minHltbHours)) {
    return false;
  }
  if (filters.maxHltbHours != null && (record.hltb_hours == null || record.hltb_hours > filters.maxHltbHours)) {
    return false;
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes(record.status)) return false;
  if (filters.hltbPresence === "with" && record.hltb_hours == null) return false;
  if (filters.hltbPresence === "without" && record.hltb_hours != null) return false;
  if (filters.detailsPresence === "with" && !record.has_details) return false;
  if (filters.detailsPresence === "without" && record.has_details) return false;
  if (filters.collectionOnly === "exclude" && record.collection_only) return false;
  if (filters.collectionOnly === "only" && !record.collection_only) return false;
  if (filters.played === "played" && record.playtime_minutes <= 0) return false;
  if (filters.played === "unplayed" && record.playtime_minutes > 0) return false;
  return true;
}

function buildExportDataset(opts: ExportOptions): ExportDataset {
  const fields = selectedFields(opts);
  const filters = normalizeFilters(opts.filters);
  const pickedCollections = pickCollections(opts);
  const categoryCollections =
    opts.scope === "categories" || opts.scope === "categories_pick" || opts.scope === "category"
      ? pickedCollections
      : exportableCollections(opts).filter((c) => c.id !== "hidden");

  if (isCategoriesStructured(opts)) {
    const categories: ExportCategoryRecord[] = [];
    const includedByAppId = new Map<number, ExportGameRecord>();
    const sourceAppIds = new Set<number>();
    let skippedCategoryCount = 0;

    for (const collection of pickedCollections) {
      const sourceGames = gamesFromIds(collection.added, opts.games);
      for (const game of sourceGames) sourceAppIds.add(game.appid);
      const missingAppIds = collection.added.filter((id) => !opts.games[id]);
      const rows = sourceGames
        .map((game) => buildRecord(game, opts, categoryCollections))
        .filter((record) => matchesExportFilters(record, filters));

      if (opts.skipEmptyCategories && rows.length === 0) {
        skippedCategoryCount += 1;
        continue;
      }

      for (const row of rows) includedByAppId.set(row.appid, row);
      categories.push({
        name: collection.name,
        key: collection.key,
        is_dynamic: collection.is_dynamic,
        game_count: rows.length,
        source_game_count: collection.added.length,
        skipped_game_count: Math.max(0, collection.added.length - rows.length),
        missing_appids: missingAppIds,
        games: rows,
      });
    }

    return {
      games: [...includedByAppId.values()],
      categories,
      fieldDefinitions: fields,
      skippedGameCount: Math.max(0, sourceAppIds.size - includedByAppId.size),
      skippedCategoryCount,
    };
  }

  const sourceGames = getGamesForScope(opts, pickedCollections);
  const games = sourceGames
    .map((game) => buildRecord(game, opts, categoryCollections))
    .filter((record) => matchesExportFilters(record, filters));

  return {
    games,
    categories: [],
    fieldDefinitions: fields,
    skippedGameCount: Math.max(0, sourceGames.length - games.length),
    skippedCategoryCount: 0,
  };
}

function projectRecord(record: ExportGameRecord, fields: ExportFieldDefinition[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field.jsonKey] = field.jsonValue(record);
  return out;
}

function sortByName(a: ExportGameRecord, b: ExportGameRecord): number {
  return a.name.localeCompare(b.name);
}

// --- Titles only ---
function toTitlesOnly(opts: ExportOptions): string {
  const dataset = buildExportDataset(opts);
  const games = [...dataset.games].sort(sortByName);
  if (opts.format === "json") return JSON.stringify(games.map((g) => g.name), null, 2);
  if (opts.format === "csv") return ["Name", ...games.map((g) => escapeCSV(g.name))].join("\n");
  if (opts.format === "md") return games.map((g) => `- ${g.name}`).join("\n");
  return games.map((g) => g.name).join("\n");
}

// --- JSON ---
function toJSON(opts: ExportOptions): string {
  if (opts.scope === "snapshot") {
    return generateLibrarySnapshotJson({
      games: opts.games,
      collections: opts.collections,
      details: opts.details,
      hltbData: opts.hltbData,
      achievements: opts.achievements,
      wishlistItems: opts.wishlistItems,
      wishlistLastFetched: opts.wishlistLastFetched,
      familyApps: opts.familyApps,
      familyAuthUsed: opts.familyAuthUsed,
      familyOwnerSteamId: opts.familyOwnerSteamId,
      familyLastFetched: opts.familyLastFetched,
      appVersion: opts.appVersion,
      steamId64: opts.steamId64,
      steamPersonaName: opts.steamPersonaName,
    });
  }
  if (opts.scope === "stats") {
    return JSON.stringify(computeStats(opts.games, opts.collections), null, 2);
  }

  const dataset = buildExportDataset(opts);
  if (isCategoriesStructured(opts)) {
    return JSON.stringify(
      dataset.categories.map((category) => ({
        name: category.name,
        key: category.key,
        is_dynamic: category.is_dynamic,
        game_count: category.game_count,
        source_game_count: category.source_game_count,
        skipped_game_count: category.skipped_game_count,
        missing_appids: category.missing_appids,
        games: category.games.map((game) => projectRecord(game, dataset.fieldDefinitions)),
      })),
      null,
      2
    );
  }
  return JSON.stringify(dataset.games.map((game) => projectRecord(game, dataset.fieldDefinitions)), null, 2);
}

// --- CSV ---
function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function csvRow(record: ExportGameRecord, fields: ExportFieldDefinition[]): string {
  return fields.map((field) => escapeCSV(field.cellValue(record))).join(",");
}

function toCSV(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "Metric,Value",
      `Total Games,${stats.totalGames}`,
      `Total Playtime (hours),${stats.totalPlaytimeHours}`,
      `Unplayed Games,${stats.unplayedCount}`,
      `Unplayed %,${stats.unplayedPercent}%`,
      `Average Hours/Game,${stats.averageHoursPerGame}`,
      "",
      "Top Played,Hours",
      ...stats.topPlayed.map((g) => `${escapeCSV(g.name)},${g.hours}`),
      "",
      "Playtime Bucket,Count",
      ...stats.playtimeBuckets.map((b) => `${escapeCSV(b.label)},${b.count}`),
    ];
    return lines.join("\n");
  }

  const dataset = buildExportDataset(opts);
  const header = dataset.fieldDefinitions.map((field) => field.label).join(",");

  if (isCategoriesStructured(opts)) {
    const rows: string[] = [
      ["Category", "Category Key", "Category Game Count", ...dataset.fieldDefinitions.map((field) => field.label)]
        .map(escapeCSV)
        .join(","),
    ];
    for (const category of dataset.categories) {
      const prefix = [category.name, category.key, String(category.game_count)].map(escapeCSV).join(",");
      if (category.games.length === 0) {
        rows.push(`${prefix},${dataset.fieldDefinitions.map(() => "").join(",")}`);
        continue;
      }
      for (const game of category.games) rows.push(`${prefix},${csvRow(game, dataset.fieldDefinitions)}`);
    }
    return rows.join("\n");
  }

  return [header, ...dataset.games.map((game) => csvRow(game, dataset.fieldDefinitions))].join("\n");
}

// --- TXT ---
function toTextLine(record: ExportGameRecord, fields: ExportFieldDefinition[]): string {
  return fields.map((field) => field.cellValue(record) || "-").join(" | ");
}

function toTXT(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "STEAM LIBRARY STATISTICS",
      "========================",
      "",
      `Total Games:          ${stats.totalGames}`,
      `Total Playtime:       ${stats.totalPlaytimeHours}h`,
      `Unplayed Games:       ${stats.unplayedCount} (${stats.unplayedPercent}%)`,
      `Average Hours/Game:   ${stats.averageHoursPerGame}h`,
      "",
      "TOP 10 MOST PLAYED",
      "-------------------",
      ...stats.topPlayed.map((g, i) => `  ${String(i + 1).padStart(2)}. ${g.name.padEnd(40)} ${String(g.hours).padStart(8)}h`),
      "",
      "PLAYTIME DISTRIBUTION",
      "---------------------",
      ...stats.playtimeBuckets.map((b) => `  ${b.label.padEnd(20)} ${String(b.count).padStart(5)} games`),
    ];
    return lines.join("\n");
  }

  const dataset = buildExportDataset(opts);
  const heading =
    opts.scope === "category"
      ? "CATEGORY EXPORT"
      : opts.scope === "categories_pick"
        ? "SELECTED CATEGORIES"
        : opts.scope === "categories"
          ? "STEAM LIBRARY - CATEGORIES"
          : "STEAM LIBRARY";
  const header = dataset.fieldDefinitions.map((field) => field.label).join(" | ");

  if (isCategoriesStructured(opts)) {
    const sections: string[] = [heading, "=".repeat(heading.length)];
    for (const category of dataset.categories) {
      sections.push("", `${category.name} (${category.game_count} games)`, "-".repeat(category.name.length + 10), header);
      for (const game of category.games) sections.push(toTextLine(game, dataset.fieldDefinitions));
    }
    return sections.join("\n");
  }

  const lines = [heading, "=".repeat(heading.length), `${dataset.games.length} games`, "", header];
  for (const game of dataset.games) lines.push(toTextLine(game, dataset.fieldDefinitions));
  return lines.join("\n");
}

// --- Markdown ---
function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownRow(record: ExportGameRecord, fields: ExportFieldDefinition[]): string {
  return `| ${fields.map((field) => escapeMarkdownCell(field.cellValue(record))).join(" | ")} |`;
}

function markdownHeader(fields: ExportFieldDefinition[]): string[] {
  return [
    `| ${fields.map((field) => escapeMarkdownCell(field.label)).join(" | ")} |`,
    `| ${fields.map(() => "---").join(" | ")} |`,
  ];
}

function toMarkdown(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "# Steam Library Statistics",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Total Games | ${stats.totalGames} |`,
      `| Total Playtime | ${stats.totalPlaytimeHours}h |`,
      `| Unplayed Games | ${stats.unplayedCount} (${stats.unplayedPercent}%) |`,
      `| Average Hours/Game | ${stats.averageHoursPerGame}h |`,
      "",
      "## Top 10 Most Played",
      "",
      "| # | Game | Hours |",
      "|---|------|-------|",
      ...stats.topPlayed.map((g, i) => `| ${i + 1} | ${escapeMarkdownCell(g.name)} | ${g.hours}h |`),
      "",
      "## Playtime Distribution",
      "",
      "| Bucket | Games |",
      "|--------|-------|",
      ...stats.playtimeBuckets.map((b) => `| ${escapeMarkdownCell(b.label)} | ${b.count} |`),
    ];
    return lines.join("\n");
  }

  const dataset = buildExportDataset(opts);
  const title =
    opts.scope === "category"
      ? "Category Export"
      : opts.scope === "categories_pick"
        ? "Selected Categories"
        : opts.scope === "categories"
          ? "Steam Library - Categories"
          : "Steam Library";

  if (isCategoriesStructured(opts)) {
    const sections = [`# ${title}`, ""];
    for (const category of dataset.categories) {
      sections.push(`## ${category.name} (${category.game_count} games)`, "", ...markdownHeader(dataset.fieldDefinitions));
      for (const game of category.games) sections.push(markdownRow(game, dataset.fieldDefinitions));
      sections.push("");
    }
    return sections.join("\n");
  }

  const lines = [`# ${title}`, "", `**${dataset.games.length} games**`, "", ...markdownHeader(dataset.fieldDefinitions)];
  for (const game of dataset.games) lines.push(markdownRow(game, dataset.fieldDefinitions));
  return lines.join("\n");
}

// --- Main ---
const FORMATTERS: Record<ExportFormat, (opts: ExportOptions) => string> = {
  json: toJSON,
  csv: toCSV,
  txt: toTXT,
  md: toMarkdown,
};

export function generateExport(opts: ExportOptions): string {
  if (opts.scope === "snapshot") return toJSON({ ...opts, format: "json" });
  if (opts.titlesOnly && opts.scope !== "stats") return toTitlesOnly(opts);
  return FORMATTERS[opts.format](opts);
}

export function getExportPreview(opts: ExportOptions): ExportPreview {
  if (opts.scope === "stats") {
    return {
      gameCount: Object.keys(opts.games).length,
      categoryCount: opts.collections.filter((c) => !c.is_deleted).length,
      skippedGameCount: 0,
      skippedCategoryCount: 0,
      fieldCount: 0,
    };
  }
  if (opts.scope === "snapshot") {
    return {
      gameCount: Object.keys(opts.games).length,
      categoryCount: opts.collections.filter((c) => !c.is_deleted).length,
      skippedGameCount: 0,
      skippedCategoryCount: 0,
      fieldCount: 0,
    };
  }
  const dataset = buildExportDataset(opts);
  return {
    gameCount: dataset.games.length,
    categoryCount: isCategoriesStructured(opts) ? dataset.categories.length : 0,
    skippedGameCount: dataset.skippedGameCount,
    skippedCategoryCount: dataset.skippedCategoryCount,
    fieldCount: dataset.fieldDefinitions.length,
  };
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  json: "json",
  csv: "csv",
  txt: "txt",
  md: "md",
};

/** Safe basename segment for default save dialog (ASCII, no path chars). */
export function sanitizeExportBasename(name: string): string {
  const s = String(name ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "category";
}

export interface DefaultFilenameOptions {
  /** Single category display name (scope `category`). */
  categoryName?: string;
  /** Number of categories for `categories_pick` default name. */
  pickCount?: number;
  /** Injectable timestamp for tests. Defaults to current local time. */
  now?: Date | number;
}

export function getDefaultFilename(
  scope: ExportScope,
  format: ExportFormat,
  opts?: DefaultFilenameOptions
): string {
  const ext = FORMAT_EXTENSIONS[format];
  const stamp = filenameTimestamp(opts?.now);
  if (scope === "stats") return `repressurizer-stats-${stamp}.${ext}`;
  if (scope === "snapshot") return `repressurizer-library-snapshot-${stamp}.json`;
  if (scope === "categories") return `repressurizer-categories-${stamp}.${ext}`;
  if (scope === "categories_pick") {
    const n = opts?.pickCount ?? 0;
    return `repressurizer-categories-${n}-selected-${stamp}.${ext}`;
  }
  if (scope === "category" && opts?.categoryName) {
    return `repressurizer-category-${sanitizeExportBasename(opts.categoryName)}-${stamp}.${ext}`;
  }
  return `repressurizer-games-${stamp}.${ext}`;
}

const FORMAT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  json: { name: "JSON", extensions: ["json"] },
  csv: { name: "CSV", extensions: ["csv"] },
  txt: { name: "Text", extensions: ["txt"] },
  md: { name: "Markdown", extensions: ["md"] },
};

export function getFileFilter(format: ExportFormat) {
  return FORMAT_FILTERS[format];
}
