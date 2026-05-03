import type { OwnedGame, GameDetails } from "./types";
import type { GameStatus } from "../stores/statusStore";
import type { GameReview } from "../stores/reviewStore";

export interface SearchFilter {
  text: string; // free text (name match)
  genre?: string;
  status?: GameStatus;
  minHours?: number;
  maxHours?: number;
  tag?: string;
  dev?: string;
  pub?: string;
  year?: number;
  minRating?: number;
  maxRating?: number;
}

/**
 * Parse a search query string into structured filters.
 * Supports: genre:rpg status:playing hours:>10 hours:<50 tag:favorite
 *           dev:valve pub:ea year:2020 rating:>7
 * Everything else is treated as free text name search.
 */
export function parseSearchQuery(query: string): SearchFilter {
  const filter: SearchFilter = { text: "" };
  const textParts: string[] = [];

  // Tokenize respecting quoted strings
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const token of tokens) {
    const colonIdx = token.indexOf(":");
    if (colonIdx === -1) {
      textParts.push(token);
      continue;
    }

    const key = token.slice(0, colonIdx).toLowerCase();
    let value = token.slice(colonIdx + 1).replace(/^"|"$/g, "");

    switch (key) {
      case "genre":
        filter.genre = value.toLowerCase();
        break;
      case "status":
        if (["playing", "beaten", "completed", "abandoned", "none"].includes(value.toLowerCase())) {
          filter.status = value.toLowerCase() as GameStatus;
        }
        break;
      case "hours":
        if (value.startsWith(">")) {
          filter.minHours = parseFloat(value.slice(1));
        } else if (value.startsWith("<")) {
          filter.maxHours = parseFloat(value.slice(1));
        } else {
          const n = parseFloat(value);
          if (!isNaN(n)) {
            filter.minHours = n;
            filter.maxHours = n;
          }
        }
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
        filter.year = parseInt(value);
        break;
      case "rating":
        if (value.startsWith(">")) {
          filter.minRating = parseFloat(value.slice(1));
        } else if (value.startsWith("<")) {
          filter.maxRating = parseFloat(value.slice(1));
        } else {
          const n = parseFloat(value);
          if (!isNaN(n)) {
            filter.minRating = n;
            filter.maxRating = n;
          }
        }
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
  filter: SearchFilter
): boolean {
  // Free text name match
  if (filter.text) {
    const name = game.name.toLowerCase();
    if (!name.includes(filter.text.toLowerCase())) return false;
  }

  // Genre
  if (filter.genre && details) {
    const hasGenre = details.genres.some((g) => g.toLowerCase().includes(filter.genre!));
    if (!hasGenre) return false;
  } else if (filter.genre && !details) {
    return false;
  }

  // Status
  if (filter.status) {
    const gameStatus = statuses[game.appid] ?? "none";
    if (gameStatus !== filter.status) return false;
  }

  // Hours
  const hours = game.playtime_forever / 60;
  if (filter.minHours != null && hours < filter.minHours) return false;
  if (filter.maxHours != null && hours > filter.maxHours) return false;

  // Tag
  if (filter.tag) {
    const gameTags = tags[game.appid] ?? [];
    if (!gameTags.some((t) => t.toLowerCase().includes(filter.tag!))) return false;
  }

  // Developer
  if (filter.dev && details) {
    if (!details.developers.some((d) => d.toLowerCase().includes(filter.dev!))) return false;
  } else if (filter.dev && !details) {
    return false;
  }

  // Publisher
  if (filter.pub && details) {
    if (!details.publishers.some((p) => p.toLowerCase().includes(filter.pub!))) return false;
  } else if (filter.pub && !details) {
    return false;
  }

  // Year
  if (filter.year && details?.release_date) {
    const gameYear = parseInt(details.release_date.slice(0, 4));
    if (isNaN(gameYear) || gameYear !== filter.year) return false;
  } else if (filter.year && !details?.release_date) {
    return false;
  }

  // Rating
  if (filter.minRating != null || filter.maxRating != null) {
    const rating = reviews[game.appid]?.rating ?? 0;
    if (filter.minRating != null && rating < filter.minRating) return false;
    if (filter.maxRating != null && rating > filter.maxRating) return false;
  }

  return true;
}

/** Check if a query string contains any advanced filters */
export function hasAdvancedFilters(query: string): boolean {
  return /\b(genre|status|hours|tag|dev|developer|pub|publisher|year|rating):/i.test(query);
}
