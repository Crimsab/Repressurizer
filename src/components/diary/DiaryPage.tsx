import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowLeft,
  Database,
  ArrowRight,
  CalendarBlank,
  ClockCounterClockwise,
  Export,
  GameController,
  Kanban,
  ListBullets,
  ListChecks,
  MagnifyingGlass,
  Notebook,
  Path,
  PencilSimple,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useStatusStore, type GameStatus } from "../../stores/statusStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useNotesStore } from "../../stores/notesStore";
import { usePlayHistoryStore } from "../../stores/playHistoryStore";
import {
  useDiaryStore,
  type DiaryEntry,
  type DiaryJournalEntry,
  type DiaryPageScope,
  type DiaryPriority,
  type DiaryRevision,
  type DiaryBoardPrefs,
  type DiaryAchievementEntry,
  type DiarySection,
  type DiaryStatusEvent,
  type DiaryBulkSnapshot,
} from "../../stores/diaryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useToastStore } from "../../stores/toastStore";
import { getHltbHours } from "../../lib/hltb";
import type { PlaytimeSession } from "../../lib/playHistory";
import { SteamImage } from "../games/SteamImage";
import { SelectMenu } from "../ui/SelectMenu";
import { useT, type TranslationKey } from "../../lib/i18n";
import type { GameDetails, OwnedGame, SteamCollection } from "../../lib/types";
import type { DiaryExportData } from "../../lib/diaryExport";
import { fetchAchievements, type HltbData } from "../../lib/tauri";
import { getDefaultDiaryTemplates, resolveDiaryTemplate, type DiaryTemplate, type DiaryTemplateContext } from "../../lib/diaryTemplates";
import { buildBoardColumns, DiaryKanbanBoard, type BoardColumn } from "./DiaryKanban";
import { DiaryGameTimeline, DiaryTimeline } from "./DiaryTimeline";
import { DiaryUpcoming } from "./DiaryUpcoming";
import { MarkdownToolbar } from "./DiaryMarkdownToolbar";
import { SessionNotes } from "./DiarySessionNotes";
import { DiaryExportDialog } from "./DiaryExportDialog";
import { DiaryBackupDialog } from "./DiaryBackupDialog";
import { RatingControl } from "./DiaryRating";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DECISION_RANK,
  GAME_TIMELINE_SECTION_ID,
  JOURNAL_SECTION_ID,
  OVERVIEW_SECTION_ID,
  PREFERENCES_KEY,
  PRIORITY_RANK,
  STATUS_LABELS,
  STATUS_STYLES,
  formatHours,
  formatDate,
  getDiaryStatus,
  loadPreferences,
  statusToGameStatus,
  type DiaryDateFormat,
  type DiaryFilter,
  type DiaryHourCycle,
  type DiaryLibraryView,
  type DiaryPreferences,
  type DiarySort,
  type DiaryViewStatus,
} from "./diaryShared";

const loadAutoCategorizeDialog = () => import("../categories/auto-categorize/AutoCategorizeDialog").then((module) => ({ default: module.AutoCategorizeDialog }));
const DiaryAutoCategorizeDialog = lazy(loadAutoCategorizeDialog);

const DIARY_VIEW_ICONS = {
  grid: SquaresFour,
  list: ListBullets,
  kanban: Kanban,
  timeline: ClockCounterClockwise,
  upcoming: ListChecks,
} as const;

interface DiaryActionSnapshot {
  diary: DiaryBulkSnapshot;
  statuses: Record<number, GameStatus | undefined>;
}

const CATEGORY_STYLES = [
  "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  "border-violet-400/25 bg-violet-400/10 text-violet-300",
  "border-amber-400/25 bg-amber-400/10 text-amber-300",
  "border-rose-400/25 bg-rose-400/10 text-rose-300",
  "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300",
] as const;

function categoryStyle(category: SteamCollection): string {
  const seed = `${category.key}:${category.name}`;
  const hash = Array.from(seed).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return CATEGORY_STYLES[hash % CATEGORY_STYLES.length];
}

function makeTemplateContext(game: OwnedGame, detail: GameDetails | undefined, status: DiaryViewStatus, rating: number, hltbHours: number | null, language: string, t: ReturnType<typeof useT>): DiaryTemplateContext {
  return {
    gameTitle: String(game.name ?? ""),
    status: t(STATUS_LABELS[status]),
    playtime: `${formatHours(game.playtime_forever, language)}h`,
    hltb: hltbHours === null ? "—" : `${hltbHours}h`,
    rating: rating > 0 ? `${rating}/10` : "—",
    genre: detail?.genres?.[0] || "—",
    developer: detail?.developers?.[0] || "—",
    publisher: detail?.publishers?.[0] || "—",
    releaseDate: detail?.release_date || detail?.store_release_date || "—",
    lastPlayed: formatDate(game.rtime_last_played, language, t("diary.never")),
    today: new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date()),
  };
}

export function DiaryPage() {
  const t = useT();
  const language = useSettingsStore((state) => state.language || "en");
  const games = useGameStore((state) => state.games);
  const details = useGameStore((state) => state.details);
  const collections = useCategoryStore((state) => state.collections);
  const setActiveCategory = useCategoryStore((state) => state.setActiveCategory);
  const statuses = useStatusStore((state) => state.statuses);
  const setStatus = useStatusStore((state) => state.setStatus);
  const setBulkStatus = useStatusStore((state) => state.setBulkStatus);
  const captureStatusSnapshot = useStatusStore((state) => state.captureSnapshot);
  const restoreStatusSnapshot = useStatusStore((state) => state.restoreSnapshot);
  const reviews = useReviewStore((state) => state.reviews);
  const setRating = useReviewStore((state) => state.setRating);
  const clearRating = useReviewStore((state) => state.clearRating);
  const notes = useNotesStore((state) => state.notes);
  const setNote = useNotesStore((state) => state.setNote);
  const entries = useDiaryStore((state) => state.entries);
  const journal = useDiaryStore((state) => state.journal);
  const pages = useDiaryStore((state) => state.pages);
  const revisions = useDiaryStore((state) => state.revisions);
  const templates = useDiaryStore((state) => state.templates);
  const hydrateDiary = useDiaryStore((state) => state.hydrate);
  const setDecision = useDiaryStore((state) => state.setDecision);
  const setBulkDecision = useDiaryStore((state) => state.setBulkDecision);
  const setBulkPriority = useDiaryStore((state) => state.setBulkPriority);
  const setBulkMarkedBacklog = useDiaryStore((state) => state.setBulkMarkedBacklog);
  const setBulkCustomAssignment = useDiaryStore((state) => state.setBulkCustomAssignment);
  const captureBulkSnapshot = useDiaryStore((state) => state.captureBulkSnapshot);
  const restoreBulkSnapshot = useDiaryStore((state) => state.restoreBulkSnapshot);
  const clearBulkDiaryState = useDiaryStore((state) => state.clearBulkDiaryState);
  const setPriority = useDiaryStore((state) => state.setPriority);
  const setMarkedBacklog = useDiaryStore((state) => state.setMarkedBacklog);
  const logStatusEvent = useDiaryStore((state) => state.logStatusEvent);
  const logStatusEvents = useDiaryStore((state) => state.logStatusEvents);
  const board = useDiaryStore((state) => state.board);
  const setBoardOrder = useDiaryStore((state) => state.setBoardOrder);
  const statusEvents = useDiaryStore((state) => state.statusEvents);
  const achievements = useDiaryStore((state) => state.achievements);
  const boardPrefs = useDiaryStore((state) => state.boardPrefs);
  const setColumnColor = useDiaryStore((state) => state.setColumnColor);
  const toggleColumnHidden = useDiaryStore((state) => state.toggleColumnHidden);
  const addCustomColumn = useDiaryStore((state) => state.addCustomColumn);
  const renameCustomColumn = useDiaryStore((state) => state.renameCustomColumn);
  const removeCustomColumn = useDiaryStore((state) => state.removeCustomColumn);
  const setCustomAssignment = useDiaryStore((state) => state.setCustomAssignment);
  const addPage = useDiaryStore((state) => state.addPage);
  const updatePage = useDiaryStore((state) => state.updatePage);
  const removePage = useDiaryStore((state) => state.removePage);
  const recordRevision = useDiaryStore((state) => state.recordRevision);
  const addJournalEntry = useDiaryStore((state) => state.addJournalEntry);
  const updateJournalEntry = useDiaryStore((state) => state.updateJournalEntry);
  const removeJournalEntry = useDiaryStore((state) => state.removeJournalEntry);
  const hltbData = useHltbStore((state) => state.data);
  const playSessions = usePlayHistoryStore((state) => state.data.sessions);
  const hydratePlayHistory = usePlayHistoryStore((state) => state.hydrate);
  const hltbTimeMode = useSettingsStore((state) => state.hltbTimeMode);
  const diaryRatingEmojis = useSettingsStore((state) => state.diaryRatingEmojis);
  const [preferences, setPreferences] = useState<DiaryPreferences>(loadPreferences);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DiaryFilter>("all");
  const [sortBy, setSortBy] = useState<DiarySort>(() => loadPreferences().sortBy);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [activeSectionByGame, setActiveSectionByGame] = useState<Record<number, string>>({});
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [diaryAutoCatOpen, setDiaryAutoCatOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void hydrateDiary();
  }, [hydrateDiary]);

  useEffect(() => {
    void hydratePlayHistory();
  }, [hydratePlayHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const searchInput = [...document.querySelectorAll<HTMLInputElement>("[data-diary-search]")]
        .find((input) => input.getClientRects().length > 0);
      if (!searchInput) return;
      event.preventDefault();
      searchInput.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  const hiddenIds = useMemo(() => {
    const hidden = collections.find((collection) => collection.id === "hidden");
    return new Set(hidden?.added ?? []);
  }, [collections]);

  const allDiaryGames = useMemo(
    () => Object.values(games).filter((game) => !hiddenIds.has(game.appid)),
    [games, hiddenIds]
  );
  const diaryStatusCounts = useMemo<Record<DiaryFilter, number>>(() => {
    const counts: Record<DiaryFilter, number> = { all: 0, backlog: 0, playing: 0, finished: 0, abandoned: 0, archived: 0 };
    for (const game of allDiaryGames) {
      const status = getDiaryStatus(game, statuses[game.appid] ?? "none", entries[game.appid]);
      counts.all += 1;
      counts[status] += 1;
    }
    return counts;
  }, [allDiaryGames, entries, statuses]);
  const diaryCollections = useMemo(
    () => collections.filter((collection) => !collection.is_dynamic && !["hidden", "favorite", "favorites"].includes(collection.id.toLowerCase())),
    [collections]
  );

  const diarySearchIndex = useMemo(() => {
    const index: Record<number, string> = {};
    const bump = (appId: number, text: string) => {
      index[appId] = `${index[appId] ?? ""}\n${text.toLocaleLowerCase(language)}`;
    };
    for (const [rawAppId, entries] of Object.entries(journal)) {
      const appId = Number(rawAppId);
      if (Number.isFinite(appId)) for (const entry of entries) bump(appId, entry.body);
    }
    for (const [rawAppId, note] of Object.entries(notes)) {
      const appId = Number(rawAppId);
      if (Number.isFinite(appId) && typeof note === "string") bump(appId, note);
    }
    for (const page of pages) {
      const text = `${page.title} ${page.markdown}`;
      if (page.scope === "all") {
        for (const game of allDiaryGames) bump(game.appid, text);
      } else {
        for (const appId of page.appIds) bump(appId, text);
      }
    }
    return index;
  }, [allDiaryGames, journal, language, notes, pages]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(language);
    const result = allDiaryGames.filter((game) => {
      const entry = entries[game.appid];
      const status = getDiaryStatus(game, statuses[game.appid] ?? "none", entry);
      if (categoryFilter !== "all" && !collections.find((collection) => collection.key === categoryFilter)?.added.includes(game.appid)) return false;
      if (!preferences.showArchived && status === "archived" && statusFilter !== "archived") return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const detail = details[game.appid];
      const searchable = [game.name, detail?.name, ...(detail?.genres ?? []), ...(detail?.developers ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(language);
      return searchable.includes(normalizedQuery) || (diarySearchIndex[game.appid] ?? "").includes(normalizedQuery);
    });

    result.sort((a, b) => {
      const entryA = entries[a.appid];
      const entryB = entries[b.appid];
      const statusA = getDiaryStatus(a, statuses[a.appid] ?? "none", entryA);
      const statusB = getDiaryStatus(b, statuses[b.appid] ?? "none", entryB);
      if (sortBy === "name") return a.name.localeCompare(b.name, language);
      if (sortBy === "rating") return (reviews[b.appid]?.rating ?? 0) - (reviews[a.appid]?.rating ?? 0);
      if (sortBy === "recent") return b.rtime_last_played - a.rtime_last_played;
      const priorityA = PRIORITY_RANK[entryA?.priority ?? "normal"];
      const priorityB = PRIORITY_RANK[entryB?.priority ?? "normal"];
      const decisionA = DECISION_RANK[entryA?.decision ?? "backlog"];
      const decisionB = DECISION_RANK[entryB?.decision ?? "backlog"];
      return (
        decisionA - decisionB ||
        priorityB - priorityA ||
        (statusA === "backlog" ? -1 : 0) - (statusB === "backlog" ? -1 : 0) ||
        a.name.localeCompare(b.name, language)
      );
    });
    return result;
  }, [allDiaryGames, categoryFilter, collections, details, diarySearchIndex, entries, language, preferences.showArchived, query, reviews, sortBy, statusFilter, statuses]);

  useEffect(() => {
    const validIds = new Set(allDiaryGames.map((game) => game.appid));
    setSelectedAppId((current) => (current !== null && !validIds.has(current) ? null : current));
  }, [allDiaryGames]);

  const selectGame = (appId: number) => {
    setSelectedAppId(appId);
  };

  const openGame = (appId: number, sectionId?: string) => {
    setSelectedAppId(appId);
    if (sectionId) setActiveSectionByGame((state) => (state[appId] === sectionId ? state : { ...state, [appId]: sectionId }));
  };

  const applyStatus = (appId: number, nextStatus: DiaryViewStatus) => {
    const game = games[appId];
    const previous = game ? getDiaryStatus(game, statuses[appId] ?? "none", entries[appId]) : null;
    if (nextStatus === "archived") {
      setDecision(appId, "archived");
    } else {
      setStatus(appId, statusToGameStatus(nextStatus));
      setDecision(appId, nextStatus === "playing" ? "next" : "backlog");
      setMarkedBacklog(appId, nextStatus === "backlog");
    }
    if (previous !== null && previous !== nextStatus) logStatusEvent(appId, nextStatus);
  };

  const captureActionSnapshot = useCallback((appIds: number[]): DiaryActionSnapshot => ({
    diary: captureBulkSnapshot(appIds),
    statuses: captureStatusSnapshot(appIds),
  }), [captureBulkSnapshot, captureStatusSnapshot]);

  const restoreActionSnapshot = useCallback((snapshot: DiaryActionSnapshot) => {
    restoreStatusSnapshot(snapshot.statuses);
    restoreBulkSnapshot(snapshot.diary);
  }, [restoreBulkSnapshot, restoreStatusSnapshot]);

  const showUndoToast = useCallback((message: string, undo: () => void) => {
    useToastStore.getState().addAction("success", message, t("common.undo"), undo);
  }, [t]);

  const applyStatusBatch = useCallback((appIds: number[], nextStatus: DiaryViewStatus) => {
    const ids = [...new Set(appIds.filter((appId) => Number.isFinite(appId)).map((appId) => Math.trunc(appId)))];
    if (ids.length === 0) return;
    // A status action takes a card out of any custom Kanban column first.
    setBulkCustomAssignment(ids, null);
    if (nextStatus === "archived") {
      setBulkStatus(ids, "none");
      setBulkDecision(ids, "archived");
      setBulkMarkedBacklog(ids, false);
    } else {
      setBulkStatus(ids, statusToGameStatus(nextStatus));
      setBulkDecision(ids, nextStatus === "playing" ? "next" : "backlog");
      setBulkMarkedBacklog(ids, nextStatus === "backlog");
    }
    logStatusEvents(ids.map((appId) => ({ appId, status: nextStatus })));
  }, [logStatusEvents, setBulkCustomAssignment, setBulkDecision, setBulkMarkedBacklog, setBulkStatus]);

  const applyBulkStatus = useCallback((appIds: number[], nextStatus: DiaryViewStatus) => {
    const snapshot = captureActionSnapshot(appIds);
    applyStatusBatch(appIds, nextStatus);
    showUndoToast(t("diary.kanban.statusChanged", { count: appIds.length }), () => restoreActionSnapshot(snapshot));
  }, [applyStatusBatch, captureActionSnapshot, restoreActionSnapshot, showUndoToast, t]);

  const applyBulkPriority = useCallback((appIds: number[], priority: DiaryPriority) => {
    const snapshot = captureActionSnapshot(appIds);
    setBulkPriority(appIds, priority);
    showUndoToast(t("diary.kanban.priorityChanged", { count: appIds.length }), () => restoreActionSnapshot(snapshot));
  }, [captureActionSnapshot, restoreActionSnapshot, setBulkPriority, showUndoToast, t]);

  const moveDiaryGames = useCallback((appIds: number[], column: BoardColumn, orderedAppIds: number[]) => {
    // setBoardOrder rewrites every rank in the destination column, so include
    // that full list in the undo snapshot in addition to the moved cards.
    const snapshot = captureActionSnapshot([...new Set([...appIds, ...orderedAppIds])]);
    if (column.kind === "custom" && column.custom) {
      setBulkCustomAssignment(appIds, column.custom.id);
    } else {
      setBulkCustomAssignment(appIds, null);
      if (column.status) applyStatusBatch(appIds, column.status);
    }
    setBoardOrder(orderedAppIds);
    showUndoToast(t("diary.kanban.moved", { count: appIds.length, column: column.label }), () => restoreActionSnapshot(snapshot));
  }, [applyStatusBatch, captureActionSnapshot, restoreActionSnapshot, setBoardOrder, setBulkCustomAssignment, showUndoToast, t]);

  const removeDiaryGames = useCallback((appIds: number[]) => {
    const ids = [...new Set(appIds)];
    if (ids.length === 0 || !window.confirm(t("diary.kanban.removeConfirm", { count: ids.length }))) return;
    const snapshot = captureActionSnapshot(ids);
    setBulkStatus(ids, "none");
    clearBulkDiaryState(ids);
    showUndoToast(t("diary.kanban.removed", { count: ids.length }), () => restoreActionSnapshot(snapshot));
  }, [captureActionSnapshot, clearBulkDiaryState, restoreActionSnapshot, setBulkStatus, showUndoToast, t]);

  const selectedGame = selectedAppId === null ? undefined : games[selectedAppId];
  const selectedDetails = selectedGame ? details[selectedGame.appid] : undefined;
  const selectedEntry = selectedGame ? entries[selectedGame.appid] : undefined;
  const selectedStatus = selectedGame
    ? getDiaryStatus(selectedGame, statuses[selectedGame.appid] ?? "none", selectedEntry)
    : "backlog";
  const selectedRating = selectedGame ? reviews[selectedGame.appid]?.rating ?? 0 : 0;
  const selectedHltbHours = selectedGame ? getHltbHours(hltbData[selectedGame.appid], hltbTimeMode) : null;
  const selectedNote = selectedGame ? notes[selectedGame.appid] ?? "" : "";
  const selectedSections = selectedGame
    ? pages.filter((page) => page.scope === "all" || page.appIds.includes(selectedGame.appid))
    : [];
  const selectedCollections = selectedGame
    ? diaryCollections.filter((collection) => collection.added.includes(selectedGame.appid))
    : [];
  const selectedSectionId = selectedGame ? activeSectionByGame[selectedGame.appid] ?? OVERVIEW_SECTION_ID : OVERVIEW_SECTION_ID;
  const selectedGameIndex = selectedGame ? filteredGames.findIndex((game) => game.appid === selectedGame.appid) : -1;
  const previousGame = selectedGameIndex > 0 ? filteredGames[selectedGameIndex - 1] : undefined;
  const nextGame = selectedGameIndex >= 0 && selectedGameIndex < filteredGames.length - 1 ? filteredGames[selectedGameIndex + 1] : undefined;
  const allTemplates = useMemo(() => [...getDefaultDiaryTemplates(language), ...templates], [language, templates]);
  const selectedTemplateContext = selectedGame
    ? makeTemplateContext(selectedGame, selectedDetails, selectedStatus, selectedRating, selectedHltbHours, language, t)
    : undefined;

  const diaryExportData = useMemo<DiaryExportData>(() => ({
    games: allDiaryGames,
    entries,
    ratings: Object.fromEntries(Object.entries(reviews).map(([appId, review]) => [Number(appId), review?.rating ?? 0])),
    notes,
    journal,
    pages,
    revisions,
    templates: allTemplates,
  }), [allDiaryGames, allTemplates, entries, journal, notes, pages, reviews, revisions]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedAppId]);

  useEffect(() => {
    if (!selectedGame) return;
    const current = activeSectionByGame[selectedGame.appid];
    if (current === JOURNAL_SECTION_ID && !preferences.showJournalPage) {
      setActiveSectionByGame((state) => ({ ...state, [selectedGame.appid]: OVERVIEW_SECTION_ID }));
    } else if (current !== OVERVIEW_SECTION_ID && current !== JOURNAL_SECTION_ID && current !== GAME_TIMELINE_SECTION_ID && current && !selectedSections.some((section) => section.id === current)) {
      setActiveSectionByGame((state) => ({ ...state, [selectedGame.appid]: OVERVIEW_SECTION_ID }));
    }
  }, [activeSectionByGame, preferences.showJournalPage, selectedGame, selectedSections]);

  const updatePreferences = (patch: Partial<DiaryPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  };

  const updateSort = (nextSort: DiarySort) => {
    setSortBy(nextSort);
    updatePreferences({ sortBy: nextSort });
  };

  const updateSelectedStatus = (nextStatus: DiaryViewStatus) => {
    if (!selectedGame) return;
    applyStatus(selectedGame.appid, nextStatus);
  };

  const handleCreateSection = (title: string, template: string, scope: DiaryPageScope, appIds: number[]) => {
    if (!selectedGame) return;
    const source = allTemplates.find((candidate) => candidate.id === template)?.markdown ?? "";
    const id = addPage(title, selectedTemplateContext ? resolveDiaryTemplate(source, selectedTemplateContext) : source, scope, appIds);
    if (id) setActiveSectionByGame((state) => ({ ...state, [selectedGame.appid]: id }));
  };

  return (
    <div data-testid="diary-workspace" className="flex min-h-0 flex-1 flex-col bg-repressurizer-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-repressurizer-border-subtle px-4 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setActiveCategory("all")}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
        >
          <ArrowLeft size={14} />
          {t("sidebar.all")}
        </button>
        <span className="text-[11px] font-medium text-repressurizer-text-faint">{t("diary.title")}</span>
      </div>

      {selectedGame ? (
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <aside style={{ "--diary-game-list-width": `${preferences.gameListWidth}px` } as CSSProperties} className="flex h-[38dvh] min-h-0 w-full shrink-0 flex-col border-b border-repressurizer-border-subtle xl:h-auto xl:w-[var(--diary-game-list-width)] xl:border-b-0">
            <div className="shrink-0 border-b border-repressurizer-border-subtle p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setSelectedAppId(null)} className="focus-ring inline-flex min-w-0 items-center gap-2 rounded-md text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-white"><ArrowLeft size={14} /><span className="truncate">{t("diary.backToLibrary")}</span></button>
                <div className="relative"><button type="button" data-diary-view-options-button aria-label={t("diary.settings")} aria-expanded={viewOptionsOpen} onClick={() => setViewOptionsOpen((open) => !open)} className="focus-ring rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><SlidersHorizontal size={14} /></button>{viewOptionsOpen && <DiaryViewOptions preferences={preferences} onChange={updatePreferences} onClose={() => setViewOptionsOpen(false)} t={t} />}</div>
              </div>
              <DiaryFilterControls query={query} statusFilter={statusFilter} statusCounts={diaryStatusCounts} sortBy={sortBy} categoryFilter={categoryFilter} collections={diaryCollections} t={t} onQueryChange={setQuery} onStatusChange={setStatusFilter} onSortChange={updateSort} onCategoryChange={setCategoryFilter} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="diary-game-list">
              {filteredGames.map((game, index) => <DiaryGameRow key={game.appid} game={game} detail={details[game.appid]} status={getDiaryStatus(game, statuses[game.appid] ?? "none", entries[game.appid])} rating={reviews[game.appid]?.rating ?? 0} journalCount={journal[game.appid]?.length ?? 0} sectionCount={pages.filter((page) => page.scope === "all" || page.appIds.includes(game.appid)).length} selected={selectedAppId === game.appid} compact index={index} onClick={() => selectGame(game.appid)} t={t} />)}
            </div>
          </aside>
          <PanelResizeHandle side="left" value={preferences.gameListWidth} min={220} max={420} onChange={(gameListWidth) => updatePreferences({ gameListWidth })} />
          <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-16 xl:pb-0">
            <DiaryDetail
                key={selectedGame.appid}
                game={selectedGame}
                detail={selectedDetails}
                entry={selectedEntry}
                status={selectedStatus}
                rating={selectedRating}
                hltbHours={selectedHltbHours}
                collections={selectedCollections}
                revisions={revisions}
                templates={allTemplates}
                ratingEmojis={diaryRatingEmojis}
                note={selectedNote}
                journalEntries={journal[selectedGame.appid] ?? []}
                gameTimelineSessions={playSessions}
                gameTimelineJournal={journal}
                gameTimelinePages={pages}
                gameTimelineReviews={reviews}
                gameTimelineStatusEvents={statusEvents}
                gameTimelineAchievements={achievements}
                boardPrefs={boardPrefs}
                onSetCustomAssignment={setCustomAssignment}
                sections={selectedSections}
                activeSectionId={selectedSectionId}
                isNext={selectedEntry?.decision === "next"}
                language={language}
                preferences={preferences}
                availableGames={allDiaryGames}
                inspectorWidth={preferences.inspectorWidth}
                t={t}
                onActiveSectionChange={(sectionId) => setActiveSectionByGame((state) => ({ ...state, [selectedGame.appid]: sectionId }))}
                onCreateSection={handleCreateSection}
                onRenameSection={(sectionId, title) => updatePage(sectionId, { title })}
                onUpdateSection={(sectionId, markdown) => updatePage(sectionId, { markdown })}
                onRemoveSection={(sectionId) => {
                  removePage(sectionId);
                  setActiveSectionByGame((state) => ({ ...state, [selectedGame.appid]: OVERVIEW_SECTION_ID }));
                }}
                onStatusChange={updateSelectedStatus}
                onRatingChange={(rating) => rating === 0 ? clearRating(selectedGame.appid) : setRating(selectedGame.appid, rating)}
                onPriorityChange={(priority) => setPriority(selectedGame.appid, priority)}
                onNoteSave={(text) => setNote(selectedGame.appid, text)}
                onRecordOverviewRevision={(markdown) => recordRevision({ target: "overview", targetId: `overview:${selectedGame.appid}`, appId: selectedGame.appid, markdown })}
                onPreviousGame={previousGame ? () => selectGame(previousGame.appid) : undefined}
                onNextGame={nextGame ? () => selectGame(nextGame.appid) : undefined}
                onInspectorResize={(inspectorWidth) => updatePreferences({ inspectorWidth })}
                onExport={() => setExportOpen(true)}
                onPlayNow={() => {
                  setStatus(selectedGame.appid, "playing");
                  setDecision(selectedGame.appid, "next");
                }}
                onDefer={() => setDecision(selectedGame.appid, "deferred")}
                onArchive={() => setDecision(selectedGame.appid, "archived")}
                onRestore={() => setDecision(selectedGame.appid, "backlog")}
                onAddJournal={(body, createdAt) => addJournalEntry(selectedGame.appid, body, createdAt, selectedGame.playtime_forever)}
                onUpdateJournal={(entryId, patch) => updateJournalEntry(selectedGame.appid, entryId, patch)}
                onRemoveJournal={(entryId) => removeJournalEntry(selectedGame.appid, entryId)}
              />
          </main>
        </div>
      ) : (
        <DiaryLibrary
          games={filteredGames}
          gamesById={games}
          details={details}
          entries={entries}
          statuses={statuses}
          reviews={reviews}
          journal={journal}
          pages={pages}
          collections={diaryCollections}
          board={board}
          boardPrefs={boardPrefs}
          sessions={playSessions}
          hltbData={hltbData}
          hltbTimeMode={hltbTimeMode}
          statusEvents={statusEvents}
          achievements={achievements}
          onSetColumnColor={setColumnColor}
          onToggleColumnHidden={toggleColumnHidden}
          onAddCustomColumn={addCustomColumn}
          onRenameCustomColumn={renameCustomColumn}
          onRemoveCustomColumn={removeCustomColumn}
          onSetCustomAssignment={setCustomAssignment}
          onSetPriority={setPriority}
          language={language}
          preferences={preferences}
          query={query}
          statusFilter={statusFilter}
          statusCounts={diaryStatusCounts}
          sortBy={sortBy}
          categoryFilter={categoryFilter}
          viewOptionsOpen={viewOptionsOpen}
          t={t}
          onQueryChange={setQuery}
          onStatusChange={setStatusFilter}
          onSortChange={updateSort}
          onCategoryChange={setCategoryFilter}
          onViewChange={(libraryView) => updatePreferences({ libraryView })}
          onViewOptionsToggle={() => setViewOptionsOpen((open) => !open)}
          onExport={() => setExportOpen(true)}
          onBackup={() => setBackupOpen(true)}
          onOpenAutoCategorize={() => setDiaryAutoCatOpen(true)}
          onPreferencesChange={updatePreferences}
          onSelectGame={selectGame}
          onApplyStatus={applyStatus}
          onSetBoardOrder={setBoardOrder}
          onBulkStatusChange={applyBulkStatus}
          onBulkPriorityChange={applyBulkPriority}
          onRemoveGames={removeDiaryGames}
          onMoveGames={moveDiaryGames}
          onOpenGame={openGame}
        />
      )}
      {exportOpen && <DiaryExportDialog data={diaryExportData} filteredAppIds={filteredGames.map((game) => game.appid)} onClose={() => setExportOpen(false)} t={t} />}
      {backupOpen && <DiaryBackupDialog language={language} t={t} onClose={() => setBackupOpen(false)} />}
      {diaryAutoCatOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />}>
          <DiaryAutoCategorizeDialog initialTarget="diary" onClose={() => setDiaryAutoCatOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function DiaryFilterControls({ query, statusFilter, statusCounts, sortBy, categoryFilter, collections, t, onQueryChange, onStatusChange, onSortChange, onCategoryChange }: {
  query: string;
  statusFilter: DiaryFilter;
  statusCounts: Record<DiaryFilter, number>;
  sortBy: DiarySort;
  categoryFilter: string;
  collections: SteamCollection[];
  t: ReturnType<typeof useT>;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: DiaryFilter) => void;
  onSortChange: (value: DiarySort) => void;
  onCategoryChange: (value: string) => void;
}) {
  const statusOptions: Array<[DiaryFilter, string]> = [["all", t("diary.allStatuses")], ["backlog", t("diary.status.backlog")], ["playing", t("diary.status.playing")], ["finished", t("diary.status.finished")], ["abandoned", t("diary.status.abandoned")], ["archived", t("diary.status.archived")]];
  const categoryOptions = [{ value: "all", label: t("diary.allCategories") }, ...collections.map((collection) => ({ value: collection.key, label: collection.name }))];
  const sortOptions = (["priority", "recent", "rating", "name"] as DiarySort[]).map((value) => ({ value, label: t(`diary.sort.${value}` as TranslationKey) }));
  return <div className="min-w-0 space-y-3">
    <label className="group flex w-full items-center gap-2 border-b border-repressurizer-border-subtle bg-transparent px-1 py-2.5 transition-colors focus-within:border-repressurizer-accent">
      <MagnifyingGlass size={15} className="shrink-0 text-repressurizer-text-faint group-focus-within:text-repressurizer-accent" />
      <input type="search" data-diary-search value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("diary.search")} aria-label={t("diary.search")} className="min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint" />
    </label>
    <div className="grid w-full grid-cols-2 gap-2">
      <SelectMenu value={categoryFilter} options={categoryOptions} onChange={onCategoryChange} ariaLabel={t("diary.categoryFilter")} size="sm" buttonClassName="border-repressurizer-border-subtle bg-repressurizer-surface/55" />
      <SelectMenu value={sortBy} options={sortOptions} onChange={onSortChange} ariaLabel={t("diary.sort")} size="sm" buttonClassName="border-repressurizer-border-subtle bg-repressurizer-surface/55" />
    </div>
    <div role="group" aria-label={t("diary.statusFilter")} className="flex min-w-0 gap-1 overflow-x-auto border-b border-repressurizer-border-subtle pb-1">
      {statusOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => onStatusChange(value)} className={`focus-ring inline-flex shrink-0 items-center gap-1 border-b-2 px-2 py-1.5 text-[10px] font-medium transition-colors ${statusFilter === value ? "border-repressurizer-accent text-repressurizer-accent" : "border-transparent text-repressurizer-text-faint hover:text-repressurizer-text"}`}><span>{label}</span><span aria-hidden="true" className="font-mono text-[9px] tabular-nums opacity-60">{statusCounts[value]}</span></button>)}
    </div>
  </div>;
}

function DiaryLibraryFilters({ query, statusFilter, statusCounts, sortBy, categoryFilter, collections, t, onQueryChange, onStatusChange, onSortChange, onCategoryChange }: {
  query: string;
  statusFilter: DiaryFilter;
  statusCounts: Record<DiaryFilter, number>;
  sortBy: DiarySort;
  categoryFilter: string;
  collections: SteamCollection[];
  t: ReturnType<typeof useT>;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: DiaryFilter) => void;
  onSortChange: (value: DiarySort) => void;
  onCategoryChange: (value: string) => void;
}) {
  const statusOptions: Array<[DiaryFilter, string]> = [["all", t("diary.allStatuses")], ["backlog", t("diary.status.backlog")], ["playing", t("diary.status.playing")], ["finished", t("diary.status.finished")], ["abandoned", t("diary.status.abandoned")], ["archived", t("diary.status.archived")]];
  const categoryOptions = [{ value: "all", label: t("diary.allCategories") }, ...collections.map((collection) => ({ value: collection.key, label: collection.name }))];
  const sortOptions = (["priority", "recent", "rating", "name"] as DiarySort[]).map((value) => ({ value, label: t(`diary.sort.${value}` as TranslationKey) }));
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <label className="group flex h-9 min-w-[180px] flex-1 basis-[220px] items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 transition-[background-color,border-color,box-shadow] focus-within:border-repressurizer-accent/60 focus-within:shadow-[0_0_0_1px_rgba(16,185,129,0.22)] hover:border-repressurizer-border hover:bg-repressurizer-surface-hover/50">
      <MagnifyingGlass size={14} className="shrink-0 text-repressurizer-text-faint group-focus-within:text-repressurizer-accent" />
      <input type="search" data-diary-search value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("diary.search")} aria-label={t("diary.search")} className="min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint" />
    </label>
    <SelectMenu value={categoryFilter} options={categoryOptions} onChange={onCategoryChange} ariaLabel={t("diary.categoryFilter")} size="sm" className="w-36 shrink-0" buttonClassName="h-9" />
    <SelectMenu value={sortBy} options={sortOptions} onChange={onSortChange} ariaLabel={t("diary.sort")} size="sm" className="w-36 shrink-0" buttonClassName="h-9" />
    <div role="group" aria-label={t("diary.statusFilter")} className="flex min-w-0 flex-wrap items-center gap-1.5 lg:ml-auto">
      {statusOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => onStatusChange(value)} className={`focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${statusFilter === value ? "border-repressurizer-accent/60 bg-repressurizer-accent/15 text-repressurizer-accent shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]" : "border-transparent bg-repressurizer-surface/40 text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"}`}><span>{label}</span><span aria-hidden="true" className="font-mono text-[9px] tabular-nums opacity-60">{statusCounts[value]}</span></button>)}
    </div>
  </div>;
}

function DiaryLibrary({ games, gamesById, details, entries, statuses, reviews, journal, pages, collections, board, boardPrefs, sessions, hltbData, hltbTimeMode, statusEvents, achievements, language, preferences, query, statusFilter, statusCounts, sortBy, categoryFilter, viewOptionsOpen, t, onQueryChange, onStatusChange, onSortChange, onCategoryChange, onViewChange, onViewOptionsToggle, onExport, onBackup, onOpenAutoCategorize, onPreferencesChange, onSelectGame, onApplyStatus, onSetBoardOrder, onBulkStatusChange, onBulkPriorityChange, onRemoveGames, onMoveGames, onSetColumnColor, onToggleColumnHidden, onAddCustomColumn, onRenameCustomColumn, onRemoveCustomColumn, onSetCustomAssignment, onSetPriority, onOpenGame }: {
  games: OwnedGame[];
  gamesById: Record<number, OwnedGame>;
  details: Record<number, GameDetails>;
  entries: Record<number, DiaryEntry>;
  statuses: Record<number, GameStatus>;
  reviews: Record<number, { rating?: number; updatedAt?: number }>;
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  collections: SteamCollection[];
  board: Record<number, number>;
  boardPrefs: DiaryBoardPrefs;
  sessions: PlaytimeSession[];
  hltbData: Record<number, HltbData>;
  hltbTimeMode: Parameters<typeof getHltbHours>[1];
  statusEvents: DiaryStatusEvent[];
  achievements: Record<number, DiaryAchievementEntry[]>;
  language: string;
  preferences: DiaryPreferences;
  query: string;
  statusFilter: DiaryFilter;
  statusCounts: Record<DiaryFilter, number>;
  sortBy: DiarySort;
  categoryFilter: string;
  viewOptionsOpen: boolean;
  onSetColumnColor: (columnKey: string, color: string | null) => void;
  onToggleColumnHidden: (columnKey: string) => void;
  onAddCustomColumn: (name: string, color: string) => string | null;
  onRenameCustomColumn: (columnId: string, name: string) => void;
  onRemoveCustomColumn: (columnId: string) => void;
  onSetCustomAssignment: (appId: number, columnId: string | null) => void;
  onSetPriority: (appId: number, priority: DiaryPriority) => void;
  t: ReturnType<typeof useT>;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: DiaryFilter) => void;
  onSortChange: (value: DiarySort) => void;
  onCategoryChange: (value: string) => void;
  onViewChange: (view: DiaryLibraryView) => void;
  onViewOptionsToggle: () => void;
  onExport: () => void;
  onBackup: () => void;
  onOpenAutoCategorize: () => void;
  onPreferencesChange: (patch: Partial<DiaryPreferences>) => void;
  onSelectGame: (appId: number) => void;
  onApplyStatus: (appId: number, status: DiaryViewStatus) => void;
  onSetBoardOrder: (orderedAppIds: number[]) => void;
  onBulkStatusChange: (appIds: number[], status: DiaryViewStatus) => void;
  onBulkPriorityChange: (appIds: number[], priority: DiaryPriority) => void;
  onRemoveGames: (appIds: number[]) => void;
  onMoveGames: (appIds: number[], column: BoardColumn, orderedAppIds: number[]) => void;
  onOpenGame: (appId: number, sectionId?: string) => void;
}) {
  const visibleAppIds = useMemo(() => new Set(games.map((game) => game.appid)), [games]);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const steamId64 = useSettingsStore((state) => state.steamId64);
  const achievementsConcurrency = useSettingsStore((state) => state.achievementsConcurrency);
  const setAchievements = useDiaryStore((state) => state.setAchievements);
  const [achievementsSyncing, setAchievementsSyncing] = useState<{ done: number; total: number } | null>(null);
  const [gameMenu, setGameMenu] = useState<{ appId: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!gameMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-diary-game-menu]")) setGameMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [gameMenu]);
  const achievementsSyncRef = useRef(false);
  const handleSyncAchievements = async () => {
    if (achievementsSyncRef.current || !apiKey || games.length === 0) return;
    achievementsSyncRef.current = true;
    setAchievementsSyncing({ done: 0, total: games.length });
    let done = 0;
    const queue = [...games];
    const worker = async () => {
      for (;;) {
        const game = queue.shift();
        if (!game) return;
        try {
          const summary = await fetchAchievements(apiKey, steamId64, game.appid);
          setAchievements(game.appid, summary.achievements
            .filter((item) => item.achieved && item.unlock_time > 0)
            .map((item) => ({ apiName: item.api_name, name: item.name, unlockedAt: item.unlock_time, icon: item.icon })));
        } catch {}
        done += 1;
        setAchievementsSyncing({ done, total: games.length });
      }
    };
    const lanes = Math.max(1, Math.min(10, achievementsConcurrency || 5));
    await Promise.all(Array.from({ length: lanes }, () => worker()));
    setAchievementsSyncing(null);
    achievementsSyncRef.current = false;
  };
  return <main className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="diary-library">
    <div className="relative z-10 shrink-0 border-b border-repressurizer-border-subtle bg-repressurizer-bg/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3 sm:px-6">
      <h1 className="sr-only order-1 flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-white">
        {t("diary.title")}
      </h1>
      <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-1.5 lg:order-2 lg:w-auto">
          <div role="group" aria-label={t("diary.view")} className="flex h-8 items-center rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/70 p-0.5">
            {(["grid", "list", "kanban", "timeline", "upcoming"] as DiaryLibraryView[]).map((view) => {
              const ViewIcon = DIARY_VIEW_ICONS[view];
              return <button key={view} type="button" aria-label={t(`diary.view.${view}` as TranslationKey)} aria-pressed={preferences.libraryView === view} data-testid={`diary-view-${view}`} onClick={() => onViewChange(view)} className={`focus-ring inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors ${preferences.libraryView === view ? "bg-repressurizer-surface-raised font-semibold text-white shadow-pop-sm" : "font-medium text-repressurizer-text-faint hover:text-repressurizer-text"}`}><ViewIcon size={13} aria-hidden="true" className={preferences.libraryView === view ? "text-repressurizer-accent" : ""} /><span className="hidden leading-none xl:inline">{t(`diary.view.${view}` as TranslationKey)}</span></button>;
            })}
          </div>
          <div className="relative">
            <button type="button" data-diary-view-options-button aria-label={t("diary.settings")} aria-expanded={viewOptionsOpen} onClick={onViewOptionsToggle} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-repressurizer-surface/60 px-2.5 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-border hover:bg-repressurizer-surface-hover hover:text-white"><SlidersHorizontal size={14} /><span className="hidden leading-none xl:inline">{t("diary.settings")}</span></button>
            {viewOptionsOpen && <DiaryViewOptions preferences={preferences} onChange={onPreferencesChange} onClose={onViewOptionsToggle} t={t} />}
          </div>
          <button type="button" onClick={onExport} aria-label={t("diary.export")} title={t("diary.export")} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-repressurizer-surface/60 px-2.5 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-border hover:bg-repressurizer-surface-hover hover:text-white"><Export size={14} /><span className="hidden leading-none xl:inline">{t("diary.export")}</span></button>
          <button type="button" onClick={onBackup} aria-label={t("diary.backup")} title={t("diary.backup")} data-testid="diary-backup-button" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-repressurizer-surface/60 px-2.5 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-border hover:bg-repressurizer-surface-hover hover:text-white"><Database size={14} /><span className="hidden leading-none xl:inline">{t("diary.backup")}</span></button>
          <button type="button" onClick={onOpenAutoCategorize} aria-label={`${t("auto.title")}: ${t("auto.destination.diary")}`} title={`${t("auto.title")}: ${t("auto.destination.diary")}`} data-testid="diary-autocat-button" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-repressurizer-accent/25 bg-repressurizer-accent/[0.08] px-2.5 text-[11px] font-medium text-repressurizer-accent transition-colors hover:border-repressurizer-accent/50 hover:bg-repressurizer-accent/15"><Sparkle size={14} /><span className="hidden leading-none xl:inline">{t("auto.title")}</span></button>
        </div>
      </div>
      <div className="px-4 pb-3 pt-3 sm:px-6">
        <DiaryLibraryFilters query={query} statusFilter={statusFilter} statusCounts={statusCounts} sortBy={sortBy} categoryFilter={categoryFilter} collections={collections} t={t} onQueryChange={onQueryChange} onStatusChange={onStatusChange} onSortChange={onSortChange} onCategoryChange={onCategoryChange} />
      </div>
    </div>
    <div hidden={preferences.libraryView !== "kanban"} className="flex min-h-0 flex-1 flex-col">
      <DiaryKanbanBoard games={games} details={details} entries={entries} statuses={statuses} reviews={reviews} journal={journal} pages={pages} board={board} boardPrefs={boardPrefs} language={language} showArchived={preferences.showArchived} forceStatus={statusFilter === "archived" ? "archived" : undefined} wipLimit={preferences.kanbanWipLimit} t={t} onApplyStatus={onApplyStatus} onSetBoardOrder={onSetBoardOrder} onSetPriority={onSetPriority} onBulkStatusChange={onBulkStatusChange} onBulkPriorityChange={onBulkPriorityChange} onRemoveGames={onRemoveGames} onMoveGames={onMoveGames} onOpenGame={(appId) => onOpenGame(appId)} onSetColumnColor={onSetColumnColor} onToggleColumnHidden={onToggleColumnHidden} onAddCustomColumn={onAddCustomColumn} onRenameCustomColumn={onRenameCustomColumn} onRemoveCustomColumn={onRemoveCustomColumn} onSetCustomAssignment={onSetCustomAssignment} />
    </div>
    <div hidden={preferences.libraryView !== "timeline"} className="flex min-h-0 flex-1 flex-col">
      <DiaryTimeline games={gamesById} visibleAppIds={visibleAppIds} sessions={sessions} journal={journal} pages={pages} reviews={reviews} statusEvents={statusEvents} achievements={achievements} achievementsSyncing={achievementsSyncing} language={language} preferences={preferences} t={t} onOpenGame={onOpenGame} onLayoutChange={(timelineLayout) => onPreferencesChange({ timelineLayout })} onSyncAchievements={() => void handleSyncAchievements()} onToggleKind={(kind) => { const hidden = new Set(preferences.timelineHiddenKinds); if (hidden.has(kind)) hidden.delete(kind); else hidden.add(kind); onPreferencesChange({ timelineHiddenKinds: [...hidden] }); }} onGameContextMenu={(appId, x, y) => setGameMenu({ appId, x: Math.min(x, window.innerWidth - 260), y: Math.min(y, window.innerHeight - 340) })} />
    </div>
    <div hidden={preferences.libraryView !== "upcoming"} className="flex min-h-0 flex-1 flex-col">
      <DiaryUpcoming games={games} entries={entries} statuses={statuses} sessions={sessions} hltbData={hltbData} hltbTimeMode={hltbTimeMode} language={language} t={t} onOpenGame={onOpenGame} onApplyStatus={onApplyStatus} />
    </div>
    <div hidden={preferences.libraryView === "kanban" || preferences.libraryView === "timeline" || preferences.libraryView === "upcoming"} className="min-h-0 flex-1 overflow-y-auto">
      {games.length === 0 ? <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center"><span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-repressurizer-border bg-repressurizer-surface/40"><GameController size={26} weight="duotone" className="text-repressurizer-text-faint" /></span><p className="text-sm font-medium text-repressurizer-text">{t("diary.empty")}</p><p className="mt-1 max-w-xs text-xs leading-relaxed text-repressurizer-text-faint">{t("diary.empty.desc")}</p></div> : <div data-testid={`diary-library-${preferences.libraryView}`} className={preferences.libraryView === "grid" ? "game-grid grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-6 p-4 sm:p-6" : "px-2 py-1 sm:px-3"}>
        {games.map((game) => <DiaryLibraryGame key={game.appid} game={game} status={getDiaryStatus(game, statuses[game.appid] ?? "none", entries[game.appid])} rating={reviews[game.appid]?.rating ?? 0} journalCount={journal[game.appid]?.length ?? 0} sectionCount={pages.filter((page) => page.scope === "all" || page.appIds.includes(game.appid)).length} language={language} view={preferences.libraryView} t={t} onClick={() => onSelectGame(game.appid)} onDoubleClick={() => onSelectGame(game.appid)} onContextMenuOpen={(x, y) => setGameMenu({ appId: game.appid, x: Math.min(x, window.innerWidth - 260), y: Math.min(y, window.innerHeight - 340) })} />)}
      </div>}
    </div>
    {gameMenu && createPortal(
      <DiaryGameContextMenu
        appId={gameMenu.appId}
        x={gameMenu.x}
        y={gameMenu.y}
        games={games}
        entries={entries}
        boardPrefs={boardPrefs}
        showArchived={preferences.showArchived}
        t={t}
        onClose={() => setGameMenu(null)}
        onOpenGame={(appId) => { setGameMenu(null); onOpenGame(appId); }}
        onApplyStatus={onApplyStatus}
        onSetCustomAssignment={onSetCustomAssignment}
        onSetPriority={onSetPriority}
      />,
      document.body,
    )}
  </main>;
}

function DiaryLibraryGame({ game, status, rating, journalCount, sectionCount, language, view, t, onClick, onDoubleClick, onContextMenuOpen }: {
  game: OwnedGame;
  status: DiaryViewStatus;
  rating: number;
  journalCount: number;
  sectionCount: number;
  language: string;
  view: DiaryLibraryView;
  t: ReturnType<typeof useT>;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenuOpen: (x: number, y: number) => void;
}) {
  const metadata = <><span>{formatHours(game.playtime_forever, language)}h</span><span aria-hidden="true" className="text-repressurizer-text-faint/60">·</span><span>{sectionCount + journalCount} {t("diary.pages.count")}</span></>;
  if (view === "list") return <button type="button" data-testid={`diary-game-${game.appid}`} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={(event) => { event.preventDefault(); onContextMenuOpen(event.clientX, event.clientY); }} className="focus-ring group grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-repressurizer-surface/50 sm:grid-cols-[92px_minmax(0,1fr)_90px_130px_72px] sm:px-3"><span className="h-11 overflow-hidden rounded-md bg-repressurizer-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"><SteamImage appId={game.appid} alt="" kind="header" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium text-repressurizer-text group-hover:text-white">{String(game.name ?? "")}</span><span className="mt-1 flex items-center gap-1.5 text-[10px] text-repressurizer-text-faint sm:hidden">{metadata}</span></span><span className="hidden text-right font-mono text-[11px] tabular-nums text-repressurizer-text-muted sm:block">{formatHours(game.playtime_forever, language)}h</span><span className={`hidden w-fit rounded-full border px-2 py-0.5 text-[10px] sm:inline-flex ${STATUS_STYLES[status]}`}>{t(STATUS_LABELS[status])}</span><span className="text-right font-mono text-xs tabular-nums text-repressurizer-accent">{rating > 0 ? `${rating}/10` : <span className="text-repressurizer-text-faint/70">—</span>}</span></button>;
  return <button type="button" data-testid={`diary-game-${game.appid}`} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={(event) => { event.preventDefault(); onContextMenuOpen(event.clientX, event.clientY); }} className="card-lift focus-ring group min-w-0 rounded-xl text-left"><span className="relative block aspect-[460/215] overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface shadow-pop-sm transition-[border-color,box-shadow] group-hover:border-repressurizer-accent/45 group-hover:shadow-pop"><SteamImage appId={game.appid} alt="" kind="header" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]" /><span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/35 to-transparent" /><span className={`absolute bottom-2 left-2 rounded-full border px-2 py-0.5 text-[9px] font-medium backdrop-blur-md ${STATUS_STYLES[status]}`}>{t(STATUS_LABELS[status])}</span>{rating > 0 && <span className="absolute bottom-2 right-2 rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">{rating}/10</span>}</span><span title={String(game.name ?? "")} className="mt-2 block truncate text-sm font-medium leading-snug text-repressurizer-text group-hover:text-white">{String(game.name ?? "")}</span><span className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums text-repressurizer-text-faint">{metadata}</span></button>;
}

function DiaryViewOptions({ preferences, onChange, onClose, t }: { preferences: DiaryPreferences; onChange: (patch: Partial<DiaryPreferences>) => void; onClose: () => void; t: ReturnType<typeof useT> }) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const updatePosition = () => {
      const button = document.querySelector<HTMLElement>("[data-diary-view-options-button]");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(320, Math.max(240, window.innerWidth - 16));
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      setPosition({ top: rect.bottom + 8, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, []);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-diary-view-options]") && !target.closest("[data-diary-view-options-button]") && !target.closest('[role="listbox"]') && !target.closest('[role="option"]')) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);
  return (
    <div data-diary-view-options data-testid="diary-view-options" style={position ? { position: "fixed", top: position.top, left: position.left, width: position.width } : { visibility: "hidden" }} className="animate-fade-in fixed z-20 max-w-[calc(100vw-1rem)] rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 p-3 shadow-pop backdrop-blur-md">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.settings")}</p>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"><span>{t("diary.compact")}</span><input type="checkbox" checked={preferences.compact} onChange={(event) => onChange({ compact: event.target.checked })} className="h-4 w-4 accent-repressurizer-accent" /></label>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"><span>{t("diary.showArchived")}</span><input type="checkbox" checked={preferences.showArchived} onChange={(event) => onChange({ showArchived: event.target.checked })} className="h-4 w-4 accent-repressurizer-accent" /></label>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"><span>{t("diary.journal.showPage")}</span><input type="checkbox" checked={preferences.showJournalPage} onChange={(event) => onChange({ showJournalPage: event.target.checked })} className="h-4 w-4 accent-repressurizer-accent" /></label>
      <div className="my-2 border-t border-repressurizer-border-subtle" />
      <div className="flex items-center justify-between gap-3 px-2 py-2 text-xs text-repressurizer-text"><span>{t("diary.journal.dateFormat")}</span><SelectMenu<DiaryDateFormat> value={preferences.dateFormat} options={[{ value: "local", label: t("diary.journal.dateFormat.local") }, { value: "iso", label: t("diary.journal.dateFormat.iso") }]} onChange={(dateFormat) => onChange({ dateFormat })} ariaLabel={t("diary.journal.dateFormat")} size="sm" className="w-32" buttonClassName="border-repressurizer-border-subtle bg-repressurizer-bg text-[11px]" /></div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"><span>{t("diary.journal.showTime")}</span><input type="checkbox" checked={preferences.showTime} onChange={(event) => onChange({ showTime: event.target.checked })} className="h-4 w-4 accent-repressurizer-accent" /></label>
      <div className={`flex items-center justify-between gap-3 px-2 py-2 text-xs ${preferences.showTime ? "text-repressurizer-text" : "text-repressurizer-text-faint"}`}><span>{t("diary.journal.hourCycle")}</span><SelectMenu<DiaryHourCycle> value={preferences.hourCycle} options={[{ value: "auto", label: t("diary.journal.hourCycle.auto") }, { value: "12", label: t("diary.journal.hourCycle.12") }, { value: "24", label: t("diary.journal.hourCycle.24") }]} onChange={(hourCycle) => onChange({ hourCycle })} disabled={!preferences.showTime} ariaLabel={t("diary.journal.hourCycle")} size="sm" className="w-32" buttonClassName="border-repressurizer-border-subtle bg-repressurizer-bg text-[11px]" /></div>
      <div className="my-2 border-t border-repressurizer-border-subtle" />
      <label className="flex items-center justify-between gap-3 px-2 py-2 text-xs text-repressurizer-text"><span>{t("diary.kanban.wipLimit")}</span><input type="number" min={0} max={20} value={preferences.kanbanWipLimit} onChange={(event) => onChange({ kanbanWipLimit: Math.min(20, Math.max(0, Math.floor(Number(event.target.value) || 0))) })} aria-label={t("diary.kanban.wipLimit")} className="w-16 rounded-md border border-repressurizer-border bg-repressurizer-bg px-2 py-1 text-[11px] text-repressurizer-text outline-none" /></label>
      <p className="px-2 pb-1 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.kanban.wipLimit.desc")}</p>
    </div>
  );
}


function DiaryGameContextMenu({ appId, x, y, games, entries, boardPrefs, showArchived, t, onClose, onOpenGame, onApplyStatus, onSetCustomAssignment, onSetPriority }: {
  appId: number;
  x: number;
  y: number;
  games: OwnedGame[];
  entries: Record<number, DiaryEntry>;
  boardPrefs: DiaryBoardPrefs;
  showArchived: boolean;
  t: ReturnType<typeof useT>;
  onClose: () => void;
  onOpenGame: (appId: number) => void;
  onApplyStatus: (appId: number, status: DiaryViewStatus) => void;
  onSetCustomAssignment: (appId: number, columnId: string | null) => void;
  onSetPriority: (appId: number, priority: DiaryPriority) => void;
}) {
  const game = games.find((candidate) => candidate.appid === appId);
  if (!game) return null;
  const columns = buildBoardColumns(boardPrefs, showArchived, t);
  const currentColumnKey = boardPrefs.customAssignments[appId] ?? getDiaryStatus(game, "none", entries[appId]);
  const move = (columnKey: string) => {
    const column = columns.find((candidate) => candidate.key === columnKey);
    if (!column) return;
    if (column.kind === "custom" && column.custom) onSetCustomAssignment(appId, column.custom.id);
    else {
      onSetCustomAssignment(appId, null);
      if (column.status) onApplyStatus(appId, column.status);
    }
    onClose();
  };
  return createPortal(
    <div data-diary-game-menu role="menu" aria-label={String(game.name ?? "")} data-testid="diary-game-context-menu" className="animate-fade-in fixed z-50 w-60 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 py-1.5 shadow-dialog backdrop-blur-md" style={{ left: x, top: y }}>
      <p className="truncate border-b border-repressurizer-border-subtle px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{String(game.name ?? "")}</p>
      <button type="button" role="menuitem" onClick={() => { onClose(); onOpenGame(appId); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white">{t("diary.openGame")}</button>
      <p className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.moveTo")}</p>
      {columns.map((column) => (
        <button key={column.key} type="button" role="menuitem" data-testid={`diary-game-move-${column.key}`} onClick={() => move(column.key)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-repressurizer-surface-hover hover:text-white ${column.key === currentColumnKey ? "text-repressurizer-accent" : "text-repressurizer-text"}`}>
          <span aria-hidden="true" style={{ backgroundColor: column.color }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
          {column.label}
        </button>
      ))}
      <p className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.priority")}</p>
      <div className="flex gap-1 px-2.5 pb-1">
        {(["high", "normal", "low"] as DiaryPriority[]).map((priority) => (
          <button key={priority} type="button" role="menuitem" onClick={() => { onSetPriority(appId, priority); onClose(); }} className={`focus-ring flex-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${priority === "high" ? "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20" : priority === "low" ? "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint hover:text-repressurizer-text" : "border-amber-400/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"}`}>{t(`diary.priority.${priority}`)}</button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function DiaryGameRow({ game, detail, status, rating, journalCount, sectionCount, selected, compact, index, onClick, t }: {
  game: OwnedGame;
  detail: GameDetails | undefined;
  status: DiaryViewStatus;
  rating: number;
  journalCount: number;
  sectionCount: number;
  selected: boolean;
  compact: boolean;
  index: number;
  onClick: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <button type="button" data-testid={`diary-game-${game.appid}`} onClick={onClick} className={`group card-lift focus-ring flex w-full items-center gap-3 rounded-xl border px-2.5 text-left ${compact ? "py-2" : "py-2.5"} ${selected ? "border-repressurizer-accent/55 bg-repressurizer-accent/10 shadow-pop-sm" : "border-transparent hover:border-repressurizer-border-subtle hover:bg-repressurizer-surface/70"}`}>
      <div className="relative h-11 w-[74px] shrink-0 overflow-hidden rounded-lg bg-repressurizer-surface"><SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" /><span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 font-mono text-[9px] text-white">{String(index + 1).padStart(2, "0")}</span></div>
      <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><p title={String(game.name ?? "")} className="line-clamp-2 break-words text-xs font-medium leading-snug text-repressurizer-text">{String(game.name ?? "")}</p>{rating > 0 && <span className="shrink-0 font-mono text-[10px] text-repressurizer-accent">{rating}/10</span>}</div><div className="mt-1 flex items-center gap-1.5"><span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${STATUS_STYLES[status]}`}>{t(STATUS_LABELS[status])}</span>{(sectionCount > 0 || journalCount > 0) && <span className="text-[10px] text-repressurizer-text-faint">{sectionCount + journalCount} {t("diary.pages.count")}</span>}</div>{!compact && <p className="mt-1 truncate text-[10px] text-repressurizer-text-faint">{detail?.developers?.[0] || t("common.unknown")}</p>}</div>
      {selected && <span className="h-2 w-2 shrink-0 rounded-full bg-repressurizer-accent shadow-[0_0_12px_rgba(126,184,255,0.8)]" />}
    </button>
  );
}

function DiaryDetail({
  game,
  detail,
  entry,
  status,
  rating,
  hltbHours,
  collections,
  revisions,
  templates,
  ratingEmojis,
  note,
  journalEntries,
  sections,
  activeSectionId,
  gameTimelineSessions,
  gameTimelineJournal,
  gameTimelinePages,
  gameTimelineReviews,
  gameTimelineStatusEvents,
  gameTimelineAchievements,
  boardPrefs,
  onSetCustomAssignment,
  isNext,
  language,
  preferences,
  availableGames,
  inspectorWidth,
  t,
  onActiveSectionChange,
  onCreateSection,
  onRenameSection,
  onUpdateSection,
  onRemoveSection,
  onStatusChange,
  onRatingChange,
  onPriorityChange,
  onNoteSave,
  onRecordOverviewRevision,
  onPreviousGame,
  onNextGame,
  onInspectorResize,
  onExport,
  onPlayNow,
  onDefer,
  onArchive,
  onRestore,
  onAddJournal,
  onUpdateJournal,
  onRemoveJournal,
}: {
  game: OwnedGame;
  detail: GameDetails | undefined;
  entry: DiaryEntry | undefined;
  status: DiaryViewStatus;
  rating: number;
  hltbHours: number | null;
  collections: SteamCollection[];
  revisions: DiaryRevision[];
  templates: DiaryTemplate[];
  ratingEmojis: string[];
  note: string;
  journalEntries: DiaryJournalEntry[];
  sections: DiarySection[];
  activeSectionId: string;
  gameTimelineSessions: PlaytimeSession[];
  gameTimelineJournal: Record<number, DiaryJournalEntry[]>;
  gameTimelinePages: DiarySection[];
  gameTimelineReviews: Record<number, { rating?: number; updatedAt?: number }>;
  gameTimelineStatusEvents: DiaryStatusEvent[];
  gameTimelineAchievements: Record<number, DiaryAchievementEntry[]>;
  boardPrefs: DiaryBoardPrefs;
  onSetCustomAssignment: (appId: number, columnId: string | null) => void;
  isNext: boolean;
  language: string;
  preferences: DiaryPreferences;
  availableGames: OwnedGame[];
  inspectorWidth: number;
  t: ReturnType<typeof useT>;
  onActiveSectionChange: (sectionId: string) => void;
  onCreateSection: (title: string, template: string, scope: DiaryPageScope, appIds: number[]) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onUpdateSection: (sectionId: string, markdown: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onStatusChange: (status: DiaryViewStatus) => void;
  onRatingChange: (rating: number) => void;
  onPriorityChange: (priority: DiaryPriority) => void;
  onNoteSave: (note: string) => void;
  onRecordOverviewRevision: (markdown: string) => void;
  onPreviousGame?: () => void;
  onNextGame?: () => void;
  onInspectorResize: (width: number) => void;
  onExport: () => void;
  onPlayNow: () => void;
  onDefer: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAddJournal: (body: string, createdAt: number) => void;
  onUpdateJournal: (entryId: string, patch: Partial<Pick<DiaryJournalEntry, "body" | "createdAt">>) => void;
  onRemoveJournal: (entryId: string) => void;
}) {
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const releaseDate = detail?.release_date || detail?.store_release_date || null;
  const templateContext = makeTemplateContext(game, detail, status, rating, hltbHours, language, t);
  return (
    <div style={{ "--diary-inspector-width": `${inspectorWidth}px` } as CSSProperties} className="grid min-h-full min-w-0 xl:grid-cols-[minmax(0,1fr)_6px_var(--diary-inspector-width)]">
      <section className="min-w-0">
        <DiarySectionRail sections={sections} templates={templates} activeSectionId={activeSectionId} selectedAppId={game.appid} availableGames={availableGames} showJournal={preferences.showJournalPage} journalCount={journalEntries.length} t={t} onSelect={onActiveSectionChange} onCreate={onCreateSection} onRename={onRenameSection} onRemove={onRemoveSection} onPreviousGame={onPreviousGame} onNextGame={onNextGame} onExport={onExport} />
        <div className="min-w-0">
          <header className="border-b border-repressurizer-border-subtle px-6 py-5">
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-3xl">{String(game.name ?? "")}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-repressurizer-text-muted">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${STATUS_STYLES[status]}`}>{t(STATUS_LABELS[status])}</span>
              {isNext && <span className="rounded-full border border-repressurizer-accent/30 bg-repressurizer-accent/10 px-2 py-1 text-[10px] text-repressurizer-accent">{t("diary.nextUp")}</span>}
              {(() => {
                const assignedId = boardPrefs.customAssignments[game.appid];
                const column = boardPrefs.customColumns.find((candidate) => candidate.id === assignedId);
                if (!column) return null;
                const chipColor = boardPrefs.columnColors[column.id] ?? column.color;
                return (
                  <span data-testid={`diary-custom-column-chip`} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium" style={{ borderColor: `${chipColor}66`, backgroundColor: `${chipColor}1e`, color: chipColor }}>
                    {column.name}
                    <button type="button" aria-label={t("diary.customColumn.remove", { column: column.name })} title={t("diary.customColumn.remove", { column: column.name })} onClick={() => onSetCustomAssignment(game.appid, null)} className="focus-ring rounded-full p-0.5 transition-colors hover:bg-black/20"><X size={9} weight="bold" /></button>
                  </span>
                );
              })()}
              <SelectMenu value={entry?.priority ?? "normal"} options={(["high", "normal", "low"] as DiaryPriority[]).map((priority) => ({ value: priority, label: `${t("diary.priority")} · ${t(`diary.priority.${priority}` as TranslationKey)}` }))} onChange={onPriorityChange} ariaLabel={t("diary.priority")} size="sm" className="w-[140px]" buttonClassName="h-7 rounded-full border-repressurizer-border-subtle bg-repressurizer-surface/70 px-2 text-[10px]" />
              {collections.map((collection) => <span key={collection.key} className={`rounded-full border px-2 py-1 text-[10px] font-medium ${categoryStyle(collection)}`}>{collection.name}</span>)}
            </div>
          </header>
          {activeSectionId === JOURNAL_SECTION_ID ? (
            <SessionNotes entries={journalEntries} language={language} preferences={preferences} t={t} onAdd={onAddJournal} onUpdate={onUpdateJournal} onRemove={onRemoveJournal} />
          ) : activeSectionId === GAME_TIMELINE_SECTION_ID ? (
            <DiaryGameTimeline appId={game.appid} sessions={gameTimelineSessions} journal={gameTimelineJournal} pages={gameTimelinePages} reviews={gameTimelineReviews} statusEvents={gameTimelineStatusEvents} achievements={gameTimelineAchievements} language={language} preferences={preferences} t={t} onOpenGame={(_targetAppId, sectionId) => { if (sectionId) onActiveSectionChange(sectionId); }} />
          ) : activeSectionId === OVERVIEW_SECTION_ID || !activeSection ? (
            <DiaryOverview appId={game.appid} note={note} revisions={revisions.filter((revision) => revision.target === "overview" && revision.targetId === `overview:${game.appid}`)} templateContext={templateContext} language={language} t={t} onNoteSave={onNoteSave} onRecordRevision={onRecordOverviewRevision} />
          ) : (
            <MarkdownSectionPanel key={activeSection.id} section={activeSection} revisions={revisions.filter((revision) => revision.target === "page" && revision.targetId === activeSection.id)} templateContext={templateContext} language={language} t={t} onRename={(title) => onRenameSection(activeSection.id, title)} onUpdate={(markdown) => onUpdateSection(activeSection.id, markdown)} onRemove={() => onRemoveSection(activeSection.id)} />
          )}
        </div>
      </section>
      <PanelResizeHandle side="right" value={inspectorWidth} min={260} max={440} onChange={onInspectorResize} />
      <DiaryInspector game={game} detail={detail} status={status} rating={rating} ratingEmojis={ratingEmojis} hltbHours={hltbHours} releaseDate={releaseDate} language={language} isNext={isNext} t={t} onStatusChange={onStatusChange} onRatingChange={onRatingChange} onPlayNow={onPlayNow} onDefer={onDefer} onArchive={onArchive} onRestore={onRestore} />
    </div>
  );
}

function DiaryInspector({ game, detail, status, rating, ratingEmojis, hltbHours, releaseDate, language, isNext, t, onStatusChange, onRatingChange, onPlayNow, onDefer, onArchive, onRestore }: {
  game: OwnedGame;
  detail: GameDetails | undefined;
  status: DiaryViewStatus;
  rating: number;
  ratingEmojis: string[];
  hltbHours: number | null;
  releaseDate: string | null;
  language: string;
  isNext: boolean;
  t: ReturnType<typeof useT>;
  onStatusChange: (status: DiaryViewStatus) => void;
  onRatingChange: (rating: number) => void;
  onPlayNow: () => void;
  onDefer: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const statusOptions = (Object.keys(STATUS_LABELS) as DiaryViewStatus[]).map((value) => ({ value, label: t(STATUS_LABELS[value]) }));
  return <aside data-testid="diary-inspector" className="min-h-full border-t border-repressurizer-border-subtle bg-repressurizer-surface/30 px-5 py-5 xl:border-t-0">
    <div className="flex flex-col xl:sticky xl:top-0">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-repressurizer-text-faint">{t("diary.metadata")}</p>
      <div data-testid="diary-hero-image" className="aspect-[16/9] overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg shadow-pop-sm"><SteamImage appId={game.appid} alt={String(game.name ?? "")} kind="header" loading="eager" className="h-full w-full object-cover" /></div>
      <div className="border-b border-repressurizer-border-subtle py-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.rating")}</p><p className="mt-1 text-xs text-repressurizer-text-muted">{t("diary.ratingHint")}</p></div><span className="flex items-center gap-2"><span className="text-2xl" aria-hidden="true">{rating > 0 ? ratingEmojis[rating - 1] : ""}</span><span className="font-mono text-2xl font-semibold tabular-nums text-white">{rating > 0 ? `${rating}/10` : "—"}</span></span></div><RatingControl rating={rating} emojis={ratingEmojis} onChange={onRatingChange} t={t} compact /></div>
      <div className="mt-5 border-b border-repressurizer-border-subtle pb-5">
        <SelectMenu value={status} options={statusOptions} onChange={onStatusChange} label={t("diary.status")} ariaLabel={t("diary.status")} className="w-full" buttonClassName={`h-10 w-full justify-between rounded-lg border px-3 text-xs font-medium ${STATUS_STYLES[status]}`} menuClassName="text-xs" />
        <div className="my-4 grid grid-cols-[1fr_auto_1fr] items-center rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/50 py-3">
          <TimeMetric label={t("diary.hoursPlayed")} value={`${formatHours(game.playtime_forever, language)}h`} />
          <span aria-hidden="true" className="text-[9px] text-repressurizer-accent/70">◆</span>
          <TimeMetric label={t("diary.hltbHours")} value={hltbHours === null ? "—" : `${hltbHours}h`} align="right" />
        </div>
        <div className="space-y-3">
        <InspectorRow label={t("diary.lastPlayed")} value={formatDate(game.rtime_last_played, language, t("diary.never"))} />
        <InspectorRow label={t("diary.releaseDate")} value={releaseDate || t("common.unknown")} />
        <InspectorRow label={t("diary.developer")} value={detail?.developers?.[0] || t("common.unknown")} />
        <InspectorRow label={t("diary.genre")} value={detail?.genres?.[0] || t("common.unknown")} />
        </div>
      </div>
      <div className="space-y-2 pt-4">{status === "archived" ? <DiaryActionButton onClick={onRestore} icon={<Notebook size={16} />} label={t("diary.restore")} tone="accent" /> : <><DiaryActionButton onClick={onPlayNow} icon={<Play size={16} weight="fill" />} label={isNext ? t("diary.nextUp") : t("diary.playNow")} tone="accent" /><div className="grid grid-cols-2 gap-2"><DiaryActionButton onClick={onDefer} icon={<CalendarBlank size={15} />} label={t("diary.defer")} tone="amber" /><DiaryActionButton onClick={onArchive} icon={<Archive size={15} />} label={t("diary.archive")} tone="neutral" /></div></>}</div>
    </div>
  </aside>;
}

function TimeMetric({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) {
  return <div className={align === "right" ? "text-right" : "text-left"}><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{label}</p><p className="mt-1 font-mono text-base font-semibold text-white">{value}</p></div>;
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 text-xs"><span className="shrink-0 text-repressurizer-text-muted">{label}</span><span className="min-w-0 truncate text-right text-repressurizer-text" title={value}>{value}</span></div>;
}

function DiarySectionRail({ sections, templates, activeSectionId, selectedAppId, availableGames, showJournal, journalCount, t, onSelect, onCreate, onRename, onRemove, onPreviousGame, onNextGame, onExport }: {
  sections: DiarySection[];
  templates: DiaryTemplate[];
  activeSectionId: string;
  selectedAppId: number;
  availableGames: OwnedGame[];
  showJournal: boolean;
  journalCount: number;
  t: ReturnType<typeof useT>;
  onSelect: (id: string) => void;
  onCreate: (title: string, template: string, scope: DiaryPageScope, appIds: number[]) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onPreviousGame?: () => void;
  onNextGame?: () => void;
  onExport: () => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("blank");
  const [scope, setScope] = useState<"this" | "all" | "chosen">("this");
  const [chosenIds, setChosenIds] = useState<number[]>([selectedAppId]);

  useEffect(() => {
    if (newOpen) setChosenIds((current) => current.includes(selectedAppId) ? current : [selectedAppId, ...current]);
  }, [newOpen, selectedAppId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    const appIds = scope === "this" ? [selectedAppId] : chosenIds;
    if (scope === "chosen" && appIds.length === 0) return;
    onCreate(title, template, scope === "all" ? "all" : "selected", appIds);
    setTitle("");
    setTemplate("blank");
    setScope("this");
    setChosenIds([selectedAppId]);
    setNewOpen(false);
  };

  const toggleGame = (appId: number) => setChosenIds((current) => current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId]);

  return (
    <aside className="border-b border-repressurizer-border-subtle bg-repressurizer-surface/20 px-4 py-3" data-testid="diary-section-rail">
      <div className="sr-only"><p>{t("diary.pages")}</p><p>{t("diary.pages.hint")}</p><span>{sections.length + 1}</span></div>
      <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto"><nav className="flex w-max min-w-full items-center justify-center gap-1.5" aria-label={t("diary.pages")}>
        <button type="button" data-testid="diary-section-overview" onClick={() => onSelect(OVERVIEW_SECTION_ID)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${activeSectionId === OVERVIEW_SECTION_ID ? "border-repressurizer-accent/45 bg-repressurizer-accent/[0.12] font-medium text-white" : "border-transparent text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"}`}><Notebook size={15} weight={activeSectionId === OVERVIEW_SECTION_ID ? "fill" : "duotone"} className={activeSectionId === OVERVIEW_SECTION_ID ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} /><span className="truncate">{t("diary.pages.overview")}</span></button>
        <button type="button" data-testid="diary-section-gametimeline" onClick={() => onSelect(GAME_TIMELINE_SECTION_ID)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${activeSectionId === GAME_TIMELINE_SECTION_ID ? "border-repressurizer-accent/45 bg-repressurizer-accent/[0.12] font-medium text-white" : "border-transparent text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"}`}><Path size={15} className={activeSectionId === GAME_TIMELINE_SECTION_ID ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} /><span className="truncate">{t("diary.tab.timeline")}</span></button>
        {showJournal && <button type="button" data-testid="diary-section-journal" onClick={() => onSelect(JOURNAL_SECTION_ID)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${activeSectionId === JOURNAL_SECTION_ID ? "border-repressurizer-accent/45 bg-repressurizer-accent/[0.12] font-medium text-white" : "border-transparent text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"}`}><PencilSimple size={15} className={activeSectionId === JOURNAL_SECTION_ID ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} /><span>{t("diary.journal")}</span>{journalCount > 0 && <span className="rounded-full bg-repressurizer-surface-raised px-1.5 font-mono text-[9px] tabular-nums text-repressurizer-text-faint">{journalCount}</span>}</button>}
        {sections.map((section) => <SectionRailItem key={section.id} section={section} active={activeSectionId === section.id} t={t} onSelect={() => onSelect(section.id)} onRename={(next) => onRename(section.id, next)} onRemove={() => onRemove(section.id)} />)}
        {!newOpen && <button type="button" data-testid="diary-add-section" onClick={() => setNewOpen(true)} className="focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-accent"><Plus size={13} />{t("diary.pages.add")}</button>}
      </nav></div>
      <div className="flex shrink-0 items-center border-l border-repressurizer-border-subtle pl-2">
        <button type="button" disabled={!onPreviousGame} onClick={onPreviousGame} aria-label={t("diary.previousGame")} title={t("diary.previousGame")} className="focus-ring rounded-md p-1.5 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white disabled:opacity-25"><ArrowLeft size={15} /></button>
        <button type="button" disabled={!onNextGame} onClick={onNextGame} aria-label={t("diary.nextGame")} title={t("diary.nextGame")} className="focus-ring rounded-md p-1.5 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white disabled:opacity-25"><ArrowRight size={15} /></button>
        <button type="button" onClick={onExport} aria-label={t("diary.export")} title={t("diary.export")} className="focus-ring ml-1 rounded-md p-1.5 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><Export size={15} /></button>
      </div>
      </div>
      {newOpen && <div className="mt-3 flex justify-center">
        <form onSubmit={submit} className="animate-fade-in w-full max-w-2xl space-y-2.5 rounded-xl border border-repressurizer-accent/30 bg-repressurizer-bg p-3 shadow-pop">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.pages.add")}</p>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.pages.name")}</span><input autoFocus data-testid="diary-section-name" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("diary.pages.name.placeholder")} className="mt-1.5 w-full rounded-md border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-xs font-normal tracking-normal text-repressurizer-text outline-none focus:border-repressurizer-accent/55" /></label>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.pages.applyTo")}</span><select data-testid="diary-page-scope" value={scope} onChange={(event) => setScope(event.target.value as "this" | "all" | "chosen")} className="mt-1.5 w-full rounded-md border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-xs font-normal tracking-normal text-repressurizer-text outline-none"><option value="this">{t("diary.pages.scope.this")}</option><option value="all">{t("diary.pages.scope.all")}</option><option value="chosen">{t("diary.pages.scope.chosen")}</option></select></label>
          {scope === "chosen" && <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-repressurizer-border bg-repressurizer-surface p-1.5">{availableGames.length === 0 ? <p className="px-1 py-1 text-[10px] text-repressurizer-text-faint">{t("diary.pages.noGames")}</p> : availableGames.map((game) => <label key={game.appid} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-repressurizer-text hover:bg-repressurizer-surface-hover"><input data-testid={`diary-page-game-${game.appid}`} type="checkbox" checked={chosenIds.includes(game.appid)} onChange={() => toggleGame(game.appid)} className="accent-repressurizer-accent" /><span className="truncate">{String(game.name ?? "")}</span></label>)}</div>}
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint"><span>{t("diary.pages.template")}</span><select value={template} onChange={(event) => setTemplate(event.target.value)} className="mt-1.5 w-full rounded-md border border-repressurizer-border bg-repressurizer-surface px-2 py-1.5 text-xs font-normal tracking-normal text-repressurizer-text outline-none"><option value="blank">{t("diary.pages.template.blank")}</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="flex gap-2"><button type="button" onClick={() => setNewOpen(false)} className="focus-ring flex-1 rounded-md border border-repressurizer-border px-2 py-1.5 text-[11px] text-repressurizer-text-muted hover:bg-repressurizer-surface-hover">{t("diary.pages.cancel")}</button><button type="submit" disabled={!title.trim() || (scope === "chosen" && chosenIds.length === 0)} className="focus-ring flex-1 rounded-md bg-repressurizer-accent px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-40">{t("diary.pages.create")}</button></div>
        </form>
      </div>}
    </aside>
  );
}

function SectionRailItem({ section, active, t, onSelect, onRename, onRemove }: { section: DiarySection; active: boolean; t: ReturnType<typeof useT>; onSelect: () => void; onRename: (title: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const saveTitle = () => { if (title.trim()) onRename(title); setEditing(false); };
  return (
    <div className={`group flex shrink-0 items-center rounded-lg border transition-colors ${active ? "border-repressurizer-accent/45 bg-repressurizer-accent/[0.12]" : "border-transparent hover:bg-repressurizer-surface-hover"}`}>
      {editing ? <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter") saveTitle(); if (event.key === "Escape") setEditing(false); }} className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-xs text-repressurizer-text outline-none" aria-label={t("diary.pages.rename")} /> : <button type="button" data-testid={`diary-section-${section.id}`} onClick={onSelect} className="focus-ring flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs text-repressurizer-text"><PencilSimple size={14} className={active ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} /><span className="truncate">{section.title}</span></button>}
      {!editing && <div className="mr-1 hidden items-center gap-0.5 group-hover:flex"><button type="button" aria-label={`${t("diary.pages.rename")}: ${section.title}`} title={t("diary.pages.rename")} onClick={() => setEditing(true)} className="focus-ring rounded p-1 text-repressurizer-text-faint hover:text-repressurizer-text"><PencilSimple size={11} /></button><button type="button" aria-label={`${t("diary.pages.delete")}: ${section.title}`} title={t("diary.pages.delete")} onClick={() => { if (window.confirm(t("diary.pages.deleteConfirm"))) onRemove(); }} className="focus-ring rounded p-1 text-repressurizer-text-faint hover:text-repressurizer-danger"><Trash size={11} /></button></div>}
    </div>
  );
}

function DiaryOverview({ appId, note, revisions, templateContext, language, t, onNoteSave, onRecordRevision }: {
  appId: number;
  note: string;
  revisions: DiaryRevision[];
  templateContext: DiaryTemplateContext;
  language: string;
  t: ReturnType<typeof useT>;
  onNoteSave: (note: string) => void;
  onRecordRevision: (markdown: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [editing, setEditing] = useState(false);
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(note); }, [note]);
  useEffect(() => {
    if (draft === note) { setSaveState("saved"); return; }
    setSaveState("saving");
    const timer = window.setTimeout(() => { onRecordRevision(note); onNoteSave(draft); setSaveState("saved"); }, 750);
    return () => window.clearTimeout(timer);
  }, [draft, note, onNoteSave, onRecordRevision]);
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);
  const restore = (revision: DiaryRevision) => { if (draft !== note) onRecordRevision(draft); onRecordRevision(note); setDraft(revision.markdown); onNoteSave(revision.markdown); setEditing(true); };
  const beginEditing = () => setEditing(true);
  const finishEditing = () => {
    if (draft !== note) { onRecordRevision(note); onNoteSave(draft); }
    setEditing(false);
  };
  useEffect(() => {
    if (!textMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-text-context-menu]")) setTextMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [textMenu]);
  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[role='toolbar']") || target.closest("[role='menu']") || target.closest("[role='dialog']") || target.closest("[role='listbox']") || target.closest("[role='option']")) return;
      if (target.closest("[data-testid='diary-overview-page']")) return;
      finishEditing();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });
  return <section data-testid="diary-overview-page" className="flex min-h-[calc(100dvh-250px)] flex-col">
    {editing ? (
      <MarkdownToolbar value={draft} onChange={setDraft} textareaRef={editorRef} templateContext={templateContext} language={language} t={t} />
    ) : (
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-repressurizer-border-subtle bg-repressurizer-bg/95 px-4 py-1.5 backdrop-blur">
        <button type="button" onClick={beginEditing} data-testid="diary-overview-edit" className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:text-white">
          <PencilSimple size={12} />
          {t("diary.pages.edit")}
        </button>
      </div>
    )}
    {editing ? (
      <textarea
        ref={editorRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={100_000}
        placeholder={t("diary.notes.placeholder")}
        aria-label={t("diary.pages.overview")}
        data-diary-document={`overview:${appId}`}
        onContextMenu={(event) => {
          event.preventDefault();
          setTextMenu({ x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 160) });
        }}
        spellCheck
        className="min-h-[calc(100dvh-340px)] w-full flex-1 resize-none bg-transparent px-6 py-4 font-mono text-[13px] leading-7 text-repressurizer-text outline-none placeholder:italic placeholder:text-repressurizer-text-faint"
      />
    ) : (
      <div
        onDoubleClick={beginEditing}
        onContextMenu={(event) => {
          // Allow native text context menu (copy, paste, search, etc.)
          event.stopPropagation();
        }}
        data-testid="diary-overview-rendered"
        className="diary-markdown min-h-[calc(100dvh-380px)] flex-1 cursor-text px-6 py-4 text-sm leading-7 text-repressurizer-text"
        title={t("diary.pages.editHint")}
      >
        {draft.trim() ? <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown> : <p className="text-sm italic text-repressurizer-text-faint">{t("diary.notes.placeholder")}</p>}
      </div>
    )}
    <div className="sticky bottom-0 z-20 flex h-8 items-center justify-end border-t border-repressurizer-border-subtle bg-repressurizer-bg/95 px-4 backdrop-blur">
      <EditorUtilityBar saveState={saveState} revisions={revisions} language={language} onRestore={restore} t={t} />
      {editing && <button type="button" onClick={finishEditing} className="focus-ring ml-3 rounded-md border border-repressurizer-border-subtle px-2 py-0.5 text-[10px] text-repressurizer-text-muted transition-colors hover:text-white">{t("common.done")}</button>}
    </div>
    {textMenu && <TextContextMenu x={textMenu.x} y={textMenu.y} textareaRef={editorRef} onClose={() => setTextMenu(null)} />}
  </section>;
}

function EditorUtilityBar({ saveState, revisions, language, onRestore, t }: { saveState: "saved" | "saving"; revisions: DiaryRevision[]; language: string; onRestore: (revision: DiaryRevision) => void; t: ReturnType<typeof useT> }) {
  const [open, setOpen] = useState(false);
  return <div className="relative ml-auto flex h-8 shrink-0 items-center gap-1 text-[10px] text-repressurizer-text-faint">
    <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${saveState === "saving" ? "animate-pulse bg-amber-300" : "bg-repressurizer-success"}`} />{t(saveState === "saving" ? "diary.autosave.saving" : "diary.autosave.saved")}</span>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t("diary.revisions")} title={t("diary.revisions")} className="focus-ring inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><ClockCounterClockwise size={14} /><span className="font-mono text-[9px]">{revisions.length}</span></button>
    {open && <div className="animate-fade-in absolute bottom-full right-0 z-40 mb-1 w-72 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 shadow-dialog backdrop-blur-md"><div className="border-b border-repressurizer-border-subtle px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{t("diary.revisions")}</div><div className="max-h-64 overflow-y-auto">{revisions.length === 0 ? <p className="px-3 py-5 text-center text-xs text-repressurizer-text-faint">{t("diary.revisions.empty")}</p> : revisions.map((revision) => <button key={revision.id} type="button" onClick={() => { onRestore(revision); setOpen(false); }} className="focus-ring flex w-full items-center justify-between gap-3 border-b border-repressurizer-border-subtle px-3 py-2.5 text-left last:border-b-0 transition-colors hover:bg-repressurizer-surface-hover"><span className="min-w-0"><span className="block truncate text-xs text-repressurizer-text">{revision.title || t("diary.pages.overview")}</span><span className="mt-0.5 block text-[10px] text-repressurizer-text-faint">{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</span></span><span className="shrink-0 text-[10px] font-medium text-repressurizer-accent">{t("diary.revisions.restore")}</span></button>)}</div></div>}
  </div>;
}

function MarkdownSectionPanel({ section, revisions, templateContext, language, t, onRename, onUpdate, onRemove }: { section: DiarySection; revisions: DiaryRevision[]; templateContext: DiaryTemplateContext; language: string; t: ReturnType<typeof useT>; onRename: (title: string) => void; onUpdate: (markdown: string) => void; onRemove: () => void }) {
  const [title, setTitle] = useState(section.title);
  const [markdown, setMarkdown] = useState(section.markdown);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setTitle(section.title); setMarkdown(section.markdown); }, [section.id, section.title, section.markdown]);
  useEffect(() => {
    const nextTitle = title.trim() || section.title;
    if (nextTitle === section.title && markdown === section.markdown) { setSaveState("saved"); return; }
    setSaveState("saving");
    const timer = window.setTimeout(() => { if (nextTitle !== section.title) onRename(nextTitle); if (markdown !== section.markdown) onUpdate(markdown); setSaveState("saved"); }, 750);
    return () => window.clearTimeout(timer);
  }, [markdown, onRename, onUpdate, section.markdown, section.title, title]);
  const scopeLabel = section.scope === "all"
    ? t("diary.pages.scope.all")
    : section.appIds.length === 1
      ? t("diary.pages.scope.game")
      : t("diary.pages.scope.games", { count: section.appIds.length });

  const restore = (revision: DiaryRevision) => { setTitle(revision.title || section.title); setMarkdown(revision.markdown); onUpdate(revision.markdown); if (revision.title && revision.title !== section.title) onRename(revision.title); };
  return <section data-testid="diary-markdown-page" className="flex min-h-[calc(100dvh-250px)] flex-col">
    <div className="flex flex-col gap-3 border-b border-repressurizer-border-subtle px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <input data-testid="diary-section-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-label={t("diary.pages.name")} className="w-full bg-transparent py-1 text-base font-medium text-white outline-none placeholder:text-repressurizer-text-faint" />
        <span className="text-[10px] text-repressurizer-text-faint">{scopeLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" aria-label={t("diary.pages.delete")} title={t("diary.pages.delete")} onClick={() => { if (window.confirm(t("diary.pages.deleteConfirm"))) onRemove(); }} className="focus-ring rounded-lg p-2 text-repressurizer-text-faint hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={14} /></button>
      </div>
    </div>
    <MarkdownToolbar value={markdown} onChange={setMarkdown} textareaRef={editorRef} templateContext={templateContext} language={language} t={t} />
    <textarea ref={editorRef} data-testid="diary-markdown-editor" value={markdown} onChange={(event) => setMarkdown(event.target.value)} placeholder={t("diary.pages.markdownPlaceholder")} spellCheck className="min-h-[calc(100dvh-380px)] w-full flex-1 resize-none bg-transparent px-6 py-4 font-mono text-[13px] leading-7 text-repressurizer-text outline-none placeholder:italic placeholder:text-repressurizer-text-faint" />
    <div className="sticky bottom-0 z-20 flex h-8 items-center justify-end border-t border-repressurizer-border-subtle bg-repressurizer-bg/95 px-4 backdrop-blur"><EditorUtilityBar saveState={saveState} revisions={revisions} language={language} onRestore={restore} t={t} /></div>
  </section>;
}

function DiaryActionButton({ onClick, icon, label, tone }: { onClick: () => void; icon: ReactNode; label: string; tone: "accent" | "amber" | "neutral" }) { const styles = { accent: "border-transparent bg-repressurizer-accent text-white shadow-pop-sm hover:bg-repressurizer-accent-hover", amber: "border-amber-400/25 bg-amber-400/10 text-amber-200 hover:border-amber-400/45 hover:bg-amber-400/20", neutral: "border-repressurizer-border bg-repressurizer-surface/70 text-repressurizer-text hover:border-repressurizer-border hover:bg-repressurizer-surface-hover" }; return <button type="button" onClick={onClick} className={`focus-ring btn-press inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${styles[tone]}`}>{icon}{label}</button>; }



function TextContextMenu({ x, y, textareaRef, onClose }: {
  x: number;
  y: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}) {
  const t = useT();
  const run = (action: "copy" | "paste" | "cut" | "selectAll") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (action === "copy") document.execCommand("copy");
    else if (action === "cut") document.execCommand("cut");
    else if (action === "paste") textarea.focus();
    else if (action === "selectAll") textarea.select();
    onClose();
  };
  const styles = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white";
  return createPortal(
    <div
      data-text-context-menu
      className="fixed z-[80] w-44 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      style={{ left: x, top: y }}
    >
      <button type="button" onClick={() => run("copy")} className={styles}>{t("textMenu.copy")}</button>
      <button type="button" onClick={() => run("paste")} className={styles}>{t("textMenu.paste")}</button>
      <button type="button" onClick={() => run("cut")} className={styles}>{t("textMenu.cut")}</button>
      <button type="button" onClick={() => run("selectAll")} className={styles}>{t("textMenu.selectAll")}</button>
    </div>,
    document.body,
  );
}

function PanelResizeHandle({ side, value, min, max, onChange }: { side: "left" | "right"; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    onChange(clamp(drag.startValue + (side === "left" ? delta : -delta)));
  };
  const stop = () => { dragRef.current = null; document.body.style.userSelect = ""; };
  return <button type="button" aria-label={side === "left" ? "Resize game list" : "Resize metadata panel"} className="group relative z-10 hidden w-1.5 shrink-0 touch-none cursor-col-resize bg-repressurizer-border-subtle transition-colors hover:bg-repressurizer-accent/45 focus:bg-repressurizer-accent/45 xl:block" onPointerDown={(event) => { dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value }; document.body.style.userSelect = "none"; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={(event) => { const delta = event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0; if (!delta) return; event.preventDefault(); onChange(clamp(value + (side === "left" ? delta : -delta))); }}><span className="absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-repressurizer-text-faint opacity-0 transition-opacity group-hover:opacity-100" /></button>;
}
