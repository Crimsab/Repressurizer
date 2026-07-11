import type { CategorizeResult } from "./tauri";

interface CombinedCategory {
  name: string;
  assigned: Set<number>;
  processed: Set<number>;
}

export function combineAutoCategorizePresetResults(
  results: CategorizeResult[],
  fallbackGamesProcessed = 0
): CategorizeResult {
  const categories = new Map<string, CombinedCategory>();
  const processed = new Set<number>();
  const categorized = new Set<number>();

  for (const result of results) {
    const resultProcessed = normalizedIds(result.processed_app_ids ?? []);
    for (const appId of resultProcessed) processed.add(appId);

    for (const [rawName, rawAssigned] of Object.entries(result.assignments)) {
      const name = rawName.trim();
      if (!name) continue;

      const key = normalizeCategoryName(name);
      const assigned = normalizedIds(rawAssigned);
      const categoryProcessed = normalizedIds(
        result.processed_app_ids_by_category?.[rawName] ?? result.processed_app_ids ?? []
      );
      const existing = categories.get(key);

      if (existing) {
        for (const appId of assigned) existing.assigned.add(appId);
        existing.processed = intersect(existing.processed, categoryProcessed);
      } else {
        categories.set(key, {
          name,
          assigned,
          processed: categoryProcessed,
        });
      }

      for (const appId of assigned) categorized.add(appId);
    }
  }

  const ordered = [...categories.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    assignments: Object.fromEntries(
      ordered.map((category) => [category.name, sortedIds(category.assigned)])
    ),
    games_processed: processed.size || fallbackGamesProcessed,
    games_categorized: categorized.size,
    processed_app_ids: processed.size > 0 ? sortedIds(processed) : undefined,
    processed_app_ids_by_category: Object.fromEntries(
      ordered.map((category) => [category.name, sortedIds(category.processed)])
    ),
  };
}

function normalizedIds(appIds: Iterable<number>): Set<number> {
  return new Set(
    [...appIds]
      .filter((id) => Number.isFinite(id))
      .map((id) => Math.trunc(id))
  );
}

function sortedIds(appIds: Iterable<number>): number[] {
  return [...appIds].sort((a, b) => a - b);
}

function intersect(left: Set<number>, right: Set<number>): Set<number> {
  return new Set([...left].filter((appId) => right.has(appId)));
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase();
}
