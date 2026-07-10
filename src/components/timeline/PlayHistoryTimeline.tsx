import { lazy, Suspense, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { usePlayHistoryStore } from "../../stores/playHistoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { SteamImage } from "../games/SteamImage";
import type { OwnedGame } from "../../lib/types";
import { normalizeLocale, useT } from "../../lib/i18n";
import { X, CalendarBlank, Clock, SquaresFour, List, Rows } from "@phosphor-icons/react";
import { DialogOverlay } from "../ui/DialogOverlay";

const loadGameDetailPage = () => import("../games/game-detail/GameDetailPage").then((m) => ({ default: m.GameDetailPage }));
const GameDetailPage = lazy(loadGameDetailPage);
const preloadGameDetailPage = () => { void loadGameDetailPage(); };

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayHistoryTimelineProps {
  onClose: () => void;
}

type ViewMode = "grid" | "list" | "strip";

interface GameEntry {
  appid: number;
  name: string;
  playtime: number; // minutes tracked during this period
  lastPlayed: number; // unix timestamp
}

interface MonthData {
  key: string;        // "2024-03"
  label: string;      // "March 2024"
  shortLabel: string; // "Mar"
  year: string;
  games: GameEntry[]; // sorted by playtime desc
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatMonthLabel(year: string, monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
    .format(new Date(Number(year), monthIndex, 1));
}

function formatMonthShort(monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short" })
    .format(new Date(2024, monthIndex, 1));
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h === 0) return "0m";
  if (h < 1) return `${minutes}m`;
  return `${h.toFixed(h >= 100 ? 0 : 1)}h`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayHistoryTimeline({ onClose }: PlayHistoryTimelineProps) {
  const t = useT();
  const locale = useSettingsStore((s) => normalizeLocale(s.language));
  const gamesMap = useGameStore((s) => s.games);
  const sessions = usePlayHistoryStore((s) => s.data.sessions);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [detailGame, setDetailGame] = useState<OwnedGame | null>(null);

  // Build monthly data from locally tracked playtime deltas. Steam only gives
  // lifetime playtime, so older hours become a baseline and only later increases
  // are added to the timeline.
  const months = useMemo((): MonthData[] => {
    const byMonth = new Map<string, Map<number, GameEntry>>();

    for (const session of sessions) {
      if (session.minutes <= 0 || session.playedAt <= 0) continue;
      const game = gamesMap[session.appid];
      const d = new Date(session.playedAt * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth.has(key)) byMonth.set(key, new Map());
      const monthGames = byMonth.get(key)!;
      const existing = monthGames.get(session.appid);
      if (existing) {
        existing.playtime += session.minutes;
        existing.lastPlayed = Math.max(existing.lastPlayed, session.playedAt);
      } else {
        monthGames.set(session.appid, {
          appid: session.appid,
          name: String(game?.name ?? session.name ?? ""),
          playtime: session.minutes,
          lastPlayed: session.playedAt,
        });
      }
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, gameMap]) => {
        const [year, month] = key.split("-");
        const idx = parseInt(month) - 1;
        const games = [...gameMap.values()].sort((a, b) => b.playtime - a.playtime);
        return {
          key,
          label: formatMonthLabel(year, idx, locale),
          shortLabel: formatMonthShort(idx, locale),
          year,
          games,
        };
      });
  }, [gamesMap, locale, sessions]);

  // Activity chart — last 24 months
  const activityChart = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const offset = 23 - i;
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = months.find((m) => m.key === key);
      return {
        key,
        short: formatMonthShort(d.getMonth(), locale),
        year: String(d.getFullYear()),
        isJan: d.getMonth() === 0,
        isCurrent: offset === 0,
        count: m?.games.length ?? 0,
      };
    });
  }, [locale, months]);

  const maxActivity = Math.max(...activityChart.map((c) => c.count), 1);

  // Flat list for list view — all games sorted by last played desc
  const flatList = useMemo(() =>
    months.flatMap((m) => m.games.map((g) => ({ ...g, monthKey: m.key, monthLabel: m.label }))),
  [months]);

  const totalGamesTracked = useMemo(
    () => new Set(sessions.map((s) => s.appid)).size,
    [sessions],
  );

  const openGame = (appid: number) => {
    preloadGameDetailPage();
    const game = gamesMap[appid];
    if (game) setDetailGame(game);
  };

  return (
    <>
      <DialogOverlay
        label={t("timeline.title")}
        onClose={onClose}
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-10 pb-8 px-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="relative flex w-full max-w-5xl flex-col animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
          style={{ maxHeight: "90vh" }}
        >

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-3">
              <CalendarBlank size={18} className="text-repressurizer-accent" weight="duotone" />
              <div>
                <h2 className="text-base font-semibold text-white leading-tight">{t("timeline.title")}</h2>
                <p className="text-[10px] text-repressurizer-text-faint mt-0.5">
                  {t("timeline.summary", { months: months.length, games: totalGamesTracked })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-repressurizer-border overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  title={t("timeline.cardView")}
                  className={`flex items-center justify-center w-8 h-8 transition-colors ${
                    viewMode === "grid"
                      ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                      : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
                  }`}
                >
                  <SquaresFour size={15} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  title={t("timeline.listView")}
                  className={`flex items-center justify-center w-8 h-8 border-l border-repressurizer-border transition-colors ${
                    viewMode === "list"
                      ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                      : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
                  }`}
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setViewMode("strip")}
                  title={t("timeline.stripView")}
                  className={`flex items-center justify-center w-8 h-8 border-l border-repressurizer-border transition-colors ${
                    viewMode === "strip"
                      ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                      : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
                  }`}
                >
                  <Rows size={15} />
                </button>
              </div>

              <button
                onClick={onClose}
                aria-label={t("common.close")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* ── Activity chart ──────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-b border-repressurizer-border-subtle shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint font-medium mb-3">
              {t("timeline.activity")}
            </p>
            <div className="flex items-end gap-px" style={{ height: 40 }}>
              {activityChart.map((cell) => {
                const pct = cell.count === 0 ? 0 : Math.max(0.1, cell.count / maxActivity);
                const heightPx = cell.count === 0 ? 2 : Math.max(4, Math.round(pct * 40));
                return (
                  <div
                    key={cell.key}
                    className="group relative flex-1 flex items-end"
                    style={{ height: 40 }}
                  >
                    <div
                      className="w-full rounded-sm transition-all duration-150"
                      style={{
                        height: heightPx,
                        background: cell.count === 0
                          ? "rgba(255,255,255,0.04)"
                          : cell.isCurrent
                          ? "var(--color-repressurizer-accent)"
                          : `color-mix(in srgb, var(--color-repressurizer-accent) ${Math.round(25 + pct * 65)}%, #09090b)`,
                      }}
                    />
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                      <div className="rounded-md border border-repressurizer-border bg-repressurizer-bg px-2 py-1 text-[9px] text-repressurizer-text whitespace-nowrap shadow-lg">
                        <span className="font-semibold">{cell.short} {cell.year}</span>
                        <span className="text-repressurizer-text-faint ml-1">
                          {cell.count > 0 ? t("timeline.gameCount", { count: cell.count }) : t("timeline.inactive")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Year labels */}
            <div className="flex gap-px mt-1.5">
              {activityChart.map((cell) => (
                <div key={cell.key} className="flex-1 relative">
                  {(cell.isJan || activityChart[0].key === cell.key) && (
                    <span className="absolute left-0 text-[8px] text-repressurizer-text-faint font-mono leading-none">
                      {cell.year}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto min-h-0">
            {months.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
                <Clock size={40} weight="duotone" className="opacity-30" />
                <p className="text-sm">{t("timeline.empty")}</p>
                <p className="text-xs">{t("timeline.empty.desc")}</p>
              </div>
            ) : viewMode === "grid" ? (
              <GridView months={months} onOpenGame={openGame} onIntent={preloadGameDetailPage} locale={locale} />
            ) : viewMode === "list" ? (
              <ListView games={flatList} onOpenGame={openGame} onIntent={preloadGameDetailPage} locale={locale} />
            ) : (
              <StripView months={months} onOpenGame={openGame} onIntent={preloadGameDetailPage} />
            )}
          </div>
        </div>
      </DialogOverlay>

      {/* Game detail overlay */}
      {detailGame && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />}>
          <GameDetailPage
            game={detailGame}
            onClose={() => setDetailGame(null)}
          />
        </Suspense>
      )}
    </>
  );
}

// ── Grid view ─────────────────────────────────────────────────────────────────

function GridView({
  months,
  onOpenGame,
  onIntent,
  locale,
}: {
  months: MonthData[];
  onOpenGame: (appid: number) => void;
  onIntent: () => void;
  locale: string;
}) {
  const t = useT();
  return (
    <div className="p-5 space-y-8">
      {months.map((month) => {
        const totalHours = month.games.reduce((s, g) => s + g.playtime, 0) / 60;
        return (
          <section key={month.key}>
            {/* Month header */}
            <div className="flex items-baseline gap-2.5 mb-3">
              <h3 className="text-sm font-semibold text-white">{month.label}</h3>
              <span className="text-[11px] text-repressurizer-text-faint font-mono tabular-nums">
                {t("timeline.gameCount", { count: month.games.length })}
              </span>
              {totalHours > 0 && (
                <span className="text-[11px] text-repressurizer-text-faint font-mono tabular-nums">
                  {t("timeline.cumulative", { hours: formatHours(Math.round(totalHours * 60)) })}
                </span>
              )}
            </div>

            {/* Game cards */}
            <div className="grid gap-2.5" style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
            }}>
              {month.games.map((g) => (
                <button
                  key={g.appid}
                  onClick={() => onOpenGame(g.appid)}
                  onPointerEnter={onIntent}
                  onFocus={onIntent}
                  className="group flex flex-col overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg text-left transition-all duration-200 hover:border-repressurizer-accent/40 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_8px_24px_rgba(0,0,0,0.4)] hover:-translate-y-0.5"
                >
                  {/* Banner 16:9 */}
                  <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
                    <SteamImage
                      appId={g.appid}
                      alt=""
                      kind="header"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    {/* Hours badge */}
                    <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-mono font-medium text-white backdrop-blur-sm border border-white/10">
                      {formatHours(g.playtime)}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="px-2.5 py-2 flex-1">
                    <p className="text-xs font-medium text-repressurizer-text truncate leading-tight">
                      {g.name}
                    </p>
                    <p className="text-[9px] text-repressurizer-text-faint mt-1 leading-none">
                      {t("timeline.lastPlayed", { date: formatDate(g.lastPlayed, locale) })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

type FlatGame = GameEntry & { monthKey: string; monthLabel: string };

function ListView({
  games,
  onOpenGame,
  onIntent,
  locale,
}: {
  games: FlatGame[];
  onOpenGame: (appid: number) => void;
  onIntent: () => void;
  locale: string;
}) {
  const t = useT();
  let lastMonthKey = "";

  return (
    <div>
      {/* Column headers */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-1.5 bg-repressurizer-bg/90 backdrop-blur-sm border-b border-repressurizer-border-subtle">
        <div className="w-11 shrink-0" />
        <span className="flex-1 text-[10px] font-medium text-repressurizer-text-faint uppercase tracking-wider">{t("timeline.column.game")}</span>
        <span className="w-14 shrink-0 text-right text-[10px] font-medium text-repressurizer-text-faint uppercase tracking-wider">{t("timeline.column.hours")}</span>
        <span className="w-28 shrink-0 text-right text-[10px] font-medium text-repressurizer-text-faint uppercase tracking-wider">{t("timeline.column.lastPlayed")}</span>
      </div>

      {games.map((g, idx) => {
        const isNewMonth = g.monthKey !== lastMonthKey;
        lastMonthKey = g.monthKey;

        // Count games in this month
        const monthGameCount = games.filter((x) => x.monthKey === g.monthKey).length;

        return (
          <div key={`${g.appid}-${g.monthKey}-${idx}`}>
            {/* Month separator */}
            {isNewMonth && (
              <div className="flex items-center gap-3 px-5 py-2 bg-repressurizer-surface/50 border-b border-repressurizer-border-subtle">
                <div className="w-2 h-2 rounded-full bg-repressurizer-accent/60 shrink-0" />
                <span className="text-xs font-semibold text-repressurizer-text">{g.monthLabel}</span>
                <span className="text-[10px] text-repressurizer-text-faint font-mono">
                  {t("timeline.gameCount", { count: monthGameCount })}
                </span>
              </div>
            )}

            {/* Game row */}
            <button
              onClick={() => onOpenGame(g.appid)}
              onPointerEnter={onIntent}
              onFocus={onIntent}
              className="group flex w-full items-center gap-3 px-5 py-2.5 transition-colors hover:bg-repressurizer-surface-hover text-left"
            >
              {/* Thumbnail */}
              <div className="w-11 h-6 shrink-0 overflow-hidden rounded bg-repressurizer-bg border border-repressurizer-border-subtle">
                <SteamImage
                  appId={g.appid}
                  alt=""
                  kind="header"
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Name */}
              <span className="flex-1 truncate text-sm text-repressurizer-text group-hover:text-white transition-colors">
                {g.name}
              </span>

              {/* Hours */}
              <span className="w-14 shrink-0 text-right font-mono text-xs text-repressurizer-text-muted tabular-nums">
                {formatHours(g.playtime)}
              </span>

              {/* Last played */}
              <span className="w-28 shrink-0 text-right text-xs text-repressurizer-text-faint">
                {formatDate(g.lastPlayed, locale)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Strip / timeline view ─────────────────────────────────────────────────────

function StripView({
  months,
  onOpenGame,
  onIntent,
}: {
  months: MonthData[];
  onOpenGame: (appid: number) => void;
  onIntent: () => void;
}) {
  const t = useT();
  let lastYear = "";

  return (
    <div className="py-4 px-5 space-y-0.5">
      {months.map((month) => {
        const showYear = month.year !== lastYear;
        lastYear = month.year;

        return (
          <div key={month.key}>
            {/* Year divider */}
            {showYear && (
              <div className="flex items-center gap-3 py-3 -mx-5 px-5 mt-2">
                <span className="text-[11px] font-mono font-semibold text-repressurizer-text-muted">{month.year}</span>
                <div className="h-px flex-1 bg-repressurizer-border-subtle" />
              </div>
            )}

            {/* Month row */}
            <div className="flex items-stretch gap-4 py-2 relative">
              {/* Timeline spine */}
              <div className="flex flex-col items-center shrink-0 w-12">
                <div className="w-2 h-2 rounded-full bg-repressurizer-accent/50 mt-1.5 shrink-0" />
                <div className="w-px flex-1 bg-repressurizer-border-subtle mt-1" />
                {/* Month label */}
                <span className="text-[10px] font-semibold text-repressurizer-text-muted mt-1">{month.shortLabel}</span>
                <span className="text-[9px] font-mono text-repressurizer-text-faint">{month.games.length}</span>
              </div>

              {/* Games filmstrip */}
              <div className="flex-1 overflow-x-auto min-w-0 pb-1 [scrollbar-width:thin]">
                <div className="flex gap-2" style={{ minWidth: "max-content" }}>
                  {month.games.map((g) => (
                    <button
                      key={g.appid}
                      onClick={() => onOpenGame(g.appid)}
                      onPointerEnter={onIntent}
                      onFocus={onIntent}
                      className="group relative shrink-0 overflow-hidden rounded-lg border border-repressurizer-border-subtle hover:border-repressurizer-accent/50 transition-all duration-200 hover:shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                      style={{ width: 96, height: 54 }}
                      title={`${g.name} — ${formatHours(g.playtime)}`}
                    >
                      <SteamImage
                        appId={g.appid}
                        alt=""
                        kind="header"
                        className="h-full w-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                      />
                      {/* Hover overlay with name + hours */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5 gap-0.5">
                        <p className="text-[8px] text-white font-medium leading-tight line-clamp-2">{g.name}</p>
                        <p className="text-[7px] text-repressurizer-accent font-mono">{formatHours(g.playtime)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* End of timeline */}
      <div className="flex items-center gap-3 py-4 -mx-5 px-5">
        <div className="ml-4 w-2 h-2 rounded-full border-2 border-repressurizer-border" />
        <span className="text-[10px] text-repressurizer-text-faint">{t("timeline.beginning")}</span>
      </div>
    </div>
  );
}
