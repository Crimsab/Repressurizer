import {
  normalizeCustomAutoCatConfig,
  type CustomRuleConditionV1,
} from "./customAutoCategorize";

/**
 * Deterministic, offline naming helpers for Diary/Kanban AutoCat columns.
 *
 * These functions never touch the network, never read the clock, and never
 * write Steam collections: they only produce readable, short, collision-safe
 * labels for local Kanban columns.
 */

export const DIARY_COLUMN_NAME_MAX = 24;

/** Characters that would break a Kanban column header or get mangled on export. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function collapseWhitespace(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ");
}

/**
 * Sanitize any raw label into a short single-line Kanban column name.
 * Falls back to `fallback` when nothing usable remains.
 */
export function sanitizeDiaryColumnLabel(
  raw: string,
  fallback = "Kanban column"
): string {
  const clean = collapseWhitespace(String(raw ?? "")).trim();
  if (!clean) return fallback;
  return truncateDiaryLabel(clean);
}

/** Truncate without splitting surrogate pairs; keeps the label within the cap. */
function truncateDiaryLabel(value: string): string {
  if (value.length <= DIARY_COLUMN_NAME_MAX) return value;
  const truncated = trimToLength(value, DIARY_COLUMN_NAME_MAX);
  return truncated.length > 0
    ? truncated
    : Array.from(value).slice(0, DIARY_COLUMN_NAME_MAX).join("");
}

/** Hard slice to `max` chars, trimming dangling surrogates and edge spaces. */
function trimToLength(value: string, max: number): string {
  if (max <= 0) return "";
  let end = Math.min(value.length, max);
  while (end > 0 && /[\ud800-\udfff]/.test(value[end - 1] ?? "")) end -= 1;
  return value.slice(0, end).trimEnd();
}

export function normalizeDiaryColumnName(value: string): string {
  return collapseWhitespace(String(value ?? "")).trim().toLocaleLowerCase();
}

/**
 * Return a collision-safe variant of `label` by appending " 2", " 3", … when an
 * equivalent name is already taken (case-insensitive). The input label itself
 * always wins over any suffixed variant.
 */
export function uniquifyDiaryColumnLabel(
  label: string,
  taken: Iterable<string> = []
): string {
  const base = sanitizeDiaryColumnLabel(label);
  const occupied = new Set([...taken].map(normalizeDiaryColumnName));
  if (!occupied.has(normalizeDiaryColumnName(base))) return base;

  for (let suffix = 2; ; suffix += 1) {
    const tail = ` ${suffix}`;
    const stem = trimToLength(base, DIARY_COLUMN_NAME_MAX - tail.length);
    if (!occupied.has(normalizeDiaryColumnName(`${stem}${tail}`))) return `${stem}${tail}`;
  }
}

/**
 * Exact meaningful group name (optionally prefixed) for auto-created group
 * columns, sanitized to a short collision-safe local Kanban label.
 */
export function diaryGroupColumnLabel(
  groupName: string,
  prefix = "",
  taken: Iterable<string> = []
): string {
  const rawGroup = collapseWhitespace(String(groupName ?? "")).trim();
  // Steam categorizer groups carry their source in a technical wrapper such
  // as "(Name) D" or "(Genre) RPG". The source is already visible in the
  // AutoCat step, so keep the Kanban label focused on the meaningful value.
  const wrapped = rawGroup.match(/^\([^)]{1,32}\)\s*(.*)$/);
  const cleanGroup = (wrapped?.[1] || rawGroup || "Group").trim();
  const cleanPrefix = collapseWhitespace(String(prefix ?? "")).trim();
  const combined = cleanPrefix ? `${cleanPrefix} · ${cleanGroup}` : cleanGroup;
  const base = sanitizeDiaryColumnLabel(combined, "Kanban column");
  return uniquifyDiaryColumnLabel(base, taken);
}

interface SuggestInput {
  type: string;
  config?: unknown;
  /** Localized source label (e.g. “By Genre”) used as last resort. */
  sourceLabel?: string;
}

const CONDITION_LIMIT = 2;

/**
 * Derive a readable default column name from the rule source and its enabled
 * conditions. Priority:
 *   1. explicit rule label (`output.categoryName`),
 *   2. a compact description of the enabled conditions,
 *   3. the source label,
 *   4. a neutral fallback.
 */
export function suggestDiaryRuleColumnName(input: SuggestInput): string {
  const config = normalizeCustomAutoCatConfig(input.config);

  const ruleLabel = collapseWhitespace(config.output.categoryName).trim();
  if (ruleLabel) return truncateDiaryLabel(ruleLabel);

  if (input.type === "custom") {
    const derived = describeCustomConditions(config.logic.conditions)
      .slice(0, CONDITION_LIMIT)
      .join(" + ");
    if (derived) return truncateDiaryLabel(derived);
  }

  const sourceLabel = collapseWhitespace(input.sourceLabel ?? "").trim();
  if (sourceLabel) return truncateDiaryLabel(sourceLabel);

  return "Kanban picks";
}

function describeCustomConditions(conditions: CustomRuleConditionV1[]): string[] {
  return conditions
    .filter((condition) => condition.enabled !== false)
    .map(describeCondition)
    .filter((label): label is string => Boolean(label));
}

function describeCondition(condition: CustomRuleConditionV1): string | null {
  switch (condition.kind) {
    case "title": {
      const value = condition.value.trim();
      if (!value) return null;
      if (condition.op === "startsWith") return `Starts ${value}`;
      if (condition.op === "regex") return "Title regex";
      return value;
    }
    case "hltb":
      return describeRange("HLTB", condition.minHours, condition.maxHoursExclusive);
    case "playtime":
      return describeRange("Played", condition.minHours, condition.maxHoursExclusive);
    case "metadataText": {
      const values = condition.values.map((value) => value.trim()).filter(Boolean);
      if (values.length === 0) return null;
      return values.slice(0, 2).join(" & ");
    }
    case "platform": {
      if (condition.values.length === 0) return null;
      return condition.values.map(capitalizeFirst).slice(0, 2).join(" & ");
    }
    case "metadataNumber": {
      if (condition.field === "releaseYear") {
        return describeRange("", condition.min, condition.max).replace(/^ /, "");
      }
      if (condition.field === "metacritic") {
        return describeRange("MC", condition.min, condition.max);
      }
      return describeRange("Reviews", condition.min, condition.max);
    }
    case "diary": {
      if (condition.field === "status") return `${capitalizeFirst(condition.status ?? "finished")} games`;
      if (condition.field === "rating") {
        return describeRange("Rated", condition.minRating, condition.maxRating);
      }
      if (condition.field === "hasJournal") {
        return condition.state === "exclude" ? "No journal" : "Journaled";
      }
      return condition.state === "exclude" ? "No pages" : "Paged";
    }
    case "special": {
      if (condition.state === "exclude") return null;
      return capitalizeFirst(condition.field);
    }
    case "category": {
      if (condition.mode === "notIn") return null;
      const names = condition.categories
        .map((category) => category.nameSnapshot || category.key)
        .filter(Boolean);
      if (names.length === 0) return null;
      return names.slice(0, 2).join(" & ");
    }
    default:
      return null;
  }
}

function describeRange(prefix: string, min?: number, max?: number): string {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  const range = hasMin && hasMax
    ? `${formatNumber(min!)}-${formatNumber(max!)}`
    : hasMin
      ? `${formatNumber(min!)}+`
      : hasMax
        ? `<${formatNumber(max!)}`
        : "";
  if (!range) return prefix;
  return prefix ? `${prefix} ${range}` : range;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
