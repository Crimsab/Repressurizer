import {
  detailsCacheNeedsRefresh,
  isDetailsCacheCurrent,
} from "../../../stores/gameStore";
import type {
  AutoCategorizePreset,
  AutoCategorizePresetConfig,
} from "../../../stores/autoCategorizeStore";
import {
  customDetailIdsNeedingFetch,
  customNeedsDetails,
  customNeedsRatings,
  customRatingIdsNeedingFetch,
  customReleaseDateIdsNeedingFetch,
  normalizeCustomAutoCatConfig,
  type CustomRuleDiagnostics,
} from "../../../lib/customAutoCategorize";
import {
  storeReleaseDateNeedsRefresh,
  yearCategorizationReleaseDate,
} from "../../../lib/releaseDates";
import { extractReleaseYear } from "../../../lib/search";
import {
  isSteamRatingFresh,
  steamRatingIdsNeedingFetch,
} from "../../../lib/steamRatings";
import type { CategorizeResult, HoursConfig } from "../../../lib/tauri";
import type {
  GameDetails,
  OwnedGame,
  SteamReviewSummary,
} from "../../../lib/types";

export type CategorizerType =
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

export type CategorizerRequirement = "details" | "releaseDates" | "ratings" | "hltb";

export type AutoCategorizeStep = "choose" | "configure" | "fetch" | "preview" | "done";
export type AutoCategorizeFetchKind = "details" | "ratings" | "releaseDates";

export const DEFAULT_HLTB_CONFIG: HoursConfig = {
  prefix: "",
  hltb_time_mode: "main_story",
  include_unknown: false,
  unknown_text: "HLTB: Unknown",
  rules: [
    { name: "Very Short (< 5h)", min_hours: 0, max_hours: 5 },
    { name: "Short (5–15h)", min_hours: 5, max_hours: 15 },
    { name: "Medium (15–30h)", min_hours: 15, max_hours: 30 },
    { name: "Long (30–60h)", min_hours: 30, max_hours: 60 },
    { name: "Very Long (60h+)", min_hours: 60, max_hours: 0 },
  ],
};

const DETAIL_CATEGORIZERS = new Set<CategorizerType>([
  "genre",
  "year",
  "score",
  "tags",
  "flags",
  "platform",
  "devpub",
  "language",
]);

export function categorizerNeedsDetails(
  type: CategorizerType,
  config?: AutoCategorizePresetConfig
): boolean {
  if (type === "custom") return customNeedsDetails(normalizeCustomAutoCatConfig(config));
  return DETAIL_CATEGORIZERS.has(type);
}

export function categorizerNeedsRatings(
  type: CategorizerType,
  config?: AutoCategorizePresetConfig
): boolean {
  if (type === "custom") return customNeedsRatings(normalizeCustomAutoCatConfig(config));
  return type === "rating";
}

export function categorizerRequirement(
  type: CategorizerType,
  config?: AutoCategorizePresetConfig
): CategorizerRequirement | null {
  if (type === "year") return "releaseDates";
  if (type === "rating") return "ratings";
  if (type === "hltb") return "hltb";
  if (categorizerNeedsDetails(type, config)) return "details";
  return null;
}

export function presetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AutoCatMetadata {
  totalDetails: number;
  flagValues: string[];
  tagValues: string[];
  genreValues: string[];
  languageValues: string[];
  studioValues: string[];
  gamesWithFlags: number;
  gamesWithTags: number;
  gamesWithGenres: number;
  gamesWithLanguages: number;
  gamesWithStudios: number;
}

export function buildAutoCatMetadata(details: GameDetails[]): AutoCatMetadata {
  const flagValues = new Set<string>();
  const tagValues = new Set<string>();
  const genreValues = new Set<string>();
  const languageValues = new Set<string>();
  const studioValues = new Set<string>();
  let gamesWithFlags = 0;
  let gamesWithTags = 0;
  let gamesWithGenres = 0;
  let gamesWithLanguages = 0;
  let gamesWithStudios = 0;

  for (const detail of details) {
    if ((detail.categories ?? []).length > 0) gamesWithFlags += 1;
    if ((detail.tags ?? []).length > 0) gamesWithTags += 1;
    if ((detail.genres ?? []).length > 0) gamesWithGenres += 1;
    if ((detail.supported_languages ?? []).length > 0) gamesWithLanguages += 1;
    if ((detail.developers ?? []).length > 0 || (detail.publishers ?? []).length > 0) {
      gamesWithStudios += 1;
    }

    for (const value of detail.categories ?? []) addCleanValue(flagValues, value);
    for (const value of detail.tags ?? []) addCleanValue(tagValues, value);
    for (const value of detail.genres ?? []) addCleanValue(genreValues, value);
    for (const value of detail.supported_languages ?? []) addCleanValue(languageValues, value);
    for (const value of detail.developers ?? []) addCleanValue(studioValues, value);
    for (const value of detail.publishers ?? []) addCleanValue(studioValues, value);
  }

  return {
    totalDetails: details.length,
    flagValues: sortValues([...flagValues]),
    tagValues: sortValues(tagValues.size > 0 ? [...tagValues] : [...flagValues]),
    genreValues: sortValues([...genreValues]),
    languageValues: sortValues([...languageValues]),
    studioValues: sortValues([...studioValues]),
    gamesWithFlags,
    gamesWithTags: gamesWithTags || gamesWithFlags,
    gamesWithGenres,
    gamesWithLanguages,
    gamesWithStudios,
  };
}

export function addCleanValue(target: Set<string>, value: string | null | undefined) {
  const clean = value?.trim();
  if (clean) target.add(clean);
}

export function sortValues(values: string[]): string[] {
  return values.sort((a, b) => a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  }));
}

export function detailNeedsFetchForType(
  type: CategorizerType,
  detail: GameDetails | undefined,
  detailsMaxAgeDays?: number,
  config?: AutoCategorizePresetConfig
): boolean {
  if (!categorizerNeedsDetails(type, config)) return false;
  if (detailsCacheNeedsRefresh(detail, detailsMaxAgeDays)) return true;
  if (type === "year") return storeReleaseDateNeedsRefresh(detail);
  return false;
}

export function detailNeedsBaseFetchForType(
  type: CategorizerType,
  detail: GameDetails | undefined,
  detailsMaxAgeDays?: number,
  config?: AutoCategorizePresetConfig
): boolean {
  return categorizerNeedsDetails(type, config) && detailsCacheNeedsRefresh(detail, detailsMaxAgeDays);
}

export function detailNeedsReleaseDateFetchForType(
  type: CategorizerType,
  detail: GameDetails | undefined,
  _config?: AutoCategorizePresetConfig
): boolean {
  if (type === "custom") return false;
  return type === "year" && isDetailsCacheCurrent(detail) && storeReleaseDateNeedsRefresh(detail);
}

export function detailHasDataForType(type: CategorizerType, detail: GameDetails | undefined, config?: AutoCategorizePresetConfig): boolean {
  if (!categorizerNeedsDetails(type, config)) return true;
  if (!detail || !isDetailsCacheCurrent(detail)) return false;
  if (type === "year") return extractReleaseYear(yearCategorizationReleaseDate(detail)) != null;
  if (type === "genre") return (detail.genres ?? []).length > 0;
  if (type === "tags") return (detail.tags ?? []).length > 0 || (detail.categories ?? []).length > 0;
  if (type === "flags") return (detail.categories ?? []).length > 0;
  if (type === "language") return (detail.supported_languages ?? []).length > 0;
  if (type === "devpub") {
    return (detail.developers ?? []).length > 0 || (detail.publishers ?? []).length > 0;
  }
  if (type === "platform") {
    const platforms = detail.platforms;
    return !!platforms && (platforms.windows || platforms.mac || platforms.linux);
  }

  return true;
}

export function detailIdsNeedingFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number,
  config?: AutoCategorizePresetConfig
): number[] {
  if (type === "custom") {
    const customConfig = normalizeCustomAutoCatConfig(config);
    return [
      ...new Set([
        ...customDetailIdsNeedingFetch(customConfig, games, details, detailsMaxAgeDays),
        ...customReleaseDateIdsNeedingFetch(customConfig, games, details),
      ]),
    ];
  }
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsFetchForType(type, details[id], detailsMaxAgeDays, config));
}

export function detailIdsNeedingBaseFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number,
  config?: AutoCategorizePresetConfig
): number[] {
  if (type === "custom") {
    return customDetailIdsNeedingFetch(normalizeCustomAutoCatConfig(config), games, details, detailsMaxAgeDays);
  }
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsBaseFetchForType(type, details[id], detailsMaxAgeDays, config));
}

export function detailIdsNeedingReleaseDateFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  config?: AutoCategorizePresetConfig
): number[] {
  if (type === "custom") {
    return customReleaseDateIdsNeedingFetch(normalizeCustomAutoCatConfig(config), games, details);
  }
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsReleaseDateFetchForType(type, details[id], config));
}

export function detailIdsReadyForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  config?: AutoCategorizePresetConfig
): number[] {
  if (!categorizerNeedsDetails(type, config)) return [];
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailHasDataForType(type, details[id], config));
}

export function detailsReadyForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  config?: AutoCategorizePresetConfig
): GameDetails[] {
  return detailIdsReadyForType(type, games, details, config)
    .map((id) => details[id])
    .filter((detail): detail is GameDetails => !!detail);
}

export function missingDetailIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => categorizerNeedsDetails(preset.type, preset.config))
        .flatMap((preset) => detailIdsNeedingFetchForType(preset.type, games, details, detailsMaxAgeDays, preset.config))
    ),
  ];
}

export function missingBaseDetailIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => categorizerNeedsDetails(preset.type, preset.config))
        .flatMap((preset) => detailIdsNeedingBaseFetchForType(preset.type, games, details, detailsMaxAgeDays, preset.config))
    ),
  ];
}

export function missingReleaseDateIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => preset.type === "year" || preset.type === "custom")
        .flatMap((preset) => detailIdsNeedingReleaseDateFetchForType(preset.type, games, details, preset.config))
    ),
  ];
}

export function canRunPresetsWithCache(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  ratings: Record<number, SteamReviewSummary>
): boolean {
  return presets.some((preset) => {
    if (categorizerNeedsRatings(preset.type, preset.config)) {
      return ratingIdsReady(games, ratings).length > 0;
    }
    if (!categorizerNeedsDetails(preset.type, preset.config)) return true;
    return detailIdsReadyForType(preset.type, games, details, preset.config).length > 0;
  });
}

export function ratingIdsReady(
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => isSteamRatingFresh(ratings[id]));
}

export function missingRatingIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>
): number[] {
  return [
    ...new Set(
      presets.flatMap((preset) =>
        preset.type === "custom"
          ? customRatingIdsNeedingFetch(normalizeCustomAutoCatConfig(preset.config), games, ratings)
          : categorizerNeedsRatings(preset.type, preset.config)
            ? steamRatingIdsNeedingFetch(games, ratings)
            : []
      )
    ),
  ];
}

export function withProcessedAppIds(result: CategorizeResult, ids: number[]): CategorizeResult {
  return {
    ...result,
    processed_app_ids: [...new Set(ids.filter((id) => Number.isFinite(id)).map((id) => Math.trunc(id)))],
  };
}

export function customDiagnosticsNotice(diagnostics: CustomRuleDiagnostics): string {
  if (diagnostics.invalidMessages.length > 0) return diagnostics.invalidMessages.join(" ");
  const skipped: string[] = [];
  if (diagnostics.skippedMissingHltb > 0) skipped.push(`${diagnostics.skippedMissingHltb} skipped missing HLTB`);
  if (diagnostics.skippedMissingDetails > 0) skipped.push(`${diagnostics.skippedMissingDetails} skipped missing details`);
  if (diagnostics.skippedMissingRatings > 0) skipped.push(`${diagnostics.skippedMissingRatings} skipped missing Steam reviews`);
  if (diagnostics.staleCategoryRefs.length > 0) {
    skipped.push(`Remove missing categories: ${diagnostics.staleCategoryRefs.map((item) => item.nameSnapshot || item.key).join(", ")}`);
  }
  return skipped.length > 0
    ? `${skipped.join(" · ")}. Skipped games are preserved on Apply.`
    : "";
}
