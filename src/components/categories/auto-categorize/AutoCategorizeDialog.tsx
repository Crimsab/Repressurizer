import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  type AutoCategorizeDiaryAction,
} from "../../../stores/autoCategorizeStore";
import { useBackgroundFetchStore } from "../../../stores/backgroundFetchStore";
import { useHltbStore } from "../../../stores/hltbStore";
import { useSteamRatingsStore } from "../../../stores/steamRatingsStore";
import { useDiaryStore } from "../../../stores/diaryStore";
import { useStatusStore, type GameStatus } from "../../../stores/statusStore";
import { useToastStore } from "../../../stores/toastStore";
import { useReviewStore } from "../../../stores/reviewStore";
import { useHltbIgnoredStore } from "../../../stores/hltbIgnoredStore";
import { useFailedGamesStore } from "../../../stores/failedGamesStore";
import { DEFAULT_COLUMN_COLORS, STATUS_LABELS, type DiaryViewStatus } from "../../diary/diaryShared";
import {
  yearCategorizationReleaseDate,
} from "../../../lib/releaseDates";
import { extractReleaseYear } from "../../../lib/search";
import {
  applyAutoCategorizeAssignments,
  withConservativeMetadataScopes,
  withExpectedAutoCategories,
} from "../../../lib/autoCategorizeApply";
import { combineAutoCategorizePresetResults } from "../../../lib/autoCategorizePresetResults";
import {
  diaryGroupColumnLabel,
  normalizeDiaryColumnName,
  sanitizeDiaryColumnLabel,
  suggestDiaryRuleColumnName,
  uniquifyDiaryColumnLabel,
} from "../../../lib/diaryAutoCatNaming";
import {
  buildAutoCategorizeDiff,
  type AutoCategorizeDiffRule,
} from "../../../lib/autoCategorizeDiff";
import { exportAutoCategorizeDiffToDisk } from "../../../lib/autoCategorizeDiffExport";
import {
  type PreviewSortContext,
} from "../../../lib/autoCategorizePreview";
import { DialogOverlay } from "../../ui/DialogOverlay";
import { ResizableDialogPanel } from "../../ui/ResizableDialogPanel";
import { SelectMenu } from "../../ui/SelectMenu";
import {
  categorizeBySteamRating,
  isSteamRatingFresh,
  steamRatingIdsNeedingFetch,
} from "../../../lib/steamRatings";
import {
  customRatingIdsNeedingFetch,
  evaluateCustomAutoCat,
  findIncompleteConditionIds,
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
  currentGameDetails,
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

export type AutoCategorizeTarget = "collections" | "diary";

interface AutoCategorizeDialogProps {
  onClose: () => void;
  initialTarget?: AutoCategorizeTarget;
}

interface DiaryAutoCatColumn {
  key: string;
  label: string;
  color: string;
  kind: "status" | "custom";
  status?: DiaryViewStatus;
  customId?: string;
}

function detailIdsEligibleForFetch(ids: number[]): number[] {
  const { isIgnored } = useFailedGamesStore.getState();
  return ids.filter((id) => !isIgnored(id));
}

export function AutoCategorizeDialog({ onClose, initialTarget = "collections" }: AutoCategorizeDialogProps) {
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
  const diaryEntries = useDiaryStore((s) => s.entries);
  const diaryJournal = useDiaryStore((s) => s.journal);
  const diaryPages = useDiaryStore((s) => s.pages);
  const diaryBoardPrefs = useDiaryStore((s) => s.boardPrefs);
  const addCustomColumn = useDiaryStore((s) => s.addCustomColumn);
  const removeCustomColumn = useDiaryStore((s) => s.removeCustomColumn);
  const captureBulkSnapshot = useDiaryStore((s) => s.captureBulkSnapshot);
  const restoreBulkSnapshot = useDiaryStore((s) => s.restoreBulkSnapshot);
  const setBulkDecision = useDiaryStore((s) => s.setBulkDecision);
  const setBulkMarkedBacklog = useDiaryStore((s) => s.setBulkMarkedBacklog);
  const setBulkCustomAssignment = useDiaryStore((s) => s.setBulkCustomAssignment);
  const logStatusEvents = useDiaryStore((s) => s.logStatusEvents);
  const gameStatuses = useStatusStore((s) => s.statuses);
  const setBulkStatus = useStatusStore((s) => s.setBulkStatus);
  const captureStatusSnapshot = useStatusStore((s) => s.captureSnapshot);
  const restoreStatusSnapshot = useStatusStore((s) => s.restoreSnapshot);
  const userReviews = useReviewStore((s) => s.reviews);
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
    if (initialTarget !== "collections") return "choose";
    if (persist.lastStep === "done") return "choose";
    return persist.lastStep;
  });
  const [type, setType] = useState<CategorizerType>(initialTarget === "diary" ? "custom" : persist.lastType);
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
  const [target, setTarget] = useState<AutoCategorizeTarget>(initialTarget);
  const [diaryTargetColumn, setDiaryTargetColumn] = useState("backlog");
  const [diaryAction, setDiaryAction] = useState<AutoCategorizeDiaryAction>("existingColumn");
  const [diaryNewColumnName, setDiaryNewColumnName] = useState("");
  const [diaryNewColumnColor, setDiaryNewColumnColor] = useState("#8b5cf6");
  const [diaryAutoColumnPrefix, setDiaryAutoColumnPrefix] = useState("");
  const [diaryAutoColumnLimit, setDiaryAutoColumnLimit] = useState(8);
  const [diaryAutoColumnReuse, setDiaryAutoColumnReuse] = useState(true);
  const [diaryMoveMatches, setDiaryMoveMatches] = useState(true);

  // Whether we're waiting for a details fetch to complete before running categorizer
  const [waitingForFetch, setWaitingForFetch] = useState(false);
  const [fetchKind, setFetchKind] = useState<FetchKind | null>(null);
  const [pendingPresetRun, setPendingPresetRun] = useState<AutoCategorizePreset[] | null>(null);

  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState<CategorizeResult | null>(initialTarget === "collections" ? persist.lastResult : null);
  const [previewContext, setPreviewContext] = useState<PreviewSortContext | null>(null);
  const [previewRules, setPreviewRules] = useState<AutoCategorizeDiffRule[]>([]);
  const [previewNotice, setPreviewNotice] = useState("");
  const [runError, setRunError] = useState("");
  const [diaryUndo, setDiaryUndo] = useState<(() => void) | null>(null);
  const [diaryUndoNotice, setDiaryUndoNotice] = useState("");
  const [diaryAppliedSummary, setDiaryAppliedSummary] = useState("");

  const metadata = useMemo(
    () => buildAutoCatMetadata(Object.values(details).filter(isDetailsCacheCurrent)),
    [details]
  );

  const diaryColumns = useMemo<DiaryAutoCatColumn[]>(() => {
    const statuses: DiaryViewStatus[] = ["backlog", "playing", "abandoned", "finished", "archived"];
    return [
      ...statuses
        .map((status) => ({
        key: status,
        label: t(STATUS_LABELS[status]),
        color: diaryBoardPrefs.columnColors[status] ?? DEFAULT_COLUMN_COLORS[status],
        kind: "status" as const,
        status,
      })),
      ...diaryBoardPrefs.customColumns
        .map((column) => ({
        key: column.id,
        label: column.name,
        color: diaryBoardPrefs.columnColors[column.id] ?? column.color,
        kind: "custom" as const,
        customId: column.id,
      })),
    ];
  }, [diaryBoardPrefs.columnColors, diaryBoardPrefs.customColumns, diaryBoardPrefs.hiddenColumns, t]);

  useEffect(() => {
    if (!diaryColumns.some((column) => column.key === diaryTargetColumn)) {
      setDiaryTargetColumn(diaryColumns[0]?.key ?? "backlog");
    }
  }, [diaryColumns, diaryTargetColumn]);

  // Deterministic, offline default for the "Create a new column" naming field:
  // derived from the rule source/conditions and editable by the user.
  const suggestedNewColumnName = useMemo(() => {
    if (target !== "diary") return "";
    return suggestDiaryRuleColumnName({
      type,
      config: customConfig,
      sourceLabel: categorizerLabel(type, t),
    }).slice(0, 24);
  }, [customConfig, t, target, type]);

  const lastSuggestedNameRef = useRef("");
  useEffect(() => {
    if (target !== "diary" || diaryAction === "existingColumn") {
      lastSuggestedNameRef.current = "";
      return;
    }
    const suggestion = suggestedNewColumnName;
    const previous = lastSuggestedNameRef.current;
    lastSuggestedNameRef.current = suggestion;
    setDiaryNewColumnName((current) => {
      const trimmed = current.trim();
      // Follow the derived default until the user edits the field by hand.
      if (trimmed.length === 0 || trimmed === previous.trim()) return suggestion;
      return current;
    });
  }, [diaryAction, suggestedNewColumnName, target]);

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

  const changeTarget = (nextTarget: AutoCategorizeTarget) => {
    if (nextTarget === target) return;
    setTarget(nextTarget);
    if (nextTarget === "diary") {
      setType("custom");
      persist.set({ lastType: "custom" });
    }
    if (nextTarget === "collections") setDiaryAction("existingColumn");
    setDiaryUndo(null);
    setDiaryUndoNotice("");
    setDiaryAppliedSummary("");
    setResult(null);
    setPreviewContext(null);
    setPreviewRules([]);
    setPreviewNotice("");
    setRunError("");
    persist.set({ lastResult: null });
    gotoStep("choose");
  };

  const handleDiaryActionChange = (nextAction: AutoCategorizeDiaryAction) => {
    setDiaryAction(nextAction);
    setDiaryMoveMatches(true);
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

  useEffect(() => {
    if (step === "preview" && result && previewRules.length === 0) {
      setPreviewRules([{ type, config: currentConfig() }]);
    }
  }, [currentConfig, previewRules.length, result, step]);

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
    if (preset.target) setTarget(preset.target);
    if (preset.diaryColumn) setDiaryTargetColumn(preset.diaryColumn);
    setDiaryAction(preset.diaryAction ?? "existingColumn");
    setDiaryNewColumnName(preset.diaryNewColumnName ?? "");
    setDiaryNewColumnColor(preset.diaryNewColumnColor ?? "#8b5cf6");
    setDiaryAutoColumnPrefix(preset.diaryAutoColumnPrefix ?? "");
    setDiaryAutoColumnLimit(preset.diaryAutoColumnLimit ?? 8);
    setDiaryAutoColumnReuse(preset.diaryAutoColumnReuse ?? true);
    setDiaryMoveMatches(preset.diaryMoveMatches ?? true);
    setDiaryUndo(null);
    setDiaryUndoNotice("");
    setDiaryAppliedSummary("");
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
    const missingDetails = detailIdsEligibleForFetch(
      missingBaseDetailIdsForPresets(presets, games, details, detailsCacheMaxAgeDays)
    );

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
      target,
      diaryColumn: target === "diary" ? diaryTargetColumn : undefined,
      diaryAction: target === "diary" ? diaryAction : undefined,
      diaryNewColumnName: target === "diary" && diaryAction === "newColumn" ? diaryNewColumnName.trim().slice(0, 24) : undefined,
      diaryNewColumnColor: target === "diary" && diaryAction === "newColumn" ? diaryNewColumnColor : undefined,
      diaryAutoColumnPrefix: target === "diary" && diaryAction === "autoColumns" ? diaryAutoColumnPrefix.trim().slice(0, 16) : undefined,
      diaryAutoColumnLimit: target === "diary" && diaryAction === "autoColumns" ? Math.min(12, Math.max(1, Math.floor(diaryAutoColumnLimit))) : undefined,
      diaryAutoColumnReuse: target === "diary" && diaryAction === "autoColumns" ? diaryAutoColumnReuse : undefined,
      diaryMoveMatches: target === "diary" ? diaryMoveMatches : undefined,
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

  const preparePresetDestination = useCallback((presets: AutoCategorizePreset[]): boolean => {
    const destinations = new Set(presets.map((preset) => preset.target ?? "collections"));
    const diaryPresets = presets.filter((preset) => (preset.target ?? "collections") === "diary");
    const diaryActions = new Set(diaryPresets.map((preset) => preset.diaryAction ?? "existingColumn"));
    const diaryColumnsForRun = new Set(diaryPresets.map((preset) => preset.diaryColumn ?? "backlog"));
    const diaryNewNames = new Set(diaryPresets.map((preset) => preset.diaryNewColumnName?.trim()).filter(Boolean));
    const diaryAutoPrefixes = new Set(diaryPresets.map((preset) => preset.diaryAutoColumnPrefix?.trim() ?? ""));
    const diaryAutoLimits = new Set(diaryPresets.map((preset) => preset.diaryAutoColumnLimit ?? 8));
    const diaryAutoReuse = new Set(diaryPresets.map((preset) => preset.diaryAutoColumnReuse ?? true));
    const diaryMove = new Set(diaryPresets.map((preset) => preset.diaryMoveMatches ?? true));
    if (
      destinations.size > 1 ||
      diaryActions.size > 1 ||
      (diaryActions.has("existingColumn") && diaryColumnsForRun.size > 1) ||
      (diaryActions.has("newColumn") && diaryNewNames.size > 1) ||
      (diaryActions.has("autoColumns") && (diaryAutoPrefixes.size > 1 || diaryAutoLimits.size > 1 || diaryAutoReuse.size > 1)) ||
      diaryMove.size > 1
    ) {
      setRunError(t("auto.presets.mixedDestination"));
      return false;
    }
    const destination = [...destinations][0] ?? "collections";
    if (destination !== target) setTarget(destination);
    if (destination === "diary") {
      const diaryPreset = diaryPresets[0];
      const action = diaryPreset?.diaryAction ?? "existingColumn";
      setDiaryAction(action);
      if (action === "existingColumn") setDiaryTargetColumn([...diaryColumnsForRun][0] ?? "backlog");
      else if (action === "newColumn") {
        setDiaryNewColumnName(diaryPreset?.diaryNewColumnName ?? "");
        setDiaryNewColumnColor(diaryPreset?.diaryNewColumnColor ?? "#8b5cf6");
      } else {
        setDiaryAutoColumnPrefix(diaryPreset?.diaryAutoColumnPrefix ?? "");
        setDiaryAutoColumnLimit(diaryPreset?.diaryAutoColumnLimit ?? 8);
        setDiaryAutoColumnReuse(diaryPreset?.diaryAutoColumnReuse ?? true);
      }
      setDiaryMoveMatches(diaryPreset?.diaryMoveMatches ?? true);
    }
    return true;
  }, [t, target]);

  const handleRunPresets = async () => {
    const presets = [...persist.presets];
    if (presets.length === 0) return;

    setRunError("");
    if (!preparePresetDestination(presets)) return;
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
    if (!preparePresetDestination(presets)) return;
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
  const guardIncompleteCustomConditions = (): boolean => {
    if (type !== "custom") return false;
    const incomplete = findIncompleteConditionIds(normalizeCustomAutoCatConfig(customConfig)).length;
    if (incomplete > 0) {
      setRunError(t("auto.custom.incompleteWarning", { count: incomplete }));
      return true;
    }
    return false;
  };

  const handleConfigure = async () => {
    if (guardIncompleteCustomConditions()) return;
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
      const missing = detailIdsEligibleForFetch(
        detailIdsNeedingBaseFetchForType(type, games, details, detailsCacheMaxAgeDays, config)
      );

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
    if (guardIncompleteCustomConditions()) return;
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
      : currentGameDetails(games, details, detailsCacheMaxAgeDays);

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
        diary: {
          entries: diaryEntries,
          statuses: gameStatuses,
          ratings: userReviews,
          journal: diaryJournal,
          pageAppIds: new Set(diaryPages.flatMap((page) => page.scope === "all" ? Object.keys(games).map(Number) : page.appIds)),
        },
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
  }, [collections, details, detailsCacheMaxAgeDays, diaryEntries, diaryJournal, diaryPages, gameStatuses, games, hltbData, ignoredHltbFails, hltbTimeMode, userReviews]);

  const runCategorizer = useCallback(async (
    options: { cachedOnly?: boolean; skippedDetails?: number } = {}
  ) => {
    setRunError("");
    try {
      const config = currentConfig();
      const rawResult = await runCategorizerConfig(type, config, options);
      const categorizedResult = options.cachedOnly
        ? rawResult
        : withExpectedAutoCategories(rawResult, type, config);
      const res = withConservativeMetadataScopes(categorizedResult, type);

      setResult(res);
      setPreviewContext({ type, config });
      setPreviewRules([{ type, config }]);
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
      const presetResults: CategorizeResult[] = [];

      for (const preset of presets) {
        const rawPresetResult = await runCategorizerConfig(preset.type, preset.config, options);
        const categorizedResult = options.cachedOnly
          ? rawPresetResult
          : withExpectedAutoCategories(rawPresetResult, preset.type, preset.config);
        const presetResult = withConservativeMetadataScopes(categorizedResult, preset.type);
        presetResults.push(presetResult);
      }

      const res = combineAutoCategorizePresetResults(presetResults, Object.keys(games).length);

      setResult(res);
      setPreviewContext(null);
      setPreviewRules(presets.map((preset) => ({
        type: preset.type,
        name: preset.name,
        config: preset.config,
      })));
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
  const handleExportDiff = async () => {
    if (!result) return null;
    const document = buildAutoCategorizeDiff(collections, result, previewRules);
    return exportAutoCategorizeDiffToDisk(document);
  };

  const applyDiaryTarget = useCallback((appIds: number[], columnKey: string) => {
    const ids = [...new Set(appIds.filter((appId) => Number.isFinite(appId)).map((appId) => Math.trunc(appId)))];
    const column = diaryColumns.find((candidate) => candidate.key === columnKey);
    if (ids.length === 0 || !column) return;

    if (column.kind === "custom" && column.customId) {
      setBulkCustomAssignment(ids, column.customId);
      return;
    }

    setBulkCustomAssignment(ids, null);
    const status = column.status;
    if (!status) return;
    const statusEvents: Array<{ appId: number; status: string }> = [];
    const applyStatus = (gameStatus: GameStatus, decision: "backlog" | "next" | "archived", markedBacklog: boolean) => {
      setBulkStatus(ids, gameStatus);
      setBulkDecision(ids, decision);
      setBulkMarkedBacklog(ids, markedBacklog);
      for (const appId of ids) statusEvents.push({ appId, status });
    };

    if (status === "backlog") applyStatus("none", "backlog", true);
    else if (status === "playing") applyStatus("playing", "next", false);
    else if (status === "finished") applyStatus("completed", "backlog", false);
    else if (status === "abandoned") applyStatus("abandoned", "backlog", false);
    else {
      setBulkDecision(ids, "archived");
      setBulkMarkedBacklog(ids, false);
      for (const appId of ids) statusEvents.push({ appId, status });
    }
    if (statusEvents.length > 0) logStatusEvents(statusEvents);
  }, [diaryColumns, logStatusEvents, setBulkCustomAssignment, setBulkDecision, setBulkMarkedBacklog, setBulkStatus]);

  const handleApply = async () => {
    if (!result) return;
    setRunError("");

    if (target === "diary") {
      const groupedIds = Object.entries(result.assignments)
        .map(([group, ids]) => [group, [...new Set(ids.filter((appId) => Number.isFinite(appId)).map((appId) => Math.trunc(appId)))]] as const)
        .filter(([, ids]) => ids.length > 0);
      const appIds = [...new Set(groupedIds.flatMap(([, ids]) => ids))];
      if (appIds.length === 0) {
        setDiaryUndo(null);
        setDiaryUndoNotice("");
        gotoStep("done");
        return;
      }

      // Keep both the Diary placement and the progress status. Undo therefore
      // restores the exact pre-run state, including queue order and custom
      // assignments, instead of guessing from the current column.
      const diarySnapshot = captureBulkSnapshot(appIds);
      const statusSnapshot = captureStatusSnapshot(appIds);
      const createdColumnIds: string[] = [];
      let undone = false;
      const undoDiaryRun = () => {
        if (undone) return;
        undone = true;
        restoreStatusSnapshot(statusSnapshot);
        restoreBulkSnapshot(diarySnapshot);
        for (const columnId of createdColumnIds) removeCustomColumn(columnId);
        setDiaryUndo(null);
        setDiaryUndoNotice(t("auto.diary.undoDone"));
      };

      if (diaryAction === "newColumn") {
        const requestedName = sanitizeDiaryColumnLabel(
          diaryNewColumnName.trim() || suggestedNewColumnName
        );
        const color = /^#[0-9a-fA-F]{6}$/.test(diaryNewColumnColor) ? diaryNewColumnColor : "#8b5cf6";
        if (!requestedName) {
          setRunError(t("auto.diaryNewColumnError"));
          return;
        }
        const existing = diaryBoardPrefs.customColumns.find((column) => column.name.trim().toLocaleLowerCase() === requestedName.toLocaleLowerCase());
        const columnId = existing?.id ?? addCustomColumn(requestedName, color);
        if (!columnId) {
          setRunError(t("auto.diaryNewColumnError"));
          return;
        }
        if (!existing) createdColumnIds.push(columnId);
        if (diaryMoveMatches) setBulkCustomAssignment(appIds, columnId);
      } else if (diaryAction === "autoColumns") {
        const limit = Math.min(12, Math.max(1, Math.floor(diaryAutoColumnLimit) || 8));
        const prefix = diaryAutoColumnPrefix.trim();
        const groupsToApply = groupedIds.slice(0, limit);
        const palette = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#f97316", "#14b8a6", "#eab308"];
        const knownColumns = [...diaryBoardPrefs.customColumns];
        // Collision-safe labels: track every name (existing + planned) so two
        // groups never collapse into one ambiguous local column.
        const takenNames = new Set(knownColumns.map((column) => normalizeDiaryColumnName(column.name)));
        for (const [[groupName, ids], index] of groupsToApply.map((group, index) => [group, index] as const)) {
          const cleanGroupName = groupName.trim() || t("auto.diaryAction.auto");
          const baseLabel = diaryGroupColumnLabel(cleanGroupName, prefix);
          const existing = diaryAutoColumnReuse
            ? knownColumns.find((column) => normalizeDiaryColumnName(column.name) === normalizeDiaryColumnName(baseLabel))
            : undefined;
          let requestedName = baseLabel;
          if (!existing) {
            requestedName = uniquifyDiaryColumnLabel(baseLabel, takenNames);
            takenNames.add(normalizeDiaryColumnName(requestedName));
          }
          const columnId = existing?.id ?? addCustomColumn(requestedName, palette[index % palette.length]);
          if (!columnId) continue;
          if (!existing) {
            createdColumnIds.push(columnId);
            knownColumns.push({ id: columnId, name: requestedName, color: palette[index % palette.length] });
          }
          if (diaryMoveMatches) setBulkCustomAssignment([...ids], columnId);
        }
        const omitted = Math.max(0, groupedIds.length - groupsToApply.length);
        setDiaryUndoNotice(omitted > 0 ? t("auto.diaryAutoColumnLimitNotice", { count: omitted }) : "");
      } else {
        applyDiaryTarget(appIds, diaryTargetColumn);
      }

      setDiaryAppliedSummary(
        diaryAction === "existingColumn" || diaryMoveMatches
          ? t("auto.diary.applied", { count: appIds.length })
          : t("auto.diary.createdOnly", { count: createdColumnIds.length }),
      );
      setDiaryUndo(() => undoDiaryRun);
      useToastStore.getState().addAction(
        "success",
        t("auto.diary.applied", { count: appIds.length }),
        t("common.undo"),
        undoDiaryRun,
      );
      gotoStep("done");
      return;
    }

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
        processedAppIdsByCategory: result.processed_app_ids_by_category,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <ResizableDialogPanel
        dialogId="auto-categorize"
        defaultSize={{ width: 920, height: 760 }}
        minSize={{ width: 640, height: 480 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface animate-fade-in shadow-dialog"
      >
        {({ sizeControls }) => (
          <>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Robot size={18} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold text-white tracking-tight">{t("auto.title")}</h2>
          </div>
          <div className="flex items-center gap-1">
            {sizeControls}
            <button onClick={onClose} aria-label={t("common.close")} className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-repressurizer-border-subtle bg-repressurizer-bg/35 px-6 py-2.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">
            <span>{t("auto.destination")}</span>
            <SelectMenu<AutoCategorizeTarget>
              value={target}
              options={[
                { value: "collections", label: t("auto.destination.collections") },
                { value: "diary", label: t("auto.destination.diary") },
              ]}
              onChange={changeTarget}
              ariaLabel={t("auto.destination")}
              testId="autocat-destination"
              size="sm"
              className="min-w-[196px]"
              buttonClassName="normal-case tracking-normal font-normal"
            />
          </div>
        </div>

        {/* Steps indicator */}
        <StepBar step={step} />

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {step === "choose" && (
              <ChooseStep
                presets={persist.presets}
                diaryMode={target === "diary"}
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
              diaryMode={target === "diary"}
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
              previewRules={previewRules}
              notice={previewNotice}
              error={runError}
              destinationLabel={target === "diary"
                ? diaryAction === "newColumn"
                  ? diaryNewColumnName.trim() || t("auto.diaryNewColumn.pending")
                  : diaryAction === "autoColumns"
                    ? t("auto.diaryAction.auto")
                    : diaryColumns.find((column) => column.key === diaryTargetColumn)?.label
                : undefined}
              diaryPreview={target === "diary"}
              diaryThenPanel={target === "diary" ? (
                <DiaryThenPanel
                  action={diaryAction}
                  onActionChange={handleDiaryActionChange}
                  columns={diaryColumns}
                  targetColumn={diaryTargetColumn}
                  onTargetColumnChange={setDiaryTargetColumn}
                  newColumnName={diaryNewColumnName}
                  onNewColumnNameChange={setDiaryNewColumnName}
                  newColumnColor={diaryNewColumnColor}
                  onNewColumnColorChange={setDiaryNewColumnColor}
                  autoColumnPrefix={diaryAutoColumnPrefix}
                  onAutoColumnPrefixChange={setDiaryAutoColumnPrefix}
                  autoColumnLimit={diaryAutoColumnLimit}
                  onAutoColumnLimitChange={setDiaryAutoColumnLimit}
                  autoColumnReuse={diaryAutoColumnReuse}
                  onAutoColumnReuseChange={setDiaryAutoColumnReuse}
                  moveMatches={diaryMoveMatches}
                  onMoveMatchesChange={setDiaryMoveMatches}
                  matchCount={result.games_categorized}
                />
              ) : undefined}
              onBack={() => gotoStep("configure")}
              onExport={handleExportDiff}
              onApply={handleApply}
            />
          )}
          {step === "done" && (
            <DoneStep result={result!} onClose={onClose} onUndo={diaryUndo ?? undefined} undoNotice={diaryUndoNotice} summary={target === "diary" ? diaryAppliedSummary : undefined} />
          )}
        </div>
          </>
        )}
      </ResizableDialogPanel>
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

function DiaryThenPanel({
  action,
  onActionChange,
  columns,
  targetColumn,
  onTargetColumnChange,
  newColumnName,
  onNewColumnNameChange,
  newColumnColor,
  onNewColumnColorChange,
  autoColumnPrefix,
  onAutoColumnPrefixChange,
  autoColumnLimit,
  onAutoColumnLimitChange,
  autoColumnReuse,
  onAutoColumnReuseChange,
  moveMatches,
  onMoveMatchesChange,
  matchCount,
}: {
  action: AutoCategorizeDiaryAction;
  onActionChange: (action: AutoCategorizeDiaryAction) => void;
  columns: DiaryAutoCatColumn[];
  targetColumn: string;
  onTargetColumnChange: (column: string) => void;
  newColumnName: string;
  onNewColumnNameChange: (name: string) => void;
  newColumnColor: string;
  onNewColumnColorChange: (color: string) => void;
  autoColumnPrefix: string;
  onAutoColumnPrefixChange: (prefix: string) => void;
  autoColumnLimit: number;
  onAutoColumnLimitChange: (limit: number) => void;
  autoColumnReuse: boolean;
  onAutoColumnReuseChange: (reuse: boolean) => void;
  moveMatches: boolean;
  onMoveMatchesChange: (move: boolean) => void;
  matchCount: number;
}) {
  const t = useT();
  const createsColumn = action !== "existingColumn";

  return (
    <div className="space-y-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{t("auto.diary.thenAction")}</span>
        <SelectMenu<AutoCategorizeDiaryAction>
          value={action}
          options={[
            { value: "existingColumn", label: t("auto.diaryAction.existing") },
            { value: "newColumn", label: t("auto.diaryAction.new") },
            { value: "autoColumns", label: t("auto.diaryAction.auto") },
          ]}
          onChange={onActionChange}
          ariaLabel={t("auto.diaryAction")}
          testId="autocat-diary-action"
          size="sm"
          className="min-w-[210px]"
          buttonClassName="normal-case tracking-normal font-normal"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-repressurizer-text">
          <input
            type="checkbox"
            checked={createsColumn}
            disabled
            data-testid="autocat-create-column"
            className="accent-repressurizer-accent"
          />
          <span>{t("auto.diary.createColumn")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-repressurizer-text">
          <input
            type="checkbox"
            checked={action === "existingColumn" || moveMatches}
            disabled={action === "existingColumn"}
            onChange={(event) => onMoveMatchesChange(event.target.checked)}
            data-testid="autocat-move-matches"
            className="accent-repressurizer-accent"
          />
          <span>{t("auto.diary.moveMatches", { count: matchCount })}</span>
        </label>
      </div>

      {action === "existingColumn" && (
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,220px)] sm:items-center">
          <span className="text-xs text-repressurizer-text-muted">{t("auto.diaryColumn")}</span>
          <SelectMenu<string>
            value={targetColumn}
            options={columns.map((column) => ({ value: column.key, label: column.label }))}
            onChange={onTargetColumnChange}
            ariaLabel={t("auto.diaryColumn")}
            testId="autocat-diary-column"
            size="sm"
            className="w-full max-w-[280px]"
            buttonClassName="max-w-[280px] normal-case tracking-normal font-normal"
          />
        </div>
      )}

      {action === "newColumn" && (
        <div className="space-y-1.5">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs text-repressurizer-text-muted">{t("auto.diaryNewColumn")}</span>
              <input
                value={newColumnName}
                onChange={(event) => onNewColumnNameChange(event.target.value.slice(0, 24))}
                placeholder={t("auto.diaryNewColumn.placeholder")}
                aria-label={t("auto.diaryNewColumn")}
                data-testid="autocat-new-column-name"
                className="h-8 w-full min-w-0 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent"
              />
            </label>
            <input
              type="color"
              value={newColumnColor}
              onChange={(event) => onNewColumnColorChange(event.target.value)}
              aria-label={t("auto.diaryNewColumn.color")}
              data-testid="autocat-new-column-color"
              className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-repressurizer-border bg-repressurizer-surface p-1"
            />
          </div>
          <p data-testid="autocat-new-column-suggested" className="text-[11px] leading-relaxed text-repressurizer-text-faint">
            {t("auto.diaryNewColumn.suggestedHint")}
          </p>
        </div>
      )}

      {action === "autoColumns" && (
        <div className="grid gap-2 text-xs text-repressurizer-text-muted sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{t("auto.diaryAutoColumnPrefix")}</span>
            <input
              value={autoColumnPrefix}
              onChange={(event) => onAutoColumnPrefixChange(event.target.value.slice(0, 16))}
              placeholder={t("auto.diaryAutoColumnPrefix.placeholder")}
              aria-label={t("auto.diaryAutoColumnPrefix")}
              data-testid="autocat-auto-column-prefix"
              className="h-8 w-full min-w-0 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="shrink-0">{t("auto.diaryAutoColumnLimit")}</span>
            <input
              type="number"
              min={1}
              max={12}
              value={autoColumnLimit}
              onChange={(event) => onAutoColumnLimitChange(Math.min(12, Math.max(1, Number(event.target.value) || 1)))}
              aria-label={t("auto.diaryAutoColumnLimit")}
              data-testid="autocat-auto-column-limit"
              className="h-8 w-16 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 text-xs text-repressurizer-text outline-none focus:border-repressurizer-accent"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoColumnReuse}
              onChange={(event) => onAutoColumnReuseChange(event.target.checked)}
              aria-label={t("auto.diaryAutoColumnReuse")}
              data-testid="autocat-auto-column-reuse"
              className="accent-repressurizer-accent"
            />
            <span>{t("auto.diaryAutoColumnReuse")}</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step: Choose
// ============================================================

// ============================================================
// Step: Configure
// ============================================================
