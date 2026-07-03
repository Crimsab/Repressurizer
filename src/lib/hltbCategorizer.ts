import { HLTB_MAX_FAILS } from "./fetchGuards";
import { getHltbHours } from "./hltb";
import type { CategorizeResult, HltbData, HoursConfig } from "./tauri";
import type { HltbTimeMode, OwnedGame } from "./types";

export function hltbModeForConfig(config: Partial<HoursConfig>, fallback?: HltbTimeMode): HltbTimeMode {
  return config.hltb_time_mode ?? fallback ?? "main_story";
}

export function hltbUnknownCategoryName(config: Partial<HoursConfig>): string {
  return config.unknown_text?.trim() || "HLTB: Unknown";
}

export function isConfirmedHltbUnknown(appId: number, ignoredFails: Record<number, number>): boolean {
  return (ignoredFails[appId] ?? 0) >= HLTB_MAX_FAILS;
}

export function categorizeByHltb(
  games: OwnedGame[],
  hltbData: Record<number, HltbData>,
  ignoredFails: Record<number, number>,
  config: HoursConfig
): CategorizeResult {
  const assignments: Record<string, number[]> = {};
  let categorized = 0;
  const mode = hltbModeForConfig(config);

  for (const game of games) {
    const hltb = hltbData[game.appid];
    const hours = getHltbHours(hltb, mode);

    if (hours == null) {
      if (config.include_unknown && isConfirmedHltbUnknown(game.appid, ignoredFails)) {
        const name = hltbUnknownCategoryName(config);
        if (!assignments[name]) assignments[name] = [];
        assignments[name].push(game.appid);
        categorized++;
      }
      continue;
    }

    for (const rule of config.rules) {
      const inMin = hours >= rule.min_hours;
      const inMax = rule.max_hours === 0 || hours < rule.max_hours;
      if (inMin && inMax) {
        const name = (config.prefix ?? "") + rule.name;
        if (!assignments[name]) assignments[name] = [];
        assignments[name].push(game.appid);
        categorized++;
        break;
      }
    }
  }

  return {
    assignments,
    games_processed: games.length,
    games_categorized: categorized,
  };
}

export function hltbProcessedAppIds(
  games: OwnedGame[],
  hltbData: Record<number, HltbData>,
  ignoredFails: Record<number, number>,
  config: HoursConfig
): number[] {
  const mode = hltbModeForConfig(config);
  return games
    .filter((game) => {
      if (getHltbHours(hltbData[game.appid], mode) != null) return true;
      return Boolean(config.include_unknown && isConfirmedHltbUnknown(game.appid, ignoredFails));
    })
    .map((game) => game.appid);
}
