import type { OwnedGame, GameDetails, AchievementSummary, HltbTimeMode } from "./types";
import type { GameStatus } from "../stores/statusStore";
import type { GameReview } from "../stores/reviewStore";
import type { FamilyLibraryApp, HltbData } from "./tauri";
import { getHltbHours } from "./hltb";

type PlatformKey = "windows" | "mac" | "linux";

interface NumericFilter {
  min?: number;
  max?: number;
}

export interface SearchFilter {
  text: string;
  nameRegex?: RegExp;
  invalidRegex?: boolean;
  appId?: NumericFilter;
  genre?: string;
  category?: string;
  status?: GameStatus;
  minHours?: number;
  maxHours?: number;
  minHltbHours?: number;
  maxHltbHours?: number;
  tag?: string;
  dev?: string;
  pub?: string;
  releaseDate?: NumericFilter;
  releaseYear?: NumericFilter;
  minRating?: number;
  maxRating?: number;
  minMetacritic?: number;
  maxMetacritic?: number;
  minAchievementPct?: number;
  maxAchievementPct?: number;
  platform?: PlatformKey;
  family?: boolean;
  duplicate?: boolean;
  missingDetails?: boolean;
  delisted?: boolean;
}

export interface MatchContext {
  hltbData?: Record<number, HltbData>;
  hltbTimeMode?: HltbTimeMode;
  achievements?: Record<number, AchievementSummary>;
  familyApps?: Record<number, FamilyLibraryApp>;
  duplicateAppIds?: Set<number>;
  delistedAppIds?: Set<number>;
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, "");
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function parseNumericFilter(value: string): NumericFilter | undefined {
  const trimmed = value.trim();
  const range = trimmed.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }

  const op = trimmed.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!op) return undefined;

  const n = Number(op[2]);
  if (!Number.isFinite(n)) return undefined;

  switch (op[1]) {
    case ">":
    case ">=":
      return { min: n };
    case "<":
    case "<=":
      return { max: n };
    case "=":
    default:
      return { min: n, max: n };
  }
}

function applyNumericFilter(
  target: SearchFilter,
  value: string,
  minKey: "minHours" | "minHltbHours" | "minRating" | "minMetacritic" | "minAchievementPct",
  maxKey: "maxHours" | "maxHltbHours" | "maxRating" | "maxMetacritic" | "maxAchievementPct"
) {
  const parsed = parseNumericFilter(value);
  if (!parsed) return;
  if (parsed.min !== undefined) target[minKey] = parsed.min;
  if (parsed.max !== undefined) target[maxKey] = parsed.max;
}

function parseRegexToken(token: string): RegExp | null {
  if (!token.startsWith("/")) return null;
  const lastSlash = token.lastIndexOf("/");
  if (lastSlash <= 0) return null;

  const pattern = token.slice(1, lastSlash);
  const flags = token.slice(lastSlash + 1);
  if (!/^[dgimsuvy]*$/.test(flags)) return null;
  return new RegExp(pattern, flags);
}

export function extractReleaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = releaseDate.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

export function extractReleaseTimestamp(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const iso = releaseDate.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const parsed = iso ? Date.parse(`${iso}T00:00:00Z`) : Date.parse(releaseDate);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateFilter(value: string): NumericFilter | undefined {
  const trimmed = value.trim();
  const range = trimmed.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (range) {
    const min = parseDateValue(range[1]);
    const max = parseDateValue(range[2]);
    if (min != null && max != null) return { min, max };
  }

  const op = trimmed.match(/^(>=|<=|>|<|=)?\s*(\d{4}-\d{2}-\d{2})$/);
  if (!op) return undefined;
  const date = parseDateValue(op[2]);
  if (date == null) return undefined;

  switch (op[1]) {
    case ">":
    case ">=":
      return { min: date };
    case "<":
    case "<=":
      return { max: date };
    case "=":
    default:
      return { min: date, max: date };
  }
}

function matchesNumeric(value: number | null | undefined, filter: NumericFilter | undefined): boolean {
  if (!filter) return true;
  if (value == null || !Number.isFinite(value)) return false;
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:[a-zA-Z]\.){3,}/g, (match) => match.replace(/\./g, ""))
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function matchesSearchText(target: string, query: string): boolean {
  if (!query) return true;
  if (target.includes(query)) return true;
  return query.split(" ").every((token) => target.includes(token));
}

/**
 * Parse a search query string into structured filters.
 *
 * Examples:
 *   /final.*vii/i genre:rpg released:2013..2020 hours:>10
 *   appid:39140 platform:windows family:true duplicate:true
 */
export function parseSearchQuery(query: string): SearchFilter {
  const filter: SearchFilter = { text: "" };
  const textParts: string[] = [];
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith("/")) {
      try {
        const regex = parseRegexToken(token);
        if (regex) {
          filter.nameRegex = regex;
        } else {
          filter.invalidRegex = true;
        }
      } catch {
        filter.invalidRegex = true;
      }
      continue;
    }

    const colonIdx = token.indexOf(":");
    if (colonIdx === -1) {
      textParts.push(stripQuotes(token));
      continue;
    }

    const key = token.slice(0, colonIdx).toLowerCase();
    const value = stripQuotes(token.slice(colonIdx + 1));

    switch (key) {
      case "appid":
      case "app":
      case "id":
        filter.appId = parseNumericFilter(value);
        break;
      case "genre":
        filter.genre = value.toLowerCase();
        break;
      case "cat":
      case "category":
        filter.category = value.toLowerCase();
        break;
      case "status":
        if (["playing", "beaten", "completed", "abandoned", "none"].includes(value.toLowerCase())) {
          filter.status = value.toLowerCase() as GameStatus;
        }
        break;
      case "hours":
      case "playtime":
        applyNumericFilter(filter, value, "minHours", "maxHours");
        break;
      case "hltb":
      case "hltbmain":
        applyNumericFilter(filter, value, "minHltbHours", "maxHltbHours");
        break;
      case "tag":
        filter.tag = value.toLowerCase();
        break;
      case "dev":
      case "developer":
        filter.dev = value.toLowerCase();
        break;
      case "pub":
      case "publisher":
        filter.pub = value.toLowerCase();
        break;
      case "year":
        filter.releaseYear = parseNumericFilter(value);
        break;
      case "released":
      case "release":
      case "date":
        filter.releaseDate = parseDateFilter(value);
        filter.releaseYear = filter.releaseDate ? undefined : parseNumericFilter(value);
        break;
      case "rating":
      case "myrating":
        applyNumericFilter(filter, value, "minRating", "maxRating");
        break;
      case "meta":
      case "metacritic":
        applyNumericFilter(filter, value, "minMetacritic", "maxMetacritic");
        break;
      case "ach":
      case "achievement":
      case "achievements":
        applyNumericFilter(filter, value, "minAchievementPct", "maxAchievementPct");
        break;
      case "platform": {
        const platform = value.toLowerCase();
        if (platform === "windows" || platform === "win") filter.platform = "windows";
        if (platform === "mac" || platform === "macos") filter.platform = "mac";
        if (platform === "linux" || platform === "steamdeck" || platform === "deck") filter.platform = "linux";
        break;
      }
      case "family":
        filter.family = parseBoolean(value);
        break;
      case "duplicate":
      case "duplicates":
      case "dupe":
        filter.duplicate = parseBoolean(value) ?? true;
        break;
      case "missing":
      case "metadata":
        filter.missingDetails = parseBoolean(value) ?? true;
        break;
      case "delisted":
        filter.delisted = parseBoolean(value) ?? true;
        break;
      default:
        textParts.push(token);
    }
  }

  filter.text = textParts.join(" ").trim();
  return filter;
}

/** Check if a game matches the parsed search filter */
export function matchesFilter(
  game: OwnedGame,
  details: GameDetails | undefined,
  statuses: Record<number, GameStatus>,
  tags: Record<number, string[]>,
  reviews: Record<number, GameReview>,
  filter: SearchFilter,
  context: MatchContext = {}
): boolean {
  if (filter.invalidRegex) return false;

  const searchableName = normalizeSearchText(`${game.name} ${details?.name ?? ""}`);
  const searchText = normalizeSearchText(filter.text);
  if (!matchesSearchText(searchableName, searchText)) return false;
  if (filter.nameRegex) {
    filter.nameRegex.lastIndex = 0;
    if (!filter.nameRegex.test(`${game.name} ${details?.name ?? ""}`.trim())) return false;
  }
  if (!matchesNumeric(game.appid, filter.appId)) return false;

  if (filter.genre) {
    if (!details?.genres.some((g) => g.toLowerCase().includes(filter.genre!))) return false;
  }

  if (filter.category) {
    if (!details?.categories.some((c) => c.toLowerCase().includes(filter.category!))) return false;
  }

  if (filter.status) {
    const gameStatus = statuses[game.appid] ?? "none";
    if (gameStatus !== filter.status) return false;
  }

  const hours = game.playtime_forever / 60;
  if (filter.minHours != null && hours < filter.minHours) return false;
  if (filter.maxHours != null && hours > filter.maxHours) return false;

  if (filter.minHltbHours != null || filter.maxHltbHours != null) {
    const hltbHours = getHltbHours(context.hltbData?.[game.appid], context.hltbTimeMode ?? "main_story");
    if (hltbHours == null) return false;
    if (filter.minHltbHours != null && hltbHours < filter.minHltbHours) return false;
    if (filter.maxHltbHours != null && hltbHours > filter.maxHltbHours) return false;
  }

  if (filter.tag) {
    const gameTags = tags[game.appid] ?? [];
    if (!gameTags.some((t) => t.toLowerCase().includes(filter.tag!))) return false;
  }

  if (filter.dev) {
    if (!details?.developers.some((d) => d.toLowerCase().includes(filter.dev!))) return false;
  }

  if (filter.pub) {
    if (!details?.publishers.some((p) => p.toLowerCase().includes(filter.pub!))) return false;
  }

  if (!matchesNumeric(extractReleaseTimestamp(details?.release_date), filter.releaseDate)) return false;
  if (!matchesNumeric(extractReleaseYear(details?.release_date), filter.releaseYear)) return false;

  const personalRating = reviews[game.appid]?.rating ?? 0;
  if (filter.minRating != null && personalRating < filter.minRating) return false;
  if (filter.maxRating != null && personalRating > filter.maxRating) return false;

  if (filter.minMetacritic != null || filter.maxMetacritic != null) {
    const metacritic = details?.metacritic_score ?? null;
    if (metacritic == null) return false;
    if (filter.minMetacritic != null && metacritic < filter.minMetacritic) return false;
    if (filter.maxMetacritic != null && metacritic > filter.maxMetacritic) return false;
  }

  if (filter.minAchievementPct != null || filter.maxAchievementPct != null) {
    const summary = context.achievements?.[game.appid];
    if (!summary || summary.total <= 0) return false;
    const pct = (summary.achieved / summary.total) * 100;
    if (filter.minAchievementPct != null && pct < filter.minAchievementPct) return false;
    if (filter.maxAchievementPct != null && pct > filter.maxAchievementPct) return false;
  }

  if (filter.platform && !details?.platforms[filter.platform]) return false;

  if (filter.family !== undefined) {
    const app = context.familyApps?.[game.appid];
    const isFamilyShared = !!app && app.is_family_shared && app.exclude_reason === 0;
    if (isFamilyShared !== filter.family) return false;
  }

  if (filter.duplicate !== undefined) {
    const isDuplicate = context.duplicateAppIds?.has(game.appid) ?? false;
    if (isDuplicate !== filter.duplicate) return false;
  }

  if (filter.missingDetails !== undefined) {
    const isMissing = !details;
    if (isMissing !== filter.missingDetails) return false;
  }

  if (filter.delisted !== undefined) {
    const isDelisted = context.delistedAppIds?.has(game.appid) ?? false;
    if (isDelisted !== filter.delisted) return false;
  }

  return true;
}

/** Check if a query string contains any advanced filters */
export function hasAdvancedFilters(query: string): boolean {
  return /(^|\s)\/.+\/[dgimsuvy]*($|\s)|\b(appid|app|id|genre|cat|category|status|hours|playtime|hltb|hltbmain|tag|dev|developer|pub|publisher|year|released|release|date|rating|myrating|meta|metacritic|ach|achievement|achievements|platform|family|duplicate|duplicates|dupe|missing|metadata|delisted):/i.test(query);
}
