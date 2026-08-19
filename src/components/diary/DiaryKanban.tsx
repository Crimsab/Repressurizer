import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, GameController, MagnifyingGlass, Plus, Trash, Warning, X } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
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

export function buildBoardColumns(boardPrefs: DiaryBoardPrefs, showArchived: boolean, t: ReturnType<typeof useT>): BoardColumn[] {
  const hidden = new Set(boardPrefs.hiddenColumns);
  const list: BoardColumn[] = [];
  for (const status of STATUS_KEYS) {
    if (status === "archived" && !showArchived) continue;
    if (hidden.has(status)) continue;
    list.push({ key: status, label: t(STATUS_LABELS[status]), color: boardPrefs.columnColors[status] ?? DEFAULT_COLUMN_COLORS[status], kind: "status", status });
  }
  for (const custom of boardPrefs.customColumns) {
    if (hidden.has(custom.id)) continue;
    list.push({ key: custom.id, label: custom.name, color: boardPrefs.columnColors[custom.id] ?? custom.color, kind: "custom", custom });
  }
  return list;
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

function colorWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const PRIORITY_EDGE: Record<DiaryPriority, string | null> = { high: "#fb7185", normal: null, low: "#64748b" };

export const DiaryKanbanBoard = memo(function DiaryKanbanBoard({ games, details, entries, statuses, reviews, journal, pages, board, boardPrefs, language, showArchived, wipLimit, t, onApplyStatus, onSetBoardOrder, onSetPriority, onOpenGame, onSetColumnColor, onToggleColumnHidden, onAddCustomColumn, onRenameCustomColumn, onRemoveCustomColumn, onSetCustomAssignment }: {
  games: OwnedGame[];
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
  wipLimit: number;
  t: ReturnType<typeof useT>;
  onApplyStatus: (appId: number, status: DiaryViewStatus) => void;
  onSetBoardOrder: (orderedAppIds: number[]) => void;
  onSetPriority: (appId: number, priority: DiaryPriority) => void;
  onOpenGame: (appId: number) => void;
  onSetColumnColor: (columnKey: string, color: string | null) => void;
  onToggleColumnHidden: (columnKey: string) => void;
  onAddCustomColumn: (name: string, color: string) => string | null;
  onRenameCustomColumn: (columnId: string, name: string) => void;
  onRemoveCustomColumn: (columnId: string) => void;
  onSetCustomAssignment: (appId: number, columnId: string | null) => void;
}) {
  const [draggingAppId, setDraggingAppId] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ appId: number; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<{ columnKey: string; index: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [columnsPopover, setColumnsPopover] = useState<PopoverAnchor | null>(null);
  const [addGamePopover, setAddGamePopover] = useState<{ anchor: PopoverAnchor; column: BoardColumn } | null>(null);
  const [addGameQuery, setAddGameQuery] = useState("");

  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; appId: number } | null>(null);
  const suppressClickRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const ghostPosRef = useRef<{ x: number; y: number } | null>(null);

  const columns = useMemo(() => buildBoardColumns(boardPrefs, showArchived, t), [boardPrefs, showArchived, t]);

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

  const moveIds = useCallback((appIds: number[], column: BoardColumn, insertAt?: number) => {
    const currentIds = (grouped.get(column.key) ?? []).map((game) => game.appid);
    const targetIds = currentIds.filter((id) => !appIds.includes(id));
    const at = Math.max(0, Math.min(insertAt ?? targetIds.length, targetIds.length));
    for (const appId of appIds) {
      if (column.kind === "custom" && column.custom) onSetCustomAssignment(appId, column.custom.id);
      else {
        onSetCustomAssignment(appId, null);
        if (column.status) onApplyStatus(appId, column.status);
      }
    }
    onSetBoardOrder([...targetIds.slice(0, at), ...appIds, ...targetIds.slice(at)]);
    setSelection(new Set());
    setContextMenu(null);
    setAddGamePopover(null);
  }, [grouped, onApplyStatus, onSetBoardOrder, onSetCustomAssignment]);

  const toggleCardSelection = (appId: number, columnKey: string, index: number, mode: "replace" | "toggle" | "range") => {
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
  };

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
        setGhost((current) => (current ? { ...current, x: position.x, y: position.y } : current));
        const columnKey = findColumnKeyAt(position.x, position.y);
        if (columnKey) setDropTarget({ columnKey, index: findDropIndex(columnKey, position.y) });
        else setDropTarget(null);
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

  const openContextMenu = (event: ReactMouseEvent, appId: number) => {
    event.preventDefault();
    event.stopPropagation();
    const appIds = selection.has(appId) ? [...selection] : [appId];
    if (!selection.has(appId)) setSelection(new Set([appId]));
    setColumnMenu(null);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 260),
      y: Math.min(event.clientY, window.innerHeight - 340),
      appIds,
    });
  };

  const openColumnMenu = (event: ReactMouseEvent, columnKey: string) => {
    if ((event.target as HTMLElement).closest("[data-kanban-card]")) return;
    event.preventDefault();
    setContextMenu(null);
    setColumnMenu({ x: Math.min(event.clientX, window.innerWidth - 270), y: Math.min(event.clientY, window.innerHeight - 300), columnKey, renaming: false });
  };

  const contextMenuGame = contextMenu && contextMenu.appIds.length === 1 ? games.find((game) => game.appid === contextMenu.appIds[0]) : undefined;
  const columnMenuColumn = columnMenu ? columns.find((column) => column.key === columnMenu.columnKey) : undefined;

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
    if (!addGamePopover) return [];
    const present = new Set((grouped.get(addGamePopover.column.key) ?? []).map((game) => game.appid));
    const query = addGameQuery.trim().toLocaleLowerCase(language);
    return games
      .filter((game) => !present.has(game.appid))
      .filter((game) => !query || String(game.name ?? "").toLocaleLowerCase(language).includes(query))
      .slice(0, 40);
  }, [addGamePopover, addGameQuery, games, grouped, language]);

  return (
    <div data-testid="diary-kanban" className="relative flex min-h-0 flex-1 flex-col">
      {selection.size > 0 && draggingAppId === null && (
        <div data-testid="diary-kanban-selection" className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-xl border border-repressurizer-accent/40 bg-repressurizer-surface px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur">
            <span className="font-mono text-[11px] font-semibold tabular-nums text-repressurizer-accent">{selection.size}</span>
            <span className="text-[11px] text-repressurizer-text-muted">{t("diary.kanban.selection", { count: selection.size })}</span>
            <span className="mx-1 h-4 w-px bg-repressurizer-border-subtle" />
            <button type="button" data-testid="diary-kanban-selection-move" aria-label={t("diary.kanban.moveTo")} className="focus-ring rounded-md px-2 py-1 text-[10px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/10"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setContextMenu({ x: Math.max(8, rect.left - 100), y: rect.top - 320, appIds: [...selection] });
              }}
            >
              {t("diary.kanban.moveTo")}
            </button>
            <button type="button" aria-label={t("diary.kanban.clearSelection")} onClick={() => setSelection(new Set())} className="focus-ring rounded-md p-1 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><X size={12} /></button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 sm:p-6" role="list" aria-label={t("diary.kanban.board")}>
        {columns.map((column) => {
          const columnGames = grouped.get(column.key) ?? [];
          const overLimit = column.status === "playing" && wipLimit > 0 && columnGames.length > wipLimit;
          const isDropTarget = dropTarget?.columnKey === column.key && draggingAppId !== null;
          return (
            <section
              key={column.key}
              data-column-key={column.key}
              data-testid={`diary-kanban-column-${column.key}`}
              data-column-name={column.label}
              aria-label={column.label}
              onContextMenu={(event) => openColumnMenu(event, column.key)}
              style={{ borderColor: `${column.color}99`, backgroundColor: `${column.color}0d` }}
              className={`flex min-h-0 min-w-[230px] max-w-[380px] flex-1 basis-0 flex-col overflow-hidden rounded-xl border transition-colors ${isDropTarget ? "bg-repressurizer-accent/[0.08]" : "bg-repressurizer-surface/30"}`}
            >
              <header
                data-testid={`diary-kanban-column-header-${column.key}`}
                className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5"
                style={{ backgroundColor: `${column.color}26`, borderBottomColor: `${column.color}66` }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" style={{ backgroundColor: column.color }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: column.color }}>{column.label}</span>
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
                      setAddGamePopover({ anchor: { x: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), y: Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 380)) }, column });
                    }}
                    className="focus-ring rounded-md p-1 transition-colors hover:bg-repressurizer-surface-hover"
                    style={{ color: column.color }}
                  >
                    <Plus size={12} weight="bold" />
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
                  <p className="rounded-lg border border-dashed border-repressurizer-border-subtle px-3 py-6 text-center text-[10px] text-repressurizer-text-faint">{t("diary.kanban.empty")}</p>
                )}
                {columnGames.map((game, index) => (
                  <div key={game.appid}>
                    {dropTarget?.columnKey === column.key && dropTarget.index === index && draggingAppId !== null && <div aria-hidden="true" className="mb-1.5 h-1 rounded-full bg-repressurizer-accent" />}
                    <KanbanCard
                      game={game}
                      detail={details[game.appid]}
                      entry={entries[game.appid]}
                      rating={reviews[game.appid]?.rating ?? 0}
                      journalCount={journal[game.appid]?.length ?? 0}
                      sectionCount={pages.filter((page) => page.scope === "all" || page.appIds.includes(game.appid)).length}
                      language={language}
                      dragging={draggingAppId === game.appid}
                      selected={selection.has(game.appid)}
                      accentColor={column.color}
                      t={t}
                      onOpen={() => { setSelection(new Set()); onOpenGame(game.appid); }}
                      onSelect={(mode) => { if (!suppressClickRef.current) toggleCardSelection(game.appid, column.key, index, mode); }}
                      onContextMenuOpen={(event) => openContextMenu(event, game.appid)}
                      onPointerDown={(appId, event) => {
                        if (event.button !== 0) return;
                        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, appId };
                      }}
                    />
                  </div>
                ))}
                {dropTarget?.columnKey === column.key && dropTarget.index >= columnGames.length && draggingAppId !== null && <div aria-hidden="true" className="h-1 rounded-full bg-repressurizer-accent" />}
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
        <div className="relative flex min-h-0 shrink-0 flex-col">
          <button
            type="button"
            data-testid="diary-kanban-columns-button"
            onClick={(event) => {
              if (columnsPopover) {
                setColumnsPopover(null);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setColumnsPopover({ x: Math.max(8, Math.min(rect.left - 284, window.innerWidth - 296)), y: Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 430)) });
            }}
            aria-expanded={columnsPopover !== null}
            aria-label={t("diary.kanban.columns")}
            title={t("diary.kanban.columns")}
            className={`flex min-h-0 w-10 flex-col items-center justify-center gap-2 rounded-xl border px-1 py-4 transition-colors ${columnsPopover ? "border-repressurizer-accent/50 text-repressurizer-accent" : "border-dashed border-repressurizer-border text-repressurizer-text-faint hover:border-repressurizer-accent/40 hover:text-repressurizer-accent"}`}
          >
            <Plus size={16} />
            <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.18em] [writing-mode:vertical-rl]">{t("diary.kanban.columns")}</span>
          </button>
        </div>
      </div>
      {ghost && createPortal(
        <div className="pointer-events-none fixed z-[70] flex items-center gap-2 rounded-lg border border-repressurizer-accent/50 bg-repressurizer-surface px-2 py-1.5 opacity-90 shadow-[0_12px_32px_rgba(0,0,0,0.5)]" style={{ left: ghost.x + 10, top: ghost.y + 8 }}>
          <span className="h-6 w-[42px] shrink-0 overflow-hidden rounded bg-repressurizer-bg">
            <SteamImage appId={ghost.appId} alt="" kind="capsule" className="h-full w-full object-cover" />
          </span>
          <span className="max-w-40 truncate text-[11px] font-medium text-white">{String(games.find((game) => game.appid === ghost.appId)?.name ?? "")}</span>
        </div>,
        document.body,
      )}
      {contextMenu && (
        <div data-kanban-context-menu role="menu" aria-label={t("diary.kanban.contextMenu")} data-testid="diary-kanban-context-menu" className="fixed z-50 w-60 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]" style={{ left: contextMenu.x, top: contextMenu.y }}>
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
              <button key={priority} type="button" role="menuitem" onClick={() => { for (const appId of contextMenu.appIds) onSetPriority(appId, priority); setContextMenu(null); }} className={`focus-ring flex-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${priority === "high" ? "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20" : priority === "low" ? "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-faint hover:text-repressurizer-text" : "border-amber-400/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"}`}>{t(`diary.priority.${priority}`)}</button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => { setSelection(new Set()); setContextMenu(null); }} className="mt-1 flex w-full items-center gap-2 border-t border-repressurizer-border-subtle px-3 py-2 text-left text-xs text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text">{t("diary.kanban.clearSelection")}</button>
        </div>
      )}
      {columnMenu && columnMenuColumn && createPortal(
        <div data-kanban-column-menu role="menu" aria-label={`${t("diary.kanban.columnMenu")}: ${columnMenuColumn.label}`} data-testid="diary-kanban-column-menu" className="fixed z-50 w-64 overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]" style={{ left: columnMenu.x, top: columnMenu.y }}>
          <p className="truncate border-b border-repressurizer-border-subtle px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: columnMenuColumn.color }}>{columnMenuColumn.label}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setColumnMenu(null);
              setAddGameQuery("");
              setAddGamePopover({ anchor: { x: Math.min(columnMenu.x, window.innerWidth - 300), y: Math.min(columnMenu.y + 40, Math.max(8, window.innerHeight - 380)) }, column: columnMenuColumn });
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
          <div data-kanban-columns-popover data-testid="diary-kanban-columns-popover" className="fixed z-50 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-repressurizer-border bg-repressurizer-surface p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)]" style={{ left: columnsPopover.x, top: columnsPopover.y }}>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.statusColumns")}</p>
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
            <p className="mb-1.5 mt-3 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.kanban.customColumns")}</p>
            <div className="space-y-0.5">
              {boardPrefs.customColumns.length === 0 && (
                <p className="px-2 py-1.5 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.kanban.customColumns.empty")}</p>
              )}
              {boardPrefs.customColumns.map((custom) => (
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
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-repressurizer-text-faint">
                    <span className="sr-only">{`${t("diary.kanban.showColumn")}: ${custom.name}`}</span>
                    <input type="checkbox" checked={!boardPrefs.hiddenColumns.includes(custom.id)} onChange={() => onToggleColumnHidden(custom.id)} className="h-3.5 w-3.5 accent-repressurizer-accent" />
                  </label>
                  <button type="button" aria-label={`${t("common.delete")}: ${custom.name}`} title={t("common.delete")} onClick={() => onRemoveCustomColumn(custom.id)} className="focus-ring rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={12} /></button>
                </div>
              ))}
            </div>
            <NewColumnRow t={t} onCreate={(name, color) => onAddCustomColumn(name, color)} />
            <p className="mt-2 border-t border-repressurizer-border-subtle px-1 pt-2 text-[10px] leading-relaxed text-repressurizer-text-faint">{t("diary.kanban.columns.hint")}</p>
          </div>
        </>,
        document.body,
      )}
      {addGamePopover && createPortal(
        <>
          <div data-kanban-addgame-popover data-testid="diary-kanban-addgame-popover" className="fixed z-50 w-[288px] overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_18px_44px_rgba(0,0,0,0.45)]" style={{ left: addGamePopover.anchor.x, top: addGamePopover.anchor.y }}>
            <div className="border-b border-repressurizer-border-subtle px-3 py-2.5">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">{t("diary.kanban.addGame")}: {addGamePopover.column.label}</p>
              <label className="mt-2 flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2.5 py-1.5 transition-colors focus-within:border-repressurizer-accent/50">
                <MagnifyingGlass size={13} className="shrink-0 text-repressurizer-text-faint" />
                <input autoFocus value={addGameQuery} onChange={(event) => setAddGameQuery(event.target.value)} placeholder={t("diary.kanban.addGame.search")} aria-label={t("diary.kanban.addGame.search")} data-testid="diary-kanban-addgame-search" className="min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint" />
              </label>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {addGameResults.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-repressurizer-text-faint">{t("diary.kanban.addGame.none")}</p>
              ) : addGameResults.map((game) => (
                <button key={game.appid} type="button" data-testid={`diary-kanban-addgame-row-${game.appid}`} onClick={() => moveIds([game.appid], addGamePopover.column)} className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-repressurizer-surface-hover">
                  <span className="h-6 w-[40px] shrink-0 overflow-hidden rounded bg-repressurizer-bg">
                    <SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-repressurizer-text">{String(game.name ?? "")}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{formatHours(game.playtime_forever, language)}h</span>
                </button>
              ))}
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
        <span data-column-color-popover className="fixed z-[95] block w-56 rounded-lg border border-repressurizer-border bg-repressurizer-bg p-2.5 shadow-[0_14px_38px_rgba(0,0,0,0.5)]" style={{ left: anchor.x, top: anchor.y }}>
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

function KanbanCard({ game, detail, entry, rating, journalCount, sectionCount, language, dragging, selected, accentColor, t, onOpen, onSelect, onContextMenuOpen, onPointerDown }: {
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
  onOpen: () => void;
  onSelect: (mode: "replace" | "toggle" | "range") => void;
  onContextMenuOpen: (event: ReactMouseEvent) => void;
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
      data-selected={selected ? "true" : "false"}
      aria-selected={selected}
      title={`${String(game.name ?? "")} — ${t("diary.kanban.openHint")}`}
      style={style}
      className={`group/card relative cursor-grab touch-none select-none rounded-lg border bg-repressurizer-surface p-2 text-left shadow-sm transition-colors active:cursor-grabbing ${dragging ? "opacity-40" : selected ? "" : "border-repressurizer-border hover:border-repressurizer-accent/40"}`}
      onPointerDown={(event) => onPointerDown(game.appid, event)}
      onClick={(event) => {
        onSelect(event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace");
      }}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenuOpen}
    >
      <button
        type="button"
        aria-label={`${t("diary.openGame")}: ${game.name ?? ""}`}
        title={t("diary.openGame")}
        onClick={(event) => { event.stopPropagation(); onOpen(); }}
        className="focus-ring absolute right-1 top-1 rounded-md bg-repressurizer-bg/90 p-1 text-repressurizer-accent opacity-0 shadow-sm transition-opacity group-hover/card:opacity-100"
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
}
