import type { SteamCollection } from "./types";

export type CategoryColorMap = Record<string, string>;

export const FAVORITE_CATEGORY_COLOR = "#D6A43A";

export const CATEGORY_COLOR_SWATCHES = [
  "#D6A43A",
  "#10B981",
  "#38BDF8",
  "#818CF8",
  "#A78BFA",
  "#F472B6",
  "#FB7185",
  "#F97316",
  "#84CC16",
  "#94A3B8",
] as const;

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    return `#${short[1]
      .split("")
      .map((part) => part + part)
      .join("")
      .toUpperCase()}`;
  }
  const long = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  return long ? `#${long[1].toUpperCase()}` : null;
}

export function normalizeCategoryColors(raw: unknown): CategoryColorMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const colors: CategoryColorMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.trim()) continue;
    const color = normalizeHexColor(value);
    if (color) colors[key] = color;
  }
  return colors;
}

export function isFavoriteCategory(collection: Pick<SteamCollection, "id" | "key" | "name">): boolean {
  const id = collection.id.toLowerCase();
  const key = collection.key.toLowerCase();
  const name = collection.name.trim().toLowerCase();
  return (
    id === "favorite" ||
    id === "favorites" ||
    key === "favorite" ||
    key === "favorites" ||
    key.endsWith(".favorite") ||
    key.endsWith(".favorites") ||
    name === "favorite" ||
    name === "favorites" ||
    name === "preferiti"
  );
}

export function getDefaultCategoryColor(collection: Pick<SteamCollection, "id" | "key" | "name">): string | null {
  return isFavoriteCategory(collection) ? FAVORITE_CATEGORY_COLOR : null;
}

export function getCategoryColor(
  collection: Pick<SteamCollection, "id" | "key" | "name">,
  colors: CategoryColorMap | undefined
): string | null {
  const byKey = normalizeHexColor(colors?.[collection.key]);
  if (byKey) return byKey;
  const byId = normalizeHexColor(colors?.[collection.id]);
  if (byId) return byId;
  return getDefaultCategoryColor(collection);
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return `rgba(255, 255, 255, ${alpha})`;
  const value = normalized.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function categoryPillStyle(color: string | null): Record<string, string> | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: colorWithAlpha(color, 0.14),
    borderColor: colorWithAlpha(color, 0.42),
    color,
  };
}
