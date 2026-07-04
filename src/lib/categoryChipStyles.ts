import type { CSSProperties } from "react";
import { colorWithAlpha, normalizeHexColor } from "./categoryColors";
import type { CategoryChipPresetId, CategoryChipStyleSettings } from "./types";

export const CATEGORY_CHIP_PRESETS: Array<{
  id: CategoryChipPresetId;
  label: string;
  description: string;
  settings: CategoryChipStyleSettings;
}> = [
  {
    id: "softOutlineCompact",
    label: "Soft outline compact",
    description: "Small translucent chip with a subtle colored border.",
    settings: {
      preset: "softOutlineCompact",
      fillOpacity: 14,
      borderOpacity: 42,
      borderWidth: 1,
      radius: 6,
      fontSize: 10,
      height: 18,
      maxWidth: 88,
      coloredText: true,
      showRemoveButton: true,
    },
  },
  {
    id: "solidReadable",
    label: "Solid readable badge",
    description: "Stronger fill and more readable text for dense libraries.",
    settings: {
      preset: "solidReadable",
      fillOpacity: 82,
      borderOpacity: 95,
      borderWidth: 1,
      radius: 7,
      fontSize: 11,
      height: 22,
      maxWidth: 128,
      coloredText: false,
      showRemoveButton: true,
    },
  },
  {
    id: "squareOutline",
    label: "Square outline label",
    description: "Crisp corners with a clear border and subtle fill.",
    settings: {
      preset: "squareOutline",
      fillOpacity: 8,
      borderOpacity: 82,
      borderWidth: 1,
      radius: 2,
      fontSize: 10,
      height: 20,
      maxWidth: 112,
      coloredText: true,
      showRemoveButton: true,
    },
  },
  {
    id: "roundCapsule",
    label: "Round capsule badge",
    description: "Pill-shaped badge with comfortable spacing.",
    settings: {
      preset: "roundCapsule",
      fillOpacity: 18,
      borderOpacity: 55,
      borderWidth: 1,
      radius: 999,
      fontSize: 11,
      height: 22,
      maxWidth: 132,
      coloredText: true,
      showRemoveButton: true,
    },
  },
  {
    id: "dotLabel",
    label: "Dot and label",
    description: "Minimal colored dot with plain text.",
    settings: {
      preset: "dotLabel",
      fillOpacity: 0,
      borderOpacity: 0,
      borderWidth: 0,
      radius: 999,
      fontSize: 11,
      height: 20,
      maxWidth: 140,
      coloredText: false,
      showRemoveButton: false,
    },
  },
];

export const DEFAULT_CATEGORY_CHIP_STYLE = CATEGORY_CHIP_PRESETS[0].settings;

const PRESET_IDS = new Set<CategoryChipPresetId>(CATEGORY_CHIP_PRESETS.map((preset) => preset.id));

export function categoryChipPresetSettings(presetId: CategoryChipPresetId): CategoryChipStyleSettings {
  return { ...(CATEGORY_CHIP_PRESETS.find((preset) => preset.id === presetId)?.settings ?? DEFAULT_CATEGORY_CHIP_STYLE) };
}

export function normalizeCategoryChipStyle(raw: unknown): CategoryChipStyleSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CATEGORY_CHIP_STYLE };
  const value = raw as Partial<CategoryChipStyleSettings>;
  const preset = PRESET_IDS.has(value.preset as CategoryChipPresetId)
    ? value.preset as CategoryChipPresetId
    : DEFAULT_CATEGORY_CHIP_STYLE.preset;
  const base = categoryChipPresetSettings(preset);
  return {
    preset,
    fillOpacity: clampNumber(value.fillOpacity, base.fillOpacity, 0, 100),
    borderOpacity: clampNumber(value.borderOpacity, base.borderOpacity, 0, 100),
    borderWidth: clampNumber(value.borderWidth, base.borderWidth, 0, 3),
    radius: clampNumber(value.radius, base.radius, 0, 999),
    fontSize: clampNumber(value.fontSize, base.fontSize, 9, 13),
    height: clampNumber(value.height, base.height, 16, 28),
    maxWidth: clampNumber(value.maxWidth, base.maxWidth, 56, 180),
    coloredText: value.coloredText === undefined ? base.coloredText : value.coloredText === true,
    showRemoveButton: value.showRemoveButton === undefined ? base.showRemoveButton : value.showRemoveButton === true,
  };
}

export function categoryChipSurfaceStyle(
  color: string | null,
  settings: CategoryChipStyleSettings
): CSSProperties {
  const normalized = normalizeHexColor(color);
  const borderColor = normalized ? colorWithAlpha(normalized, settings.borderOpacity / 100) : undefined;
  const backgroundColor = normalized ? colorWithAlpha(normalized, settings.fillOpacity / 100) : undefined;
  return {
    height: `${settings.height}px`,
    maxWidth: `${settings.maxWidth}px`,
    borderRadius: settings.radius >= 900 ? "999px" : `${settings.radius}px`,
    borderWidth: `${settings.borderWidth}px`,
    borderColor,
    backgroundColor,
    color: settings.coloredText && normalized ? normalized : undefined,
    fontSize: `${settings.fontSize}px`,
    lineHeight: "1",
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}
