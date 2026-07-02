import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
  detailsCacheNeedsRefresh,
  isDetailsCacheCurrent,
  useGameStore,
} from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  useAutoCategorizeStore,
  DEFAULT_STEAM_RATING_CONFIG,
  type AutoCategorizePreset,
  type AutoCategorizePresetConfig,
} from "../../stores/autoCategorizeStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useSteamRatingsStore } from "../../stores/steamRatingsStore";
import { MAX_FAIL_RUNS, useFailedGamesStore } from "../../stores/failedGamesStore";
import { HLTB_MAX_FAILS, useHltbIgnoredStore } from "../../stores/hltbIgnoredStore";
import { detailsPriceNeedsCurrencyRefresh } from "../../lib/prices";
import {
  storeReleaseDateNeedsRefresh,
  yearCategorizationReleaseDate,
} from "../../lib/releaseDates";
import { extractReleaseYear } from "../../lib/search";
import {
  applyAutoCategorizeAssignments,
  withExpectedAutoCategories,
} from "../../lib/autoCategorizeApply";
import {
  sortAutoCategorizePreviewEntries,
  type PreviewSortContext,
  type PreviewSortMode,
} from "../../lib/autoCategorizePreview";
import {
  categorizeBySteamRating,
  defaultSteamRatingRules,
  isSteamRatingFresh,
  steamRatingIdsNeedingFetch,
} from "../../lib/steamRatings";
import { getHltbHours, hltbModeLabel, HLTB_TIME_MODES } from "../../lib/hltb";
import {
  runHoursCategorizer,
  runGenreCategorizer,
  runTagsCategorizer,
  runYearCategorizer,
  runScoreCategorizer,
  runDevPubCategorizer,
  runFlagsCategorizer,
  runLanguageCategorizer,
  runPlatformCategorizer,
  runNameCategorizer,
  createManualBackup,
  type CategorizeResult,
  type HoursConfig,
  type GenreConfig,
  type TagsConfig,
  type YearConfig,
  type DevPubConfig,
  type FlagsConfig,
  type LanguageConfig,
  type PlatformConfig,
  type NameConfig,
  type SteamRatingConfig,
  type SteamRatingRule,
  type YearGrouping,
} from "../../lib/tauri";
import type { GameDetails, HltbTimeMode, OwnedGame, SteamReviewSummary } from "../../lib/types";
import type { HltbData } from "../../lib/tauri";
import {
  X,
  Clock,
  Tag,
  Playlist,
  Calendar,
  Star,
  Robot,
  ArrowRight,
  ArrowLeft,
  Check,
  Warning,
  Spinner,
  Plus,
  Trash,
  FolderSimplePlus,
  Timer,
  Buildings,
  Flag,
  Globe,
  Desktop,
  TextAa,
  FloppyDisk,
  ArrowUp,
  ArrowDown,
  CopySimple,
} from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";
import { SelectMenu } from "../ui/SelectMenu";

// ============================================================
// Types
// ============================================================

type CategorizerType =
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
  | "name";
type Step = "choose" | "configure" | "fetch" | "preview" | "done";
type FetchKind = "details" | "ratings" | "releaseDates";

const CATEGORIZERS: {
  value: CategorizerType;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  needsDetails: boolean;
  needsHltb: boolean;
  needsRatings: boolean;
  icon: typeof Clock;
}[] = [
  { value: "name", labelKey: "auto.byName", descriptionKey: "auto.byName.desc", needsDetails: false, needsHltb: false, needsRatings: false, icon: TextAa },
  { value: "genre", labelKey: "auto.byGenre", descriptionKey: "auto.byGenre.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Tag },
  { value: "year", labelKey: "auto.byYear", descriptionKey: "auto.byYear.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Calendar },
  { value: "rating", labelKey: "auto.byRating", descriptionKey: "auto.byRating.desc", needsDetails: false, needsHltb: false, needsRatings: true, icon: Star },
  { value: "score", labelKey: "auto.byScore", descriptionKey: "auto.byScore.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Star },
  { value: "tags", labelKey: "auto.byTags", descriptionKey: "auto.byTags.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Playlist },
  { value: "flags", labelKey: "auto.byFlags", descriptionKey: "auto.byFlags.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Flag },
  { value: "hltb", labelKey: "auto.byHltb", descriptionKey: "auto.byHltb.desc", needsDetails: false, needsHltb: true, needsRatings: false, icon: Timer },
  { value: "hours", labelKey: "auto.byPlaytime", descriptionKey: "auto.byPlaytime.desc", needsDetails: false, needsHltb: false, needsRatings: false, icon: Clock },
  { value: "platform", labelKey: "auto.byPlatform", descriptionKey: "auto.byPlatform.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Desktop },
  { value: "devpub", labelKey: "auto.byDevPub", descriptionKey: "auto.byDevPub.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Buildings },
  { value: "language", labelKey: "auto.byLanguage", descriptionKey: "auto.byLanguage.desc", needsDetails: true, needsHltb: false, needsRatings: false, icon: Globe },
];

const DEFAULT_HLTB_CONFIG: HoursConfig = {
  prefix: "",
  hltb_time_mode: "main_story",
  rules: [
    { name: "Very Short (< 5h)", min_hours: 0, max_hours: 5 },
    { name: "Short (5–15h)", min_hours: 5, max_hours: 15 },
    { name: "Medium (15–30h)", min_hours: 15, max_hours: 30 },
    { name: "Long (30–60h)", min_hours: 30, max_hours: 60 },
    { name: "Very Long (60h+)", min_hours: 60, max_hours: 0 },
  ],
};

function categorizerLabel(type: CategorizerType, t: ReturnType<typeof useT>): string {
  const option = CATEGORIZERS.find((item) => item.value === type);
  if (!option) return type;
  return t(option.labelKey);
}

function categorizerNeedsDetails(type: CategorizerType): boolean {
  return CATEGORIZERS.find((item) => item.value === type)?.needsDetails ?? false;
}

function categorizerNeedsRatings(type: CategorizerType): boolean {
  return CATEGORIZERS.find((item) => item.value === type)?.needsRatings ?? false;
}

function presetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AutoCatMetadata {
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

function buildAutoCatMetadata(details: GameDetails[]): AutoCatMetadata {
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

function addCleanValue(target: Set<string>, value: string | null | undefined) {
  const clean = value?.trim();
  if (clean) target.add(clean);
}

function sortValues(values: string[]): string[] {
  return values.sort((a, b) => a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  }));
}

function detailNeedsFetchForType(
  type: CategorizerType,
  detail: GameDetails | undefined,
  detailsMaxAgeDays?: number
): boolean {
  if (!categorizerNeedsDetails(type)) return false;
  if (detailsCacheNeedsRefresh(detail, detailsMaxAgeDays)) return true;
  if (type === "year") return storeReleaseDateNeedsRefresh(detail);
  return false;
}

function detailNeedsBaseFetchForType(
  type: CategorizerType,
  detail: GameDetails | undefined,
  detailsMaxAgeDays?: number
): boolean {
  return categorizerNeedsDetails(type) && detailsCacheNeedsRefresh(detail, detailsMaxAgeDays);
}

function detailNeedsReleaseDateFetchForType(type: CategorizerType, detail: GameDetails | undefined): boolean {
  return type === "year" && isDetailsCacheCurrent(detail) && storeReleaseDateNeedsRefresh(detail);
}

function detailHasDataForType(type: CategorizerType, detail: GameDetails | undefined): boolean {
  if (!categorizerNeedsDetails(type)) return true;
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

function detailIdsNeedingFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsFetchForType(type, details[id], detailsMaxAgeDays));
}

function detailIdsNeedingBaseFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsBaseFetchForType(type, details[id], detailsMaxAgeDays));
}

function detailIdsNeedingReleaseDateFetchForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailNeedsReleaseDateFetchForType(type, details[id]));
}

function detailIdsReadyForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): number[] {
  if (!categorizerNeedsDetails(type)) return [];
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailHasDataForType(type, details[id]));
}

function detailsReadyForType(
  type: CategorizerType,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): GameDetails[] {
  return detailIdsReadyForType(type, games, details)
    .map((id) => details[id])
    .filter((detail): detail is GameDetails => !!detail);
}

function missingDetailIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => categorizerNeedsDetails(preset.type))
        .flatMap((preset) => detailIdsNeedingFetchForType(preset.type, games, details, detailsMaxAgeDays))
    ),
  ];
}

function missingBaseDetailIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => categorizerNeedsDetails(preset.type))
        .flatMap((preset) => detailIdsNeedingBaseFetchForType(preset.type, games, details, detailsMaxAgeDays))
    ),
  ];
}

function missingReleaseDateIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): number[] {
  return [
    ...new Set(
      presets
        .filter((preset) => preset.type === "year")
        .flatMap((preset) => detailIdsNeedingReleaseDateFetchForType(preset.type, games, details))
    ),
  ];
}

function canRunPresetsWithCache(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  ratings: Record<number, SteamReviewSummary>
): boolean {
  return presets.some((preset) => {
    if (categorizerNeedsRatings(preset.type)) {
      return ratingIdsReady(games, ratings).length > 0;
    }
    if (!categorizerNeedsDetails(preset.type)) return true;
    return detailIdsReadyForType(preset.type, games, details).length > 0;
  });
}

function ratingIdsReady(
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>
): number[] {
  return Object.keys(games)
    .map(Number)
    .filter((id) => isSteamRatingFresh(ratings[id]));
}

function missingRatingIdsForPresets(
  presets: AutoCategorizePreset[],
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>
): number[] {
  return presets.some((preset) => categorizerNeedsRatings(preset.type))
    ? steamRatingIdsNeedingFetch(games, ratings)
    : [];
}

// Pure JS HLTB categorizer
function runHltbCategorizerJs(
  games: OwnedGame[],
  hltbData: Record<number, HltbData>,
  config: HoursConfig
): CategorizeResult {
  const assignments: Record<string, number[]> = {};
  let categorized = 0;

  for (const game of games) {
    const hltb = hltbData[game.appid];
    const hours = getHltbHours(hltb, hltbModeForConfig(config));
    if (hours == null) continue;

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

function hltbModeForConfig(config: Partial<HoursConfig>, fallback?: HltbTimeMode): HltbTimeMode {
  return config.hltb_time_mode ?? fallback ?? "main_story";
}

function withProcessedAppIds(result: CategorizeResult, ids: number[]): CategorizeResult {
  return {
    ...result,
    processed_app_ids: [...new Set(ids.filter((id) => Number.isFinite(id)).map((id) => Math.trunc(id)))],
  };
}

// ============================================================
// Main dialog
// ============================================================

interface AutoCategorizeDialogProps {
  onClose: () => void;
}

export function AutoCategorizeDialog({ onClose }: AutoCategorizeDialogProps) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const ratings = useSteamRatingsStore((s) => s.ratings);
  const collections = useCategoryStore((s) => s.collections);
  const applyImportedCollections = useCategoryStore((s) => s.applyImportedCollections);
  const steamPath = useSettingsStore((s) => s.steamPath);
  const steamId3 = useSettingsStore((s) => s.steamId3);
  const hltbData = useHltbStore((s) => s.data);
  const hltbTimeMode = useSettingsStore((s) => s.hltbTimeMode);
  const detailsCacheMaxAgeDays = useSettingsStore((s) => s.detailsCacheMaxAgeDays);

  const persist = useAutoCategorizeStore();

  // Background fetch store
  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const ratingsRunning = useBackgroundFetchStore((s) => s.ratingsRunning);
  const ratingsFetched = useBackgroundFetchStore((s) => s.ratingsFetched);
  const ratingsTotal = useBackgroundFetchStore((s) => s.ratingsTotal);
  const ratingsCoolingDown = useBackgroundFetchStore((s) => s.ratingsCoolingDown);
  const ratingsCooldownSecs = useBackgroundFetchStore((s) => s.ratingsCooldownSecs);
  const releaseDatesRunning = useBackgroundFetchStore((s) => s.releaseDatesRunning);
  const releaseDatesFetched = useBackgroundFetchStore((s) => s.releaseDatesFetched);
  const releaseDatesTotal = useBackgroundFetchStore((s) => s.releaseDatesTotal);
  const { startDetailsFetch, startRatingsFetch, startStoreReleaseDateFetch } = useBackgroundFetchStore.getState();

  // Local step — "fetch" isn't persisted; "done" resets to "choose" on reopen
  const [step, setStep] = useState<Step>(() => {
    if (useBackgroundFetchStore.getState().detailsRunning) return "fetch";
    if (useBackgroundFetchStore.getState().releaseDatesRunning) return "fetch";
    if (useBackgroundFetchStore.getState().ratingsRunning) return "fetch";
    if (persist.lastStep === "done") return "choose";
    return persist.lastStep;
  });
  const [type, setType] = useState<CategorizerType>(persist.lastType);
  const [hoursConfig, setHoursConfig] = useState<HoursConfig>(persist.hoursConfig);
  const [genreConfig, setGenreConfig] = useState<GenreConfig>(persist.genreConfig);
  const [tagsConfig, setTagsConfig] = useState<TagsConfig>(persist.tagsConfig);
  const [yearConfig, setYearConfig] = useState<YearConfig>(persist.yearConfig);
  const [devPubConfig, setDevPubConfig] = useState<DevPubConfig>(persist.devPubConfig);
  const [flagsConfig, setFlagsConfig] = useState<FlagsConfig>(persist.flagsConfig);
  const [languageConfig, setLanguageConfig] = useState<LanguageConfig>(persist.languageConfig);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(persist.platformConfig);
  const [nameConfig, setNameConfig] = useState<NameConfig>(persist.nameConfig);
  const [ratingConfig, setRatingConfig] = useState<SteamRatingConfig>(
    persist.ratingConfig ?? DEFAULT_STEAM_RATING_CONFIG
  );
  const [hltbConfig, setHltbConfig] = useState<HoursConfig>({
    ...DEFAULT_HLTB_CONFIG,
    hltb_time_mode: hltbTimeMode,
  });
  const [presetName, setPresetName] = useState("");
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);

  // Whether we're waiting for a details fetch to complete before running categorizer
  const [waitingForFetch, setWaitingForFetch] = useState(() => {
    const background = useBackgroundFetchStore.getState();
    return background.detailsRunning || background.ratingsRunning || background.releaseDatesRunning;
  });
  const [fetchKind, setFetchKind] = useState<FetchKind | null>(() => {
    const background = useBackgroundFetchStore.getState();
    if (background.ratingsRunning) return "ratings";
    if (background.releaseDatesRunning) return "releaseDates";
    if (background.detailsRunning) return "details";
    return null;
  });
  const [pendingPresetRun, setPendingPresetRun] = useState<AutoCategorizePreset[] | null>(null);

  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState<CategorizeResult | null>(persist.lastResult);
  const [previewContext, setPreviewContext] = useState<PreviewSortContext | null>(null);
  const [previewNotice, setPreviewNotice] = useState("");
  const [runError, setRunError] = useState("");

  const categorizer = CATEGORIZERS.find((c) => c.value === type)!;
  const metadata = useMemo(
    () => buildAutoCatMetadata(Object.values(details).filter(isDetailsCacheCurrent)),
    [details]
  );

  // When a background fetch completes and we were waiting: run categorizer.
  useEffect(() => {
    const activeFetchDone =
      (fetchKind === "details" && !detailsRunning) ||
      (fetchKind === "releaseDates" && !releaseDatesRunning) ||
      (fetchKind === "ratings" && !ratingsRunning);
    if (waitingForFetch && activeFetchDone) {
      if (fetchKind !== "releaseDates" && categorizerNeedsDetails(type)) {
        const missingReleaseDates = detailIdsNeedingReleaseDateFetchForType(type, games, details);
        if (missingReleaseDates.length > 0) {
          setFetchKind("releaseDates");
          if (!releaseDatesRunning) {
            startStoreReleaseDateFetch(fetchItemsForIds(missingReleaseDates));
          }
          return;
        }
      }
      setWaitingForFetch(false);
      setFetchKind(null);
      runCategorizer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsRunning, ratingsRunning, releaseDatesRunning, waitingForFetch, fetchKind, details, games, type]);

  useEffect(() => {
    if (!pendingPresetRun || detailsRunning || ratingsRunning || releaseDatesRunning) return;
    const queue = pendingPresetRun;
    if (startMissingPresetFetch(queue)) return;
    setPendingPresetRun(null);
    runPresetSequence(queue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsRunning, ratingsRunning, releaseDatesRunning, pendingPresetRun, details, ratings]);

  // Helper to sync step to store (skip "fetch")
  const gotoStep = (s: Step) => {
    setStep(s);
    if (s !== "fetch") persist.set({ lastStep: s });
  };

  // ---- Step: choose ----
  const handleChoose = (t: CategorizerType) => {
    setType(t);
    setPresetName("");
    setLoadedPresetId(null);
    persist.set({ lastType: t });
    gotoStep("configure");
  };

  const currentConfig = useCallback((): AutoCategorizePresetConfig => {
    if (type === "hours") return hoursConfig;
    if (type === "genre") return genreConfig;
    if (type === "tags") return tagsConfig;
    if (type === "year") return yearConfig;
    if (type === "devpub") return devPubConfig;
    if (type === "flags") return flagsConfig;
    if (type === "language") return languageConfig;
    if (type === "platform") return platformConfig;
    if (type === "name") return nameConfig;
    if (type === "rating") return ratingConfig;
    if (type === "hltb") return hltbConfig;
    return {};
  }, [type, hoursConfig, genreConfig, tagsConfig, yearConfig, devPubConfig, flagsConfig, languageConfig, platformConfig, nameConfig, ratingConfig, hltbConfig]);

  const applyPresetConfig = (preset: AutoCategorizePreset) => {
    const config = preset.config as Record<string, unknown>;
    if (preset.type === "hours") setHoursConfig(config as unknown as HoursConfig);
    if (preset.type === "genre") setGenreConfig(config as unknown as GenreConfig);
    if (preset.type === "tags") setTagsConfig(config as unknown as TagsConfig);
    if (preset.type === "year") setYearConfig(config as unknown as YearConfig);
    if (preset.type === "devpub") setDevPubConfig(config as unknown as DevPubConfig);
    if (preset.type === "flags") setFlagsConfig(config as unknown as FlagsConfig);
    if (preset.type === "language") setLanguageConfig(config as unknown as LanguageConfig);
    if (preset.type === "platform") setPlatformConfig(config as unknown as PlatformConfig);
    if (preset.type === "name") setNameConfig(config as unknown as NameConfig);
    if (preset.type === "rating") setRatingConfig(config as unknown as SteamRatingConfig);
    if (preset.type === "hltb") setHltbConfig(config as unknown as HoursConfig);
  };

  const handleLoadPreset = (preset: AutoCategorizePreset) => {
    setType(preset.type);
    applyPresetConfig(preset);
    setPresetName(preset.name);
    setLoadedPresetId(preset.id);
    persist.set({ lastType: preset.type });
    gotoStep("configure");
  };

  const handleDeletePreset = (id: string) => {
    persist.set({ presets: persist.presets.filter((preset) => preset.id !== id) });
    if (loadedPresetId === id) {
      setLoadedPresetId(null);
      setPresetName("");
    }
  };

  const handleMovePreset = (id: string, direction: -1 | 1) => {
    const index = persist.presets.findIndex((preset) => preset.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= persist.presets.length) return;
    const next = [...persist.presets];
    [next[index], next[target]] = [next[target], next[index]];
    persist.set({ presets: next });
  };

  const fetchItemsForIds = useCallback((ids: number[]) => (
    ids.map((id) => ({ appId: id, name: games[id]?.name ?? `#${id}` }))
  ), [games]);

  const ensureSteamRatingsHydrated = useCallback(async () => {
    if (!useSteamRatingsStore.getState().hydrated) {
      await useSteamRatingsStore.getState().hydrateCache();
    }
    return useSteamRatingsStore.getState().ratings;
  }, []);

  useEffect(() => {
    if (step === "configure" && categorizerNeedsRatings(type)) {
      ensureSteamRatingsHydrated().catch(() => {});
    }
  }, [ensureSteamRatingsHydrated, step, type]);

  const startMissingPresetFetch = useCallback((presets: AutoCategorizePreset[]): boolean => {
    const missingDetails = missingBaseDetailIdsForPresets(presets, games, details, detailsCacheMaxAgeDays);

    if (missingDetails.length > 0) {
      setFetchError("");
      setStep("fetch");
      setFetchKind("details");
      setPendingPresetRun(presets);
      if (!detailsRunning) startDetailsFetch(missingDetails);
      return true;
    }

    const missingReleaseDates = missingReleaseDateIdsForPresets(presets, games, details);

    if (missingReleaseDates.length > 0) {
      setFetchError("");
      setStep("fetch");
      setFetchKind("releaseDates");
      setPendingPresetRun(presets);
      if (!releaseDatesRunning) startStoreReleaseDateFetch(fetchItemsForIds(missingReleaseDates));
      return true;
    }

    const currentRatings = useSteamRatingsStore.getState().ratings;
    const missingRatings = presets.some((preset) => categorizerNeedsRatings(preset.type))
      ? steamRatingIdsNeedingFetch(games, currentRatings)
      : [];

    if (missingRatings.length > 0) {
      setFetchError("");
      setStep("fetch");
      setFetchKind("ratings");
      setPendingPresetRun(presets);
      if (!ratingsRunning) startRatingsFetch(fetchItemsForIds(missingRatings));
      return true;
    }

    return false;
  }, [
    details,
    detailsRunning,
    fetchItemsForIds,
    games,
    releaseDatesRunning,
    ratingsRunning,
    startDetailsFetch,
    startRatingsFetch,
    startStoreReleaseDateFetch,
    t,
  ]);

  const handleSavePreset = () => {
    const now = Date.now();
    const name = presetName.trim() || categorizerLabel(type, t);
    const preset: AutoCategorizePreset = {
      id: loadedPresetId ?? presetId(),
      name,
      type,
      config: currentConfig(),
      createdAt: persist.presets.find((item) => item.id === loadedPresetId)?.createdAt ?? now,
      updatedAt: now,
    };
    const existing = persist.presets.findIndex((item) => item.id === preset.id);
    const presets =
      existing >= 0
        ? persist.presets.map((item) => (item.id === preset.id ? preset : item))
        : [...persist.presets, preset];
    persist.set({ presets });
    setLoadedPresetId(preset.id);
    setPresetName(name);
  };

  const handleRunPresets = async () => {
    const presets = [...persist.presets];
    if (presets.length === 0) return;

    setRunError("");
    setFetchError("");
    setWaitingForFetch(false);

    if (presets.some((preset) => categorizerNeedsRatings(preset.type))) {
      await ensureSteamRatingsHydrated();
    }

    if (startMissingPresetFetch(presets)) return;

    await runPresetSequence(presets);
  };

  const handleRunPresetsCachedOnly = async () => {
    const presets = [...persist.presets];
    if (presets.length === 0) return;
    const currentRatings = presets.some((preset) => categorizerNeedsRatings(preset.type))
      ? await ensureSteamRatingsHydrated()
      : ratings;

    if (!canRunPresetsWithCache(presets, games, details, currentRatings)) {
      setRunError(t("auto.cachedOnlyNoMetadata"));
      return;
    }

    setRunError("");
    setFetchError("");
    setWaitingForFetch(false);
    setPendingPresetRun(null);
    await runPresetSequence(presets, {
      cachedOnly: true,
      skippedDetails:
      missingDetailIdsForPresets(presets, games, details, detailsCacheMaxAgeDays).length +
        missingRatingIdsForPresets(presets, games, currentRatings).length,
    });
  };

  // ---- Step: configure → run ----
  const handleConfigure = async () => {
    persist.set({
      hoursConfig,
      genreConfig,
      tagsConfig,
      yearConfig,
      devPubConfig,
      flagsConfig,
      languageConfig,
      platformConfig,
      nameConfig,
      ratingConfig,
    });

    // HLTB categorizer: no fetch needed, runs directly
    if (type === "hltb") {
      await runCategorizer();
      return;
    }

    if (type === "rating") {
      const currentRatings = await ensureSteamRatingsHydrated();
      const missing = steamRatingIdsNeedingFetch(games, currentRatings);
      if (missing.length > 0) {
        setFetchError("");
        setStep("fetch");
        setFetchKind("ratings");

        if (ratingsRunning) {
          setWaitingForFetch(true);
          return;
        }

        startRatingsFetch(fetchItemsForIds(missing));
        setWaitingForFetch(true);
        return;
      }
    }

    if (categorizer.needsDetails) {
      const missing = detailIdsNeedingBaseFetchForType(type, games, details, detailsCacheMaxAgeDays);

      if (missing.length > 0) {
        setFetchError("");
        setStep("fetch");
        setFetchKind("details");

        // If already running from background fetch, just wait for it
        if (detailsRunning) {
          setWaitingForFetch(true);
          return;
        }

        // Start background fetch and wait
        startDetailsFetch(missing);
        setWaitingForFetch(true);
        return;
      }

      const missingReleaseDates = detailIdsNeedingReleaseDateFetchForType(type, games, details);

      if (missingReleaseDates.length > 0) {
        setFetchError("");
        setStep("fetch");
        setFetchKind("releaseDates");

        if (releaseDatesRunning) {
          setWaitingForFetch(true);
          return;
        }

        startStoreReleaseDateFetch(fetchItemsForIds(missingReleaseDates));
        setWaitingForFetch(true);
        return;
      }
    }

    await runCategorizer();
  };

  const handleConfigureCachedOnly = async () => {
    persist.set({
      hoursConfig,
      genreConfig,
      tagsConfig,
      yearConfig,
      devPubConfig,
      flagsConfig,
      languageConfig,
      platformConfig,
      nameConfig,
      ratingConfig,
    });

    if (categorizer.needsDetails && detailIdsReadyForType(type, games, details).length === 0) {
      setRunError(t("auto.cachedOnlyNoMetadata"));
      return;
    }
    const currentRatings = categorizer.needsRatings
      ? await ensureSteamRatingsHydrated()
      : ratings;
    if (categorizer.needsRatings && ratingIdsReady(games, currentRatings).length === 0) {
      setRunError(t("auto.cachedOnlyNoMetadata"));
      return;
    }

    const skippedDetails = categorizer.needsDetails
      ? detailIdsNeedingFetchForType(type, games, details, detailsCacheMaxAgeDays).length
      : categorizer.needsRatings
        ? steamRatingIdsNeedingFetch(games, currentRatings).length
      : 0;
    await runCategorizer({ cachedOnly: true, skippedDetails });
  };

  const runCategorizerConfig = useCallback(async (
    runType: CategorizerType,
    config: AutoCategorizePresetConfig,
    options: { cachedOnly?: boolean } = {}
  ): Promise<CategorizeResult> => {
    const allGames = Object.values(games);
    const ratingsForRun = useSteamRatingsStore.getState().ratings;
    const gamesForRun = options.cachedOnly && categorizerNeedsRatings(runType)
      ? allGames.filter((game) => isSteamRatingFresh(ratingsForRun[game.appid]))
      : allGames;
    const allDetails = options.cachedOnly && categorizerNeedsDetails(runType)
      ? detailsReadyForType(runType, games, details)
      : Object.values(details);

    if (runType === "hours") {
      const cfg = config as HoursConfig;
      return withProcessedAppIds(await runHoursCategorizer(gamesForRun, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), gamesForRun.map((game) => game.appid));
    }
    if (runType === "genre") {
      const cfg = config as GenreConfig;
      return withProcessedAppIds(await runGenreCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "tags") {
      const cfg = config as TagsConfig;
      return withProcessedAppIds(await runTagsCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "year") {
      const cfg = config as YearConfig;
      const processedIds = allDetails
        .filter((detail) => extractReleaseYear(yearCategorizationReleaseDate(detail)) != null)
        .map((detail) => detail.app_id);
      return withProcessedAppIds(await runYearCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), processedIds);
    }
    if (runType === "devpub") {
      const cfg = config as DevPubConfig;
      return withProcessedAppIds(await runDevPubCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        min_games: cfg.min_games || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "flags") {
      const cfg = config as FlagsConfig;
      return withProcessedAppIds(await runFlagsCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        max_flags: cfg.max_flags || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "language") {
      const cfg = config as LanguageConfig;
      return withProcessedAppIds(await runLanguageCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        max_languages: cfg.max_languages || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "platform") {
      const cfg = config as PlatformConfig;
      return withProcessedAppIds(await runPlatformCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), allDetails.map((detail) => detail.app_id));
    }
    if (runType === "name") {
      const cfg = config as NameConfig;
      return withProcessedAppIds(await runNameCategorizer(gamesForRun, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), gamesForRun.map((game) => game.appid));
    }
    if (runType === "hltb") {
      const cfg = config as HoursConfig;
      const mode = hltbModeForConfig(cfg, hltbTimeMode);
      return withProcessedAppIds(runHltbCategorizerJs(gamesForRun, hltbData, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        hltb_time_mode: mode,
      }), gamesForRun
        .filter((game) => getHltbHours(hltbData[game.appid], mode) != null)
        .map((game) => game.appid));
    }
    if (runType === "rating") {
      const cfg = config as SteamRatingConfig;
      return withProcessedAppIds(categorizeBySteamRating(gamesForRun, ratingsForRun, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      }), gamesForRun
        .filter((game) => isSteamRatingFresh(ratingsForRun[game.appid]))
        .map((game) => game.appid));
    }

    return withProcessedAppIds(await runScoreCategorizer(allDetails, true), allDetails.map((detail) => detail.app_id));
  }, [games, details, hltbData, hltbTimeMode]);

  const runCategorizer = useCallback(async (
    options: { cachedOnly?: boolean; skippedDetails?: number } = {}
  ) => {
    setRunError("");
    try {
      const config = currentConfig();
      const rawResult = await runCategorizerConfig(type, config, options);
      const res = options.cachedOnly
        ? rawResult
        : withExpectedAutoCategories(rawResult, type, config);

      setResult(res);
      setPreviewContext({ type, config });
      setPreviewNotice(options.cachedOnly
        ? t("auto.cachedOnlyNotice", { count: options.skippedDetails ?? 0 })
        : "");
      persist.set({ lastResult: res });
      gotoStep("preview");
    } catch (e) {
      setRunError(t("auto.categorizationFailed", { error: String(e) }));
      gotoStep("configure");
    }
  }, [
    type,
    games,
    details,
    hltbData,
    hoursConfig,
    genreConfig,
    tagsConfig,
    yearConfig,
    devPubConfig,
    flagsConfig,
    languageConfig,
    platformConfig,
    nameConfig,
    ratingConfig,
    hltbConfig,
    currentConfig,
    runCategorizerConfig,
    t,
  ]);

  const runPresetSequence = useCallback(async (
    presets: AutoCategorizePreset[],
    options: { cachedOnly?: boolean; skippedDetails?: number } = {}
  ) => {
    setRunError("");
    try {
      const assignmentSets = new Map<string, Set<number>>();
      const categorizedIds = new Set<number>();

      for (const preset of presets) {
        const rawPresetResult = await runCategorizerConfig(preset.type, preset.config, options);
        const presetResult = options.cachedOnly
          ? rawPresetResult
          : withExpectedAutoCategories(rawPresetResult, preset.type, preset.config);
        for (const [category, ids] of Object.entries(presetResult.assignments)) {
          const bucket = assignmentSets.get(category) ?? new Set<number>();
          for (const id of ids) {
            bucket.add(id);
            categorizedIds.add(id);
          }
          assignmentSets.set(category, bucket);
        }
      }

      const assignments = Object.fromEntries(
        [...assignmentSets.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, ids]) => [category, [...ids].sort((a, b) => a - b)])
      );
      const res: CategorizeResult = {
        assignments,
        games_processed: Object.keys(games).length,
        games_categorized: categorizedIds.size,
      };

      setResult(res);
      setPreviewContext(null);
      setPreviewNotice(options.cachedOnly
        ? t("auto.cachedOnlyNotice", { count: options.skippedDetails ?? 0 })
        : "");
      persist.set({ lastResult: res });
      gotoStep("preview");
    } catch (e) {
      setRunError(t("auto.categorizationFailed", { error: String(e) }));
      gotoStep("choose");
    }
  }, [games, runCategorizerConfig, t]);

  // ---- Step: apply ----
  const handleApply = async () => {
    if (!result) return;

    if (steamPath && steamId3) {
      try {
        await createManualBackup(steamPath, steamId3, t("auto.backupName"));
      } catch {
        // backup failure is non-fatal
      }
    }

    applyImportedCollections(
      applyAutoCategorizeAssignments(collections, result.assignments, undefined, {
        processedAppIds: result.processed_app_ids,
      })
    );

    gotoStep("done");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-full max-w-2xl flex-col animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Robot size={18} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold text-white tracking-tight">{t("auto.title")}</h2>
          </div>
          <button onClick={onClose} className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Steps indicator */}
        <StepBar step={step} />

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === "choose" && (
            <ChooseStep
              presets={persist.presets}
              onChoose={handleChoose}
              onRunPresets={handleRunPresets}
              onRunPresetsCachedOnly={handleRunPresetsCachedOnly}
              onLoadPreset={handleLoadPreset}
              onDeletePreset={handleDeletePreset}
              onMovePreset={handleMovePreset}
              error={runError}
            />
          )}
          {step === "configure" && (
            <ConfigureStep
              type={type}
              hoursConfig={hoursConfig} setHoursConfig={setHoursConfig}
              genreConfig={genreConfig} setGenreConfig={setGenreConfig}
              tagsConfig={tagsConfig} setTagsConfig={setTagsConfig}
              yearConfig={yearConfig} setYearConfig={setYearConfig}
              devPubConfig={devPubConfig} setDevPubConfig={setDevPubConfig}
              flagsConfig={flagsConfig} setFlagsConfig={setFlagsConfig}
              languageConfig={languageConfig} setLanguageConfig={setLanguageConfig}
              platformConfig={platformConfig} setPlatformConfig={setPlatformConfig}
              nameConfig={nameConfig} setNameConfig={setNameConfig}
              ratingConfig={ratingConfig} setRatingConfig={setRatingConfig}
              hltbConfig={hltbConfig} setHltbConfig={setHltbConfig}
              metadata={metadata}
              presetName={presetName}
              setPresetName={setPresetName}
              onSavePreset={handleSavePreset}
              loadedPresetId={loadedPresetId}
              error={runError}
              onBack={() => gotoStep("choose")}
              onNext={handleConfigure}
              onCachedOnly={handleConfigureCachedOnly}
              cachedOnlyAvailable={
                (
                  categorizer.needsDetails &&
                  detailIdsReadyForType(type, games, details).length > 0 &&
                  detailIdsNeedingFetchForType(type, games, details, detailsCacheMaxAgeDays).length > 0
                ) ||
                (
                  categorizer.needsRatings &&
                  ratingIdsReady(games, ratings).length > 0 &&
                  steamRatingIdsNeedingFetch(games, ratings).length > 0
                )
              }
              cachedOnlyMissingCount={
                categorizer.needsDetails
                  ? detailIdsNeedingFetchForType(type, games, details, detailsCacheMaxAgeDays).length
                  : categorizer.needsRatings
                    ? steamRatingIdsNeedingFetch(games, ratings).length
                  : 0
              }
            />
          )}
          {step === "fetch" && (
            <FetchStep
              progress={
                fetchKind === "ratings"
                  ? ratingsFetched
                  : fetchKind === "releaseDates"
                    ? releaseDatesFetched
                    : detailsFetched
              }
              total={
                fetchKind === "ratings"
                  ? ratingsTotal
                  : fetchKind === "releaseDates"
                    ? releaseDatesTotal
                    : detailsTotal
              }
              error={fetchError}
              waiting={waitingForFetch || pendingPresetRun !== null}
              coolingDown={fetchKind === "ratings" ? ratingsCoolingDown : false}
              cooldownSecs={fetchKind === "ratings" ? ratingsCooldownSecs : 0}
              message={
                fetchKind === "ratings"
                  ? t("auto.fetchingRatings")
                  : fetchKind === "releaseDates"
                    ? t("fetch.releaseDates")
                    : t("auto.fetchingDetails")
              }
            />
          )}
          {step === "preview" && result && (
            <PreviewStep
              result={result}
              context={previewContext}
              notice={previewNotice}
              onBack={() => gotoStep("configure")}
              onApply={handleApply}
            />
          )}
          {step === "done" && (
            <DoneStep result={result!} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step indicator
// ============================================================

const STEPS: { key: Step; labelKey: TranslationKey }[] = [
  { key: "choose", labelKey: "auto.step.choose" },
  { key: "configure", labelKey: "auto.step.configure" },
  { key: "preview", labelKey: "auto.step.preview" },
  { key: "done", labelKey: "auto.step.apply" },
];

function StepBar({ step }: { step: Step }) {
  const t = useT();
  const shown = STEPS.filter((s) => s.key !== "fetch");
  const idx = shown.findIndex((s) => s.key === step) !== -1
    ? shown.findIndex((s) => s.key === step)
    : (step === "fetch" ? 1 : shown.length - 1);

  return (
    <div className="flex items-center gap-0 border-b border-repressurizer-border px-6 py-3">
      {shown.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${
            i < idx ? "text-repressurizer-accent" : i === idx ? "text-white" : "text-repressurizer-text-faint"
          }`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              i < idx ? "bg-repressurizer-accent text-repressurizer-bg" : i === idx ? "bg-repressurizer-accent/20 text-repressurizer-accent ring-1 ring-repressurizer-accent" : "bg-repressurizer-surface-hover"
            }`}>
              {i < idx ? <Check size={10} weight="bold" /> : i + 1}
            </span>
            {t(s.labelKey)}
          </div>
          {i < shown.length - 1 && (
            <div className={`mx-3 h-px w-8 ${i < idx ? "bg-repressurizer-accent/40" : "bg-repressurizer-border-subtle"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Step: Choose
// ============================================================

function ChooseStep({
  presets,
  onChoose,
  onRunPresets,
  onRunPresetsCachedOnly,
  onLoadPreset,
  onDeletePreset,
  onMovePreset,
  error,
}: {
  presets: AutoCategorizePreset[];
  onChoose: (t: CategorizerType) => void;
  onRunPresets: () => void;
  onRunPresetsCachedOnly: () => void;
  onLoadPreset: (preset: AutoCategorizePreset) => void;
  onDeletePreset: (id: string) => void;
  onMovePreset: (id: string, direction: -1 | 1) => void;
  error: string;
}) {
  const t = useT();
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const detailsCacheMaxAgeDays = useSettingsStore((s) => s.detailsCacheMaxAgeDays);
  const ratings = useSteamRatingsStore((s) => s.ratings);
  const ratingsHydrated = useSteamRatingsStore((s) => s.hydrated);
  const ratingsHydrating = useSteamRatingsStore((s) => s.hydrating);
  const hydrateRatingsCache = useSteamRatingsStore((s) => s.hydrateCache);
  const hltbData = useHltbStore((s) => s.data);
  const ignoredDetailFails = useFailedGamesStore((s) => s.fails);
  const ignoredHltbFails = useHltbIgnoredStore((s) => s.fails);
  const currency = useSettingsStore((s) => s.currency);
  const [cacheNotice, setCacheNotice] = useState("");
  const gameIds = useMemo(() => Object.keys(games).map(Number), [games]);
  const ignoredDetailsSet = useMemo(
    () =>
      new Set(
        Object.entries(ignoredDetailFails)
          .filter(([, count]) => count >= MAX_FAIL_RUNS)
          .map(([id]) => Number(id))
      ),
    [ignoredDetailFails]
  );
  const ignoredHltbSet = useMemo(
    () =>
      new Set(
        Object.entries(ignoredHltbFails)
          .filter(([, count]) => count >= HLTB_MAX_FAILS)
          .map(([id]) => Number(id))
      ),
    [ignoredHltbFails]
  );
  const detailIdsNeedingRefresh = useMemo(
    () => gameIds.filter((id) => detailsCacheNeedsRefresh(details[id], detailsCacheMaxAgeDays) || detailsPriceNeedsCurrencyRefresh(details[id], currency)),
    [currency, details, detailsCacheMaxAgeDays, gameIds]
  );
  const fetchableDetailIds = useMemo(
    () => detailIdsNeedingRefresh.filter((id) => !ignoredDetailsSet.has(id)),
    [detailIdsNeedingRefresh, ignoredDetailsSet]
  );
  const staleDetailCount = gameIds.filter((id) => !!details[id] && detailsCacheNeedsRefresh(details[id], detailsCacheMaxAgeDays)).length;
  const wrongCurrencyDetailCount = gameIds.filter((id) => detailsPriceNeedsCurrencyRefresh(details[id], currency)).length;
  const ignoredDetailCount = detailIdsNeedingRefresh.length - fetchableDetailIds.length;
  const cachedCount = gameCount - detailIdsNeedingRefresh.length;
  const missingHltbIds = useMemo(
    () => gameIds.filter((id) => !hltbData[id]),
    [gameIds, hltbData]
  );
  const fetchableHltbIds = useMemo(
    () => missingHltbIds.filter((id) => !ignoredHltbSet.has(id)),
    [ignoredHltbSet, missingHltbIds]
  );
  const hltbIgnoredCount = missingHltbIds.length - fetchableHltbIds.length;
  const hltbCount = gameCount - missingHltbIds.length;
  const storeReleaseDateIdsNeedingRefresh = useMemo(
    () => gameIds.filter((id) => isDetailsCacheCurrent(details[id]) && storeReleaseDateNeedsRefresh(details[id])),
    [details, gameIds]
  );
  const storeReleaseDateCount = gameIds.filter((id) =>
    isDetailsCacheCurrent(details[id]) && !storeReleaseDateNeedsRefresh(details[id])
  ).length;
  const storeReleaseDatesBlockedByDetails =
    gameCount - storeReleaseDateCount - storeReleaseDateIdsNeedingRefresh.length;
  const missingRatings = ratingsHydrated ? steamRatingIdsNeedingFetch(games, ratings) : [];
  const ratingCount = ratingsHydrated ? gameCount - missingRatings.length : 0;
  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const startDetailsFetch = useBackgroundFetchStore((s) => s.startDetailsFetch);
  const hltbRunning = useBackgroundFetchStore((s) => s.hltbRunning);
  const hltbFetched = useBackgroundFetchStore((s) => s.hltbFetched);
  const hltbTotal = useBackgroundFetchStore((s) => s.hltbTotal);
  const ratingsRunning = useBackgroundFetchStore((s) => s.ratingsRunning);
  const ratingsFetched = useBackgroundFetchStore((s) => s.ratingsFetched);
  const ratingsTotal = useBackgroundFetchStore((s) => s.ratingsTotal);
  const startRatingsFetch = useBackgroundFetchStore((s) => s.startRatingsFetch);
  const releaseDatesRunning = useBackgroundFetchStore((s) => s.releaseDatesRunning);
  const releaseDatesFetched = useBackgroundFetchStore((s) => s.releaseDatesFetched);
  const releaseDatesTotal = useBackgroundFetchStore((s) => s.releaseDatesTotal);
  const startStoreReleaseDateFetch = useBackgroundFetchStore((s) => s.startStoreReleaseDateFetch);
  const startHltbFetch = useBackgroundFetchStore((s) => s.startHltbFetch);

  const fetchItemsForIds = useCallback((ids: number[]) => (
    ids.map((id) => ({ appId: id, name: games[id]?.name ?? `#${id}` }))
  ), [games]);

  const handleFetchDetails = () => {
    setCacheNotice("");
    if (fetchableDetailIds.length > 0) {
      startDetailsFetch(fetchableDetailIds);
      return;
    }
    if (detailIdsNeedingRefresh.length > 0) {
      setCacheNotice(t("auto.cache.onlyIgnored"));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  const handleFetchRatings = async (): Promise<boolean> => {
    if (!ratingsHydrated) await hydrateRatingsCache();
    const currentRatings = useSteamRatingsStore.getState().ratings;
    const missing = steamRatingIdsNeedingFetch(games, currentRatings);
    if (missing.length > 0) {
      startRatingsFetch(fetchItemsForIds(missing));
      return true;
    }
    return false;
  };

  const handleFetchHltb = () => {
    setCacheNotice("");
    if (fetchableHltbIds.length > 0) {
      startHltbFetch(fetchItemsForIds(fetchableHltbIds));
      return;
    }
    if (missingHltbIds.length > 0) {
      setCacheNotice(t("auto.cache.hltbOnlyIgnored"));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  const handleFetchStoreReleaseDates = () => {
    setCacheNotice("");
    if (storeReleaseDateIdsNeedingRefresh.length > 0) {
      startStoreReleaseDateFetch(fetchItemsForIds(storeReleaseDateIdsNeedingRefresh));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  return (
    <div className="space-y-2">
      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CacheStatusCard
          label={t("auto.cache.details")}
          cached={cachedCount}
          total={gameCount}
          running={detailsRunning}
          progress={detailsFetched}
          progressTotal={detailsTotal}
          missing={detailIdsNeedingRefresh.length}
          fetchable={fetchableDetailIds.length}
          notes={[
            staleDetailCount > 0 ? t("auto.cache.detailsStale", { count: staleDetailCount }) : "",
            wrongCurrencyDetailCount > 0 ? t("auto.cache.wrongCurrency", { count: wrongCurrencyDetailCount }) : "",
            ignoredDetailCount > 0 ? t("auto.cache.ignored", { count: ignoredDetailCount }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchDetails}
        />
        <CacheStatusCard
          label={t("auto.cache.releaseDates")}
          cached={storeReleaseDateCount}
          total={gameCount}
          running={releaseDatesRunning}
          progress={releaseDatesFetched}
          progressTotal={releaseDatesTotal}
          missing={gameCount - storeReleaseDateCount}
          fetchable={storeReleaseDateIdsNeedingRefresh.length}
          notes={[
            storeReleaseDateIdsNeedingRefresh.length > 0 ? t("auto.cache.releaseDatesMissing", { count: storeReleaseDateIdsNeedingRefresh.length }) : "",
            storeReleaseDatesBlockedByDetails > 0 ? t("auto.cache.releaseDatesNeedDetails", { count: storeReleaseDatesBlockedByDetails }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchStoreReleaseDates}
        />
        <CacheStatusCard
          label={t("auto.cache.ratings")}
          cached={ratingCount}
          total={gameCount}
          running={ratingsRunning}
          progress={ratingsFetched}
          progressTotal={ratingsTotal}
          missing={ratingsHydrated ? missingRatings.length : gameCount}
          fetchable={ratingsHydrated ? missingRatings.length : gameCount}
          loading={ratingsHydrating || !ratingsHydrated}
          onFetch={handleFetchRatings}
        />
        <CacheStatusCard
          label={t("auto.cache.hltb")}
          cached={hltbCount}
          total={gameCount}
          running={hltbRunning}
          progress={hltbFetched}
          progressTotal={hltbTotal}
          missing={missingHltbIds.length}
          fetchable={fetchableHltbIds.length}
          notes={[
            hltbIgnoredCount > 0 ? t("auto.cache.hltbIgnored", { count: hltbIgnoredCount }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchHltb}
        />
      </div>

      {cacheNotice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text-muted">
          <Warning size={14} weight="duotone" className="shrink-0 text-repressurizer-text-faint" />
          {cacheNotice}
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-repressurizer-danger/20 bg-repressurizer-danger/8 p-3 text-sm text-repressurizer-danger">
          <Warning size={16} weight="fill" />
          {error}
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-4 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              {t("auto.presets.saved")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onRunPresetsCachedOnly}
                className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
              >
                <CopySimple size={12} weight="duotone" />
                {t("auto.presets.runCached")}
              </button>
              <button
                type="button"
                onClick={onRunPresets}
                className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-2.5 py-1 text-[11px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
              >
                <Playlist size={12} weight="duotone" />
                {t("auto.presets.runAll")}
                <span className="font-mono text-[10px] tabular-nums text-repressurizer-accent/70">
                  {presets.length}
                </span>
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {presets.map((preset, index) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-2"
              >
                <button
                  type="button"
                  onClick={() => onLoadPreset(preset)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-repressurizer-text">
                    {preset.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-repressurizer-text-faint">
                    {categorizerLabel(preset.type, t)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onMovePreset(preset.id, -1)}
                  disabled={index === 0}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text disabled:opacity-30"
                  title={t("auto.moveUp")}
                  aria-label={t("auto.moveUp")}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onMovePreset(preset.id, 1)}
                  disabled={index === presets.length - 1}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text disabled:opacity-30"
                  title={t("auto.moveDown")}
                  aria-label={t("auto.moveDown")}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(preset.id)}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-danger/70 hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"
                  title={t("auto.delete")}
                  aria-label={t("auto.delete")}
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-sm text-repressurizer-text-muted">{t("auto.choose.desc")}</p>
      {CATEGORIZERS.map((c) => {
        const Icon = c.icon;
        const label = t(c.labelKey);
        const description = t(c.descriptionKey);
        return (
          <button
            key={c.value}
            onClick={() => onChoose(c.value)}
            className="btn-press flex w-full items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3.5 py-2.5 text-left transition-colors hover:border-repressurizer-accent hover:bg-repressurizer-accent/5"
          >
            <Icon size={18} weight="duotone" className="shrink-0 text-repressurizer-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="mt-0.5 truncate text-xs text-repressurizer-text-faint">{description}</p>
            </div>
            {c.needsDetails && (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                {t("auto.needsDetails")}
              </span>
            )}
            {c.needsHltb && (
              <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                {t("auto.needsHltb")}
              </span>
            )}
            {c.needsRatings && (
              <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                {t("auto.needsRatings")}
              </span>
            )}
            <ArrowRight size={16} className="shrink-0 text-repressurizer-text-faint" />
          </button>
        );
      })}
    </div>
  );
}

function CacheStatusCard({
  label,
  cached,
  total,
  running,
  progress,
  progressTotal,
  missing,
  fetchable,
  notes,
  loading,
  onFetch,
}: {
  label: string;
  cached: number;
  total: number;
  running: boolean;
  progress: number;
  progressTotal: number;
  missing: number;
  fetchable?: number;
  notes?: string[];
  loading?: boolean;
  onFetch?: () => void;
}) {
  const t = useT();
  const isComplete = total > 0 && missing === 0;
  const fetchableCount = fetchable ?? missing;
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-repressurizer-text-faint">
          {label}
        </p>
        {loading ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
            <Spinner size={9} className="animate-spin" />
            {t("auto.loadingCache")}
          </span>
        ) : running ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
            <Spinner size={9} className="animate-spin" />
            {progress}/{progressTotal}
          </span>
        ) : isComplete ? (
          <span className="shrink-0 rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent">
            {t("auto.allCached")}
          </span>
        ) : onFetch && fetchableCount > 0 ? (
          <button
            type="button"
            onClick={onFetch}
            className="btn-press shrink-0 rounded-md bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            {t("auto.fetchNow")}
          </button>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-sm font-medium tabular-nums text-repressurizer-text">
        {cached} / {total}
      </p>
      {notes && notes.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {notes.map((note) => (
            <p key={note} className="truncate text-[10px] text-repressurizer-text-faint">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step: Configure
// ============================================================

function ConfigureStep({
  type, hoursConfig, setHoursConfig, genreConfig, setGenreConfig,
  tagsConfig, setTagsConfig, yearConfig, setYearConfig,
  devPubConfig, setDevPubConfig, flagsConfig, setFlagsConfig,
  languageConfig, setLanguageConfig,
  platformConfig, setPlatformConfig, nameConfig, setNameConfig,
  ratingConfig, setRatingConfig,
  hltbConfig, setHltbConfig, metadata, presetName, setPresetName, onSavePreset,
  loadedPresetId, error, onBack, onNext, onCachedOnly, cachedOnlyAvailable, cachedOnlyMissingCount,
}: {
  type: CategorizerType;
  hoursConfig: HoursConfig; setHoursConfig: (c: HoursConfig) => void;
  genreConfig: GenreConfig; setGenreConfig: (c: GenreConfig) => void;
  tagsConfig: TagsConfig; setTagsConfig: (c: TagsConfig) => void;
  yearConfig: YearConfig; setYearConfig: (c: YearConfig) => void;
  devPubConfig: DevPubConfig; setDevPubConfig: (c: DevPubConfig) => void;
  flagsConfig: FlagsConfig; setFlagsConfig: (c: FlagsConfig) => void;
  languageConfig: LanguageConfig; setLanguageConfig: (c: LanguageConfig) => void;
  platformConfig: PlatformConfig; setPlatformConfig: (c: PlatformConfig) => void;
  nameConfig: NameConfig; setNameConfig: (c: NameConfig) => void;
  ratingConfig: SteamRatingConfig; setRatingConfig: (c: SteamRatingConfig) => void;
  hltbConfig: HoursConfig; setHltbConfig: (c: HoursConfig) => void;
  metadata: AutoCatMetadata;
  presetName: string;
  setPresetName: (name: string) => void;
  onSavePreset: () => void;
  loadedPresetId: string | null;
  error: string;
  onBack: () => void;
  onNext: () => void;
  onCachedOnly: () => void;
  cachedOnlyAvailable: boolean;
  cachedOnlyMissingCount: number;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.preset.saved")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={t("auto.presetName")}
            className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onSavePreset}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-2 text-sm font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            <FloppyDisk size={14} weight="duotone" />
            {loadedPresetId ? t("auto.update") : t("auto.save")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-repressurizer-danger/20 bg-repressurizer-danger/8 p-3 text-sm text-repressurizer-danger">
          <Warning size={16} weight="fill" />
          {error}
        </div>
      )}

      {type === "hours" && <HoursConfigForm config={hoursConfig} onChange={setHoursConfig} />}
      {type === "genre" && <GenreConfigForm config={genreConfig} onChange={setGenreConfig} suggestions={metadata.genreValues} />}
      {type === "tags" && <TagsConfigForm config={tagsConfig} onChange={setTagsConfig} suggestions={metadata.tagValues} metadata={metadata} />}
      {type === "year" && <YearConfigForm config={yearConfig} onChange={setYearConfig} />}
      {type === "hltb" && <HoursConfigForm config={hltbConfig} onChange={setHltbConfig} label={t("auto.hltbBuckets")} showHltbMode />}
      {type === "devpub" && <DevPubConfigForm config={devPubConfig} onChange={setDevPubConfig} suggestions={metadata.studioValues} metadata={metadata} />}
      {type === "flags" && <FlagsConfigForm config={flagsConfig} onChange={setFlagsConfig} suggestions={metadata.flagValues} metadata={metadata} />}
      {type === "language" && <LanguageConfigForm config={languageConfig} onChange={setLanguageConfig} suggestions={metadata.languageValues} metadata={metadata} />}
      {type === "platform" && <PlatformConfigForm config={platformConfig} onChange={setPlatformConfig} />}
      {type === "name" && <NameConfigForm config={nameConfig} onChange={setNameConfig} />}
      {type === "rating" && <SteamRatingConfigForm config={ratingConfig} onChange={setRatingConfig} />}
      {type === "score" && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
          <p className="font-medium text-repressurizer-text mb-2">{t("auto.metacriticBuckets")}</p>
          <div className="space-y-1.5 text-xs">
            {[
              { name: "Must-Play", range: "90-100" },
              { name: "Great", range: "75-89" },
              { name: "Good", range: "60-74" },
              { name: "Mixed", range: "40-59" },
              { name: "Poor", range: "0-39" },
            ].map((r) => (
              <div key={r.name} className="flex justify-between">
                <span className="text-repressurizer-text">{r.name}</span>
                <span className="font-mono text-repressurizer-accent">{r.range}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-repressurizer-text-faint">{t("auto.metacriticSkipped")}</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
          <ArrowLeft size={14} />
          {t("auto.back")}
        </button>
        <div className="flex items-center gap-2">
          {cachedOnlyAvailable && (
            <button
              onClick={onCachedOnly}
              className="btn-press inline-flex items-center gap-1.5 rounded-xl border border-repressurizer-border bg-repressurizer-surface px-4 py-2 text-sm font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
              title={t("auto.cachedOnlyTooltip", { count: cachedOnlyMissingCount })}
            >
              <CopySimple size={14} />
              {t("auto.runCachedOnly")}
            </button>
          )}
          <button onClick={onNext} className="btn-press inline-flex items-center gap-1.5 rounded-xl bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover">
            {t("auto.run")}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-forms ----

function PrefixInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
        {t("auto.categoryPrefix")} <span className="normal-case text-repressurizer-text-faint/60">{t("auto.optional")}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("auto.prefixPlaceholder")}
        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
      />
    </div>
  );
}

function HoursConfigForm({
  config,
  onChange,
  label,
  showHltbMode = false,
}: {
  config: HoursConfig;
  onChange: (c: HoursConfig) => void;
  label?: string;
  showHltbMode?: boolean;
}) {
  const t = useT();
  const updateRule = (i: number, field: string, val: string) => {
    const rules = config.rules.map((r, idx) =>
      idx === i ? { ...r, [field]: field === "name" ? val : parseFloat(val) || 0 } : r
    );
    onChange({ ...config, rules });
  };
  const addRule = () => onChange({ ...config, rules: [...config.rules, { name: t("auto.newBucket"), min_hours: 0, max_hours: 0 }] });
  const removeRule = (i: number) => onChange({ ...config, rules: config.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      {showHltbMode && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
            {t("auto.hltbTimeType")}
          </label>
          <SelectMenu<HltbTimeMode>
            ariaLabel={t("auto.hltbTimeType")}
            value={hltbModeForConfig(config)}
            onChange={(mode) => onChange({ ...config, hltb_time_mode: mode })}
            size="sm"
            className="w-full"
            options={HLTB_TIME_MODES.map((mode) => ({
              value: mode,
              label: hltbModeLabel(mode),
            }))}
          />
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{label ?? t("auto.timeBuckets")}</label>
          <button onClick={addRule} className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent/15 px-2 py-1 text-xs text-repressurizer-accent hover:bg-repressurizer-accent/25">
            <Plus size={11} weight="bold" /> {t("auto.add")}
          </button>
        </div>
        <div className="space-y-2">
          {config.rules.map((rule, i) => (
            <div key={i} className="flex gap-2">
              <input value={rule.name} onChange={(e) => updateRule(i, "name", e.target.value)} className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none" placeholder={t("auto.name")} />
              <input type="number" value={rule.min_hours} onChange={(e) => updateRule(i, "min_hours", e.target.value)} className="w-20 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder={t("auto.min")} />
              <input type="number" value={rule.max_hours} onChange={(e) => updateRule(i, "max_hours", e.target.value)} className="w-24 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder={t("auto.maxOpenPlaceholder")} />
              <button onClick={() => removeRule(i)} className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-danger/60 hover:text-repressurizer-danger hover:bg-repressurizer-danger/10">
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-repressurizer-text-faint">{t("auto.maxOpenHint")}</p>
      </div>
    </div>
  );
}

function GenreConfigForm({
  config,
  onChange,
  suggestions,
}: {
  config: GenreConfig;
  onChange: (c: GenreConfig) => void;
  suggestions: string[];
}) {
  const t = useT();
  const [newIgnored, setNewIgnored] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.maxCategories")}</label>
        <input
          type="number"
          min={1}
          value={config.max_categories ?? ""}
          onChange={(e) => onChange({ ...config, max_categories: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-32 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.ignoredGenres")}
        items={config.ignored_genres}
        newItem={newIgnored}
        setNewItem={setNewIgnored}
        onAddItem={(value) => onChange({ ...config, ignored_genres: [...config.ignored_genres, value] })}
        onRemove={(v) => onChange({ ...config, ignored_genres: config.ignored_genres.filter((g) => g !== v) })}
        suggestions={suggestions}
      />
    </div>
  );
}

function TagsConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: TagsConfig;
  onChange: (c: TagsConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newTag, setNewTag] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.maxTags")}</label>
        <input
          type="number"
          min={1}
          value={config.max_tags ?? ""}
          onChange={(e) => onChange({ ...config, max_tags: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-32 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeTags")}
        items={config.included_tags}
        newItem={newTag}
        setNewItem={setNewTag}
        onAddItem={(value) => onChange({ ...config, included_tags: [...config.included_tags, value] })}
        onRemove={(v) => onChange({ ...config, included_tags: config.included_tags.filter((t) => t !== v) })}
        suggestions={suggestions}
      />
      <MetadataStatus label={t("detail.tags")} valueCount={suggestions.length} gameCount={metadata.gamesWithTags} totalDetails={metadata.totalDetails} />
    </div>
  );
}

function YearConfigForm({ config, onChange }: { config: YearConfig; onChange: (c: YearConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.grouping")}</label>
        <div className="flex gap-2">
          {(["None", "HalfDecade", "Decade"] as YearGrouping[]).map((g) => (
            <button
              key={g}
              onClick={() => onChange({ ...config, grouping: g })}
              className={`btn-press rounded-xl border px-4 py-2 text-sm transition-colors ${
                config.grouping === g
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border"
              }`}
            >
              {g === "None" ? t("auto.group.year") : g === "HalfDecade" ? t("auto.group.halfDecade") : t("auto.group.decade")}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.include_unknown}
          onChange={(e) => onChange({ ...config, include_unknown: e.target.checked })}
          className="h-4 w-4 rounded border-repressurizer-border bg-repressurizer-bg accent-repressurizer-accent"
        />
        <span className="text-sm text-repressurizer-text">{t("auto.includeUnknownYear")}</span>
      </label>
    </div>
  );
}

function DevPubConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: DevPubConfig;
  onChange: (c: DevPubConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newName, setNewName] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckboxRow
          label={t("auto.developers")}
          checked={config.include_developers}
          onChange={(checked) => onChange({ ...config, include_developers: checked })}
        />
        <CheckboxRow
          label={t("auto.publishers")}
          checked={config.include_publishers}
          onChange={(checked) => onChange({ ...config, include_publishers: checked })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.minimumGames")}
        </label>
        <input
          type="number"
          min={1}
          value={config.min_games ?? ""}
          onChange={(e) => onChange({ ...config, min_games: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.noMinimum")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeStudios")}
        items={config.selected}
        newItem={newName}
        setNewItem={setNewName}
        onAddItem={(value) => onChange({ ...config, selected: [...config.selected, value] })}
        onRemove={(value) => onChange({ ...config, selected: config.selected.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.studios")} valueCount={suggestions.length} gameCount={metadata.gamesWithStudios} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

function FlagsConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: FlagsConfig;
  onChange: (c: FlagsConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newFlag, setNewFlag] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.maxFlags")}
        </label>
        <input
          type="number"
          min={1}
          value={config.max_flags ?? ""}
          onChange={(e) => onChange({ ...config, max_flags: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeFlags")}
        items={config.included_flags}
        newItem={newFlag}
        setNewItem={setNewFlag}
        onAddItem={(value) => onChange({ ...config, included_flags: [...config.included_flags, value] })}
        onRemove={(value) => onChange({ ...config, included_flags: config.included_flags.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.flags")} valueCount={suggestions.length} gameCount={metadata.gamesWithFlags} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

function LanguageConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: LanguageConfig;
  onChange: (c: LanguageConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newLanguage, setNewLanguage] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.maxLanguages")}
        </label>
        <input
          type="number"
          min={1}
          value={config.max_languages ?? ""}
          onChange={(e) => onChange({ ...config, max_languages: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeLanguages")}
        items={config.included_languages}
        newItem={newLanguage}
        setNewItem={setNewLanguage}
        onAddItem={(value) => onChange({ ...config, included_languages: [...config.included_languages, value] })}
        onRemove={(value) => onChange({ ...config, included_languages: config.included_languages.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.languages")} valueCount={suggestions.length} gameCount={metadata.gamesWithLanguages} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

function PlatformConfigForm({ config, onChange }: { config: PlatformConfig; onChange: (c: PlatformConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <CheckboxRow
          label={t("auto.platform.windows")}
          checked={config.include_windows}
          onChange={(checked) => onChange({ ...config, include_windows: checked })}
        />
        <CheckboxRow
          label={t("auto.platform.mac")}
          checked={config.include_mac}
          onChange={(checked) => onChange({ ...config, include_mac: checked })}
        />
        <CheckboxRow
          label={t("auto.platform.linux")}
          checked={config.include_linux}
          onChange={(checked) => onChange({ ...config, include_linux: checked })}
        />
      </div>
    </div>
  );
}

function NameConfigForm({ config, onChange }: { config: NameConfig; onChange: (c: NameConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2">
        <CheckboxRow
          label={t("auto.ignoreLeadingThe")}
          checked={config.skip_leading_the}
          onChange={(checked) => onChange({ ...config, skip_leading_the: checked })}
        />
        <CheckboxRow
          label={t("auto.groupNumbers")}
          checked={config.group_numbers}
          onChange={(checked) => onChange({ ...config, group_numbers: checked })}
        />
        <CheckboxRow
          label={t("auto.groupOther")}
          checked={config.group_other}
          onChange={(checked) => onChange({ ...config, group_other: checked })}
        />
      </div>
    </div>
  );
}

function SteamRatingConfigForm({
  config,
  onChange,
}: {
  config: SteamRatingConfig;
  onChange: (c: SteamRatingConfig) => void;
}) {
  const t = useT();
  const rules = config.rules?.length ? config.rules : defaultSteamRatingRules();
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(0, rules.length - 1));
  const selectedRule = rules[selectedIndex];
  const duplicateNames = new Set(
    rules
      .map((rule) => rule.name.trim())
      .filter((name, index, all) => name && all.indexOf(name) !== index)
  );

  const updateRules = (nextRules: SteamRatingRule[]) => {
    onChange({ ...config, rules: nextRules });
  };
  const updateRule = (index: number, patch: Partial<SteamRatingRule>) => {
    updateRules(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };
  const addRule = () => {
    const next = [
      ...rules,
      { name: t("auto.newRatingRule"), min_score: 0, max_score: 100, min_reviews: 1, max_reviews: 0 },
    ];
    updateRules(next);
    setSelected(next.length - 1);
  };
  const duplicateRule = () => {
    if (!selectedRule) return;
    const next = [
      ...rules.slice(0, selectedIndex + 1),
      { ...selectedRule, name: t("auto.copyName", { name: selectedRule.name }) },
      ...rules.slice(selectedIndex + 1),
    ];
    updateRules(next);
    setSelected(selectedIndex + 1);
  };
  const removeRule = () => {
    if (rules.length <= 1) return;
    const next = rules.filter((_, index) => index !== selectedIndex);
    updateRules(next);
    setSelected(Math.min(selectedIndex, next.length - 1));
  };
  const moveRule = (direction: -1 | 1) => {
    const target = selectedIndex + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    updateRules(next);
    setSelected(target);
  };
  const resetRules = () => {
    updateRules(defaultSteamRatingRules());
    setSelected(0);
  };
  const addMissingDefaultRules = () => {
    const existing = new Set(rules.map((rule) => rule.name.trim().toLocaleLowerCase()).filter(Boolean));
    const missing = defaultSteamRatingRules().filter(
      (rule) => !existing.has(rule.name.trim().toLocaleLowerCase())
    );
    if (missing.length === 0) return;
    updateRules([...rules, ...missing]);
    setSelected(rules.length);
  };

  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-medium text-repressurizer-text">{t("auto.steamRatingBuckets")}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={addMissingDefaultRules}
              className="btn-press rounded-lg border border-repressurizer-border-subtle px-2 py-1 text-[11px] text-repressurizer-text-faint transition-colors hover:border-repressurizer-border hover:text-repressurizer-text"
            >
              {t("auto.addMissingDefaults")}
            </button>
            <button
              type="button"
              onClick={resetRules}
              className="btn-press rounded-lg border border-repressurizer-danger/30 px-2 py-1 text-[11px] text-repressurizer-danger/70 transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger"
            >
              {t("auto.replaceWithDefaults")}
            </button>
          </div>
        </div>
        <div className="mb-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
          <CheckboxRow
            label={t("auto.useWilsonScore")}
            checked={config.use_wilson_score ?? false}
            onChange={(checked) => onChange({ ...config, use_wilson_score: checked })}
          />
          <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
            {t("auto.useWilsonScore.explain")}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
          <div className="min-h-0 space-y-1">
            {rules.map((rule, index) => {
              const duplicate = duplicateNames.has(rule.name.trim());
              return (
                <button
                  key={`${rule.name}-${index}`}
                  type="button"
                  onClick={() => setSelected(index)}
                  className={`btn-press flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    index === selectedIndex
                      ? "border-repressurizer-accent bg-repressurizer-accent/10"
                      : duplicate
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-repressurizer-border-subtle bg-repressurizer-surface"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-repressurizer-text">{rule.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-repressurizer-accent">
                    {rule.min_score}-{rule.max_score}% · {rule.min_reviews}+
                  </span>
                </button>
              );
            })}
            <div className="grid grid-cols-4 gap-1 pt-1">
              <button type="button" onClick={addRule} className="btn-press flex h-8 items-center justify-center rounded-lg bg-repressurizer-accent/15 text-repressurizer-accent hover:bg-repressurizer-accent/25" title={t("auto.add")}>
                <Plus size={13} weight="bold" />
              </button>
              <button type="button" onClick={duplicateRule} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text" title={t("auto.duplicate")}>
                <CopySimple size={13} />
              </button>
              <button type="button" onClick={() => moveRule(-1)} disabled={selectedIndex === 0} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text disabled:opacity-30" title={t("auto.moveUp")}>
                <ArrowUp size={13} />
              </button>
              <button type="button" onClick={() => moveRule(1)} disabled={selectedIndex === rules.length - 1} className="btn-press flex h-8 items-center justify-center rounded-lg border border-repressurizer-border-subtle text-repressurizer-text-faint hover:text-repressurizer-text disabled:opacity-30" title={t("auto.moveDown")}>
                <ArrowDown size={13} />
              </button>
            </div>
          </div>
          {selectedRule && (
            <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface p-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{t("auto.name")}</label>
                <input
                  value={selectedRule.name}
                  onChange={(e) => updateRule(selectedIndex, { name: e.target.value })}
                  className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={t("auto.minScore")} value={selectedRule.min_score} min={0} max={100} onChange={(value) => updateRule(selectedIndex, { min_score: value })} />
                <NumberField label={t("auto.maxScore")} value={selectedRule.max_score} min={0} max={100} onChange={(value) => updateRule(selectedIndex, { max_score: value })} />
                <NumberField label={t("auto.minReviews")} value={selectedRule.min_reviews} min={0} onChange={(value) => updateRule(selectedIndex, { min_reviews: value })} />
                <NumberField label={t("auto.maxReviews")} value={selectedRule.max_reviews} min={0} onChange={(value) => updateRule(selectedIndex, { max_reviews: value })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-repressurizer-text-faint">{t("auto.maxReviewsHint")}</p>
                <button
                  type="button"
                  onClick={removeRule}
                  disabled={rules.length <= 1}
                  className="btn-press inline-flex items-center gap-1 rounded-lg border border-repressurizer-danger/30 px-2 py-1 text-[11px] text-repressurizer-danger/70 hover:text-repressurizer-danger disabled:opacity-30"
                >
                  <Trash size={12} />
                  {t("auto.delete")}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-repressurizer-text-faint">{t("auto.ratingRulesOrderHint")}</p>
        <p className="mt-1 text-repressurizer-text-faint">{t("auto.steamRatingSkipped")}</p>
        {duplicateNames.size > 0 && (
          <p className="mt-2 text-xs text-amber-400">{t("auto.duplicateRuleNames")}</p>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5 font-mono text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
      />
    </label>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text transition-colors hover:border-repressurizer-border">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-repressurizer-border bg-repressurizer-bg accent-repressurizer-accent"
      />
      <span>{label}</span>
    </label>
  );
}

function MetadataStatus({
  label,
  valueCount,
  gameCount,
  totalDetails,
}: {
  label: string;
  valueCount: number;
  gameCount: number;
  totalDetails: number;
}) {
  const t = useT();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-repressurizer-text-faint">
      <span className="rounded-md bg-repressurizer-surface-hover px-2 py-0.5">
        {label}: <span className="font-mono text-repressurizer-text tabular-nums">{valueCount}</span>
      </span>
      <span className="rounded-md bg-repressurizer-surface-hover px-2 py-0.5">
        {t("auto.metadataCoverage", { count: gameCount, total: totalDetails })}
      </span>
    </div>
  );
}

function TagListInput({
  label,
  items,
  newItem,
  setNewItem,
  onAddItem,
  onRemove,
  suggestions = [],
  status,
}: {
  label: string;
  items: string[];
  newItem: string;
  setNewItem: (v: string) => void;
  onAddItem: (v: string) => void;
  onRemove: (v: string) => void;
  suggestions?: string[];
  status?: ReactNode;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const normalizedItems = useMemo(() => new Set(items.map((item) => item.toLocaleLowerCase())), [items]);
  const query = newItem.trim().toLocaleLowerCase();
  const visibleSuggestions = useMemo(
    () =>
      suggestions
        .filter((item) => !normalizedItems.has(item.toLocaleLowerCase()))
        .filter((item) => !query || item.toLocaleLowerCase().includes(query))
        .slice(0, 24),
    [normalizedItems, query, suggestions]
  );
  const shouldShowSuggestions = suggestions.length > 0 && (focused || query.length > 0);

  const addValue = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (!normalizedItems.has(value.toLocaleLowerCase())) {
      onAddItem(value);
    }
    setNewItem("");
    setFocused(false);
  };

  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{label}</label>
      {status}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue(newItem);
            }
          }}
          placeholder={t("auto.typeEnter")}
          className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
        />
        <button onClick={() => addValue(newItem)} className="btn-press flex items-center justify-center w-8 h-8 rounded-lg bg-repressurizer-accent/15 text-repressurizer-accent hover:bg-repressurizer-accent/25">
          <Plus size={14} weight="bold" />
        </button>
      </div>
      {shouldShowSuggestions && (
        <div className="mb-2 max-h-32 overflow-auto rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-2">
          {visibleSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addValue(item)}
                  className="btn-press rounded-md border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 text-xs text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-1 text-xs text-repressurizer-text-faint">
              {t("auto.noSuggestions")}
            </p>
          )}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-md bg-repressurizer-surface-hover px-2.5 py-1 text-xs text-repressurizer-text">
              {item}
              <button onClick={() => onRemove(item)} className="text-repressurizer-text-faint hover:text-repressurizer-danger ml-0.5">
                <X size={11} weight="bold" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step: Fetch
// ============================================================

function FetchStep({ progress, total, error, waiting, coolingDown, cooldownSecs, message }: {
  progress: number;
  total: number;
  error: string;
  waiting: boolean;
  coolingDown: boolean;
  cooldownSecs: number;
  message: string;
}) {
  const t = useT();
  const percent = total > 0 ? Math.round((progress / total) * 100) : 0;

  if (error) {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-2 rounded-xl border border-repressurizer-danger/20 bg-repressurizer-danger/8 p-4 text-sm text-repressurizer-danger">
          <Warning size={16} weight="fill" className="shrink-0 mt-0.5" />
          {error}
        </div>
      </div>
    );
  }

  if (!waiting || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Spinner size={28} className="animate-spin text-repressurizer-accent mb-3" />
        <p className="text-sm text-repressurizer-text">{t("auto.running")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-repressurizer-text-muted">{message}</p>
      {coolingDown && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <Spinner size={12} className="animate-spin shrink-0" />
          <span>{t("fetch.slowingDown", { seconds: cooldownSecs })}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-repressurizer-bg">
        <div
          className="h-full rounded-full bg-repressurizer-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-repressurizer-text-faint tabular-nums">
        {t("auto.fetchProgress", { progress, total, percent })}
      </p>
      <p className="text-xs text-repressurizer-text-faint">{t("auto.fetchingBackground")}</p>
    </div>
  );
}

// ============================================================
// Step: Preview
// ============================================================

function PreviewStep({ result, context, notice, onBack, onApply }: {
  result: CategorizeResult;
  context: PreviewSortContext | null;
  notice: string;
  onBack: () => void;
  onApply: () => void;
}) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const [sortMode, setSortMode] = useState<PreviewSortMode>("count");
  const entries = useMemo(
    () => sortAutoCategorizePreviewEntries(result.assignments, sortMode, context),
    [context, result.assignments, sortMode]
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t("auto.categories"), value: entries.length },
          { label: t("auto.gamesCategorized"), value: result.games_categorized },
          { label: t("auto.gamesProcessed"), value: result.games_processed },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-center">
            <p className="font-mono text-xl font-semibold text-repressurizer-accent tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-repressurizer-text-faint">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
          {t("auto.previewSort")}
        </p>
        <div className="flex rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-1">
          {([
            ["count", t("auto.sortCount")],
            ["name", t("auto.sortName")],
            ["natural", t("auto.sortNatural")],
          ] as Array<[PreviewSortMode, string]>).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`btn-press rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                sortMode === mode
                  ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                  : "text-repressurizer-text-faint hover:text-repressurizer-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Category list — expandable */}
      <div className="space-y-0.5 max-h-72 overflow-auto rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-2">
        {entries.map(([name, ids]) => {
          const isOpen = expanded.has(name);
          return (
            <div key={name}>
              <button
                onClick={() => toggle(name)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-repressurizer-surface-hover"
              >
                <FolderSimplePlus size={14} weight="duotone" className="shrink-0 text-repressurizer-accent" />
                <span className="flex-1 text-sm text-repressurizer-text truncate">{name}</span>
                <span className="font-mono text-xs text-repressurizer-text-faint tabular-nums">{t("auto.gamesCount", { count: ids.length })}</span>
                <span className="text-repressurizer-text-faint text-[10px] ml-1">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="ml-8 mb-1 space-y-0.5">
                  {ids.map((id) => {
                    const g = games[id];
                    return (
                      <p key={id} className="text-[11px] text-repressurizer-text-muted truncate px-2 py-0.5">
                        {g ? String(g.name ?? "") : `#${id}`}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-repressurizer-text-faint">
        {t("auto.previewHint")}
      </p>

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
          <ArrowLeft size={14} /> {t("auto.back")}
        </button>
        <button onClick={onApply} className="btn-press inline-flex items-center gap-1.5 rounded-xl bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover">
          <Check size={14} weight="bold" /> {t("auto.step.apply")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Step: Done
// ============================================================

function DoneStep({ result, onClose }: { result: CategorizeResult; onClose: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-repressurizer-accent/15 mb-4">
        <Check size={28} weight="bold" className="text-repressurizer-accent" />
      </div>
      <p className="text-base font-semibold text-white mb-1">{t("auto.done")}</p>
      <p className="text-sm text-repressurizer-text-muted mb-6">
        {t("auto.doneSummary", { categories: Object.keys(result.assignments).length, games: result.games_categorized })}
        <br />
        {t("auto.rememberSave")}
      </p>
      <button onClick={onClose} className="btn-press rounded-xl bg-repressurizer-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover">
        {t("auto.close")}
      </button>
    </div>
  );
}
