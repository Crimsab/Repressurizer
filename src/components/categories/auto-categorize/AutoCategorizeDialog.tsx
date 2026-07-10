import { useState, useCallback, useEffect, useMemo } from "react";
import {
  isDetailsCacheCurrent,
  useGameStore,
} from "../../../stores/gameStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import {
  useAutoCategorizeStore,
  DEFAULT_STEAM_RATING_CONFIG,
  type AutoCategorizePreset,
  type AutoCategorizePresetConfig,
} from "../../../stores/autoCategorizeStore";
import { useBackgroundFetchStore } from "../../../stores/backgroundFetchStore";
import { useHltbStore } from "../../../stores/hltbStore";
import { useSteamRatingsStore } from "../../../stores/steamRatingsStore";
import { useHltbIgnoredStore } from "../../../stores/hltbIgnoredStore";
import {
  yearCategorizationReleaseDate,
} from "../../../lib/releaseDates";
import { extractReleaseYear } from "../../../lib/search";
import {
  applyAutoCategorizeAssignments,
  withExpectedAutoCategories,
} from "../../../lib/autoCategorizeApply";
import {
  type PreviewSortContext,
} from "../../../lib/autoCategorizePreview";
import { DialogOverlay } from "../../ui/DialogOverlay";
import {
  categorizeBySteamRating,
  isSteamRatingFresh,
  steamRatingIdsNeedingFetch,
} from "../../../lib/steamRatings";
import {
  customRatingIdsNeedingFetch,
  evaluateCustomAutoCat,
  normalizeCustomAutoCatConfig,
  type CustomAutoCatConfigV1,
} from "../../../lib/customAutoCategorize";
import {
  categorizeByHltb,
  hltbModeForConfig,
  hltbProcessedAppIds,
} from "../../../lib/hltbCategorizer";
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
} from "../../../lib/tauri";
import {
  X,
  Robot,
  Check,
} from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../../lib/i18n";
import {
  DEFAULT_HLTB_CONFIG,
  buildAutoCatMetadata,
  canRunPresetsWithCache,
  categorizerNeedsDetails,
  categorizerNeedsRatings,
  customDiagnosticsNotice,
  detailIdsNeedingBaseFetchForType,
  detailIdsNeedingFetchForType,
  detailIdsNeedingReleaseDateFetchForType,
  detailIdsReadyForType,
  detailsReadyForType,
  missingBaseDetailIdsForPresets,
  missingDetailIdsForPresets,
  missingRatingIdsForPresets,
  missingReleaseDateIdsForPresets,
  presetId,
  ratingIdsReady,
  withProcessedAppIds,
  type AutoCategorizeFetchKind as FetchKind,
  type AutoCategorizeStep as Step,
  type CategorizerType,
} from "./autoCategorizeModel";
import { ChooseStep, categorizerLabel } from "./AutoCategorizeChooseStep";
import {
  DoneStep,
  FetchStep,
  PreviewStep,
} from "./AutoCategorizeResultSteps";
import { ConfigureStep } from "./AutoCategorizeConfigureStep";

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
  const ignoredHltbFails = useHltbIgnoredStore((s) => s.fails);
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
  const [customConfig, setCustomConfig] = useState<CustomAutoCatConfigV1>(
    normalizeCustomAutoCatConfig(persist.customConfig)
  );
  const [hltbConfig, setHltbConfig] = useState<HoursConfig>({
    ...DEFAULT_HLTB_CONFIG,
    hltb_time_mode: hltbTimeMode,
  });
  const [presetName, setPresetName] = useState("");
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);

  // Whether we're waiting for a details fetch to complete before running categorizer
  const [waitingForFetch, setWaitingForFetch] = useState(false);
  const [fetchKind, setFetchKind] = useState<FetchKind | null>(null);
  const [pendingPresetRun, setPendingPresetRun] = useState<AutoCategorizePreset[] | null>(null);

  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState<CategorizeResult | null>(persist.lastResult);
  const [previewContext, setPreviewContext] = useState<PreviewSortContext | null>(null);
  const [previewNotice, setPreviewNotice] = useState("");
  const [runError, setRunError] = useState("");

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
      const config = currentConfig();
      if (fetchKind !== "releaseDates" && categorizerNeedsDetails(type, config)) {
        const missingReleaseDates = detailIdsNeedingReleaseDateFetchForType(type, games, details, config);
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
    if (type === "custom") return customConfig;
    return {};
  }, [type, hoursConfig, genreConfig, tagsConfig, yearConfig, devPubConfig, flagsConfig, languageConfig, platformConfig, nameConfig, ratingConfig, hltbConfig, customConfig]);

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
    if (preset.type === "custom") setCustomConfig(normalizeCustomAutoCatConfig(preset.config));
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
    if (step === "configure" && categorizerNeedsRatings(type, currentConfig())) {
      ensureSteamRatingsHydrated().catch(() => {});
    }
  }, [currentConfig, ensureSteamRatingsHydrated, step, type]);

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
    const missingRatings = missingRatingIdsForPresets(presets, games, currentRatings);

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

    if (presets.some((preset) => categorizerNeedsRatings(preset.type, preset.config))) {
      await ensureSteamRatingsHydrated();
    }

    if (startMissingPresetFetch(presets)) return;

    await runPresetSequence(presets);
  };

  const handleRunPresetsCachedOnly = async () => {
    const presets = [...persist.presets];
    if (presets.length === 0) return;
    const currentRatings = presets.some((preset) => categorizerNeedsRatings(preset.type, preset.config))
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
      customConfig,
    });

    // HLTB categorizer: no fetch needed, runs directly
    if (type === "hltb") {
      await runCategorizer();
      return;
    }

    const config = currentConfig();

    if (type === "rating" || categorizerNeedsRatings(type, config)) {
      const currentRatings = await ensureSteamRatingsHydrated();
      const missing = type === "custom"
        ? customRatingIdsNeedingFetch(normalizeCustomAutoCatConfig(config), games, currentRatings)
        : steamRatingIdsNeedingFetch(games, currentRatings);
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

    if (categorizerNeedsDetails(type, config)) {
      const missing = detailIdsNeedingBaseFetchForType(type, games, details, detailsCacheMaxAgeDays, config);

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

      const missingReleaseDates = detailIdsNeedingReleaseDateFetchForType(type, games, details, config);

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
      customConfig,
    });

    const config = currentConfig();
    const needsDetails = categorizerNeedsDetails(type, config);
    const needsRatings = categorizerNeedsRatings(type, config);

    if (needsDetails && detailIdsReadyForType(type, games, details, config).length === 0) {
      setRunError(t("auto.cachedOnlyNoMetadata"));
      return;
    }
    const currentRatings = needsRatings
      ? await ensureSteamRatingsHydrated()
      : ratings;
    if (needsRatings && ratingIdsReady(games, currentRatings).length === 0) {
      setRunError(t("auto.cachedOnlyNoMetadata"));
      return;
    }

    const skippedDetails = needsDetails
      ? detailIdsNeedingFetchForType(type, games, details, detailsCacheMaxAgeDays, config).length
      : needsRatings
        ? (type === "custom"
          ? customRatingIdsNeedingFetch(normalizeCustomAutoCatConfig(config), games, currentRatings).length
          : steamRatingIdsNeedingFetch(games, currentRatings).length)
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
    const gamesForRun = options.cachedOnly && categorizerNeedsRatings(runType, config)
      ? allGames.filter((game) => isSteamRatingFresh(ratingsForRun[game.appid]))
      : allGames;
    const allDetails = options.cachedOnly && categorizerNeedsDetails(runType, config)
      ? detailsReadyForType(runType, games, details, config)
      : Object.values(details);

    if (runType === "custom") {
      return evaluateCustomAutoCat({
        config: normalizeCustomAutoCatConfig(config),
        games,
        details,
        collections,
        hltbData,
        ratings: ratingsForRun,
        hltbTimeMode,
        detailsCacheMaxAgeDays,
      });
    }

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
      const resolvedConfig = {
        ...cfg,
        prefix: cfg.prefix || undefined,
        hltb_time_mode: mode,
      };
      return withProcessedAppIds(
        categorizeByHltb(gamesForRun, hltbData, ignoredHltbFails, resolvedConfig),
        hltbProcessedAppIds(gamesForRun, hltbData, ignoredHltbFails, resolvedConfig)
      );
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
  }, [collections, details, detailsCacheMaxAgeDays, games, hltbData, ignoredHltbFails, hltbTimeMode]);

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
      const customNotice = rawResult.custom_diagnostics
        ? customDiagnosticsNotice(rawResult.custom_diagnostics)
        : "";
      setPreviewNotice(options.cachedOnly
        ? [t("auto.cachedOnlyNotice", { count: options.skippedDetails ?? 0 }), customNotice].filter(Boolean).join(" ")
        : customNotice);
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
    ignoredHltbFails,
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
      const processedIds = new Set<number>();

      for (const preset of presets) {
        const rawPresetResult = await runCategorizerConfig(preset.type, preset.config, options);
        const presetResult = options.cachedOnly
          ? rawPresetResult
          : withExpectedAutoCategories(rawPresetResult, preset.type, preset.config);
        for (const id of presetResult.processed_app_ids ?? []) {
          processedIds.add(id);
        }
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
        games_processed: processedIds.size || Object.keys(games).length,
        games_categorized: categorizedIds.size,
        processed_app_ids: processedIds.size > 0 ? [...processedIds].sort((a, b) => a - b) : undefined,
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
    setRunError("");

    if (!steamPath.trim() || !steamId3.trim()) {
      setRunError(t("auto.backupUnavailable"));
      return;
    }
    try {
      await createManualBackup(steamPath, steamId3, t("auto.backupName"));
    } catch (error) {
      setRunError(t("auto.backupFailed", { error: String(error) }));
      return;
    }

    applyImportedCollections(
      applyAutoCategorizeAssignments(collections, result.assignments, undefined, {
        processedAppIds: result.processed_app_ids,
      })
    );

    gotoStep("done");
  };

  const activeConfig = currentConfig();
  const activeNeedsDetails = categorizerNeedsDetails(type, activeConfig);
  const activeNeedsRatings = categorizerNeedsRatings(type, activeConfig);
  const activeMissingDetails = detailIdsNeedingFetchForType(type, games, details, detailsCacheMaxAgeDays, activeConfig);
  const activeMissingRatings = type === "custom"
    ? customRatingIdsNeedingFetch(normalizeCustomAutoCatConfig(activeConfig), games, ratings)
    : steamRatingIdsNeedingFetch(games, ratings);

  return (
    <DialogOverlay
      label={t("auto.title")}
      onClose={onClose}
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
          <button onClick={onClose} aria-label={t("common.close")} className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
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
              customConfig={customConfig} setCustomConfig={setCustomConfig}
              collections={collections}
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
                  activeNeedsDetails &&
                  detailIdsReadyForType(type, games, details, activeConfig).length > 0 &&
                  activeMissingDetails.length > 0
                ) ||
                (
                  activeNeedsRatings &&
                  ratingIdsReady(games, ratings).length > 0 &&
                  activeMissingRatings.length > 0
                )
              }
              cachedOnlyMissingCount={
                activeNeedsDetails
                  ? activeMissingDetails.length
                  : activeNeedsRatings
                    ? activeMissingRatings.length
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
              error={runError}
              onBack={() => gotoStep("configure")}
              onApply={handleApply}
            />
          )}
          {step === "done" && (
            <DoneStep result={result!} onClose={onClose} />
          )}
        </div>
      </div>
    </DialogOverlay>
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

// ============================================================
// Step: Configure
// ============================================================
