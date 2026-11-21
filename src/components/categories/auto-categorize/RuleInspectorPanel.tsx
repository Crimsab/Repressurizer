import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  CheckCircle,
  Export,
  MagnifyingGlass,
  Question,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  customRuleConnectors,
  inspectCustomAutoCatGame,
  inspectCustomAutoCatRule,
  type CustomAutoCatConfigV1,
  type CustomRuleConditionV1,
  type CustomRuleInspectorState,
} from "../../../lib/customAutoCategorize";
import { useT, type TranslationKey } from "../../../lib/i18n";
import type { SteamCollection } from "../../../lib/types";
import { useDiaryStore } from "../../../stores/diaryStore";
import { useGameStore } from "../../../stores/gameStore";
import { useHltbStore } from "../../../stores/hltbStore";
import { useReviewStore } from "../../../stores/reviewStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useStatusStore } from "../../../stores/statusStore";
import { useSteamRatingsStore } from "../../../stores/steamRatingsStore";

interface RuleInspectorPanelProps {
  config: CustomAutoCatConfigV1;
  collections: SteamCollection[];
}

const CONDITION_LABELS: Record<CustomRuleConditionV1["kind"], TranslationKey> = {
  category: "auto.custom.kind.category",
  special: "auto.custom.kind.special",
  title: "auto.custom.kind.title",
  playtime: "auto.custom.kind.playtime",
  hltb: "auto.custom.kind.hltb",
  metadataText: "auto.custom.kind.metadataText",
  platform: "auto.custom.kind.platform",
  metadataNumber: "auto.custom.kind.metadataNumber",
  diary: "auto.custom.kind.diary",
};

const STATE_STYLES: Record<CustomRuleInspectorState, string> = {
  pass: "border-repressurizer-accent/25 bg-repressurizer-accent/10 text-repressurizer-accent",
  fail: "border-repressurizer-danger/25 bg-repressurizer-danger/10 text-repressurizer-danger",
  missing: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  "not-applicable": "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint",
};

function stateIcon(state: CustomRuleInspectorState) {
  if (state === "pass") return <CheckCircle size={13} weight="fill" />;
  if (state === "fail") return <XCircle size={13} weight="fill" />;
  return <Question size={13} weight="fill" />;
}

export function RuleInspectorPanel({ config, collections }: RuleInspectorPanelProps) {
  const t = useT();
  const games = useGameStore((state) => state.games);
  const details = useGameStore((state) => state.details);
  const hltbData = useHltbStore((state) => state.data);
  const ratings = useSteamRatingsStore((state) => state.ratings);
  const hltbTimeMode = useSettingsStore((state) => state.hltbTimeMode);
  const detailsCacheMaxAgeDays = useSettingsStore((state) => state.detailsCacheMaxAgeDays);
  const entries = useDiaryStore((state) => state.entries);
  const journal = useDiaryStore((state) => state.journal);
  const pages = useDiaryStore((state) => state.pages);
  const statuses = useStatusStore((state) => state.statuses);
  const reviews = useReviewStore((state) => state.reviews);
  const [query, setQuery] = useState("");
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [exportState, setExportState] = useState<"idle" | "saved" | "error">("idle");

  const input = useMemo(() => ({
    config,
    games,
    details,
    collections,
    hltbData,
    ratings,
    hltbTimeMode,
    detailsCacheMaxAgeDays,
    diary: {
      entries,
      statuses,
      ratings: reviews,
      journal,
      pageAppIds: new Set(pages.filter((page) => page.scope === "selected").flatMap((page) => page.appIds)),
    },
  }), [collections, config, details, detailsCacheMaxAgeDays, entries, games, hltbData, hltbTimeMode, journal, pages, ratings, reviews, statuses]);

  const summary = useMemo(() => inspectCustomAutoCatRule(input), [input]);
  const stateByAppId = useMemo(() => {
    const result = new Map<number, "included" | "excluded" | "missing">();
    summary.includedAppIds.forEach((appId) => result.set(appId, "included"));
    summary.excludedAppIds.forEach((appId) => result.set(appId, "excluded"));
    summary.missingAppIds.forEach((appId) => result.set(appId, "missing"));
    return result;
  }, [summary]);
  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return Object.values(games)
      .filter((game) => !normalizedQuery || game.name.toLocaleLowerCase().includes(normalizedQuery) || String(game.appid).includes(normalizedQuery))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 40);
  }, [games, query]);

  useEffect(() => {
    if (selectedAppId != null && games[selectedAppId]) return;
    const firstLibraryAppId = Object.keys(games)[0];
    // Number(undefined) is NaN, never nullish, so an empty library must fall back to null explicitly.
    setSelectedAppId(summary.includedAppIds[0] ?? summary.excludedAppIds[0] ?? summary.missingAppIds[0] ?? (firstLibraryAppId === undefined ? null : Number(firstLibraryAppId)));
  }, [games, selectedAppId, summary.excludedAppIds, summary.includedAppIds, summary.missingAppIds]);

  const inspection = selectedAppId == null ? null : inspectCustomAutoCatGame(input, selectedAppId);
  const connectors = customRuleConnectors(config, true);

  const exportReport = async () => {
    setExportState("idle");
    try {
      const destination = await save({
        defaultPath: "repressurizer-rule-inspection.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      const path = Array.isArray(destination) ? destination[0] : destination;
      if (!path) return;
      await writeTextFile(path, JSON.stringify({
        schema: "repressurizer.ruleInspection",
        version: 1,
        generatedAt: new Date().toISOString(),
        config,
        summary,
        selectedGame: inspection,
      }, null, 2));
      setExportState("saved");
    } catch {
      setExportState("error");
    }
  };

  return (
    <section data-testid="rule-inspector" className="overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-repressurizer-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-repressurizer-text">{t("auto.inspector.title")}</p>
          <p className="mt-0.5 text-xs text-repressurizer-text-faint">{t("auto.inspector.description")}</p>
        </div>
        <button type="button" onClick={exportReport} className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-2 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent">
          <Export size={14} />
          {t("auto.inspector.export")}
        </button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-repressurizer-border-subtle border-b border-repressurizer-border-subtle">
        <Metric label={t("auto.inspector.included")} value={summary.matched} tone="text-repressurizer-accent" />
        <Metric label={t("auto.inspector.excluded")} value={summary.excludedAppIds.length} tone="text-repressurizer-text" />
        <Metric label={t("auto.inspector.missing")} value={summary.missing} tone="text-amber-300" />
      </div>

      {summary.warnings.length > 0 && (
        <div data-testid="rule-inspector-warnings" className="space-y-1 border-b border-repressurizer-border-subtle bg-amber-400/5 px-4 py-3">
          {summary.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-xs text-amber-200">
              <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="grid min-h-64 md:grid-cols-[minmax(190px,0.8fr)_minmax(0,1.7fr)]">
        <div className="border-b border-repressurizer-border-subtle p-3 md:border-b-0 md:border-r">
          <label className="relative block">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint" />
            <input
              data-testid="rule-inspector-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("auto.inspector.search")}
              className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface py-2 pl-9 pr-3 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
          </label>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
            {filteredGames.map((game) => {
              const gameState = stateByAppId.get(game.appid) ?? "missing";
              return (
                <button
                  data-testid={`rule-inspector-game-${game.appid}`}
                  key={game.appid}
                  type="button"
                  onClick={() => setSelectedAppId(game.appid)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${selectedAppId === game.appid ? "bg-repressurizer-accent/12 text-repressurizer-text" : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover"}`}
                >
                  <span className="min-w-0 truncate">{game.name}</span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${gameState === "included" ? "bg-repressurizer-accent" : gameState === "excluded" ? "bg-repressurizer-danger" : "bg-amber-300"}`} aria-label={t(`auto.inspector.${gameState}` as TranslationKey)} />
                </button>
              );
            })}
            {filteredGames.length === 0 && <p className="px-2 py-4 text-center text-xs text-repressurizer-text-faint">{t("auto.inspector.noGames")}</p>}
          </div>
        </div>

        <div data-testid="rule-inspector-details" className="min-w-0 p-4">
          {inspection ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-repressurizer-text">{inspection.gameName}</p>
                  <p className="font-mono text-[10px] text-repressurizer-text-faint">App {inspection.appId}</p>
                </div>
                <FinalStateBadge state={inspection.finalState} />
              </div>
              <div className="space-y-2">
                {inspection.conditions.map((condition, index) => (
                  <div key={condition.condition.id}>
                    {index > 0 && <p className="mb-2 text-center font-mono text-[10px] font-semibold uppercase tracking-wider text-repressurizer-text-faint">{connectors[index - 1] ?? config.logic.op}</p>}
                    <div data-testid={`rule-inspector-condition-${condition.condition.id}`} className={`rounded-lg border p-3 ${condition.decisive ? "border-repressurizer-border bg-repressurizer-surface/70" : "border-repressurizer-border-subtle bg-repressurizer-surface/25"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-repressurizer-text">{t(CONDITION_LABELS[condition.condition.kind])}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_STYLES[condition.state]}`}>
                          {stateIcon(condition.state)}
                          {t(`auto.inspector.state.${condition.state}` as TranslationKey)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-start justify-between gap-3 text-xs">
                        <span className="text-repressurizer-text-faint">{t("auto.inspector.observed")}</span>
                        <span className="break-words text-right font-mono text-repressurizer-text-muted">{condition.actualValue}</span>
                      </div>
                      {condition.decisive && <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-repressurizer-text-faint">{t("auto.inspector.decisive")}</p>}
                    </div>
                  </div>
                ))}
                {inspection.conditions.length === 0 && <p className="py-8 text-center text-xs text-repressurizer-text-faint">{t("auto.inspector.noConditions")}</p>}
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-xs text-repressurizer-text-faint">{t("auto.inspector.noGames")}</p>
          )}
        </div>
      </div>
      {exportState !== "idle" && <p role="status" className={`border-t border-repressurizer-border-subtle px-4 py-2 text-xs ${exportState === "saved" ? "text-repressurizer-accent" : "text-repressurizer-danger"}`}>{t(exportState === "saved" ? "auto.inspector.exported" : "auto.inspector.exportError")}</p>}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="px-3 py-3 text-center"><p className={`font-mono text-lg font-semibold ${tone}`}>{value}</p><p className="text-[10px] uppercase tracking-wide text-repressurizer-text-faint">{label}</p></div>;
}

function FinalStateBadge({ state }: { state: "included" | "excluded" | "missing" }) {
  const t = useT();
  const style = state === "included" ? STATE_STYLES.pass : state === "excluded" ? STATE_STYLES.fail : STATE_STYLES.missing;
  return <span data-testid="rule-inspector-final-state" className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{t(`auto.inspector.${state}` as TranslationKey)}</span>;
}
