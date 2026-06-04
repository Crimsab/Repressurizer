import { useState, useCallback, useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAutoCategorizeStore } from "../../stores/autoCategorizeStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { useHltbStore } from "../../stores/hltbStore";
import {
  runHoursCategorizer,
  runGenreCategorizer,
  runTagsCategorizer,
  runYearCategorizer,
  runScoreCategorizer,
  createManualBackup,
  type CategorizeResult,
  type HoursConfig,
  type GenreConfig,
  type TagsConfig,
  type YearConfig,
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
} from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";

// ============================================================
// Types
// ============================================================

type CategorizerType = "hours" | "genre" | "tags" | "year" | "score" | "hltb";
type Step = "choose" | "configure" | "fetch" | "preview" | "done";

const CATEGORIZERS: {
  value: CategorizerType;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
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
  const { addGamesToCategory, addCategory, collections } = useCategoryStore();
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
  const [hltbConfig, setHltbConfig] = useState<HoursConfig>(DEFAULT_HLTB_CONFIG);

  // Whether we're waiting for a details fetch to complete before running categorizer
  const [waitingForFetch, setWaitingForFetch] = useState(() =>
    useBackgroundFetchStore.getState().detailsRunning
  );

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

  // Helper to sync step to store (skip "fetch")
  const gotoStep = (s: Step) => {
    setStep(s);
    if (s !== "fetch") persist.set({ lastStep: s });
  };

  // ---- Step: choose ----
  const handleChoose = (t: CategorizerType) => {
    setType(t);
    persist.set({ lastType: t });
    gotoStep("configure");
  };

  // ---- Step: configure → run ----
  const handleConfigure = async () => {
    persist.set({ hoursConfig, genreConfig, tagsConfig, yearConfig });

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

  const runCategorizer = useCallback(async () => {
    setRunError("");
    try {
      const allGames = Object.values(games);
      const allDetails = Object.values(details);
      let res: CategorizeResult;

      if (type === "hours") {
        res = await runHoursCategorizer(allGames, {
          ...hoursConfig,
          prefix: hoursConfig.prefix || undefined,
        });
      } else if (type === "genre") {
        res = await runGenreCategorizer(allDetails, {
          ...genreConfig,
          prefix: genreConfig.prefix || undefined,
        });
      } else if (type === "tags") {
        res = await runTagsCategorizer(allDetails, {
          ...tagsConfig,
          prefix: tagsConfig.prefix || undefined,
        });
      } else if (type === "year") {
        res = await runYearCategorizer(allDetails, {
          ...yearConfig,
          prefix: yearConfig.prefix || undefined,
        });
      } else if (type === "hltb") {
        res = runHltbCategorizerJs(allGames, hltbData, {
          ...hltbConfig,
          prefix: hltbConfig.prefix || undefined,
        });
      } else {
        res = await runScoreCategorizer(allDetails, true);
      }

      setResult(res);
      persist.set({ lastResult: res });
      gotoStep("preview");
    } catch (e) {
      setRunError(t("auto.categorizationFailed", { error: String(e) }));
      gotoStep("configure");
    }
  }, [type, games, details, hltbData, hoursConfig, genreConfig, tagsConfig, yearConfig, hltbConfig, t]);

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

    for (const [catName, appIds] of Object.entries(result.assignments)) {
      const existing = collections.find((c) => c.name === catName && !c.is_dynamic);
      if (existing) {
        addGamesToCategory(existing.key, appIds);
      } else {
        addCategory(catName);
        setTimeout(() => {
          const created = useCategoryStore
            .getState()
            .collections.find((c) => c.name === catName && !c.is_dynamic);
          if (created) addGamesToCategory(created.key, appIds);
        }, 0);
      }
    }

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
          {step === "choose" && <ChooseStep onChoose={handleChoose} />}
          {step === "configure" && (
            <ConfigureStep
              type={type}
              hoursConfig={hoursConfig} setHoursConfig={setHoursConfig}
              genreConfig={genreConfig} setGenreConfig={setGenreConfig}
              tagsConfig={tagsConfig} setTagsConfig={setTagsConfig}
              yearConfig={yearConfig} setYearConfig={setYearConfig}
              hltbConfig={hltbConfig} setHltbConfig={setHltbConfig}
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
              waiting={waitingForFetch}
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

function ChooseStep({ onChoose }: { onChoose: (t: CategorizerType) => void }) {
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

      <p className="mb-3 text-sm text-repressurizer-text-muted">{t("auto.choose.desc")}</p>
      {CATEGORIZERS.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.value}
            onClick={() => onChoose(c.value)}
            className="btn-press flex w-full items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3.5 text-left transition-colors hover:border-repressurizer-accent hover:bg-repressurizer-accent/5"
          >
            <Icon size={20} weight="duotone" className="shrink-0 text-repressurizer-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{t(c.labelKey)}</p>
              <p className="text-xs text-repressurizer-text-faint mt-0.5">{t(c.descriptionKey)}</p>
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
  hltbConfig, setHltbConfig, error, onBack, onNext,
}: {
  type: CategorizerType;
  hoursConfig: HoursConfig; setHoursConfig: (c: HoursConfig) => void;
  genreConfig: GenreConfig; setGenreConfig: (c: GenreConfig) => void;
  tagsConfig: TagsConfig; setTagsConfig: (c: TagsConfig) => void;
  yearConfig: YearConfig; setYearConfig: (c: YearConfig) => void;
  hltbConfig: HoursConfig; setHltbConfig: (c: HoursConfig) => void;
  error: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
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
