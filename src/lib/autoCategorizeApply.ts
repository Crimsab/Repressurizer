import type {
  CategorizeResult,
  FlagsConfig,
  HoursConfig,
  LanguageConfig,
  PlatformConfig,
  TagsConfig,
  SteamRatingConfig,
} from "./tauri";
import type { CustomAutoCatConfigV1 } from "./customAutoCategorize";
import type { SteamCollection } from "./types";
import { expectedSteamRatingCategoryNames } from "./steamRatings";
import { hltbUnknownCategoryName } from "./hltbCategorizer";

export type AutoCategorizeApplyType =
  | "hours"
  | "genre"
  | "tags"
  | "year"
  | "score"
  | "rating"
  | "hltb"
  | "devpub"
  | "flags"
  | "language"
  | "platform"
  | "name"
  | "custom";

interface AutoCategorizeApplyOptions {
  processedAppIds?: Iterable<number>;
}

export function applyAutoCategorizeAssignments(
  collections: SteamCollection[],
  assignments: Record<string, number[]>,
  timestamp = Math.floor(Date.now() / 1000),
  options: AutoCategorizeApplyOptions = {}
): SteamCollection[] {
  const assignmentEntries = normalizeAssignments(assignments);
  const usedKeys = new Set(collections.map((collection) => collection.key));
  const matchedAssignmentNames = new Set<string>();
  const processedAppIds = options.processedAppIds
    ? new Set([...options.processedAppIds].filter((id) => Number.isFinite(id)).map((id) => Math.trunc(id)))
    : null;

  const nextCollections = collections.map((collection) => {
    if (collection.is_dynamic) return collection;

    const assignment = assignmentEntries.get(normalizeCategoryName(collection.name));
    if (!assignment) return collection;

    matchedAssignmentNames.add(assignment.normalizedName);
    const preserved = processedAppIds
      ? collection.added.filter((appId) => !processedAppIds.has(appId))
      : [];
    return {
      ...collection,
      name: assignment.name,
      added: uniqueSortedIds([...preserved, ...assignment.added]),
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    };
  });

  for (const assignment of assignmentEntries.values()) {
    if (matchedAssignmentNames.has(assignment.normalizedName)) continue;

    const id = uniqueAutoCollectionId(assignment.name, usedKeys);
    const key = `user-collections.${id}`;
    usedKeys.add(key);
    nextCollections.push({
      id,
      key,
      name: assignment.name,
      added: assignment.added,
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    });
  }

  return nextCollections;
}

export function withExpectedAutoCategories(
  result: CategorizeResult,
  type: AutoCategorizeApplyType,
  config: unknown
): CategorizeResult {
  const expected = expectedAutoCategoryNames(type, config);
  if (expected.length === 0) return result;

  const assignments: Record<string, number[]> = { ...result.assignments };
  for (const name of expected) {
    if (!(name in assignments)) {
      assignments[name] = [];
    }
  }

  return { ...result, assignments };
}

export function expectedAutoCategoryNames(
  type: AutoCategorizeApplyType,
  config: unknown
): string[] {
  if (type === "hours" || type === "hltb") {
    const hoursConfig = config as Partial<HoursConfig>;
    const names = (hoursConfig.rules ?? [])
      .map((rule) => prefixedName(hoursConfig.prefix, rule.name))
      .filter((name) => name.length > 0);
    if (type === "hltb" && hoursConfig.include_unknown) {
      names.push(hltbUnknownCategoryName(hoursConfig));
    }
    return names;
  }

  if (type === "score") {
    return ["Must-Play", "Great", "Good", "Mixed", "Poor"];
  }

  if (type === "rating") {
    return expectedSteamRatingCategoryNames(config as SteamRatingConfig);
  }

  if (type === "platform") {
    const platformConfig = config as Partial<PlatformConfig>;
    const names: string[] = [];
    if (platformConfig.include_windows) names.push("Windows");
    if (platformConfig.include_mac) names.push("macOS");
    if (platformConfig.include_linux) names.push("Linux");
    return names.map((name) => prefixedName(platformConfig.prefix, name));
  }

  if (type === "tags") {
    const tagsConfig = config as Partial<TagsConfig>;
    return (tagsConfig.included_tags ?? [])
      .map((name) => prefixedName(tagsConfig.prefix, name))
      .filter((name) => name.length > 0);
  }

  if (type === "flags") {
    const flagsConfig = config as Partial<FlagsConfig>;
    return (flagsConfig.included_flags ?? [])
      .map((name) => prefixedName(flagsConfig.prefix, name))
      .filter((name) => name.length > 0);
  }

  if (type === "language") {
    const languageConfig = config as Partial<LanguageConfig>;
    return (languageConfig.included_languages ?? [])
      .map((name) => prefixedName(languageConfig.prefix, name))
      .filter((name) => name.length > 0);
  }

  if (type === "custom") {
    const customConfig = config as Partial<CustomAutoCatConfigV1>;
    const name = customConfig.output?.categoryName?.trim();
    return name ? [name] : [];
  }

  return [];
}

function normalizeAssignments(assignments: Record<string, number[]>) {
  const entries = new Map<
    string,
    { name: string; normalizedName: string; added: number[] }
  >();

  for (const [rawName, appIds] of Object.entries(assignments)) {
    const name = rawName.trim();
    if (!name) continue;

    const normalizedName = normalizeCategoryName(name);
    const existing = entries.get(normalizedName);
    if (existing) {
      existing.added = uniqueSortedIds([...existing.added, ...appIds]);
    } else {
      entries.set(normalizedName, {
        name,
        normalizedName,
        added: uniqueSortedIds(appIds),
      });
    }
  }

  return entries;
}

function uniqueSortedIds(appIds: number[]): number[] {
  return [...new Set(appIds.filter((id) => Number.isFinite(id)))]
    .map((id) => Math.trunc(id))
    .sort((a, b) => a - b);
}

function uniqueAutoCollectionId(name: string, usedKeys: Set<string>): string {
  const base = `uc-auto-${hashName(name)}-${slugName(name)}`;
  let id = base;
  let suffix = 2;
  while (usedKeys.has(`user-collections.${id}`)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (const char of normalizeCategoryName(name)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function slugName(name: string): string {
  const slug = normalizeCategoryName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "category";
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function prefixedName(prefix: string | undefined, name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) return "";
  return `${prefix ?? ""}${trimmedName}`;
}
