import type { TranslationKey } from "../../lib/i18n";
import type { OwnedGame } from "../../lib/types";
import type { DiaryEntry, DiaryPriority } from "../../stores/diaryStore";
import type { GameStatus } from "../../stores/statusStore";

export type DiaryViewStatus = "backlog" | "playing" | "finished" | "abandoned" | "archived";
export type DiaryFilter = "all" | DiaryViewStatus;
export type DiarySort = "priority" | "recent" | "rating" | "name";
export type DiaryLibraryView = "grid" | "list" | "kanban" | "timeline" | "upcoming";
export type DiaryDateFormat = "local" | "iso";
export type DiaryHourCycle = "auto" | "12" | "24";
export type DiaryTimelineLayout = "rail" | "cards" | "compact";
export const OVERVIEW_SECTION_ID = "__overview__";
export const JOURNAL_SECTION_ID = "__journal__";
export const GAME_TIMELINE_SECTION_ID = "__gametimeline__";

export const STATUS_LABELS: Record<DiaryViewStatus, TranslationKey> = {
  backlog: "diary.status.backlog",
  playing: "diary.status.playing",
  finished: "diary.status.finished",
  abandoned: "diary.status.abandoned",
  archived: "diary.status.archived",
};

export const STATUS_STYLES: Record<DiaryViewStatus, string> = {
  backlog: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  playing: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  finished: "border-repressurizer-accent/25 bg-repressurizer-accent/10 text-repressurizer-accent",
  abandoned: "border-repressurizer-border bg-repressurizer-surface-hover text-repressurizer-text-muted",
  archived: "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint",
};

/** Default Kanban column colors, mirroring the diary status palette. */
export const DEFAULT_COLUMN_COLORS: Record<DiaryViewStatus, string> = {
  backlog: "#fbbf24",
  playing: "#38bdf8",
  abandoned: "#94a3b8",
  finished: "#7eb8ff",
  archived: "#9ca3af",
};

export const STATUS_DOT_STYLES: Record<DiaryViewStatus, string> = {
  backlog: "bg-amber-400",
  playing: "bg-sky-400",
  finished: "bg-repressurizer-accent",
  abandoned: "bg-repressurizer-text-faint",
  archived: "bg-repressurizer-text-faint/50",
};

export const PRIORITY_RANK: Record<DiaryPriority, number> = { high: 3, normal: 2, low: 1 };
export const DECISION_RANK: Record<string, number> = { next: 0, backlog: 1, deferred: 2, archived: 3 };

export const PRIORITY_DOT_STYLES: Record<DiaryPriority, string> = {
  high: "bg-rose-400",
  normal: "bg-repressurizer-text-faint/60",
  low: "bg-transparent border border-repressurizer-border",
};

export interface DiaryPreferences {
  compact: boolean;
  showArchived: boolean;
  libraryView: DiaryLibraryView;
  showJournalPage: boolean;
  sortBy: DiarySort;
  dateFormat: DiaryDateFormat;
  showTime: boolean;
  hourCycle: DiaryHourCycle;
  gameListWidth: number;
  inspectorWidth: number;
  /** Soft cap for the Kanban "playing" column; 0 disables it. */
  kanbanWipLimit: number;
  timelineLayout: DiaryTimelineLayout;
  /** Timeline event kinds the user turned off; persisted across sessions. */
  timelineHiddenKinds: string[];
}

export const DEFAULT_PREFERENCES: DiaryPreferences = {
  compact: true,
  showArchived: false,
  libraryView: "grid",
  showJournalPage: true,
  sortBy: "recent",
  dateFormat: "local",
  showTime: true,
  hourCycle: "auto",
  gameListWidth: 272,
  inspectorWidth: 300,
  kanbanWipLimit: 0,
  timelineLayout: "rail",
  timelineHiddenKinds: [],
};

export const TIMELINE_KIND_VALUES = ["session", "note", "page", "rating", "status", "achievement"];
export const PREFERENCES_KEY = "repressurizer-diary-preferences";
const LIBRARY_VIEWS: DiaryLibraryView[] = ["grid", "list", "kanban", "timeline", "upcoming"];

export function loadPreferences(): DiaryPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<DiaryPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      libraryView: LIBRARY_VIEWS.includes(parsed.libraryView as DiaryLibraryView) ? (parsed.libraryView as DiaryLibraryView) : "grid",
      showJournalPage: parsed.showJournalPage !== false,
      sortBy: parsed.sortBy === "priority" || parsed.sortBy === "rating" || parsed.sortBy === "name" ? parsed.sortBy : "recent",
      dateFormat: parsed.dateFormat === "iso" ? "iso" : "local",
      hourCycle: parsed.hourCycle === "12" || parsed.hourCycle === "24" ? parsed.hourCycle : "auto",
      showTime: parsed.showTime !== false,
      gameListWidth: Math.min(420, Math.max(220, Number(parsed.gameListWidth) || DEFAULT_PREFERENCES.gameListWidth)),
      inspectorWidth: Math.min(440, Math.max(260, Number(parsed.inspectorWidth) || DEFAULT_PREFERENCES.inspectorWidth)),
      kanbanWipLimit: Math.min(20, Math.max(0, Math.floor(Number(parsed.kanbanWipLimit) || 0))),
      timelineLayout: parsed.timelineLayout === "cards" || parsed.timelineLayout === "compact" ? parsed.timelineLayout : "rail",
      timelineHiddenKinds: [...new Set((Array.isArray(parsed.timelineHiddenKinds) ? parsed.timelineHiddenKinds : []).filter((kind): kind is string => typeof kind === "string" && TIMELINE_KIND_VALUES.includes(kind as never)))].slice(0, 6),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function getDiaryStatus(game: OwnedGame, status: GameStatus, entry: DiaryEntry | undefined): DiaryViewStatus {
  if (entry?.decision === "archived") return "archived";
  if (status === "abandoned") return "abandoned";
  if (status === "beaten" || status === "completed") return "finished";
  if (entry?.markedBacklog) return "backlog";
  if (status === "playing" || game.playtime_forever > 0) return "playing";
  return "backlog";
}

export function statusToGameStatus(status: DiaryViewStatus): GameStatus {
  if (status === "playing") return "playing";
  if (status === "finished") return "completed";
  if (status === "abandoned") return "abandoned";
  return "none";
}

export function formatHours(minutes: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(minutes / 60);
}

export function formatDate(unixSeconds: number | null | undefined, language: string, fallback: string): string {
  if (!unixSeconds || unixSeconds <= 0) return fallback;
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(unixSeconds * 1000));
}

export function formatTimestamp(timestamp: number, language: string, preferences: Pick<DiaryPreferences, "dateFormat" | "showTime" | "hourCycle">): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "—";
  if (preferences.dateFormat === "iso") {
    const pad = (value: number) => String(value).padStart(2, "0");
    const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (!preferences.showTime) return datePart;
    const hours = preferences.hourCycle === "12" ? ((date.getHours() + 11) % 12) + 1 : date.getHours();
    const suffix = preferences.hourCycle === "12" ? (date.getHours() >= 12 ? " PM" : " AM") : "";
    return `${datePart} ${pad(hours)}:${pad(date.getMinutes())}${suffix}`;
  }
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    ...(preferences.showTime ? { timeStyle: "short" } : {}),
    ...(preferences.hourCycle === "12" ? { hourCycle: "h12" } : {}),
    ...(preferences.hourCycle === "24" ? { hourCycle: "h23" } : {}),
  };
  return new Intl.DateTimeFormat(language, options).format(date);
}

export function toDateTimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
