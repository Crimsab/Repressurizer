import type { HltbData } from "./tauri";
import type { HltbTimeMode } from "./types";

export const HLTB_TIME_MODES: HltbTimeMode[] = [
  "main_story",
  "main_extra",
  "completionist",
  "first_available",
];

export function isHltbTimeMode(value: unknown): value is HltbTimeMode {
  return typeof value === "string" && HLTB_TIME_MODES.includes(value as HltbTimeMode);
}

export function hltbModeLabel(mode: HltbTimeMode): string {
  switch (mode) {
    case "main_extra":
      return "Main + Extras";
    case "completionist":
      return "Completionist";
    case "first_available":
      return "First available";
    case "main_story":
    default:
      return "Main Story";
  }
}

export function getHltbHours(
  hltb: Pick<HltbData, "main_story" | "main_extra" | "completionist"> | null | undefined,
  mode: HltbTimeMode
): number | null {
  if (!hltb) return null;

  switch (mode) {
    case "main_extra":
      return hltb.main_extra ?? null;
    case "completionist":
      return hltb.completionist ?? null;
    case "first_available":
      return hltb.main_story ?? hltb.main_extra ?? hltb.completionist ?? null;
    case "main_story":
    default:
      return hltb.main_story ?? null;
  }
}
