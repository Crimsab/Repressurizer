import { useState, useCallback, useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  useAutoCategorizeStore,
  type AutoCategorizePreset,
  type AutoCategorizePresetConfig,
} from "../../stores/autoCategorizeStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { useHltbStore } from "../../stores/hltbStore";
import {
  applyAutoCategorizeAssignments,
  withExpectedAutoCategories,
} from "../../lib/autoCategorizeApply";
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
  type YearGrouping,
} from "../../lib/tauri";
import type { OwnedGame } from "../../lib/types";
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
} from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";

// ============================================================
// Types
// ============================================================

type CategorizerType =
  | "hours"
  | "genre"
  | "tags"
  | "year"
  | "score"
  | "hltb"
  | "devpub"
  | "flags"
  | "language"
  | "platform"
  | "name";
type Step = "choose" | "configure" | "fetch" | "preview" | "done";

const CATEGORIZERS: {
  value: CategorizerType;
  labelKey?: TranslationKey;
  descriptionKey?: TranslationKey;
  label?: string;
  description?: string;
  needsDetails: boolean;
  needsHltb: boolean;
  icon: typeof Clock;
}[] = [
  { value: "hours", labelKey: "auto.byPlaytime", descriptionKey: "auto.byPlaytime.desc", needsDetails: false, needsHltb: false, icon: Clock },
  { value: "genre", labelKey: "auto.byGenre", descriptionKey: "auto.byGenre.desc", needsDetails: true, needsHltb: false, icon: Tag },
  { value: "tags", labelKey: "auto.byTags", descriptionKey: "auto.byTags.desc", needsDetails: true, needsHltb: false, icon: Playlist },
  { value: "year", labelKey: "auto.byYear", descriptionKey: "auto.byYear.desc", needsDetails: true, needsHltb: false, icon: Calendar },
  { value: "score", labelKey: "auto.byScore", descriptionKey: "auto.byScore.desc", needsDetails: true, needsHltb: false, icon: Star },
  { value: "hltb", labelKey: "auto.byHltb", descriptionKey: "auto.byHltb.desc", needsDetails: false, needsHltb: true, icon: Timer },
  { value: "devpub", label: "Developer / Publisher", description: "Create categories from Steam developer and publisher metadata.", needsDetails: true, needsHltb: false, icon: Buildings },
  { value: "flags", label: "Store flags", description: "Create categories from Steam feature flags such as Single-player or Steam Cloud.", needsDetails: true, needsHltb: false, icon: Flag },
  { value: "language", label: "Language support", description: "Create categories from Steam supported language metadata.", needsDetails: true, needsHltb: false, icon: Globe },
  { value: "platform", label: "Platform support", description: "Create Windows, macOS and Linux support categories.", needsDetails: true, needsHltb: false, icon: Desktop },
  { value: "name", label: "Name", description: "Create alphabet buckets from game titles.", needsDetails: false, needsHltb: false, icon: TextAa },
];

const DEFAULT_HLTB_CONFIG: HoursConfig = {
  prefix: "",
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
  return option.labelKey ? t(option.labelKey) : option.label ?? type;
}

function categorizerNeedsDetails(type: CategorizerType): boolean {
  return CATEGORIZERS.find((item) => item.value === type)?.needsDetails ?? false;
}

function presetId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    if (!hltb || hltb.main_story == null) continue;

    const hours = hltb.main_story;
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
  const collections = useCategoryStore((s) => s.collections);
  const applyImportedCollections = useCategoryStore((s) => s.applyImportedCollections);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const steamPath = useSettingsStore((s) => s.steamPath);
  const steamId3 = useSettingsStore((s) => s.steamId3);
  const hltbData = useHltbStore((s) => s.data);

  const persist = useAutoCategorizeStore();

  // Background fetch store
  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const { startDetailsFetch } = useBackgroundFetchStore.getState();

  // Local step — "fetch" isn't persisted; "done" resets to "choose" on reopen
  const [step, setStep] = useState<Step>(() => {
    if (useBackgroundFetchStore.getState().detailsRunning) return "fetch";
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
  const [hltbConfig, setHltbConfig] = useState<HoursConfig>(DEFAULT_HLTB_CONFIG);
  const [presetName, setPresetName] = useState("");
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);

  // Whether we're waiting for a details fetch to complete before running categorizer
  const [waitingForFetch, setWaitingForFetch] = useState(() =>
    useBackgroundFetchStore.getState().detailsRunning
  );
  const [pendingPresetRun, setPendingPresetRun] = useState<AutoCategorizePreset[] | null>(null);

  const [fetchError, setFetchError] = useState("");
  const [result, setResult] = useState<CategorizeResult | null>(persist.lastResult);
  const [runError, setRunError] = useState("");

  const categorizer = CATEGORIZERS.find((c) => c.value === type)!;

  // When background details fetch completes and we were waiting → run categorizer
  useEffect(() => {
    if (waitingForFetch && !detailsRunning) {
      setWaitingForFetch(false);
      runCategorizer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsRunning, waitingForFetch]);

  useEffect(() => {
    if (!pendingPresetRun || detailsRunning) return;
    const queue = pendingPresetRun;
    setPendingPresetRun(null);
    runPresetSequence(queue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsRunning, pendingPresetRun]);

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
    if (type === "hltb") return hltbConfig;
    return {};
  }, [type, hoursConfig, genreConfig, tagsConfig, yearConfig, devPubConfig, flagsConfig, languageConfig, platformConfig, nameConfig, hltbConfig]);

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

    if (presets.some((preset) => categorizerNeedsDetails(preset.type))) {
      const allIds = Object.keys(games).map(Number);
      const missing = allIds.filter((id) => !details[id]);

      if (missing.length > 0) {
        if (!apiKey) {
          setFetchError(t("auto.detailsRequired"));
          setStep("fetch");
          return;
        }

        setStep("fetch");
        setPendingPresetRun(presets);

        if (!detailsRunning) {
          startDetailsFetch(missing);
        }
        return;
      }
    }

    await runPresetSequence(presets);
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
    });

    // HLTB categorizer: no fetch needed, runs directly
    if (type === "hltb") {
      await runCategorizer();
      return;
    }

    if (categorizer.needsDetails) {
      const allIds = Object.keys(games).map(Number);
      const missing = allIds.filter((id) => !details[id]);

      if (missing.length > 0) {
        if (!apiKey) {
          setFetchError(t("auto.detailsRequired"));
          setStep("fetch");
          return;
        }

        setFetchError("");
        setStep("fetch");

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
    }

    await runCategorizer();
  };

  const runCategorizerConfig = useCallback(async (
    runType: CategorizerType,
    config: AutoCategorizePresetConfig
  ): Promise<CategorizeResult> => {
    const allGames = Object.values(games);
    const allDetails = Object.values(details);

    if (runType === "hours") {
      const cfg = config as HoursConfig;
      return runHoursCategorizer(allGames, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "genre") {
      const cfg = config as GenreConfig;
      return runGenreCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "tags") {
      const cfg = config as TagsConfig;
      return runTagsCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "year") {
      const cfg = config as YearConfig;
      return runYearCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "devpub") {
      const cfg = config as DevPubConfig;
      return runDevPubCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        min_games: cfg.min_games || undefined,
      });
    }
    if (runType === "flags") {
      const cfg = config as FlagsConfig;
      return runFlagsCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        max_flags: cfg.max_flags || undefined,
      });
    }
    if (runType === "language") {
      const cfg = config as LanguageConfig;
      return runLanguageCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
        max_languages: cfg.max_languages || undefined,
      });
    }
    if (runType === "platform") {
      const cfg = config as PlatformConfig;
      return runPlatformCategorizer(allDetails, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "name") {
      const cfg = config as NameConfig;
      return runNameCategorizer(allGames, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }
    if (runType === "hltb") {
      const cfg = config as HoursConfig;
      return runHltbCategorizerJs(allGames, hltbData, {
        ...cfg,
        prefix: cfg.prefix || undefined,
      });
    }

    return runScoreCategorizer(allDetails, true);
  }, [games, details, hltbData]);

  const runCategorizer = useCallback(async () => {
    setRunError("");
    try {
      const config = currentConfig();
      const res = withExpectedAutoCategories(
        await runCategorizerConfig(type, config),
        type,
        config
      );

      setResult(res);
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
    hltbConfig,
    currentConfig,
    runCategorizerConfig,
    t,
  ]);

  const runPresetSequence = useCallback(async (presets: AutoCategorizePreset[]) => {
    setRunError("");
    try {
      const assignmentSets = new Map<string, Set<number>>();
      const categorizedIds = new Set<number>();

      for (const preset of presets) {
        const presetResult = withExpectedAutoCategories(
          await runCategorizerConfig(preset.type, preset.config),
          preset.type,
          preset.config
        );
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
        await createManualBackup(steamPath, steamId3, "Pre-auto-categorize");
      } catch {
        // backup failure is non-fatal
      }
    }

    applyImportedCollections(
      applyAutoCategorizeAssignments(collections, result.assignments)
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
              onLoadPreset={handleLoadPreset}
              onDeletePreset={handleDeletePreset}
              onMovePreset={handleMovePreset}
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
              hltbConfig={hltbConfig} setHltbConfig={setHltbConfig}
              presetName={presetName}
              setPresetName={setPresetName}
              onSavePreset={handleSavePreset}
              loadedPresetId={loadedPresetId}
              error={runError}
              onBack={() => gotoStep("choose")}
              onNext={handleConfigure}
            />
          )}
          {step === "fetch" && (
            <FetchStep
              progress={detailsFetched}
              total={detailsTotal}
              error={fetchError}
              waiting={waitingForFetch || pendingPresetRun !== null}
            />
          )}
          {step === "preview" && result && (
            <PreviewStep
              result={result}
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
  onLoadPreset,
  onDeletePreset,
  onMovePreset,
}: {
  presets: AutoCategorizePreset[];
  onChoose: (t: CategorizerType) => void;
  onRunPresets: () => void;
  onLoadPreset: (preset: AutoCategorizePreset) => void;
  onDeletePreset: (id: string) => void;
  onMovePreset: (id: string, direction: -1 | 1) => void;
}) {
  const t = useT();
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const cachedCount = Object.keys(details).length;
  const hltbCount = Object.keys(useHltbStore((s) => s.data)).length;
  const missingCount = gameCount - cachedCount;
  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const startDetailsFetch = useBackgroundFetchStore((s) => s.startDetailsFetch);
  const hltbRunning = useBackgroundFetchStore((s) => s.hltbRunning);
  const hltbFetched = useBackgroundFetchStore((s) => s.hltbFetched);
  const hltbTotal = useBackgroundFetchStore((s) => s.hltbTotal);

  const handleFetchDetails = () => {
    const allIds = Object.keys(games).map(Number);
    const missing = allIds.filter((id) => !details[id]);
    if (missing.length > 0) startDetailsFetch(missing);
  };

  return (
    <div className="space-y-2">
      {/* Details cache status */}
      <div className="mb-2 flex items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-2.5">
        <div className="flex-1 text-xs text-repressurizer-text-muted">
          <span className="text-repressurizer-text-faint">{t("auto.cacheStatus", { cached: cachedCount, total: gameCount })}</span>
        </div>
        {detailsRunning ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
            <Spinner size={9} className="animate-spin" />
            {detailsFetched}/{detailsTotal}
          </span>
        ) : missingCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              {t("auto.needFetching", { count: missingCount })}
            </span>
            <button
              onClick={handleFetchDetails}
              className="rounded-md bg-repressurizer-accent/15 px-2 py-0.5 text-[10px] font-medium text-repressurizer-accent hover:bg-repressurizer-accent/25 transition-colors"
            >
              {t("auto.fetchNow")}
            </button>
          </div>
        ) : (
          <span className="rounded-md bg-repressurizer-accent/10 px-2 py-0.5 text-[10px] font-medium text-repressurizer-accent">
            ✓ {t("auto.allCached")}
          </span>
        )}
      </div>

      {/* HLTB cache status */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-2.5">
        <div className="flex-1 text-xs text-repressurizer-text-muted">
          <span className="font-mono text-repressurizer-text tabular-nums">{hltbCount}</span>
          <span className="text-repressurizer-text-faint"> {t("auto.hltbCached", { count: hltbCount })}</span>
        </div>
        {hltbRunning ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
            <Spinner size={9} className="animate-spin" />
            {hltbFetched}/{hltbTotal}
          </span>
        ) : hltbCount > 0 ? (
          <span className="rounded-md bg-repressurizer-accent/10 px-2 py-0.5 text-[10px] font-medium text-repressurizer-accent">
            {t("auto.hltbCached", { count: hltbCount })}
          </span>
        ) : (
          <span className="rounded-md bg-repressurizer-surface-hover px-2 py-0.5 text-[10px] font-medium text-repressurizer-text-faint">
            {t("common.none")}
          </span>
        )}
      </div>

      {presets.length > 0 && (
        <div className="mb-4 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              Saved AutoCats
            </p>
            <button
              type="button"
              onClick={onRunPresets}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-2.5 py-1 text-[11px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
            >
              <Playlist size={12} weight="duotone" />
              Run all
              <span className="font-mono text-[10px] tabular-nums text-repressurizer-accent/70">
                {presets.length}
              </span>
            </button>
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
                  title="Move up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onMovePreset(preset.id, 1)}
                  disabled={index === presets.length - 1}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(preset.id)}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-danger/70 hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"
                  title="Delete"
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-3 text-sm text-repressurizer-text-muted">{t("auto.choose.desc")}</p>
      {CATEGORIZERS.map((c) => {
        const Icon = c.icon;
        const label = c.labelKey ? t(c.labelKey) : c.label ?? c.value;
        const description = c.descriptionKey ? t(c.descriptionKey) : c.description ?? "";
        return (
          <button
            key={c.value}
            onClick={() => onChoose(c.value)}
            className="btn-press flex w-full items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3.5 text-left transition-colors hover:border-repressurizer-accent hover:bg-repressurizer-accent/5"
          >
            <Icon size={20} weight="duotone" className="shrink-0 text-repressurizer-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-repressurizer-text-faint mt-0.5">{description}</p>
            </div>
            {c.needsDetails && (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                {t("auto.needsDetails")}
              </span>
            )}
            {c.needsHltb && (
              <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                HLTB
              </span>
            )}
            <ArrowRight size={16} className="shrink-0 text-repressurizer-text-faint" />
          </button>
        );
      })}
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
  hltbConfig, setHltbConfig, presetName, setPresetName, onSavePreset,
  loadedPresetId, error, onBack, onNext,
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
  hltbConfig: HoursConfig; setHltbConfig: (c: HoursConfig) => void;
  presetName: string;
  setPresetName: (name: string) => void;
  onSavePreset: () => void;
  loadedPresetId: string | null;
  error: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          Saved AutoCat
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onSavePreset}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-2 text-sm font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            <FloppyDisk size={14} weight="duotone" />
            {loadedPresetId ? "Update" : "Save"}
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
      {type === "genre" && <GenreConfigForm config={genreConfig} onChange={setGenreConfig} />}
      {type === "tags" && <TagsConfigForm config={tagsConfig} onChange={setTagsConfig} />}
      {type === "year" && <YearConfigForm config={yearConfig} onChange={setYearConfig} />}
      {type === "hltb" && <HoursConfigForm config={hltbConfig} onChange={setHltbConfig} label={t("auto.hltbBuckets")} />}
      {type === "devpub" && <DevPubConfigForm config={devPubConfig} onChange={setDevPubConfig} />}
      {type === "flags" && <FlagsConfigForm config={flagsConfig} onChange={setFlagsConfig} />}
      {type === "language" && <LanguageConfigForm config={languageConfig} onChange={setLanguageConfig} />}
      {type === "platform" && <PlatformConfigForm config={platformConfig} onChange={setPlatformConfig} />}
      {type === "name" && <NameConfigForm config={nameConfig} onChange={setNameConfig} />}
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
        <button onClick={onNext} className="btn-press inline-flex items-center gap-1.5 rounded-xl bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover">
          {t("auto.run")}
          <ArrowRight size={14} />
        </button>
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

function HoursConfigForm({ config, onChange, label }: { config: HoursConfig; onChange: (c: HoursConfig) => void; label?: string }) {
  const t = useT();
  const updateRule = (i: number, field: string, val: string) => {
    const rules = config.rules.map((r, idx) =>
      idx === i ? { ...r, [field]: field === "name" ? val : parseFloat(val) || 0 } : r
    );
    onChange({ ...config, rules });
  };
  const addRule = () => onChange({ ...config, rules: [...config.rules, { name: "New bucket", min_hours: 0, max_hours: 0 }] });
  const removeRule = (i: number) => onChange({ ...config, rules: config.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
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
              <input type="number" value={rule.min_hours} onChange={(e) => updateRule(i, "min_hours", e.target.value)} className="w-20 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder="min" />
              <input type="number" value={rule.max_hours} onChange={(e) => updateRule(i, "max_hours", e.target.value)} className="w-20 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder="max (0=∞)" />
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

function GenreConfigForm({ config, onChange }: { config: GenreConfig; onChange: (c: GenreConfig) => void }) {
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
        onAdd={() => { if (newIgnored.trim()) { onChange({ ...config, ignored_genres: [...config.ignored_genres, newIgnored.trim()] }); setNewIgnored(""); } }}
        onRemove={(v) => onChange({ ...config, ignored_genres: config.ignored_genres.filter((g) => g !== v) })}
      />
    </div>
  );
}

function TagsConfigForm({ config, onChange }: { config: TagsConfig; onChange: (c: TagsConfig) => void }) {
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
        onAdd={() => { if (newTag.trim()) { onChange({ ...config, included_tags: [...config.included_tags, newTag.trim()] }); setNewTag(""); } }}
        onRemove={(v) => onChange({ ...config, included_tags: config.included_tags.filter((t) => t !== v) })}
      />
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

function DevPubConfigForm({ config, onChange }: { config: DevPubConfig; onChange: (c: DevPubConfig) => void }) {
  const [newName, setNewName] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckboxRow
          label="Developers"
          checked={config.include_developers}
          onChange={(checked) => onChange({ ...config, include_developers: checked })}
        />
        <CheckboxRow
          label="Publishers"
          checked={config.include_publishers}
          onChange={(checked) => onChange({ ...config, include_publishers: checked })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          Minimum games
        </label>
        <input
          type="number"
          min={1}
          value={config.min_games ?? ""}
          onChange={(e) => onChange({ ...config, min_games: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="No minimum"
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label="Only include these studios"
        items={config.selected}
        newItem={newName}
        setNewItem={setNewName}
        onAdd={() => {
          if (newName.trim()) {
            onChange({ ...config, selected: [...config.selected, newName.trim()] });
            setNewName("");
          }
        }}
        onRemove={(value) => onChange({ ...config, selected: config.selected.filter((item) => item !== value) })}
      />
    </div>
  );
}

function FlagsConfigForm({ config, onChange }: { config: FlagsConfig; onChange: (c: FlagsConfig) => void }) {
  const [newFlag, setNewFlag] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          Max flags per game
        </label>
        <input
          type="number"
          min={1}
          value={config.max_flags ?? ""}
          onChange={(e) => onChange({ ...config, max_flags: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="Unlimited"
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label="Only include these flags"
        items={config.included_flags}
        newItem={newFlag}
        setNewItem={setNewFlag}
        onAdd={() => {
          if (newFlag.trim()) {
            onChange({ ...config, included_flags: [...config.included_flags, newFlag.trim()] });
            setNewFlag("");
          }
        }}
        onRemove={(value) => onChange({ ...config, included_flags: config.included_flags.filter((item) => item !== value) })}
      />
    </div>
  );
}

function LanguageConfigForm({ config, onChange }: { config: LanguageConfig; onChange: (c: LanguageConfig) => void }) {
  const [newLanguage, setNewLanguage] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          Max languages per game
        </label>
        <input
          type="number"
          min={1}
          value={config.max_languages ?? ""}
          onChange={(e) => onChange({ ...config, max_languages: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="Unlimited"
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label="Only include these languages"
        items={config.included_languages}
        newItem={newLanguage}
        setNewItem={setNewLanguage}
        onAdd={() => {
          if (newLanguage.trim()) {
            onChange({ ...config, included_languages: [...config.included_languages, newLanguage.trim()] });
            setNewLanguage("");
          }
        }}
        onRemove={(value) => onChange({ ...config, included_languages: config.included_languages.filter((item) => item !== value) })}
      />
    </div>
  );
}

function PlatformConfigForm({ config, onChange }: { config: PlatformConfig; onChange: (c: PlatformConfig) => void }) {
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <CheckboxRow
          label="Windows"
          checked={config.include_windows}
          onChange={(checked) => onChange({ ...config, include_windows: checked })}
        />
        <CheckboxRow
          label="macOS"
          checked={config.include_mac}
          onChange={(checked) => onChange({ ...config, include_mac: checked })}
        />
        <CheckboxRow
          label="Linux"
          checked={config.include_linux}
          onChange={(checked) => onChange({ ...config, include_linux: checked })}
        />
      </div>
    </div>
  );
}

function NameConfigForm({ config, onChange }: { config: NameConfig; onChange: (c: NameConfig) => void }) {
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2">
        <CheckboxRow
          label="Ignore leading “The”"
          checked={config.skip_leading_the}
          onChange={(checked) => onChange({ ...config, skip_leading_the: checked })}
        />
        <CheckboxRow
          label="Group titles starting with numbers as #"
          checked={config.group_numbers}
          onChange={(checked) => onChange({ ...config, group_numbers: checked })}
        />
        <CheckboxRow
          label="Group symbols and non-Latin initials as Other"
          checked={config.group_other}
          onChange={(checked) => onChange({ ...config, group_other: checked })}
        />
      </div>
    </div>
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

function TagListInput({
  label, items, newItem, setNewItem, onAdd, onRemove,
}: {
  label: string; items: string[]; newItem: string; setNewItem: (v: string) => void;
  onAdd: () => void; onRemove: (v: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder={t("auto.typeEnter")}
          className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
        />
        <button onClick={onAdd} className="btn-press flex items-center justify-center w-8 h-8 rounded-lg bg-repressurizer-accent/15 text-repressurizer-accent hover:bg-repressurizer-accent/25">
          <Plus size={14} weight="bold" />
        </button>
      </div>
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

function FetchStep({ progress, total, error, waiting }: {
  progress: number; total: number; error: string; waiting: boolean;
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
      <p className="text-sm text-repressurizer-text-muted">{t("auto.fetchingDetails")}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-repressurizer-bg">
        <div
          className="h-full rounded-full bg-repressurizer-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-repressurizer-text-faint tabular-nums">
        {progress} / {total} games ({percent}%)
      </p>
      <p className="text-xs text-repressurizer-text-faint">{t("auto.fetchingBackground")}</p>
    </div>
  );
}

// ============================================================
// Step: Preview
// ============================================================

function PreviewStep({ result, onBack, onApply }: {
  result: CategorizeResult;
  onBack: () => void;
  onApply: () => void;
}) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const entries = Object.entries(result.assignments).sort((a, b) => b[1].length - a[1].length);
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
