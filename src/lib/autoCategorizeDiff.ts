import { applyAutoCategorizeAssignments } from "./autoCategorizeApply";
import type { AutoCategorizeApplyType } from "./autoCategorizeApply";
import type { CategorizeResult } from "./tauri";
import type { SteamCollection } from "./types";

export interface AutoCategorizeDiffRule {
  type: AutoCategorizeApplyType;
  name?: string;
  config: unknown;
}

export interface AutoCategorizeCategoryDiff {
  name: string;
  created: boolean;
  addedAppIds: number[];
  removedAppIds: number[];
}

export interface AutoCategorizeDiffDocument {
  schema: "repressurizer.autocat-preview-diff";
  version: 1;
  preview: {
    categories: number;
    gamesCategorized: number;
    gamesProcessed: number;
  };
  changes: {
    categoriesChanged: number;
    membershipsAdded: number;
    membershipsRemoved: number;
  };
  rules: Array<{
    type: AutoCategorizeApplyType;
    name?: string;
    config: unknown;
  }>;
  categories: AutoCategorizeCategoryDiff[];
}

const SENSITIVE_METADATA_KEY = /(?:api.?key|token|cookie|secret|password|credential|bearer|path|directory|folder)/i;
const VOLATILE_METADATA_KEYS = new Set(["id", "createdAt", "updatedAt"]);

export function buildAutoCategorizeDiff(
  collections: SteamCollection[],
  result: CategorizeResult,
  rules: AutoCategorizeDiffRule[],
): AutoCategorizeDiffDocument {
  const nextCollections = applyAutoCategorizeAssignments(
    collections,
    result.assignments,
    0,
    {
      processedAppIds: result.processed_app_ids,
      processedAppIdsByCategory: result.processed_app_ids_by_category,
    },
  );
  const categories = Object.keys(result.assignments)
    .map((name) => categoryDiff(name, collections, nextCollections))
    .sort((a, b) => compareText(a.name, b.name));
  const membershipsAdded = categories.reduce((total, category) => total + category.addedAppIds.length, 0);
  const membershipsRemoved = categories.reduce((total, category) => total + category.removedAppIds.length, 0);

  return {
    schema: "repressurizer.autocat-preview-diff",
    version: 1,
    preview: {
      categories: Object.keys(result.assignments).length,
      gamesCategorized: result.games_categorized,
      gamesProcessed: result.games_processed,
    },
    changes: {
      categoriesChanged: categories.filter(
        (category) => category.created || category.addedAppIds.length > 0 || category.removedAppIds.length > 0,
      ).length,
      membershipsAdded,
      membershipsRemoved,
    },
    rules: rules.map((rule) => ({
      type: rule.type,
      ...(rule.name?.trim() ? { name: rule.name.trim() } : {}),
      config: sanitizeRuleMetadata(rule.config),
    })),
    categories,
  };
}

export function serializeAutoCategorizeDiff(document: AutoCategorizeDiffDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function categoryDiff(
  name: string,
  beforeCollections: SteamCollection[],
  afterCollections: SteamCollection[],
): AutoCategorizeCategoryDiff {
  const normalizedName = normalizeCategoryName(name);
  const before = beforeCollections.find(
    (collection) => !collection.is_dynamic && normalizeCategoryName(collection.name) === normalizedName,
  );
  const after = afterCollections.find(
    (collection) => !collection.is_dynamic && normalizeCategoryName(collection.name) === normalizedName,
  );
  const beforeIds = new Set(before?.added ?? []);
  const afterIds = new Set(after?.added ?? []);

  return {
    name: name.trim(),
    created: !before && !!after,
    addedAppIds: sortedIds([...afterIds].filter((appId) => !beforeIds.has(appId))),
    removedAppIds: sortedIds([...beforeIds].filter((appId) => !afterIds.has(appId))),
  };
}

function sanitizeRuleMetadata(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(sanitizeRuleMetadata);
  if (typeof value !== "object") return null;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_METADATA_KEY.test(key) && !VOLATILE_METADATA_KEYS.has(key))
      .sort(([a], [b]) => compareText(a, b))
      .map(([key, nested]) => [key, sanitizeRuleMetadata(nested)]),
  );
}

function sortedIds(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite).map(Math.trunc))].sort((a, b) => a - b);
}

function normalizeCategoryName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function compareText(a: string, b: string): number {
  const left = a.toLocaleLowerCase("en-US");
  const right = b.toLocaleLowerCase("en-US");
  return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
