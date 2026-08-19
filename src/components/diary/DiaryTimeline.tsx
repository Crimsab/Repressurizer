import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarBlank,
  Cards,
  CaretDown,
  CaretLeft,
  CaretRight,
  FileText,
  GameController,
  Path,
  PencilSimple,
  Rows,
  Star,
  Clock,
  Trophy,
} from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { useT, type TranslationKey } from "../../lib/i18n";
import type { OwnedGame } from "../../lib/types";
import type { PlaytimeSession } from "../../lib/playHistory";
import type { DiaryAchievementEntry, DiaryJournalEntry, DiarySection, DiaryStatusEvent } from "../../stores/diaryStore";
import {
  formatHours,
  STATUS_LABELS,
  JOURNAL_SECTION_ID,
  type DiaryPreferences,
  type DiaryTimelineLayout,
  type DiaryViewStatus,
} from "./diaryShared";

type TimelineKind = "session" | "note" | "page" | "rating" | "status" | "achievement";

interface TimelineEvent {
  id: string;
  at: number;
  appId: number | null;
  kind: TimelineKind;
  body?: string;
  minutes?: number;
  rating?: number;
  status?: DiaryViewStatus;
  sectionId?: string;
  achievementIcon?: string | null;
}

const KIND_FILTERS: Array<{ value: TimelineKind; labelKey: TranslationKey; icon: typeof Star }> = [
  { value: "session", labelKey: "diary.timeline.sessions", icon: GameController },
  { value: "note", labelKey: "diary.timeline.notes", icon: PencilSimple },
  { value: "page", labelKey: "diary.timeline.pages", icon: FileText },
  { value: "rating", labelKey: "diary.timeline.ratings", icon: Star },
  { value: "status", labelKey: "diary.timeline.status", icon: CalendarBlank },
  { value: "achievement", labelKey: "diary.timeline.achievements", icon: Trophy },
];

const KIND_ICON_STYLES: Record<TimelineKind, string> = {
  session: "border-sky-400/30 bg-sky-400/15 text-sky-300",
  note: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  page: "border-violet-400/30 bg-violet-400/15 text-violet-300",
  rating: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  status: "border-indigo-400/30 bg-indigo-400/15 text-indigo-300",
  achievement: "border-teal-400/30 bg-teal-400/15 text-teal-300",
};

const KIND_LABEL_KEYS: Record<TimelineKind, TranslationKey> = {
  session: "diary.timeline.sessions",
  note: "diary.timeline.notes",
  page: "diary.timeline.pages",
  rating: "diary.timeline.ratings",
  status: "diary.timeline.status",
  achievement: "diary.timeline.achievements",
};

const LAYOUT_OPTIONS: Array<{ value: DiaryTimelineLayout; labelKey: TranslationKey; icon: typeof Star }> = [
  { value: "rail", labelKey: "diary.timeline.layout.rail", icon: Path },
  { value: "cards", labelKey: "diary.timeline.layout.cards", icon: Cards },
  { value: "compact", labelKey: "diary.timeline.layout.compact", icon: Rows },
];

const MAX_TIMELINE_EVENTS = 400;
const STATUS_ORDER: DiaryViewStatus[] = ["backlog", "playing", "finished", "abandoned", "archived"];

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const DiaryTimeline = memo(function DiaryTimeline({ games, visibleAppIds, sessions, journal, pages, reviews, statusEvents, achievements, achievementsSyncing, language, preferences, t, onOpenGame, onLayoutChange, onSyncAchievements, onToggleKind, onGameContextMenu }: {
  games: Record<number, OwnedGame>;
  visibleAppIds: Set<number>;
  sessions: PlaytimeSession[];
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  reviews: Record<number, { rating?: number; updatedAt?: number }>;
  statusEvents: DiaryStatusEvent[];
  achievements: Record<number, DiaryAchievementEntry[]>;
  achievementsSyncing: { done: number; total: number } | null;
  language: string;
  preferences: DiaryPreferences;
  t: ReturnType<typeof useT>;
  onOpenGame: (appId: number, sectionId?: string) => void;
  onLayoutChange: (layout: DiaryTimelineLayout) => void;
  onSyncAchievements: () => void;
  onToggleKind: (kind: string) => void;
  onGameContextMenu?: (appId: number, x: number, y: number) => void;
}) {
  const enabledKinds = useMemo(() => {
    const hidden = new Set(preferences.timelineHiddenKinds);
    return new Set(KIND_FILTERS.map((filter) => filter.value).filter((kind) => !hidden.has(kind)));
  }, [preferences.timelineHiddenKinds]);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [collapsedGames, setCollapsedGames] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleSetEntry = (setter: (updater: (current: Set<string>) => Set<string>) => void, key: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const events = useMemo(
    () => collectTimelineEvents({ games, visibleAppIds, sessions, journal, pages, reviews, statusEvents, achievements }),
    [achievements, games, journal, pages, reviews, sessions, statusEvents, visibleAppIds],
  );

  const days = useMemo(() => {
    const grouped: Array<{ key: string; at: number; events: TimelineEvent[]; sessionMinutes: number }> = [];
    for (const event of events) {
      if (!enabledKinds.has(event.kind)) continue;
      const key = dayKey(event.at);
      let day = grouped.find((candidate) => candidate.key === key);
      if (!day) {
        day = { key, at: event.at, events: [], sessionMinutes: 0 };
        grouped.push(day);
      }
      day.events.push(event);
      if (event.kind === "session") day.sessionMinutes += event.minutes ?? 0;
    }
    return grouped;
  }, [enabledKinds, events]);

  const toggleKind = (kind: TimelineKind) => onToggleKind(kind);

  const months = useMemo(() => {
    const list: Array<{ key: string; label: string; at: number }> = [];
    const seen = new Set<string>();
    for (const day of days) {
      const key = day.key.slice(0, 7);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, label: new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(new Date(day.at)), at: day.at });
    }
    return list;
  }, [days, language]);

  useEffect(() => {
    if (currentMonth === null && months.length > 0) setCurrentMonth(months[0].key);
  }, [currentMonth, months]);

  const scrollToMonth = (monthKey: string) => {
    setCurrentMonth(monthKey);
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-month-key="${monthKey}"]`);
    if (target) (target as HTMLElement).scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const handleTimelineScroll = () => {
    const container = scrollRef.current;
    if (!container || months.length === 0) return;
    const containerTop = container.getBoundingClientRect().top;
    let active: string | null = null;
    for (const section of Array.from(container.querySelectorAll("[data-month-key]"))) {
      const rect = (section as HTMLElement).getBoundingClientRect();
      if (rect.top <= containerTop + 90) active = (section as HTMLElement).dataset.monthKey ?? null;
      else break;
    }
    if (active) setCurrentMonth(active);
  };

  const monthIndex = months.findIndex((month) => month.key === currentMonth);
  const monthLabel = monthIndex >= 0 ? months[monthIndex].label : "";

  return (
    <div ref={scrollRef} onScroll={handleTimelineScroll} data-testid="diary-timeline" className="min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-2 border-b border-repressurizer-border-subtle bg-repressurizer-bg/95 px-4 backdrop-blur sm:px-6">
        <div role="group" aria-label={t("diary.timeline.filters")} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <Clock size={13} className="mr-0.5 shrink-0 text-repressurizer-accent" />
          {KIND_FILTERS.map(({ value, labelKey, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={enabledKinds.has(value)}
              data-testid={`diary-timeline-filter-${value}`}
              onClick={() => toggleKind(value)}
              className={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${enabledKinds.has(value) ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint hover:text-repressurizer-text"}`}
            >
              <Icon size={12} />
              {t(labelKey)}
            </button>
          ))}
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{events.filter((event) => enabledKinds.has(event.kind)).length} {t("diary.timeline.events")}</span>
        </div>
        <button
          type="button"
          data-testid="diary-timeline-sync"
          onClick={onSyncAchievements}
          disabled={achievementsSyncing !== null}
          title={t("diary.timeline.achievements.sync")}
          aria-label={t("diary.timeline.achievements.sync")}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-accent disabled:opacity-60"
        >
          <Trophy size={13} className={achievementsSyncing !== null ? "animate-pulse text-repressurizer-accent" : ""} />
          {achievementsSyncing !== null && <span className="font-mono tabular-nums">{achievementsSyncing.done}/{achievementsSyncing.total}</span>}
        </button>
        {months.length > 1 && (
          <div role="group" aria-label={t("diary.timeline.month")} data-testid="diary-timeline-months" className="flex shrink-0 items-center gap-0.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-0.5 py-0.5">
            <button type="button" aria-label={t("diary.timeline.monthPrev")} data-testid="diary-timeline-month-prev" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => monthIndex >= 0 && monthIndex < months.length - 1 && scrollToMonth(months[monthIndex + 1].key)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:opacity-30"><CaretLeft size={12} /></button>
            <span className="whitespace-nowrap px-0.5 text-[10px] font-semibold text-repressurizer-text-muted">{monthLabel}</span>
            <button type="button" aria-label={t("diary.timeline.monthNext")} data-testid="diary-timeline-month-next" disabled={monthIndex <= 0} onClick={() => monthIndex > 0 && scrollToMonth(months[monthIndex - 1].key)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:opacity-30"><CaretRight size={12} /></button>
          </div>
        )}
        <div role="group" aria-label={t("diary.timeline.layout")} className="flex shrink-0 items-center gap-0.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface p-0.5">
          {LAYOUT_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
            <button key={value} type="button" aria-pressed={preferences.timelineLayout === value} data-testid={`diary-timeline-layout-${value}`} title={t(labelKey)} aria-label={t(labelKey)} onClick={() => onLayoutChange(value)} className={`focus-ring rounded-md p-1.5 transition-colors ${preferences.timelineLayout === value ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-faint hover:text-repressurizer-text"}`}>
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>
      {days.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
          <CalendarBlank size={34} weight="duotone" className="mb-3 text-repressurizer-text-faint" />
          <p className="text-sm font-medium text-repressurizer-text">{t("diary.timeline.empty")}</p>
          <p className="mt-1 text-xs text-repressurizer-text-faint">{t("diary.timeline.empty.desc")}</p>
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-6">
          {days.map((day) => {
            const labels = dayLabels(day.at, language, preferences, t);
            const dayCollapsed = collapsedDays.has(day.key);
            const dayMeta = (
              <>
                {day.events.length} {t("diary.timeline.events")}
                {day.sessionMinutes > 0 && ` · ${t("diary.timeline.playedTotal", { hours: formatHours(day.sessionMinutes, language) })}`}
              </>
            );
            const gameGroups: Array<{ key: string; appId: number | null; name: string; events: TimelineEvent[] }> = [];
            const groupIndex = new Map<string, number>();
            for (const event of day.events) {
              const groupKey = event.appId === null ? "all" : String(event.appId);
              let position = groupIndex.get(groupKey);
              if (position === undefined) {
                position = gameGroups.length;
                groupIndex.set(groupKey, position);
                gameGroups.push({ key: groupKey, appId: event.appId, name: event.appId !== null ? String(games[event.appId]?.name ?? "") : t("diary.pages.scope.all"), events: [] });
              }
              gameGroups[position].events.push(event);
            }
            const chevronClass = "shrink-0 text-repressurizer-text-faint transition-transform duration-150";
            return (
              <section key={day.key} data-month-key={day.key.slice(0, 7)} data-testid="diary-timeline-day" className="mb-7">
                {preferences.timelineLayout === "rail" && (
                  <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                    <button
                      type="button"
                      data-testid={`diary-timeline-day-toggle-${day.key}`}
                      aria-expanded={!dayCollapsed}
                      aria-label={`${t("diary.timeline.toggleDay")}: ${labels.gutterPrimary}`}
                      onClick={() => toggleSetEntry(setCollapsedDays, day.key)}
                      className={`sticky top-[52px] z-[5] flex w-full flex-col items-center gap-0.5 self-start rounded-lg border px-2 py-2.5 text-center backdrop-blur transition-colors hover:border-repressurizer-accent/40 ${dayCollapsed ? "border-repressurizer-border-subtle bg-repressurizer-surface/50 opacity-75" : "border-repressurizer-border bg-repressurizer-surface/80"}`}
                    >
                      <p className="text-[15px] font-bold leading-tight text-white">{labels.gutterPrimary}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{labels.gutterSecondary}</p>
                      <span className="mt-1 inline-flex items-center gap-0.5 rounded-full border border-repressurizer-border-subtle bg-repressurizer-bg/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">
                        {day.events.length}
                        <CaretDown size={9} className={`transition-transform duration-150 ${dayCollapsed ? "-rotate-90" : ""}`} />
                      </span>
                    </button>
                    {!dayCollapsed && (
                      <ol className="relative space-y-4 border-l border-repressurizer-border-subtle pl-7">
                        {gameGroups.map((group) => {
                          const groupCollapsed = collapsedGames.has(`${day.key}:${group.key}`);
                          const groupEvents = group.events.filter((event) => enabledKinds.has(event.kind));
                          if (groupEvents.length === 0) return null;
                          return (
                            <li key={group.key}>
                              <div
                                className="relative flex min-w-0 items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface/60 py-1.5 pl-2 pr-3 shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                                data-testid={`diary-timeline-game-${group.appId ?? "all"}`}
                                onContextMenu={group.appId !== null && onGameContextMenu ? (event) => { event.preventDefault(); onGameContextMenu(group.appId!, event.clientX, event.clientY); } : undefined}
                              >
                                {group.appId !== null ? (
                                  <span aria-hidden="true" className="shrink-0 overflow-hidden rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg">
                                    <SteamImage appId={group.appId} alt="" kind="capsule" className="h-auto w-[112px] object-cover" />
                                  </span>
                                ) : (
                                  <span aria-hidden="true" className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-faint"><FileText size={14} /></span>
                                )}
                                <button
                                  type="button"
                                  aria-expanded={!groupCollapsed}
                                  aria-label={`${t("diary.timeline.toggleGame")}: ${group.name}`}
                                  onClick={() => toggleSetEntry(setCollapsedGames, `${day.key}:${group.key}`)}
                                  className="focus-ring inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left transition-colors hover:bg-repressurizer-surface/60"
                                >
                                  <CaretDown size={12} className={`${chevronClass} ${groupCollapsed ? "-rotate-90" : ""}`} />
                                  <span className="truncate text-[15px] font-semibold text-white">{group.name}</span>
                                </button>
                                <span className="shrink-0 rounded-full border border-repressurizer-border-subtle bg-repressurizer-bg/80 px-2 py-0.5 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{groupEvents.length}</span>
                              </div>
                              {!groupCollapsed && (
                                <ol className="relative ml-4 mt-2 space-y-3 pl-5">
                                  {groupEvents.map((event) => (
                                    <TimelineRow key={event.id} event={event} layout="rail" nested game={event.appId !== null ? games[event.appId] : undefined} language={language} preferences={preferences} t={t} onOpenGame={onOpenGame} />
                                  ))}
                                </ol>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
                {preferences.timelineLayout === "cards" && (
                  <div className="mx-auto w-full max-w-4xl">
                    <button
                      type="button"
                      data-testid={`diary-timeline-day-toggle-${day.key}`}
                      aria-expanded={!dayCollapsed}
                      onClick={() => toggleSetEntry(setCollapsedDays, day.key)}
                      className="focus-ring mb-3 flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-0.5"
                    >
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${labels.isToday ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border bg-repressurizer-surface text-white"}`}>
                        <CaretDown size={10} className={`transition-transform duration-150 ${dayCollapsed ? "-rotate-90" : ""}`} />
                        {labels.pill}
                      </span>
                      <span className="truncate font-mono text-[10px] text-repressurizer-text-faint">{dayMeta}</span>
                    </button>
                    {!dayCollapsed && (
                      <div className="space-y-3">
                        {gameGroups.map((group) => {
                          const groupCollapsed = collapsedGames.has(`${day.key}:${group.key}`);
                          const groupEvents = group.events.filter((event) => enabledKinds.has(event.kind));
                          if (groupEvents.length === 0) return null;
                          return (
                            <div key={group.key} data-testid={`diary-timeline-game-${group.appId ?? "all"}`} className="overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface/55 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
                              <div className="flex w-full items-center gap-4 p-3.5 transition-colors hover:bg-repressurizer-surface/70">
                                <button
                                  type="button"
                                  aria-expanded={!groupCollapsed}
                                  aria-label={`${t("diary.timeline.toggleGame")}: ${group.name}`}
                                  onClick={() => toggleSetEntry(setCollapsedGames, `${day.key}:${group.key}`)}
                                  className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left"
                                >
                                  <CaretDown size={13} className={`shrink-0 text-repressurizer-text-faint transition-transform duration-150 ${groupCollapsed ? "-rotate-90" : ""}`} />
                                  {group.appId !== null ? (
                                    <span aria-hidden="true" className="h-[68px] w-[146px] shrink-0 overflow-hidden rounded-lg bg-repressurizer-bg">
                                      <SteamImage appId={group.appId} alt="" kind="header" className="h-full w-full object-cover" />
                                    </span>
                                  ) : (
                                    <span aria-hidden="true" className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-lg bg-repressurizer-bg text-repressurizer-text-faint"><FileText size={20} /></span>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-white">{group.name}</span>
                                    <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{groupEvents.length} {t("diary.timeline.events")}</span>
                                  </span>
                                </button>
                                {group.appId !== null && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenGame(group.appId!, undefined)}
                                    aria-label={`${group.name} — ${t("diary.openGame")}`}
                                    className="focus-ring shrink-0 rounded-md border border-repressurizer-border-subtle px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/40 hover:text-repressurizer-accent"
                                  >
                                    {t("diary.openGame")}
                                  </button>
                                )}
                              </div>
                              {!groupCollapsed && (
                                <ol className="divide-y divide-repressurizer-border-subtle border-t border-repressurizer-border-subtle">
                                  {groupEvents.map((event) => (
                                    <li key={event.id} data-testid="diary-timeline-event-cardsrow" data-kind={event.kind} className="flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-repressurizer-surface/50">
                                      <span className="w-[92px] shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{eventTimeLabel(event, language, preferences)}</span>
                                      <KindNode event={event} t={t} size="md" />
                                      <button
                                        type="button"
                                        onClick={() => event.appId !== null && onOpenGame(event.appId, event.kind === "note" ? JOURNAL_SECTION_ID : event.sectionId)}
                                        className={`focus-ring min-w-0 flex-1 truncate text-left text-xs text-repressurizer-text-muted transition-colors hover:text-white ${event.kind === "note" ? "whitespace-pre-wrap line-clamp-2" : ""}`}
                                      >
                                        {eventTitle(event, t)}
                                      </button>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {preferences.timelineLayout === "compact" && (
                  <div>
                    <button
                      type="button"
                      data-testid={`diary-timeline-day-toggle-${day.key}`}
                      aria-expanded={!dayCollapsed}
                      onClick={() => toggleSetEntry(setCollapsedDays, day.key)}
                      className="sticky top-[48px] z-[5] -mx-1 mb-1 flex w-[calc(100%+8px)] min-w-0 items-center justify-between gap-3 rounded-md bg-repressurizer-bg/90 px-2 py-1 backdrop-blur transition-colors hover:bg-repressurizer-surface/60"
                    >
                      <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-repressurizer-text-muted">
                        <CaretDown size={10} className={`${chevronClass} ${dayCollapsed ? "-rotate-90" : ""}`} />
                        <span className="truncate">{labels.pill}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-[9px] text-repressurizer-text-faint">{dayMeta}</span>
                    </button>
                    {!dayCollapsed && (
                      <ol className="space-y-px">
                        {day.events.map((event) => (
                          <TimelineRow key={event.id} event={event} layout="compact" game={event.appId !== null ? games[event.appId] : undefined} language={language} preferences={preferences} t={t} onOpenGame={onOpenGame} />
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
});

export interface TimelineSources {
  games: Record<number, OwnedGame>;
  visibleAppIds: Set<number>;
  sessions: PlaytimeSession[];
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  reviews: Record<number, { rating?: number; updatedAt?: number }>;
  statusEvents: DiaryStatusEvent[];
  achievements: Record<number, DiaryAchievementEntry[]>;
}

export function collectTimelineEvents(sources: TimelineSources): TimelineEvent[] {
  const { visibleAppIds, sessions, journal, pages, reviews, statusEvents, achievements } = sources;
  const collected: TimelineEvent[] = [];
  for (const session of sessions) {
    if (!visibleAppIds.has(session.appid)) continue;
    collected.push({ id: `session-${session.id}`, at: session.playedAt * 1000, appId: session.appid, kind: "session", minutes: session.minutes });
  }
  for (const [rawAppId, notes] of Object.entries(journal)) {
    const appId = Number(rawAppId);
    if (!Number.isFinite(appId) || !visibleAppIds.has(appId)) continue;
    for (const note of notes) collected.push({ id: `note-${note.id}`, at: note.createdAt, appId, kind: "note", body: note.body });
  }
  for (const page of pages) {
    const appId = page.scope === "all" ? null : page.appIds[0] ?? null;
    if (appId !== null && !visibleAppIds.has(appId)) continue;
    collected.push({ id: `page-${page.id}`, at: page.updatedAt, appId, kind: "page", body: page.title, sectionId: page.id });
  }
  for (const [rawAppId, review] of Object.entries(reviews)) {
    const appId = Number(rawAppId);
    if (!Number.isFinite(appId) || !visibleAppIds.has(appId) || (review?.rating ?? 0) <= 0) continue;
    const updatedAt = review.updatedAt ?? 0;
    if (updatedAt <= 0) continue;
    collected.push({ id: `rating-${appId}`, at: updatedAt, appId, kind: "rating", rating: review.rating });
  }
  for (const event of statusEvents) {
    if (!Number.isFinite(event.appId) || !visibleAppIds.has(event.appId)) continue;
    const status = STATUS_ORDER.find((candidate) => candidate === event.status);
    if (!status) continue;
    collected.push({ id: `status-${event.id}`, at: event.at, appId: event.appId, kind: "status", status });
  }
  for (const [rawAppId, entries] of Object.entries(achievements)) {
    const appId = Number(rawAppId);
    if (!Number.isFinite(appId) || !visibleAppIds.has(appId)) continue;
    for (const entry of entries) {
      collected.push({ id: `achievement-${appId}-${entry.apiName}`, at: entry.unlockedAt * 1000, appId, kind: "achievement", body: entry.name, achievementIcon: entry.icon });
    }
  }
  collected.sort((a, b) => b.at - a.at);
  return collected.slice(0, MAX_TIMELINE_EVENTS);
}

/** Per-game timeline rendered inside the diary notebook. */
export function DiaryGameTimeline({ appId, sessions, journal, pages, reviews, statusEvents, achievements, language, preferences, t, onOpenGame }: {
  appId: number;
  sessions: PlaytimeSession[];
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  reviews: Record<number, { rating?: number; updatedAt?: number }>;
  statusEvents: DiaryStatusEvent[];
  achievements: Record<number, DiaryAchievementEntry[]>;
  language: string;
  preferences: DiaryPreferences;
  t: ReturnType<typeof useT>;
  onOpenGame: (appId: number, sectionId?: string) => void;
}) {
  const events = useMemo(
    () => collectTimelineEvents({ games: {}, visibleAppIds: new Set([appId]), sessions, journal, pages, reviews, statusEvents, achievements }),
    [achievements, appId, journal, pages, reviews, sessions, statusEvents],
  );
  const days = useMemo(() => {
    const grouped: Array<{ key: string; at: number; events: TimelineEvent[] }> = [];
    for (const event of events) {
      const key = dayKey(event.at);
      let day = grouped.find((candidate) => candidate.key === key);
      if (!day) {
        day = { key, at: event.at, events: [] };
        grouped.push(day);
      }
      day.events.push(event);
    }
    return grouped;
  }, [events]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-5 sm:px-6" data-testid="diary-gametimeline">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium text-white">{t("diary.tab.timeline")}</h3>
        <span className="rounded-md bg-repressurizer-accent/10 px-2 py-1 font-mono text-[10px] tabular-nums text-repressurizer-accent">{events.length}</span>
      </div>
      {days.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-repressurizer-border-subtle px-6 py-10 text-center">
          <CalendarBlank size={26} weight="duotone" className="mb-2 text-repressurizer-text-faint" />
          <p className="text-xs text-repressurizer-text-muted">{t("diary.gameTimeline.empty")}</p>
        </div>
      ) : (
        days.map((day) => {
          const labels = dayLabels(day.at, language, preferences, t);
          return (
            <div key={day.key} className="mb-5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{labels.pill}</p>
              <ol className="space-y-1">
                {day.events.map((event) => (
                  <li key={event.id} data-kind={event.kind} className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-repressurizer-surface/45">
                    <span className="w-[86px] shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{eventTimeLabel(event, language, preferences)}</span>
                    <KindNode event={event} t={t} size="md" />
                    <span className={`min-w-0 flex-1 text-xs text-repressurizer-text-muted ${event.kind === "note" ? "line-clamp-2 whitespace-pre-wrap" : "truncate"}`} title={eventTitle(event, t)}>{eventTitle(event, t)}</span>
                    {(event.kind === "note" || event.kind === "page") && (
                      <button type="button" onClick={() => onOpenGame(appId, event.kind === "note" ? JOURNAL_SECTION_ID : event.sectionId)} className="focus-ring shrink-0 text-[10px] font-medium text-repressurizer-accent transition-colors hover:text-white">
                        {t("diary.openGame")}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })
      )}
    </section>
  );
}

const ISODate = (at: number) => {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Time label that always follows the user's datetime preferences. */
function timelineTimeLabel(at: number, language: string, preferences: DiaryPreferences): string {
  if (!preferences.showTime) return ISODate(at);
  if (preferences.dateFormat === "iso") {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, "0");
    if (preferences.hourCycle === "12") {
      const hours = ((date.getHours() + 11) % 12) + 1;
      return `${hours}:${pad(date.getMinutes())} ${date.getHours() >= 12 ? "PM" : "AM"}`;
    }
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const options: Intl.DateTimeFormatOptions = preferences.hourCycle === "12"
    ? { hourCycle: "h12", minute: "2-digit" }
    : preferences.hourCycle === "24"
      ? { hourCycle: "h23", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat(language, options).format(new Date(at));
}

/** Sessions show their start-end range; everything else shows a single time. */
function eventTimeLabel(event: TimelineEvent, language: string, preferences: DiaryPreferences): string {
  const start = timelineTimeLabel(event.at, language, preferences);
  if (event.kind !== "session" || !event.minutes || event.minutes <= 0) return start;
  const end = timelineTimeLabel(event.at + event.minutes * 60_000, language, preferences);
  return `${start} – ${end}`;
}

interface DayLabels {
  gutterPrimary: string;
  gutterSecondary: string;
  pill: string;
  isToday: boolean;
}

function dayLabels(at: number, language: string, preferences: DiaryPreferences, t: ReturnType<typeof useT>): DayLabels {
  const date = new Date(at);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const today = sameDay(date, now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (preferences.dateFormat === "iso") {
    const iso = ISODate(at);
    return {
      gutterPrimary: iso.slice(5),
      gutterSecondary: iso.slice(0, 4),
      pill: today ? t("diary.timeline.today") : sameDay(date, yesterday) ? t("diary.timeline.yesterday") : iso,
      isToday: today,
    };
  }
  return {
    gutterPrimary: new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(date),
    gutterSecondary: new Intl.DateTimeFormat(language, { weekday: "short" }).format(date),
    pill: today
      ? t("diary.timeline.today")
      : sameDay(date, yesterday)
        ? t("diary.timeline.yesterday")
        : new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(date),
    isToday: today,
  };
}

function eventTitle(event: TimelineEvent, t: ReturnType<typeof useT>): string {
  if (event.kind === "session") return t("diary.timeline.session", { minutes: event.minutes ?? 0 });
  if (event.kind === "note") return event.body ?? "";
  if (event.kind === "page") return t("diary.timeline.pageEvent", { title: event.body ?? "" });
  if (event.kind === "rating") return t("diary.timeline.rated", { rating: event.rating ?? 0 });
  if (event.kind === "achievement") return t("diary.timeline.achievement", { name: event.body ?? "" });
  return t("diary.timeline.marked", { status: t(STATUS_LABELS[event.status ?? "backlog"]) });
}

function eventIcon(event: TimelineEvent): typeof Star {
  return event.kind === "session" ? GameController : event.kind === "note" ? PencilSimple : event.kind === "page" ? FileText : event.kind === "rating" ? Star : event.kind === "achievement" ? Trophy : CalendarBlank;
}

function KindNode({ event, t, size = "sm" }: { event: TimelineEvent; t: ReturnType<typeof useT>; size?: "sm" | "md" | "lg" }) {
  const Icon = eventIcon(event);
  const kindLabel = t(KIND_LABEL_KEYS[event.kind]);
  const dimension = size === "lg" ? "h-[26px] w-[26px]" : size === "md" ? "h-5 w-5" : "h-[18px] w-[18px]";
  const iconSize = size === "lg" ? 12 : size === "md" ? 10 : 9;
  if (event.kind === "achievement" && event.achievementIcon) {
    return (
      <span title={kindLabel} className={`block shrink-0 overflow-hidden rounded-full border border-repressurizer-border-subtle bg-repressurizer-bg ${dimension}`}>
        <img src={event.achievementIcon} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  return <span aria-hidden="true" title={kindLabel} className={`flex shrink-0 items-center justify-center rounded-full border ${dimension} ${KIND_ICON_STYLES[event.kind]}`}><Icon size={iconSize} /></span>;
}

function TimelineRow({ event, layout, nested = false, game, language, preferences, t, onOpenGame }: {
  event: TimelineEvent;
  layout: DiaryTimelineLayout;
  nested?: boolean;
  game: OwnedGame | undefined;
  language: string;
  preferences: DiaryPreferences;
  t: ReturnType<typeof useT>;
  onOpenGame: (appId: number, sectionId?: string) => void;
}) {
  const title = eventTitle(event, t);
  const name = game ? String(game.name ?? "") : t("diary.pages.scope.all");
  const openSectionId = event.kind === "note" ? JOURNAL_SECTION_ID : event.sectionId;
  const time = eventTimeLabel(event, language, preferences);

  if (layout === "compact") {
    return (
      <li data-testid="diary-timeline-event-compact" data-kind={event.kind} className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-repressurizer-surface/45">
        <span className="w-[44px] shrink-0 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{time}</span>
        <KindNode event={event} t={t} size="md" />
        {event.appId !== null ? (
          <button type="button" onClick={() => onOpenGame(event.appId!, openSectionId)} className="focus-ring max-w-[30%] shrink-0 truncate text-left text-xs font-medium text-repressurizer-text transition-colors hover:text-white">{name}</button>
        ) : (
          <span className="max-w-[30%] shrink-0 truncate text-xs font-medium text-repressurizer-text">{name}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-repressurizer-text-muted" title={title}>{title}</span>
      </li>
    );
  }

  if (layout === "cards") {
    return (
      <li data-testid="diary-timeline-event-cards" data-kind={event.kind}>
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface/55 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-colors hover:border-repressurizer-accent/35">
          {event.appId !== null ? (
            <button type="button" onClick={() => onOpenGame(event.appId!, openSectionId)} className="focus-ring relative w-[124px] shrink-0 overflow-hidden bg-repressurizer-bg sm:w-[148px]" aria-label={`${name} — ${t("diary.openGame")}`}>
              <SteamImage appId={event.appId} alt="" kind="header" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span aria-hidden="true" className="flex w-[52px] shrink-0 items-center justify-center bg-repressurizer-bg text-repressurizer-text-faint"><FileText size={16} /></span>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              {event.appId !== null ? (
                <button type="button" onClick={() => onOpenGame(event.appId!, openSectionId)} className="focus-ring truncate text-left text-sm font-semibold text-white transition-colors hover:text-repressurizer-accent">{name}</button>
              ) : (
                <span className="truncate text-sm font-semibold text-white">{name}</span>
              )}
              <span className="shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{time}</span>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-repressurizer-text-muted">
              <KindNode event={event} t={t} />
              <span className={`min-w-0 ${event.kind === "note" ? "line-clamp-2 whitespace-pre-wrap" : "truncate"}`} title={title}>{title}</span>
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li data-testid="diary-timeline-event-rail" data-kind={event.kind} className={`group ${nested ? "" : "relative"}`}>
      {!nested && (
        <span className="absolute top-0.5 -left-[35px] h-[26px] w-[26px]">
          <KindNode event={event} t={t} size="lg" />
        </span>
      )}
      <p className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${nested ? "" : ""}`}>
        {nested && <KindNode event={event} t={t} size="sm" />}
        <span className={`shrink-0 font-mono font-bold tabular-nums ${nested ? "text-[11px] text-repressurizer-text-muted" : "text-[13px] text-white"}`}>{time}</span>
        {event.appId !== null ? (
          <button type="button" onClick={() => onOpenGame(event.appId!, openSectionId)} className={`focus-ring truncate text-left font-medium text-repressurizer-text transition-colors hover:text-white ${nested ? "text-[13px]" : "text-sm"}`}>{name}</button>
        ) : (
          <span className={`truncate font-medium text-repressurizer-text ${nested ? "text-[13px]" : "text-sm"}`}>{name}</span>
        )}
      </p>
      <p className={`mt-0.5 pl-0.5 text-xs text-repressurizer-text-muted ${event.kind === "note" ? "line-clamp-2 whitespace-pre-wrap" : "truncate"}`} title={title}>{title}</p>
    </li>
  );
}
