import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useT, type TranslationKey } from "../../lib/i18n";
import { probeSamBridge } from "../../lib/tauri";
import type { SamBridgeProbe } from "../../lib/types";
import {
  ArrowsClockwise,
  SteamLogo,
  Trophy,
  Wrench,
  X,
} from "@phosphor-icons/react";

interface SteamToolsPageProps {
  onClose: () => void;
  onOpenAchievements: () => void;
}

type Tone = "ready" | "planned" | "locked" | "danger";

export function SteamToolsPage({ onClose, onOpenAchievements }: SteamToolsPageProps) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const summaries = useAchievementsStore((s) => s.summaries);
  const settings = useSettingsStore();
  const [samProbe, setSamProbe] = useState<SamBridgeProbe | null>(null);
  const [samChecking, setSamChecking] = useState(false);

  const refreshSamProbe = useCallback(async () => {
    setSamChecking(true);
    try {
      const probe = await probeSamBridge(settings.steamPath, 0);
      setSamProbe(probe);
    } catch {
      setSamProbe(null);
    } finally {
      setSamChecking(false);
    }
  }, [settings.steamPath]);

  useEffect(() => {
    let cancelled = false;
    setSamChecking(true);
    probeSamBridge(settings.steamPath, 0)
      .then((probe) => {
        if (!cancelled) setSamProbe(probe);
      })
      .catch(() => {
        if (!cancelled) setSamProbe(null);
      })
      .finally(() => {
        if (!cancelled) setSamChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.steamPath]);

  const stats = useMemo(() => {
    const gameValues = Object.values(games);
    const achievementGames = gameValues.filter((game) =>
      details[game.appid]?.categories?.includes("Steam Achievements")
    );
    const fetched = achievementGames.filter((game) => summaries[game.appid]?.total > 0);
    const incomplete = fetched.filter((game) => {
      const summary = summaries[game.appid];
      return summary.achieved > 0 && summary.achieved < summary.total;
    });
    const completed = fetched.filter((game) => {
      const summary = summaries[game.appid];
      return summary.total > 0 && summary.achieved === summary.total;
    });
    const neverPlayed = gameValues.filter((game) => game.playtime_forever === 0).length;

    return {
      totalGames: gameValues.length,
      achievementGames: achievementGames.length,
      fetched: fetched.length,
      incomplete: incomplete.length,
      completed: completed.length,
      neverPlayed,
    };
  }, [details, games, summaries]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-5xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-repressurizer-accent/30 bg-repressurizer-accent/10 text-repressurizer-accent">
              <SteamLogo size={22} weight="fill" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold leading-tight tracking-tight text-white">
                  {t("steamTools.title")}
                </h2>
                <StatusPill tone={settings.steamToolsEnabled ? "ready" : "planned"}>
                  {settings.steamToolsEnabled ? t("steamTools.labOn") : t("steamTools.labOff")}
                </StatusPill>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-repressurizer-text-faint">
                {t("steamTools.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t("steamTools.metric.games")} value={stats.totalGames} />
            <Metric label={t("steamTools.metric.achievementGames")} value={stats.achievementGames} />
            <Metric label={t("steamTools.metric.fetched")} value={stats.fetched} />
            <Metric label={t("steamTools.metric.neverPlayed")} value={stats.neverPlayed} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4">
              <CapabilityCard
                icon={<Trophy size={18} weight="duotone" />}
                title={t("steamTools.achievements.title")}
                status={t("steamTools.status.readOnly")}
                tone="ready"
                description={t("steamTools.achievements.desc")}
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <MiniMetric label={t("steamTools.achievements.incomplete")} value={stats.incomplete} />
                  <MiniMetric label={t("steamTools.achievements.complete")} value={stats.completed} />
                  <MiniMetric label={t("steamTools.achievements.unfetched")} value={Math.max(0, stats.achievementGames - stats.fetched)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={onOpenAchievements}
                    className="btn-press inline-flex items-center gap-2 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
                  >
                    <Trophy size={14} weight="bold" />
                    {t("steamTools.achievements.open")}
                  </button>
                </div>
              </CapabilityCard>
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Wrench size={17} weight="duotone" className="text-repressurizer-accent" />
                    <h3 className="text-sm font-semibold text-repressurizer-text">{t("steamTools.sam.title")}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshSamProbe()}
                    disabled={samChecking}
                    className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1.5 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-50"
                  >
                    <ArrowsClockwise size={13} className={samChecking ? "animate-spin" : ""} />
                    {t("settings.refresh")}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
                  {t("steamTools.sam.desc")}
                </p>
                <div className="mt-3 space-y-2">
                  <ProbeFact label={t("steamTools.bridge.webApi")} value={t("steamTools.status.ready")} />
                  <ProbeFact label={t("steamTools.bridge.sam")} value={samReadinessLabel(t, samProbe)} />
                  <ProbeFact label={t("steamTools.sam.platform")} value={samProbe?.platform ?? t("steamTools.sam.checking")} />
                  <ProbeFact label={t("steamTools.sam.steamClient")} value={booleanLabel(t, samProbe?.steamClientLibraryFound)} />
                  <ProbeFact label={t("steamTools.sam.writes")} value={samProbe?.writesSteam ? t("steamTools.sam.available") : t("steamTools.status.readOnly")} />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-repressurizer-text tabular-nums">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-repressurizer-text tabular-nums">{value}</p>
    </div>
  );
}

function CapabilityCard({
  icon,
  title,
  status,
  tone,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  tone: Tone;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 text-repressurizer-accent">{icon}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">{description}</p>
          </div>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const styles: Record<Tone, string> = {
    ready: "border-repressurizer-success/30 bg-repressurizer-success/10 text-repressurizer-success",
    planned: "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-muted",
    locked: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    danger: "border-repressurizer-danger/30 bg-repressurizer-danger/10 text-repressurizer-danger",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

function ProbeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2">
      <span className="min-w-0 truncate text-xs text-repressurizer-text-muted">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-repressurizer-text tabular-nums">{value}</span>
    </div>
  );
}

function booleanLabel(t: ReturnType<typeof useT>, value: boolean | undefined): string {
  if (value == null) return t("steamTools.sam.checking");
  return value ? t("steamTools.sam.available") : t("steamTools.sam.notFound");
}

function samReadinessLabel(t: ReturnType<typeof useT>, probe: SamBridgeProbe | null): string {
  if (!probe) return t("steamTools.sam.checking");
  const key = `steamTools.sam.readiness.${probe.readiness}` as TranslationKey;
  return t(key);
}
