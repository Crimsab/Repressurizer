import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  FolderSimplePlus,
  Spinner,
  Warning,
} from "@phosphor-icons/react";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import {
  normalizeCustomAutoCatConfig,
  type CustomHltbCondition,
} from "../../lib/customAutoCategorize";
import { getHltbHours, hltbModeLabel } from "../../lib/hltb";
import {
  sortAutoCategorizePreviewEntries,
  type PreviewSortContext,
  type PreviewSortMode,
} from "../../lib/autoCategorizePreview";
import type { CategorizeResult, HltbData } from "../../lib/tauri";
import { useT } from "../../lib/i18n";

export function FetchStep({ progress, total, error, waiting, coolingDown, cooldownSecs, message }: {
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

export function PreviewStep({ result, context, notice, error, onBack, onApply }: {
  result: CategorizeResult;
  context: PreviewSortContext | null;
  notice: string;
  error: string;
  onBack: () => void;
  onApply: () => void;
}) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const hltbData = useHltbStore((s) => s.data);
  const [sortMode, setSortMode] = useState<PreviewSortMode>("count");
  const entries = useMemo(
    () => sortAutoCategorizePreviewEntries(result.assignments, sortMode, context),
    [context, result.assignments, sortMode]
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(entries.length === 1 ? [entries[0][0]] : [])
  );

  useEffect(() => {
    if (entries.length === 1) setExpanded(new Set([entries[0][0]]));
  }, [entries]);

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
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
          <span>{error}</span>
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
                    const note = customPreviewGameNote(context, id, hltbData);
                    return (
                      <div key={id} className="flex items-center gap-2 px-2 py-0.5 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-repressurizer-text-muted">
                          {g ? String(g.name ?? "") : `#${id}`}
                        </span>
                        {note && (
                          <span
                            title={note.title}
                            className="shrink-0 rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-repressurizer-accent"
                          >
                            {note.label}
                          </span>
                        )}
                      </div>
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

interface CustomPreviewGameNote {
  label: string;
  title: string;
}

function customPreviewGameNote(
  context: PreviewSortContext | null,
  appId: number,
  hltbData: Record<number, HltbData>
): CustomPreviewGameNote | null {
  if (context?.type !== "custom") return null;
  const config = normalizeCustomAutoCatConfig(context.config);
  const hltbConditions = config.logic.conditions.filter(
    (condition): condition is CustomHltbCondition => condition.kind === "hltb" && condition.enabled !== false
  );
  if (hltbConditions.length === 0) return null;

  const hltb = hltbData[appId];
  const label = hltbConditions
    .map((condition) => {
      const hours = getHltbHours(hltb, condition.mode);
      if (hours == null) return "";
      return `${hltbModeLabel(condition.mode)}: ${formatPreviewHours(hours)}`;
    })
    .filter(Boolean)
    .join(" · ");
  if (!label) return null;

  const match = [
    hltb?.game_name ? `HLTB match: ${hltb.game_name}` : "",
    hltb?.confidence != null ? `confidence: ${hltb.confidence}%` : "",
  ].filter(Boolean).join(" · ");

  return {
    label,
    title: match || label,
  };
}

function formatPreviewHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

// ============================================================
// Step: Done
// ============================================================

export function DoneStep({ result, onClose }: { result: CategorizeResult; onClose: () => void }) {
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
