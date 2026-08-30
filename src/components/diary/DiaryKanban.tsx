import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, CheckSquareOffset, DotsSixVertical, GameController, MagnifyingGlass, Plus, Trash, Warning, X } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { SelectMenu } from "../ui/SelectMenu";
import { useT } from "../../lib/i18n";
import type { OwnedGame, GameDetails } from "../../lib/types";
import type { DiaryBoardPrefs, DiaryCustomColumn, DiaryEntry, DiaryJournalEntry, DiaryPriority, DiarySection } from "../../stores/diaryStore";
import type { GameStatus } from "../../stores/statusStore";
import {
  getDiaryStatus,
  formatHours,
  STATUS_LABELS,
  DEFAULT_COLUMN_COLORS,
  type DiaryViewStatus,
} from "./diaryShared";

const STATUS_KEYS: DiaryViewStatus[] = ["backlog", "playing", "abandoned", "finished", "archived"];
const DRAG_THRESHOLD_PX = 6;

export interface BoardColumn {
  key: string;
  label: string;
  color: string;
  kind: "status" | "custom";
  status?: DiaryViewStatus;
  custom?: DiaryCustomColumn;
}

export function buildBoardColumns(boardPrefs: DiaryBoardPrefs, showArchived: boolean, t: ReturnType<typeof useT>, forceStatus?: DiaryViewStatus): BoardColumn[] {
  const hidden = new Set(boardPrefs.hiddenColumns);
  const list: BoardColumn[] = [];
  for (const status of STATUS_KEYS) {
    if (status === "archived" && !showArchived && forceStatus !== status) continue;
    if (hidden.has(status) && forceStatus !== status) continue;
    list.push({ key: status, label: t(STATUS_LABELS[status]), color: boardPrefs.columnColors[status] ?? DEFAULT_COLUMN_COLORS[status], kind: "status", status });
  }
  for (const custom of boardPrefs.customColumns) {
    if (hidden.has(custom.id)) continue;
    list.push({ key: custom.id, label: custom.name, color: boardPrefs.columnColors[custom.id] ?? custom.color, kind: "custom", custom });
  }
  const rank = new Map(boardPrefs.columnOrder.map((columnKey, index) => [columnKey, index]));
  return list.sort((left, right) => (rank.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.key) ?? Number.MAX_SAFE_INTEGER));
}

interface DropTarget {
  columnKey: string;
  index: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  appIds: number[];
}

interface ColumnMenuState {
  x: number;
  y: number;
  columnKey: string;
  renaming: boolean;
}

interface PopoverAnchor {
  x: number;
  y: number;
}

interface ColumnsPopoverAnchor {
  x: number;
  bottom: number;
  maxHeight: number;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const PRIORITY_EDGE: Record<DiaryPriority, string | null> = { high: "#fb7185", normal: null, low: "#64748b" };

export const DiaryKanbanBoard = memo(function DiaryKanbanBoard({ games, kanbanGames, libraryGames, details, entries, statuses, reviews, journal, pages, board, boardPrefs, language, showArchived, forceStatus, wipLimit, hideEmptyColumns, t, onBulkStatusChange, onBulkPriorityChange, onRemoveGames, onRestoreRemovedGames, onMoveGames, onOpenGame, onSetColumnColor, onToggleColumnHidden, onAddCustomColumn, onRenameCustomColumn, onRemoveCustomColumn, onMergeCustomColumn, onRemoveEmptyCustomColumns, onMoveCustomColumn, onSetColumnOrder }: {
  games: OwnedGame[];
  kanbanGames: OwnedGame[];
  libraryGames: OwnedGame[];
  details: Record<number, GameDetails>;
  entries: Record<number, DiaryEntry>;
  statuses: Record<number, GameStatus>;
  reviews: Record<number, { rating?: number }>;
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  board: Record<number, number>;
  boardPrefs: DiaryBoardPrefs;
  language: string;
  showArchived: boolean;
  forceStatus?: DiaryViewStatus;
  wipLimit: number;
  hideEmptyColumns: boolean;
  t: ReturnType<typeof useT>;
  onApplyStatus: (appId: number, status: DiaryViewStatus) => void;
  onSetBoardOrder: (orderedAppIds: number[]) => void;
  onSetPriority: (appId: number, priority: DiaryPriority) => void;
  onBulkStatusChange: (appIds: number[], status: DiaryViewStatus) => void;
  onBulkPriorityChange: (appIds: number[], priority: DiaryPriority) => void;
  onRemoveGames: (appIds: number[]) => void;
  onRestoreRemovedGames: () => void;
  onMoveGames: (appIds: number[], column: BoardColumn, orderedAppIds: number[]) => void;
  onOpenGame: (appId: number) => void;
  onSetColumnColor: (columnKey: string, color: string | null) => void;
  onToggleColumnHidden: (columnKey: string) => void;
  onAddCustomColumn: (name: string, color: string) => string | null;
  onRenameCustomColumn: (columnId: string, name: string) => void;
  onRemoveCustomColumn: (columnId: string) => void;
  onMergeCustomColumn: (sourceId: string, targetId: string) => void;
  onRemoveEmptyCustomColumns: () => void;
  onMoveCustomColumn: (columnId: string, direction: -1 | 1) => void;
  onSetColumnOrder: (columnKeys: string[]) => void;
  onSetCustomAssignment: (appId: number, columnId: string | null) => void;
}) {
  const [draggingAppId, setDraggingAppId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ appId: number; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<{ columnKey: string; index: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [columnsPopover, setColumnsPopover] = useState<ColumnsPopoverAnchor | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [addGamePopover, setAddGamePopover] = useState<{ anchor: PopoverAnchor; column: BoardColumn } | null>(null);
  const [addGameQuery, setAddGameQuery] = useState("");
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<{ key: string; after: boolean } | null>(null);

  const kanbanRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; appId: number } | null>(null);
  const suppressClickRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const ghostPosRef = useRef<{ x: number; y: number } | null>(null);
  const ghostElementRef = useRef<HTMLDivElement | null>(null);

  const columns = useMemo(() => buildBoardColumns(boardPrefs, showArchived, t, forceStatus), [boardPrefs, forceStatus, showArchived, t]);

  const reorderColumn = useCallback((sourceKey: string, targetKey: string, after: boolean) => {
    if (sourceKey === targetKey) return;
    const order = [...boardPrefs.columnOrder];
    const sourceIndex = order.indexOf(sourceKey);
    if (sourceIndex < 0 || !order.includes(targetKey)) return;
    order.splice(sourceIndex, 1);
    const targetIndex = order.indexOf(targetKey);
    order.splice(targetIndex + (after ? 1 : 0), 0, sourceKey);
    onSetColumnOrder(order);
  }, [boardPrefs.columnOrder, onSetColumnOrder]);

  const moveColumnStep = useCallback((columnKey: string, direction: -1 | 1) => {
    const index = columns.findIndex((column) => column.key === columnKey);
    const target = columns[index + direction];
    if (index < 0 || !target) return;
    reorderColumn(columnKey, target.key, direction > 0);
  }, [columns, reorderColumn]);

  const columnOfGame = useMemo(() => {
    const byCustom = new Map(boardPrefs.customColumns.map((custom) => [custom.id, custom]));
    const visibleKeys = new Set(columns.map((column) => column.key));
    return (game: OwnedGame): BoardColumn | undefined => {
      const assigned = boardPrefs.customAssignments[game.appid];
      if (assigned) {
        const custom = byCustom.get(assigned);
        if (custom && visibleKeys.has(custom.id)) {
          return { key: custom.id, label: custom.name, color: boardPrefs.columnColors[custom.id] ?? custom.color, kind: "custom", custom };
        }
      }
      const status = getDiaryStatus(game, statuses[game.appid] ?? "none", entries[game.appid]);
      return columns.find((column) => column.status === status);
    };
  }, [boardPrefs.customAssignments, boardPrefs.customColumns, boardPrefs.columnColors, columns, entries, statuses]);

  const grouped = useMemo(() => {
    const byColumn = new Map<string, OwnedGame[]>();
    for (const column of columns) byColumn.set(column.key, []);
    const baseIndex = new Map(games.map((game, index) => [game.appid, index] as const));
    for (const game of games) {
      const column = columnOfGame(game);
      if (!column) continue;
      byColumn.get(column.key)?.push(game);
    }
    for (const list of byColumn.values()) {
      list.sort((a, b) => (board[a.appid] ?? Number.MAX_SAFE_INTEGER) - (board[b.appid] ?? Number.MAX_SAFE_INTEGER) || (baseIndex.get(a.appid) ?? 0) - (baseIndex.get(b.appid) ?? 0));
    }
    return byColumn;
  }, [board, columnOfGame, columns, games]);

  const boardColumns = useMemo(() => (hideEmptyColumns && !forceStatus ? columns.filter((column) => (grouped.get(column.key)?.length ?? 0) > 0) : columns), [columns, forceStatus, grouped, hideEmptyColumns]);

  const emptyCustomColumnCount = useMemo(() => {
    const assignedColumnIds = new Set(Object.values(boardPrefs.customAssignments));
    return boardPrefs.customColumns.filter((column) => !assignedColumnIds.has(column.id)).length;
  }, [boardPrefs.customAssignments, boardPrefs.customColumns]);

  const sectionCountByAppId = useMemo(() => {
    const counts = new Map<number, number>();
    const globalCount = pages.reduce((count, page) => count + (page.scope === "all" ? 1 : 0), 0);
    if (globalCount > 0) for (const game of games) counts.set(game.appid, globalCount);
    for (const page of pages) {
      if (page.scope === "all") continue;
      for (const appId of page.appIds) counts.set(appId, (counts.get(appId) ?? 0) + 1);
    }
    return counts;
  }, [games, pages]);

  const moveIds = useCallback((appIds: number[], column: BoardColumn, insertAt?: number) => {
    const currentIds = (grouped.get(column.key) ?? []).map((game) => game.appid);
    const movingSet = new Set(appIds);
    const targetIds = currentIds.filter((id) => !movingSet.has(id));
    const at = Math.max(0, Math.min(insertAt ?? targetIds.length, targetIds.length));
    const orderedAppIds = [...targetIds.slice(0, at), ...appIds, ...targetIds.slice(at)];
    onMoveGames(appIds, column, orderedAppIds);
    setSelection(new Set());
    setContextMenu(null);
    setAddGamePopover(null);
  }, [grouped, onMoveGames]);

  const toggleColumnSelection = useCallback((columnKey: string) => {
    const columnIds = (grouped.get(columnKey) ?? []).map((game) => game.appid);
    if (columnIds.length === 0) return;
    setSelection((current) => {
      const allSelected = columnIds.every((appId) => current.has(appId));
      const next = new Set(current);
      for (const appId of columnIds) {
        if (allSelected) next.delete(appId);
        else next.add(appId);
      }
      return next;
    });
    setLastClicked({ columnKey, index: columnIds.length - 1 });
  }, [grouped]);

  const handleColumnKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, columnKey: string) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    toggleColumnSelection(columnKey);
  }, [toggleColumnSelection]);

  const toggleCardSelection = useCallback((appId: number, columnKey: string, index: number, mode: "replace" | "toggle" | "range") => {
    const columnIds = (grouped.get(columnKey) ?? []).map((game) => game.appid);
    setSelection((current) => {
      if (mode === "replace") return new Set([appId]);
      if (mode === "toggle") {
        const next = new Set(current);
        if (next.has(appId)) next.delete(appId);
        else next.add(appId);
        return next;
      }
      const anchor = lastClicked && lastClicked.columnKey === columnKey ? lastClicked.index : index;
      const from = Math.min(anchor, index);
      const to = Math.max(anchor, index);
      return new Set(columnIds.slice(from, to + 1));
    });
    setLastClicked({ columnKey, index });
  }, [grouped, lastClicked]);

  const columnRectsRef = useRef<Array<{ key: string; left: number; right: number; top: number; bottom: number; cards: Array<{ top: number; bottom: number }> }>>([]);

  const cacheColumnRects = () => {
    columnRectsRef.current = Array.from(document.querySelectorAll<HTMLElement>("[data-column-key]")).map((section) => ({
      key: section.dataset.columnKey ?? "",
      left: section.getBoundingClientRect().left,
      right: section.getBoundingClientRect().right,
      top: section.getBoundingClientRect().top,
      bottom: section.getBoundingClientRect().bottom,
      cards: Array.from(section.querySelectorAll<HTMLElement>("[data-kanban-card]")).map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
    }));
  };

  const findColumnKeyAt = (x: number, y: number): string | null => {
    for (const rect of columnRectsRef.current) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return rect.key;
    }
    return null;
  };

  const findDropIndex = (columnKey: string, y: number): number => {
    const cached = columnRectsRef.current.find((rect) => rect.key === columnKey);
    if (!cached) return 0;
    let index = 0;
    for (const card of cached.cards) {
      if (y > (card.top + card.bottom) / 2) index += 1;
      else break;
    }
    return index;
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (draggingAppId === null) {
        if (distance < DRAG_THRESHOLD_PX) return;
        suppressClickRef.current = true;
        cacheColumnRects();
        setDraggingAppId(drag.appId);
        setGhost({ appId: drag.appId, x: event.clientX, y: event.clientY });
        return;
      }
      ghostPosRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const position = ghostPosRef.current;
        if (!position) return;
        if (ghostElementRef.current) {
          ghostElementRef.current.style.transform = `translate3d(${position.x + 10}px, ${position.y + 8}px, 0)`;
        }
        const columnKey = findColumnKeyAt(position.x, position.y);
        const nextTarget = columnKey ? { columnKey, index: findDropIndex(columnKey, position.y) } : null;
        setDropTarget((current) => {
          if (current?.columnKey === nextTarget?.columnKey && current?.index === nextTarget?.index) return current;
          return nextTarget;
        });
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) dragRef.current = null;
      if (draggingAppId === null) return;
      const appId = draggingAppId;
      const columnKey = findColumnKeyAt(event.clientX, event.clientY);
      setDraggingAppId(null);
      setGhost(null);
      setDropTarget(null);
      window.setTimeout(() => { suppressClickRef.current = false; }, 80);
      if (!columnKey) return;
      const column = columns.find((candidate) => candidate.key === columnKey);
      if (!column) return;
      const movingIds = selection.has(appId) ? [...selection] : [appId];
      const index = findDropIndex(columnKey, event.clientY);
      moveIds(movingIds, column, index);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [columns, draggingAppId, moveIds, selection]);

  const openContextMenu = useCallback((event: ReactMouseEvent, appId: number) => {
    event.preventDefault();
    event.stopPropagation();
    const appIds = selection.has(appId) ? [...selection] : [appId];
    if (!selection.has(appId)) setSelection(new Set([appId]));
    setColumnMenu(null);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 260),
      y: Math.min(event.clientY, window.innerHeight - 430),
      appIds,
    });
  }, [selection]);

  const handleCardOpen = useCallback((appId: number) => {
    setSelection(new Set());
    onOpenGame(appId);
  }, [onOpenGame]);

  const handleCardSelect = useCallback((appId: number, columnKey: string, index: number, mode: "replace" | "toggle" | "range") => {
    if (!suppressClickRef.current) toggleCardSelection(appId, columnKey, index, mode);
  }, [toggleCardSelection]);

  const handleCardContextMenu = useCallback((event: ReactMouseEvent, appId: number) => {
    openContextMenu(event, appId);
  }, [openContextMenu]);

  const handleCardPointerDown = useCallback((appId: number, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, appId };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isFlatNavigation = key === "j" || key === "k";
      const isVerticalNavigation = key === "w" || key === "s" || key === "arrowup" || key === "arrowdown";
      const isHorizontalNavigation = key === "a" || key === "d" || key === "arrowleft" || key === "arrowright";
      if (!isFlatNavigation && !isVerticalNavigation && !isHorizontalNavigation) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const boardRoot = kanbanRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!boardRoot || boardRoot.getClientRects().length === 0) return;
      if (target?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog']")) return;
      const currentCard = target?.closest<HTMLElement>("[data-kanban-card]") ?? null;
      const currentSection = currentCard?.closest<HTMLElement>("[data-column-key]")
        ?? target?.closest<HTMLElement>("[data-column-key]")
        ?? null;
      if (!currentCard && !currentSection) return;

      const focusElement = (element: HTMLElement) => {
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      };

      if (isFlatNavigation) {
        const cards = Array.from(boardRoot.querySelectorAll<HTMLElement>("[data-kanban-card]"));
        if (cards.length === 0) return;
        const currentIndex = currentCard ? cards.indexOf(currentCard) : key === "j" ? -1 : cards.length;
        const nextIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + (key === "j" ? 1 : -1)));
        if (nextIndex === currentIndex) return;
        event.preventDefault();
        focusElement(cards[nextIndex]);
        return;
      }

      if (isVerticalNavigation && currentSection) {
        const cards = Array.from(currentSection.querySelectorAll<HTMLElement>("[data-kanban-card]"));
        if (cards.length === 0) return;
        const currentIndex = currentCard ? cards.indexOf(currentCard) : -1;
        const movingUp = key === "w" || key === "arrowup";
        const nextIndex = currentCard ? currentIndex + (movingUp ? -1 : 1) : movingUp ? cards.length - 1 : 0;
        if (nextIndex < 0 || nextIndex >= cards.length || nextIndex === currentIndex) return;
        event.preventDefault();
        focusElement(cards[nextIndex]);
        return;
      }

      if (isHorizontalNavigation && currentSection) {
        const sections = Array.from(boardRoot.querySelectorAll<HTMLElement>("[data-column-key]"));
        const currentSectionIndex = sections.indexOf(currentSection);
        if (currentSectionIndex < 0) return;
        const movingLeft = key === "a" || key === "arrowleft";
        const targetSection = sections[currentSectionIndex + (movingLeft ? -1 : 1)];
        if (!targetSection) return;
        const targetCards = Array.from(targetSection.querySelectorAll<HTMLElement>("[data-kanban-card]"));
        const currentRect = currentCard?.getBoundingClientRect();
        const currentCenterY = currentRect ? currentRect.top + currentRect.height / 2 : null;
        const targetCard = targetCards.reduce<HTMLElement | null>((closest, card) => {
          if (currentCenterY === null) return closest ?? card;
          const cardCenter = card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2;
          const closestCenter = closest ? closest.getBoundingClientRect().top + closest.getBoundingClientRect().height / 2 : null;
          return closestCenter === null || Math.abs(cardCenter - currentCenterY) < Math.abs(closestCenter - currentCenterY)
            ? card
            : closest;
        }, null);
        event.preventDefault();
        focusElement(targetCard ?? targetSection);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;

      // Escape closes the transient Kanban menus first. A second Escape clears
      // the bulk selection, matching the expected keyboard escape hierarchy.
      if (contextMenu || columnMenu || columnsPopover || addGamePopover) {
        setContextMenu(null);
        setColumnMenu(null);
        setColumnsPopover(null);
        setAddGamePopover(null);
        event.preventDefault();
        return;
      }
      if (selection.size === 0) return;
      setSelection(new Set());
      setLastClicked(null);
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [addGamePopover, columnMenu, columnsPopover, contextMenu, selection.size]);

  const openColumnMenu = (event: ReactMouseEvent, columnKey: string) => {
    if ((event.target as HTMLElement).closest("[data-kanban-card]")) return;
    event.preventDefault();
    setContextMenu(null);
    setColumnMenu({ x: Math.min(event.clientX, window.innerWidth - 270), y: Math.min(event.clientY, window.innerHeight - 300), columnKey, renaming: false });
  };

  const contextMenuGame = contextMenu && contextMenu.appIds.length === 1 ? games.find((game) => game.appid === contextMenu.appIds[0]) : undefined;
  const columnMenuColumn = columnMenu ? columns.find((column) => column.key === columnMenu.columnKey) : undefined;

  useEffect(() => {
    const onResize = () => {
      setColumnsPopover(null);
      setAddGamePopover(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!columnsPopover && !addGamePopover && !contextMenu && !columnMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (columnsPopover && !target.closest("[data-kanban-columns-popover]") && !target.closest('[data-testid="diary-kanban-columns-button"]') && !target.closest("[data-column-color-popover]")) setColumnsPopover(null);
      if (addGamePopover && !target.closest("[data-kanban-addgame-popover]") && !target.closest("[data-kanban-addgame-button]")) setAddGamePopover(null);
      if (contextMenu && !target.closest("[data-kanban-context-menu]")) setContextMenu(null);
      if (columnMenu && !target.closest("[data-kanban-column-menu]") && !target.closest("[data-column-color-popover]")) setColumnMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [addGamePopover, columnMenu, columnsPopover, contextMenu]);

  const addGameResults = useMemo(() => {
    if (!addGamePopover) return { onKanban: [] as OwnedGame[], inLibrary: [] as OwnedGame[], onKanbanCount: 0, inLibraryCount: 0 };
    const present = new Set((grouped.get(addGamePopover.column.key) ?? []).map((game) => game.appid));
    const onKanban = new Set(kanbanGames.map((game) => game.appid));
    const query = addGameQuery.trim().toLocaleLowerCase(language);
    const matches = (game: OwnedGame) => !query || String(game.name ?? "").toLocaleLowerCase(language).includes(query);
    const byName = (left: OwnedGame, right: OwnedGame) => String(left.name ?? "").localeCompare(String(right.name ?? ""), language);
    const onKanbanMatches = kanbanGames.filter((game) => !present.has(game.appid) && matches(game)).sort(byName);
    const inLibraryMatches = libraryGames.filter((game) => !onKanban.has(game.appid) && matches(game)).sort(byName);
    return {
      onKanban: onKanbanMatches.slice(0, 24),
      inLibrary: inLibraryMatches.slice(0, 24),
      onKanbanCount: onKanbanMatches.length,
      inLibraryCount: inLibraryMatches.length,
    };
  }, [addGamePopover, addGameQuery, grouped, kanbanGames, language, libraryGames]);

  return (
    <div ref={kanbanRef} data-testid="diary-kanban" className="relative flex min-h-0 flex-1 flex-col">
      {selection.size > 0 && draggingAppId === null && (
        <div data-testid="diary-kanban-selection" className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
          <div className="animate-fade-in inline-flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1.5 rounded-xl border border-repressurizer-accent/35 bg-repressurizer-surface-raised/95 py-1.5 pl-1 pr-1.5 shadow-dialog backdrop-blur-md">
            <span className="ml-1 mr-0.5 inline-flex items-center gap-1.5">
              <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-repressurizer-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-repressurizer-accent">{selection.size}</span>
              <span className="text-[11px] text-repressurizer-text-muted">{t("diary.kanban.selection", { count: selection.size })}</span>
            </span>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-repressurizer-border" />
            <button type="button" data-testid="diary-kanban-selection-move" aria-label={t("diary.kanban.moveTo")} className="focus-ring rounded-md px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setContextMenu({ x: Math.max(8, rect.left - 100), y: rect.top - 320, appIds: [...selection] });
              }}
            >
              {t("diary.kanban.moveTo")}
            </button>
            <div data-testid="diary-kanban-selection-status" className="w-[132px] shrink-0">
              <SelectMenu<"" | DiaryViewStatus>
                value=""
                options={[
                  { value: "", label: t("diary.kanban.changeStatus") },
                  ...STATUS_KEYS.map((status) => ({ value: status, label: t(STATUS_LABELS[status]) })),
                ]}
                onChange={(status) => {
                  if (!status) return;
                  onBulkStatusChange([...selection], status);
                  setSelection(new Set());
                }}
                ariaLabel={t("diary.kanban.changeStatus")}
                placeholder={t("diary.kanban.changeStatus")}
                size="sm"
                buttonClassName="h-7 rounded-md px-2 text-[10px]"
              />
            </div>
            <div data-testid="diary-kanban-selection-priority" className="w-[132px] shrink-0">
              <SelectMenu<"" | DiaryPriority>
                value=""
                options={[
                  { value: "", label: t("diary.kanban.changePriority") },
                  ...(["high", "normal", "low"] as DiaryPriority[]).map((priority) => ({ value: priority, label: t(`diary.priority.${priority}`) })),
                ]}
                onChange={(priority) => {
                  if (!priority) return;
                  onBulkPriorityChange([...selection], priority);
                  setSelection(new Set());
                }}
                ariaLabel={t("diary.kanban.changePriority")}
                placeholder={t("diary.kanban.changePriority")}
                size="sm"
                buttonClassName="h-7 rounded-md px-2 text-[10px]"
              />
            </div>
            <button
              type="button"
              data-testid="diary-kanban-selection-archive"
              aria-label={t("diary.kanban.archiveSelected")}
              onClick={() => { onBulkStatusChange([...selection], "archived"); setSelection(new Set()); }}
              className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-400/15"
            >
              <Archive size={12} />
              {t("diary.kanban.archiveSelected")}
            </button>
            <button
              type="button"
              data-testid="diary-kanban-selection-remove"
              aria-label={t("diary.kanban.removeSelected")}
              onClick={() => { onRemoveGames([...selection]); setSelection(new Set()); }}
              className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/15"
            >
              <Trash size={12} />
              {t("diary.kanban.removeSelected")}
            </button>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-repressurizer-border" />
            <button type="button" aria-label={t("diary.kanban.clearSelection")} onClick={() => setSelection(new Set())} className="focus-ring rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><X size={12} /></button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 pr-16 sm:p-6 sm:pr-20" role="list" aria-label={t("diary.kanban.board")} aria-multiselectable="true">
        {boardColumns.map((column) => {
          const columnGames = grouped.get(column.key) ?? [];
          const overLimit = column.status === "playing" && wipLimit > 0 && columnGames.length > wipLimit;
          const isDropTarget = dropTarget?.columnKey === column.key && draggingAppId !== null;
          const isColumnDropTarget = columnDropTarget?.key === column.key && draggingColumnKey !== null;
          return (
            <section
              key={column.key}
              data-column-key={column.key}
              data-testid={isDropTarget ? "diary-kanban-drop-target" : `diary-kanban-column-${column.key}`}
              data-column-name={column.label}
              aria-label={column.label}
              aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight"
              onContextMenu={(event) => openColumnMenu(event, column.key)}
              onDragOver={(event) => {
                const hasColumnPayload = event.dataTransfer.types.includes("text/plain");
                if ((!draggingColumnKey && !hasColumnPayload) || draggingColumnKey === column.key) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setColumnDropTarget({ key: column.key, after: event.clientX >= rect.left + rect.width / 2 });
              }}
              onDrop={(event) => {
                const sourceKey = event.dataTransfer.getData("text/plain") || draggingColumnKey;
                if (!sourceKey || sourceKey === column.key) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                reorderColumn(sourceKey, column.key, event.clientX >= rect.left + rect.width / 2);
                setDraggingColumnKey(null);
                setColumnDropTarget(null);
              }}
              onKeyDown={(event) => handleColumnKeyDown(event, column.key)}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement;
                if (!target.closest("[data-kanban-card], button, input, textarea, select")) event.currentTarget.focus();
              }}
              tabIndex={0}
              style={{ borderColor: `${column.color}80`, backgroundColor: `${column.color}0d`, boxShadow: isColumnDropTarget ? `inset 0 0 0 2px ${colorWithAlpha(column.color, 0.78)}, 0 0 22px ${colorWithAlpha(column.color, 0.16)}` : undefined }}
              className={`flex min-h-0 w-[min(320px,calc(100vw-48px))] shrink-0 flex-col overflow-hidden rounded-xl border transition-[background-color,border-color,box-shadow] ${isDropTarget ? "bg-repressurizer-accent/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_28px_rgba(16,185,129,0.14)] ring-2 ring-inset ring-repressurizer-accent/70" : "shadow-pop-sm"}`}
            >
              <header
                data-testid={`diary-kanban-column-header-${column.key}`}
                className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2"
                style={{ backgroundColor: `${column.color}26`, borderBottomColor: `${column.color}59` }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    draggable
                    data-testid={`diary-kanban-column-drag-${column.key}`}
                    aria-label={`${t("diary.kanban.columns")}: ${column.label}`}
                    title={t("diary.kanban.columns.hint")}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", column.key);
                      setDraggingColumnKey(column.key);
                      setColumnDropTarget(null);
                    }}
                    onDragEnd={() => { setDraggingColumnKey(null); setColumnDropTarget(null); }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      moveColumnStep(column.key, event.key === "ArrowLeft" ? -1 : 1);
                    }}
                    className="focus-ring -ml-1 cursor-grab rounded p-0.5 active:cursor-grabbing"
                    style={{ color: column.color }}
                  >
                    <DotsSixVertical size={14} weight="bold" />
                  </button>
                  <span aria-hidden="true" style={{ backgroundColor: column.color }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: column.color }}>{column.label}</span>
                  {isDropTarget && <span className="rounded-full bg-repressurizer-accent/15 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-repressurizer-accent">{t("diary.kanban.dropHere")}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-kanban-addgame-button
                    aria-label={`${t("diary.kanban.addGame")}: ${column.label}`}
                    title={t("diary.kanban.addGame")}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setAddGameQuery("");
                      setColumnMenu(null);
                      setAddGamePopover({ anchor: { x: Math.max(8, Math.min(rect.left, window.innerWidth - 344)), y: Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 460)) }, column });
                    }}
                    className="focus-ring rounded-md p-1 transition-colors hover:bg-repressurizer-surface-hover"
                    style={{ color: column.color }}
                  >
                    <Plus size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    data-testid={`diary-kanban-select-all-${column.key}`}
                    aria-label={`${columnGames.length > 0 && columnGames.every((game) => selection.has(game.appid)) ? t("diary.kanban.deselectAll") : t("diary.kanban.selectAll")}: ${column.label}`}
                    title={columnGames.length > 0 && columnGames.every((game) => selection.has(game.appid)) ? t("diary.kanban.deselectAll") : t("diary.kanban.selectAll")}
                    aria-pressed={columnGames.length > 0 && columnGames.every((game) => selection.has(game.appid))}
                    disabled={columnGames.length === 0}
                    onClick={() => toggleColumnSelection(column.key)}
                    className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <CheckSquareOffset size={12} />
                  </button>
                  {overLimit ? (
                    <span data-testid="diary-kanban-wip-over" title={t("diary.kanban.wipOver")} style={{ borderColor: colorWithAlpha(column.color, 0.55), backgroundColor: colorWithAlpha(column.color, 0.14), color: column.color }} className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 font-mono text-[10px] tabular-nums"><Warning size={10} weight="fill" />{columnGames.length}/{wipLimit}</span>
                  ) : (
                    <span style={{ color: column.color, backgroundColor: colorWithAlpha(column.color, 0.12) }} className="shrink-0 rounded-full px-1.5 font-mono text-[10px] tabular-nums">{columnGames.length}</span>
                  )}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                {columnGames.length === 0 && dropTarget?.columnKey !== column.key && (
                  <p className="rounded-lg border border-dashed border-repressurizer-border/70 bg-black/[0.04] px-3 py-6 text-center text-[10px] text-repressurizer-text-faint">{t("diary.kanban.empty")}</p>
                )}
                {columnGames.map((game, index) => (
                  <div key={game.appid}>
                    {dropTarget?.columnKey === column.key && dropTarget.index === index && draggingAppId !== null && <div data-testid="diary-kanban-drop-marker" aria-hidden="true" className="kanban-drop-marker mb-1.5 h-1 rounded-full bg-repressurizer-accent shadow-[0_0_12px_rgba(16,185,129,0.7)]" />}
                    <KanbanCard
                      game={game}
                      detail={details[game.appid]}
                      entry={entries[game.appid]}
                      rating={reviews[game.appid]?.rating ?? 0}
                      journalCount={journal[game.appid]?.length ?? 0}
                      sectionCount={sectionCountByAppId.get(game.appid) ?? 0}
                      language={language}
                      dragging={draggingAppId === game.appid}
                      selected={selection.has(game.appid)}
                      accentColor={column.color}
                      t={t}
                      columnKey={column.key}
                      columnIndex={index}
                      onOpen={handleCardOpen}
                      onSelect={handleCardSelect}
                      onContextMenuOpen={handleCardContextMenu}
                      onPointerDown={handleCardPointerDown}
                    />
                  </div>
                ))}
                {dropTarget?.columnKey === column.key && dropTarget.index >= columnGames.length && draggingAppId !== null && <div data-testid="diary-kanban-drop-marker" aria-hidden="true" className="kanban-drop-marker h-1 rounded-full bg-repressurizer-accent shadow-[0_0_12px_rgba(16,185,129,0.7)]" />}
              </div>
            </section>
          );
        })}
        {games.length === 0 && (
          <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
            <GameController size={34} weight="duotone" className="mb-3 text-repressurizer-text-faint" />
            <p className="text-sm font-medium text-repressurizer-text">{t("diary.empty")}</p>
            <p className="mt-1 text-xs text-repressurizer-text-faint">{t("diary.empty.desc")}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        data-testid="diary-kanban-columns-button"
        onClick={(event) => {
          if (columnsPopover) {
            setColumnsPopover(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setColumnsPopover({
            x: Math.max(8, Math.min(rect.left - 284, window.innerWidth - 296)),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
            maxHeight: Math.max(160, Math.min(window.innerHeight * 0.7, rect.top - 16)),
          });
        }}
        aria-expanded={columnsPopover !== null}
        aria-label={t("diary.kanban.columns")}
        title={t("diary.kanban.columns")}
        className={`focus-ring absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border shadow-pop transition-colors sm:bottom-6 sm:right-6 ${columnsPopover ? "border-repressurizer-accent/50 bg-repressurizer-surface-raised text-repressurizer-accent" : "border-repressurizer-border bg-repressurizer-surface-raised/95 text-repressurizer-text-muted hover:border-repressurizer-accent/50 hover:text-repressurizer-accent"}`}
      >
        <Plus size={16} weight="bold" />
        <span className="sr-only">{t("diary.kanban.columns")}</span>
      </button>
      {ghost && createPortal(
        <div ref={ghostElementRef} className="pointer-events-none fixed left-0 top-0 z-[70] flex rotate-2 scale-[1.04] items-center gap-2 rounded-lg border border-repressurizer-accent/60 bg-repressurizer-surface-raised px-2 py-1.5 opacity-95 shadow-dialog" style={{ transform: `translate3d(${ghost.x + 10}px, ${ghost.y + 8}px, 0)` }}>
          <span className="h-6 w-[42px] shrink-0 overflow-hidden rounded bg-repressurizer-bg ring-1 ring-white/10">
            <SteamImage appId={ghost.appId} alt="" kind="capsule" className="h-full w-full object-cover" />
          </span>
          <span className="max-w-40 truncate text-[11px] font-medium text-white">{String(games.find((game) => game.appid === ghost.appId)?.name ?? "")}</span>
        </div>,
        document.body,
      )}
      {contextMenu && (
        <div data-kanban-context-menu role="menu" aria-label={t("diary.kanban.contextMenu")} data-testid="diary-kanban-context-menu" className="animate-fade-in fixed z-50 w-60 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 py-1.5 shadow-dialog backdrop-blur-md" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <p className="truncate border-b border-repressurizer-border-subtle px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">
            {contextMenuGame ? String(contextMenuGame.name ?? "") : t("diary.kanban.selection", { count: contextMenu.appIds.length })}
          </p>
          {contextMenuGame && (
            <button type="button" role="menuitem" data-testid="diary-kanban-open" onClick={() => { const appId = contextMenu.appIds[0]; setContextMenu(null); setSelection(new Set()); onOpenGame(appId); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white">{t("diary.openGame")}</button>
          )}
          <p className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.moveTo")}</p>
          {columns.map((column) => (
            <button key={column.key} type="button" role="menuitem" data-testid={`diary-kanban-move-${column.key}`} onClick={() => moveIds(contextMenu.appIds, column)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white">
              <span aria-hidden="true" style={{ backgroundColor: column.color }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
              {column.label}
            </button>
          ))}
          <p className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.priority")}</p>
          <div className="flex gap-1 px-2.5 pb-1">
            {(["high", "normal", "low"] as DiaryPriority[]).map((priority) => (
              <button key={priority} type="button" role="menuitem" onClick={() => { onBulkPriorityChange(contextMenu.appIds, priority); setContextMenu(null); }} className={`focus-ring flex-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${priority === "high" ? "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20" : priority === "low" ? "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint hover:text-repressurizer-text" : "border-amber-400/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"}`}>{t(`diary.priority.${priority}`)}</button>
            ))}
          </div>
          <div className="mt-1 border-t border-repressurizer-border-subtle pt-1">
            <button
              type="button"
              role="menuitem"
              data-testid="diary-kanban-context-archive"
              onClick={() => {
                onBulkStatusChange(contextMenu.appIds, "archived");
                setSelection(new Set());
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/15"
            >
              <Archive size={13} />
              {t("diary.kanban.archiveSelected")}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="diary-kanban-context-remove"
              onClick={() => {
                onRemoveGames(contextMenu.appIds);
                setSelection(new Set());
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/15"
            >
              <Trash size={13} />
              {t("diary.kanban.removeSelected")}
            </button>
          </div>
          <button type="button" role="menuitem" onClick={() => { setSelection(new Set()); setContextMenu(null); }} className="mt-1 flex w-full items-center gap-2 border-t border-repressurizer-border-subtle px-3 py-2 text-left text-xs text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text">{t("diary.kanban.clearSelection")}</button>
        </div>
      )}
      {columnMenu && columnMenuColumn && createPortal(
        <div data-kanban-column-menu role="menu" aria-label={`${t("diary.kanban.columnMenu")}: ${columnMenuColumn.label}`} data-testid="diary-kanban-column-menu" className="animate-fade-in fixed z-50 w-64 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 py-1.5 shadow-dialog backdrop-blur-md" style={{ left: columnMenu.x, top: columnMenu.y }}>
          <p className="truncate border-b border-repressurizer-border-subtle px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: columnMenuColumn.color }}>{columnMenuColumn.label}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setColumnMenu(null);
              setAddGameQuery("");
              setAddGamePopover({ anchor: { x: Math.max(8, Math.min(columnMenu.x, window.innerWidth - 344)), y: Math.min(columnMenu.y + 40, Math.max(8, window.innerHeight - 460)) }, column: columnMenuColumn });
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <Plus size={12} />
            {t("diary.kanban.addGame")}
          </button>
          <p className="px-3 pb-1.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.columnColor")}</p>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {BOARD_COLOR_PALETTE.map((paletteColor) => (
              <button key={paletteColor} type="button" aria-label={paletteColor} onClick={() => { onSetColumnColor(columnMenuColumn.key, paletteColor); setColumnMenu(null); }} className="focus-ring h-5 w-5 rounded-full border border-repressurizer-border transition-transform hover:scale-110" style={{ backgroundColor: paletteColor }} />
            ))}
          </div>
          <div className="mx-3 mb-2"><ColumnColorButton color={boardPrefs.columnColors[columnMenuColumn.key] ?? columnMenuColumn.color} label={columnMenuColumn.label} isCustom={columnMenuColumn.kind === "custom"} t={t} onSetColor={(value) => onSetColumnColor(columnMenuColumn.key, value)} /></div>
          {columnMenuColumn.kind === "custom" && columnMenuColumn.custom && (
            <>
              {columnMenu.renaming ? (
                <input
                  autoFocus
                  defaultValue={columnMenuColumn.custom.name}
                  maxLength={24}
                  aria-label={t("diary.kanban.renameColumn")}
                  className="mx-3 mb-1.5 w-[calc(100%-24px)] rounded-md border border-repressurizer-accent/50 bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text outline-none"
                  onBlur={(event) => { if (event.target.value.trim()) onRenameCustomColumn(columnMenuColumn.custom!.id, event.target.value); setColumnMenu(null); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { const value = event.currentTarget.value.trim(); if (value) onRenameCustomColumn(columnMenuColumn.custom!.id, value); setColumnMenu(null); }
                    if (event.key === "Escape") setColumnMenu(null);
                  }}
                />
              ) : (
                <button type="button" role="menuitem" onClick={() => setColumnMenu({ ...columnMenu, renaming: true })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover hover:text-white">{t("diary.kanban.renameColumn")}</button>
              )}
              <button type="button" role="menuitem" onClick={() => { onRemoveCustomColumn(columnMenuColumn.custom!.id); setColumnMenu(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10">
                <Trash size={12} />
                {t("common.delete")}
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => { onToggleColumnHidden(columnMenuColumn.key); setColumnMenu(null); }} className="mt-1 flex w-full items-center gap-2 border-t border-repressurizer-border-subtle px-3 py-2 text-left text-xs text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text">{t("diary.kanban.hideColumn")}</button>
        </div>,
        document.body,
      )}
      {columnsPopover && createPortal(
        <>
          <div data-kanban-columns-popover data-testid="diary-kanban-columns-popover" className="animate-fade-in fixed z-50 w-72 overflow-y-auto rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 p-3 shadow-pop backdrop-blur-md" style={{ left: columnsPopover.x, bottom: columnsPopover.bottom, maxHeight: columnsPopover.maxHeight }}>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.boardOrder")}</p>
            <ol data-testid="diary-kanban-board-order" className="mb-1 space-y-0.5">
              {columns.map((column, index) => (
                <li key={column.key} data-testid={`diary-kanban-order-row-${column.key}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="shrink-0 rounded-md bg-repressurizer-bg px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-repressurizer-text-faint">{index + 1}</span>
                    <span aria-hidden="true" style={{ backgroundColor: column.color }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
                    <span className="truncate">{column.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button type="button" data-testid={`diary-kanban-order-left-${column.key}`} aria-label={`${t("diary.kanban.moveColumnLeft")}: ${column.label}`} title={t("diary.kanban.moveColumnLeft")} disabled={index === 0} onClick={() => moveColumnStep(column.key, -1)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:cursor-not-allowed disabled:opacity-25"><ArrowLeft size={11} /></button>
                    <button type="button" data-testid={`diary-kanban-order-right-${column.key}`} aria-label={`${t("diary.kanban.moveColumnRight")}: ${column.label}`} title={t("diary.kanban.moveColumnRight")} disabled={index === columns.length - 1} onClick={() => moveColumnStep(column.key, 1)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:cursor-not-allowed disabled:opacity-25"><ArrowRight size={11} /></button>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mb-1.5 mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.statusColumns")}</p>
            <div className="space-y-0.5">
              {STATUS_KEYS.map((status) => (
                <ColumnEditorRow
                  key={status}
                  columnKey={status}
                  label={t(STATUS_LABELS[status])}
                  color={boardPrefs.columnColors[status] ?? DEFAULT_COLUMN_COLORS[status]}
                  hidden={boardPrefs.hiddenColumns.includes(status)}
                  t={t}
                  onSetColor={(color) => onSetColumnColor(status, color)}
                  onToggleHidden={() => onToggleColumnHidden(status)}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/45 px-2 py-1.5">
              <span className="text-[10px] text-repressurizer-text-faint">
                {t("diary.kanban.removedGames")}
              </span>
              <button
                type="button"
                data-testid="diary-kanban-restore-removed"
                disabled={boardPrefs.removedAppIds.length === 0}
                onClick={onRestoreRemovedGames}
                className="focus-ring rounded-md border border-repressurizer-border-subtle px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/40 hover:text-repressurizer-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("diary.kanban.restoreRemoved", {
                  count: boardPrefs.removedAppIds.length,
                })}
              </button>
            </div>
            <p className="mb-1.5 mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.customColumns")}</p>
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/45 px-2 py-1.5">
              <span className="text-[10px] text-repressurizer-text-faint">{t("diary.kanban.cleanupEmpty")}</span>
              <button type="button" data-testid="diary-kanban-clean-empty" disabled={emptyCustomColumnCount === 0} onClick={() => { onRemoveEmptyCustomColumns(); setMergeSourceId(null); }} className="focus-ring rounded-md border border-repressurizer-border-subtle px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/40 hover:text-repressurizer-accent disabled:cursor-not-allowed disabled:opacity-40">{t("diary.kanban.cleanupEmpty.action")} <span className="font-mono tabular-nums">{emptyCustomColumnCount}</span></button>
            </div>
            <div className="space-y-0.5">
              {boardPrefs.customColumns.length === 0 && (
                <p className="px-2 py-1.5 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.kanban.customColumns.empty")}</p>
              )}
              {boardPrefs.customColumns.map((custom, customIndex) => (
                <div key={custom.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover">
                  <ColumnColorButton
                    testId={`diary-column-color-${custom.id}`}
                    color={boardPrefs.columnColors[custom.id] ?? custom.color}
                    label={custom.name}
                    isCustom
                    t={t}
                    onSetColor={(color) => onSetColumnColor(custom.id, color)}
                  />
                  <input
                    value={custom.name}
                    maxLength={24}
                    aria-label={`${t("diary.kanban.renameColumn")}: ${custom.name}`}
                    onChange={(event) => onRenameCustomColumn(custom.id, event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-repressurizer-text outline-none transition-colors hover:border-repressurizer-border-subtle focus:border-repressurizer-accent/50"
                  />
                  <span className="shrink-0 rounded-full border border-repressurizer-border-subtle bg-repressurizer-bg px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-repressurizer-text-faint">{grouped.get(custom.id)?.length ?? 0}</span>
                  <button type="button" aria-label={`${t("diary.kanban.moveColumnUp")}: ${custom.name}`} title={t("diary.kanban.moveColumnUp")} disabled={customIndex === 0} onClick={() => onMoveCustomColumn(custom.id, -1)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:opacity-25"><ArrowUp size={11} /></button>
                  <button type="button" aria-label={`${t("diary.kanban.moveColumnDown")}: ${custom.name}`} title={t("diary.kanban.moveColumnDown")} disabled={customIndex === boardPrefs.customColumns.length - 1} onClick={() => onMoveCustomColumn(custom.id, 1)} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:text-repressurizer-text disabled:opacity-25"><ArrowDown size={11} /></button>
                  <button type="button" aria-label={`${t("diary.kanban.mergeColumn")}: ${custom.name}`} title={t("diary.kanban.mergeColumn")} onClick={() => setMergeSourceId((current) => current === custom.id ? null : custom.id)} className={`focus-ring rounded-md p-1 transition-colors ${mergeSourceId === custom.id ? "bg-repressurizer-accent/15 text-repressurizer-accent" : "text-repressurizer-text-faint hover:text-repressurizer-text"}`}><ArrowRight size={11} /></button>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-repressurizer-text-faint">
                    <span className="sr-only">{`${t("diary.kanban.showColumn")}: ${custom.name}`}</span>
                    <input type="checkbox" checked={!boardPrefs.hiddenColumns.includes(custom.id)} onChange={() => onToggleColumnHidden(custom.id)} className="h-3.5 w-3.5 accent-repressurizer-accent" />
                  </label>
                  <button type="button" aria-label={`${t("common.delete")}: ${custom.name}`} title={t("common.delete")} onClick={() => onRemoveCustomColumn(custom.id)} className="focus-ring rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={12} /></button>
                </div>
              ))}
            </div>
            {mergeSourceId && boardPrefs.customColumns.length > 1 && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-repressurizer-accent/25 bg-repressurizer-accent/[0.06] p-2">
                <select data-testid="diary-kanban-merge-target" aria-label={t("diary.kanban.mergeTarget")} defaultValue="" onChange={(event) => {
                  const targetId = event.target.value;
                  if (!targetId) return;
                  onMergeCustomColumn(mergeSourceId, targetId);
                  setMergeSourceId(null);
                }} className="min-w-0 flex-1 rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1.5 text-[10px] text-repressurizer-text outline-none focus:border-repressurizer-accent/50">
                  <option value="">{t("diary.kanban.mergeTarget")}</option>
                  {boardPrefs.customColumns.filter((column) => column.id !== mergeSourceId).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                </select>
              </div>
            )}
            <NewColumnRow t={t} onCreate={(name, color) => onAddCustomColumn(name, color)} />
            <p className="mt-2 border-t border-repressurizer-border-subtle px-1 pt-2 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.kanban.columns.hint")}</p>
          </div>
        </>,
        document.body,
      )}
      {addGamePopover && createPortal(
        <>
          <div data-kanban-addgame-popover data-testid="diary-kanban-addgame-popover" className="animate-fade-in fixed z-50 w-[min(336px,calc(100vw-16px))] overflow-hidden rounded-xl border bg-repressurizer-surface-raised shadow-pop" style={{ left: addGamePopover.anchor.x, top: addGamePopover.anchor.y, borderColor: colorWithAlpha(addGamePopover.column.color, 0.42), "--kanban-column-color": addGamePopover.column.color, "--kanban-column-soft": colorWithAlpha(addGamePopover.column.color, 0.1) } as CSSProperties}>
            <div className="border-b border-repressurizer-border-subtle px-3 py-2.5">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]"><span className="text-repressurizer-text-faint">{t("diary.kanban.addGame")}: </span><span style={{ color: addGamePopover.column.color }}>{addGamePopover.column.label}</span></p>
              <label className="group/search mt-2 flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2.5 py-1.5 transition-colors focus-within:border-[var(--kanban-column-color)]">
                <MagnifyingGlass size={13} className="shrink-0 text-repressurizer-text-faint transition-colors group-focus-within/search:text-[var(--kanban-column-color)]" />
                <input autoFocus value={addGameQuery} onChange={(event) => setAddGameQuery(event.target.value)} placeholder={t("diary.kanban.addGame.search")} aria-label={t("diary.kanban.addGame.search")} data-testid="diary-kanban-addgame-search" className="min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint" />
              </label>
            </div>
            <div className="max-h-[min(420px,65vh)] overflow-y-auto p-1.5">
              {addGameResults.onKanban.length === 0 && addGameResults.inLibrary.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-repressurizer-text-faint">{t("diary.kanban.addGame.none")}</p>
              ) : (
                <div className="space-y-2">
                  {addGameResults.inLibrary.length > 0 && (
                    <section data-testid="diary-kanban-addgame-section-library" aria-labelledby="diary-kanban-addgame-heading-library">
                      <div id="diary-kanban-addgame-heading-library" className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: addGamePopover.column.color }}>
                        <span>{t("diary.kanban.addGame")}</span>
                        <span data-testid="diary-kanban-addgame-count-library" className="rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums" style={{ backgroundColor: colorWithAlpha(addGamePopover.column.color, 0.14) }}>{addGameResults.inLibraryCount}</span>
                      </div>
                      {addGameResults.inLibrary.map((game) => (
                        <button key={game.appid} type="button" data-source="library" data-testid={`diary-kanban-addgame-row-${game.appid}`} onClick={() => moveIds([game.appid], addGamePopover.column)} className="group focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--kanban-column-soft)]">
                          <span className="h-7 w-[46px] shrink-0 overflow-hidden rounded bg-repressurizer-bg"><SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" /></span>
                          <span className="min-w-0 flex-1 truncate text-xs text-repressurizer-text">{String(game.name ?? "")}</span>
                          <span className="shrink-0 font-mono text-[9px] tabular-nums text-repressurizer-text-faint">{formatHours(game.playtime_forever, language)}h</span>
                          <Plus data-testid={`diary-kanban-addgame-action-${game.appid}`} size={13} weight="bold" className="shrink-0 text-repressurizer-text-faint transition-[color,transform] group-hover:scale-110 group-hover:text-[var(--kanban-column-color)] group-focus-visible:text-[var(--kanban-column-color)]" aria-hidden="true" />
                        </button>
                      ))}
                    </section>
                  )}
                  {addGameResults.onKanban.length > 0 && (
                    <section data-testid="diary-kanban-addgame-section-kanban" aria-labelledby="diary-kanban-addgame-heading-kanban" className={addGameResults.inLibrary.length > 0 ? "border-t border-repressurizer-border-subtle pt-2" : ""}>
                      <div id="diary-kanban-addgame-heading-kanban" className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: addGamePopover.column.color }}>
                        <span>{t("diary.kanban.addGame.onKanban")}</span>
                        <span data-testid="diary-kanban-addgame-count-kanban" className="rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums" style={{ backgroundColor: colorWithAlpha(addGamePopover.column.color, 0.14) }}>{addGameResults.onKanbanCount}</span>
                      </div>
                      {addGameResults.onKanban.map((game) => {
                        const currentColumn = columnOfGame(game);
                        return (
                          <button key={game.appid} type="button" data-source="kanban" data-testid={`diary-kanban-addgame-row-${game.appid}`} onClick={() => moveIds([game.appid], addGamePopover.column)} className="group focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--kanban-column-soft)]">
                            <span className="h-7 w-[46px] shrink-0 overflow-hidden rounded bg-repressurizer-bg"><SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs text-repressurizer-text">{String(game.name ?? "")}</span><span className="block truncate text-[9px] text-repressurizer-text-faint">{currentColumn?.label ?? t("diary.kanban.addGame.onKanban")}</span></span>
                            <ArrowRight data-testid={`diary-kanban-addgame-action-${game.appid}`} size={13} weight="bold" className="shrink-0 text-repressurizer-text-faint transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-[var(--kanban-column-color)] group-focus-visible:text-[var(--kanban-column-color)]" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
});

const BOARD_COLOR_PALETTE = ["#fbbf24", "#38bdf8", "#34d399", "#f472b6", "#a78bfa", "#f87171", "#facc15", "#2dd4bf", "#94a3b8", "#fb923c"];

function ColumnColorButton({ color, label, testId, isCustom, t, onSetColor }: { color: string; label: string; testId?: string; isCustom: boolean; t: ReturnType<typeof useT>; onSetColor: (color: string | null) => void }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState(color);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Commit only when the native picker fires "change" (release/close), like the
  // main Settings accent picker, so sliding never re-renders the board.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onCommit = () => onSetColor(input.value);
    input.addEventListener("change", onCommit);
    return () => input.removeEventListener("change", onCommit);
  }, [onSetColor, anchor]);
  useEffect(() => {
    if (!anchor) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-column-color-popover]")) setAnchor(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [anchor]);
  return (
    <span className="relative shrink-0">
      <button
        ref={undefined}
        type="button"
        aria-label={`${t("diary.kanban.columnColor")}: ${label}`}
        data-testid={testId}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setDraft(color);
          setAnchor({ x: Math.min(rect.left, window.innerWidth - 232), y: Math.min(rect.bottom + 4, window.innerHeight - 220) });
        }}
        className="focus-ring h-4 w-4 rounded-full border border-repressurizer-border transition-transform hover:scale-110"
        style={{ backgroundColor: draft }}
      />
      {anchor && createPortal(
        <span data-column-color-popover className="animate-fade-in fixed z-[95] block w-56 rounded-xl border border-repressurizer-border bg-repressurizer-bg p-2.5 shadow-pop" style={{ left: anchor.x, top: anchor.y }}>
          <label className="mb-2 flex cursor-pointer items-center gap-2.5">
            <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-repressurizer-border">
              <span className="block h-full w-full" style={{ backgroundColor: draft }} />
              <input
                ref={inputRef}
                type="color"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={t("diary.kanban.columnColor")}
              />
            </span>
            <span className="text-[10px] leading-tight text-repressurizer-text-muted">{t("diary.kanban.columnColor")}</span>
          </label>
          <span className="grid grid-cols-5 gap-1.5">
            {BOARD_COLOR_PALETTE.map((paletteColor) => (
              <button key={paletteColor} type="button" aria-label={paletteColor} onClick={() => { setDraft(paletteColor); onSetColor(paletteColor); setAnchor(null); }} className="focus-ring h-6 w-6 rounded-full border border-repressurizer-border transition-transform hover:scale-110" style={{ backgroundColor: paletteColor }} />
            ))}
          </span>
          <button type="button" onClick={() => { setDraft(color); onSetColor(isCustom ? color : null); setAnchor(null); }} className="focus-ring mt-2 w-full rounded-md border border-repressurizer-border px-2 py-1.5 text-[10px] text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white">{t("diary.kanban.colorReset")}</button>
        </span>,
        document.body,
      )}
    </span>
  );
}

function ColumnEditorRow({ columnKey, label, color, hidden, t, onSetColor, onToggleHidden }: {
  columnKey: string;
  label: string;
  color: string;
  hidden: boolean;
  t: ReturnType<typeof useT>;
  onSetColor: (color: string | null) => void;
  onToggleHidden: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover">
      <span className="flex min-w-0 items-center gap-2">
        <ColumnColorButton testId={`diary-column-color-${columnKey}`} color={color} label={label} isCustom={false} t={t} onSetColor={onSetColor} />
        <span className={`truncate ${hidden ? "text-repressurizer-text-faint line-through" : ""}`}>{label}</span>
      </span>
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-repressurizer-text-faint">
        <span className="sr-only">{`${t("diary.kanban.showColumn")}: ${label}`}</span>
        <input type="checkbox" checked={!hidden} onChange={onToggleHidden} className="h-3.5 w-3.5 accent-repressurizer-accent" />
      </label>
    </div>
  );
}

function NewColumnRow({ t, onCreate }: { t: ReturnType<typeof useT>; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(BOARD_COLOR_PALETTE[4]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-repressurizer-border-subtle px-2 py-2">
      <span className="relative shrink-0">
        <button type="button" aria-label={t("diary.kanban.columnColor")} onClick={() => setPaletteOpen((open) => !open)} className="focus-ring h-4 w-4 rounded-full border border-repressurizer-border transition-transform hover:scale-110" style={{ backgroundColor: color }} />
        {paletteOpen && (
          <span className="absolute left-0 top-full z-30 mt-1 block w-52 rounded-lg border border-repressurizer-border bg-repressurizer-bg p-2 shadow-[0_14px_38px_rgba(0,0,0,0.5)]">
            <span className="grid grid-cols-5 gap-1.5">
              {BOARD_COLOR_PALETTE.map((paletteColor) => (
                <button key={paletteColor} type="button" aria-label={paletteColor} onClick={() => { setColor(paletteColor); setPaletteOpen(false); }} className="focus-ring h-6 w-6 rounded-full border border-repressurizer-border transition-transform hover:scale-110" style={{ backgroundColor: paletteColor }} />
              ))}
            </span>
          </span>
        )}
      </span>
      <input value={name} maxLength={24} placeholder={t("diary.kanban.newColumn.placeholder")} aria-label={t("diary.kanban.newColumn")} data-testid="diary-kanban-new-column-name" onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1.5 text-xs text-repressurizer-text outline-none focus:border-repressurizer-accent/50" />
      <button
        type="button"
        data-testid="diary-kanban-new-column-add"
        disabled={!name.trim()}
        onClick={() => { onCreate(name, color); setName(""); }}
        className="focus-ring btn-press inline-flex shrink-0 items-center gap-1 rounded-md bg-repressurizer-accent px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
      >
        <Plus size={11} weight="bold" />
        {t("diary.kanban.newColumn")}
      </button>
    </div>
  );
}

const KanbanCard = memo(function KanbanCard({ game, detail, entry, rating, journalCount, sectionCount, language, dragging, selected, accentColor, t, columnKey, columnIndex, onOpen, onSelect, onContextMenuOpen, onPointerDown }: {
  game: OwnedGame;
  detail: GameDetails | undefined;
  entry: DiaryEntry | undefined;
  rating: number;
  journalCount: number;
  sectionCount: number;
  language: string;
  dragging: boolean;
  selected: boolean;
  accentColor: string;
  t: ReturnType<typeof useT>;
  columnKey: string;
  columnIndex: number;
  onOpen: (appId: number) => void;
  onSelect: (appId: number, columnKey: string, index: number, mode: "replace" | "toggle" | "range") => void;
  onContextMenuOpen: (event: ReactMouseEvent, appId: number) => void;
  onPointerDown: (appId: number, event: ReactPointerEvent) => void;
}) {
  const priority = entry?.priority ?? "normal";
  const edge = PRIORITY_EDGE[priority];
  const style: CSSProperties = selected
    ? { borderColor: `${accentColor}cc`, backgroundColor: `${accentColor}1e`, boxShadow: `0 0 0 1px ${accentColor}55` }
    : {};
  if (edge) style.borderLeft = `3px solid ${edge}`;
  return (
    <div
      data-testid={`diary-kanban-card-${game.appid}`}
      data-kanban-card
      data-selected={selected ? "true" : "false"}
      aria-selected={selected}
      tabIndex={0}
      title={`${String(game.name ?? "")} — ${t("diary.kanban.openHint")}`}
      style={style}
      className={`group/card card-lift focus-ring relative cursor-grab touch-none select-none rounded-lg border bg-repressurizer-surface p-2.5 text-left shadow-pop-sm active:cursor-grabbing ${dragging ? "opacity-40" : selected ? "" : "border-repressurizer-border-subtle hover:border-repressurizer-accent/45 hover:bg-repressurizer-surface-hover/70 hover:shadow-pop"}`}
      data-column-index={columnIndex}
      aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"
      onPointerDown={(event) => onPointerDown(game.appid, event)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen(game.appid);
          return;
        }
        if (event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          onSelect(game.appid, columnKey, columnIndex, "toggle");
        }
      }}
      onClick={(event) => {
        onSelect(game.appid, columnKey, columnIndex, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace");
      }}
      onDoubleClick={() => onOpen(game.appid)}
      onContextMenu={(event) => onContextMenuOpen(event, game.appid)}
    >
      <button
        type="button"
        aria-label={`${t("diary.openGame")}: ${game.name ?? ""}`}
        title={t("diary.openGame")}
        onClick={(event) => { event.stopPropagation(); onOpen(game.appid); }}
        className="focus-ring absolute right-1 top-1 rounded-md bg-repressurizer-bg/90 p-1 text-repressurizer-accent opacity-0 shadow-pop-sm ring-1 ring-white/10 transition-opacity hover:bg-repressurizer-accent/20 group-hover/card:opacity-100 focus-visible:opacity-100"
      >
        <ArrowUpRight size={11} weight="bold" />
      </button>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="relative h-8 w-[54px] shrink-0 overflow-hidden rounded bg-repressurizer-bg">
          <SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 flex-1 self-center">
          <span className="flex min-w-0 items-start gap-1.5">
            <span title={String(game.name ?? "")} className="line-clamp-2 break-words text-xs font-medium leading-snug text-repressurizer-text group-hover/card:text-white">{String(game.name ?? "")}</span>
            {rating > 0 && <span className="shrink-0 font-mono text-[11px] font-semibold text-repressurizer-accent">{rating}/10</span>}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[10px] text-repressurizer-text-faint">
            <span className="shrink-0 font-mono">{formatHours(game.playtime_forever, language)}h</span>
            {(sectionCount > 0 || journalCount > 0) && <span className="shrink-0">·</span>}
            {(sectionCount > 0 || journalCount > 0) && <span className="shrink-0">{sectionCount + journalCount} {t("diary.pages.count")}</span>}
            {detail?.developers?.[0] && <span className="truncate">· {detail.developers[0]}</span>}
          </span>
        </span>
      </div>
    </div>
  );
});
