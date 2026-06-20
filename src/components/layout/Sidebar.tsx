import { useState, useEffect, useRef, useCallback } from "react";
import { useCategoryStore } from "../../stores/categoryStore";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import { useFamilyStore } from "../../stores/familyStore";
import type { OwnedGame, SteamCollection } from "../../lib/types";
import { GameDetailPage } from "../games/GameDetailPage";
import { MergeCategoriesDialog } from "../categories/MergeCategoriesDialog";
import {
  GameController,
  Question,
  FolderOpen,
  Plus,
  PencilSimple,
  TrashSimple,
  Robot,
  Stack,
  Lightning,
  EyeSlash,
  Clock,
  DotsSixVertical,
  Export,
  X,
  ArrowsMerge,
  CopySimple,
  UsersThree,
} from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { SteamImage } from "../games/SteamImage";

interface CategoryContextMenuState {
  x: number;
  y: number;
  collection: SteamCollection;
}

export function Sidebar() {
  const {
    collections,
    activeCategory,
    setActiveCategory,
    addCategory,
    removeCategory,
    removeCategories,
    renameCategory,
    addGamesToCategory,
    selectedCategoryKeys,
    toggleCategorySelection,
    clearCategorySelection,
    setSelectedCategoryKeys,
    duplicateCategory,
  } = useCategoryStore();

  const games = useGameStore((s) => s.games);
  const openExportDialog = useExportUiStore((s) => s.openExportDialog);
  const selectedGameIds = useGameStore((s) => s.selectedGameIds);
  const showDynamicCategories = useSettingsStore((s) => s.showDynamicCategories);
  const showEmptyLists = useSettingsStore((s) => s.showEmptyLists);
  const pinFavorites = useSettingsStore((s) => s.pinFavorites);
  const showSmartLists = useSettingsStore((s) => s.showSmartLists);
  const showNowPlaying = useSettingsStore((s) => s.showNowPlaying);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const next = Math.min(400, Math.max(160, dragRef.current.startWidth + delta));
      setSettings({ sidebarWidth: next });
    };

    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const t = useT();
  const categoryOrder = useSettingsStore((s) => s.categoryOrder ?? []);

  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [detailGame, setDetailGame] = useState<OwnedGame | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<CategoryContextMenuState | null>(null);
  const [confirmDeleteKeys, setConfirmDeleteKeys] = useState<string[] | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [duplicateFor, setDuplicateFor] = useState<SteamCollection | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const categoryAnchorRef = useRef<string | null>(null);

  const isRemovableCategory = useCallback(
    (key: string | null) => {
      if (!key) return false;
      return collections.some((c) => c.key === key && !c.is_dynamic);
    },
    [collections]
  );

  // Category reorder drag state
  const [reorderDragKey, setReorderDragKey] = useState<string | null>(null);
  const [reorderOverKey, setReorderOverKey] = useState<string | null>(null);

  const handleCategoryDragStart = useCallback((key: string) => {
    setReorderDragKey(key);
  }, []);

  const handleCategoryDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setReorderOverKey(key);
  }, []);

  const handleCategoryDrop = useCallback((targetKey: string) => {
    if (!reorderDragKey || reorderDragKey === targetKey) {
      setReorderDragKey(null);
      setReorderOverKey(null);
      return;
    }
    // Compute new order
    const currentOrder = sortedCollections.map((c) => c.key);
    const fromIdx = currentOrder.indexOf(reorderDragKey);
    const toIdx = currentOrder.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, reorderDragKey);
    setSettings({ categoryOrder: newOrder });
    setReorderDragKey(null);
    setReorderOverKey(null);
  }, [reorderDragKey]);

  const gameCount = Object.keys(games).length;
  const allGameIds = Object.keys(games).map(Number);
  const categorizedIds = new Set(collections.flatMap((c) => c.added));
  const uncategorizedCount = allGameIds.filter((id) => !categorizedIds.has(id)).length;

  useEffect(() => {
    if (!showEmptyLists && activeCategory === "uncategorized" && uncategorizedCount === 0) {
      setActiveCategory("all");
    }
  }, [activeCategory, setActiveCategory, showEmptyLists, uncategorizedCount]);

  const gameValues = Object.values(games);
  const backlogCount = gameValues.filter((g) => g.playtime_forever === 0).length;
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const recentlyPlayedCount = gameValues.filter((g) => g.rtime_last_played > thirtyDaysAgo).length;

  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const nowPlayingGame = gameValues.reduce<(typeof gameValues)[0] | null>((best, g) => {
    if (g.rtime_last_played <= oneDayAgo) return best;
    if (!best || g.rtime_last_played > best.rtime_last_played) return g;
    return best;
  }, null);
  const hiddenCollection = collections.find((c) => c.id === "hidden");
  const hiddenCount = hiddenCollection?.added.length ?? 0;
  const sharedFamilyCount = useFamilyStore((s) => s.sharedCount());

  const handleCreateCategory = () => {
    if (newCatName.trim()) {
      addCategory(newCatName.trim());
      setNewCatName("");
      setShowNewCat(false);
    }
  };

  const handleDrop = (key: string) => {
    const ids = Object.keys(selectedGameIds).map(Number);
    if (ids.length > 0) {
      addGamesToCategory(key, ids);
    }
    setDragOver(null);
  };

  const handleContextMenu = (e: React.MouseEvent, col: SteamCollection) => {
    e.preventDefault();
    e.stopPropagation();
    if (col.is_dynamic) return;
    if (
      selectedCategoryKeys.length > 1 &&
      !selectedCategoryKeys.includes(col.key)
    ) {
      clearCategorySelection();
    }
    setContextMenu({ x: e.clientX, y: e.clientY, collection: col });
  };

  useEffect(() => {
    if (selectedCategoryKeys.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName;
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        clearCategorySelection();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      setConfirmDeleteKeys([...selectedCategoryKeys]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCategoryKeys, clearCategorySelection]);

  const visibleCollections = collections.filter(
    (c) =>
      c.id !== "hidden" &&
      (c.id !== "favorite" || c.added.length > 0) &&
      (showDynamicCategories || !c.is_dynamic)
  );
  const sortedCollections = [...visibleCollections].sort((a, b) => {
    // Custom order takes priority if both items are in the order list
    if (categoryOrder.length > 0) {
      const aIdx = categoryOrder.indexOf(a.key);
      const bIdx = categoryOrder.indexOf(b.key);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
    if (pinFavorites) {
      const aFav = a.id === "favorite" || a.key === "favorite" || a.name.toLowerCase() === "favorite" || a.name.toLowerCase() === "favorites";
      const bFav = b.id === "favorite" || b.key === "favorite" || b.name.toLowerCase() === "favorite" || b.name.toLowerCase() === "favorites";
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <aside
      className="relative flex flex-col border-r border-repressurizer-border-subtle bg-repressurizer-surface/50 shrink-0"
      style={{ width: sidebarWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-repressurizer-accent/30 transition-colors z-10"
        title={t("sidebar.dragResize")}
      />

      <div className="flex-1 overflow-auto px-2 py-2">

        {/* Now Playing */}
        {showNowPlaying && nowPlayingGame && (
          <button
            onClick={() => setDetailGame(nowPlayingGame)}
            className="mb-2 w-full overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface text-left transition-all hover:border-repressurizer-accent/50 hover:bg-repressurizer-surface-hover group"
          >
            <div className="relative h-14 overflow-hidden">
              <SteamImage
                appId={nowPlayingGame.appid}
                alt=""
                kind="header"
                className="h-full w-full object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity scale-105 group-hover:scale-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute top-1.5 right-1.5 rounded-md bg-repressurizer-accent px-1.5 py-0.5 text-[8px] font-bold text-black tracking-wide uppercase">
                {t("sidebar.recent")}
              </span>
            </div>
            <div className="px-2.5 py-2">
              <p className="truncate text-xs font-semibold text-white leading-tight">{String(nowPlayingGame.name ?? "")}</p>
              <p className="flex items-center gap-1 text-[10px] text-repressurizer-text-muted mt-0.5">
                <Clock size={9} className="text-repressurizer-accent shrink-0" />
                <span className="text-repressurizer-text">{(nowPlayingGame.playtime_forever / 60).toFixed(1)}h</span>
                <span className="text-repressurizer-border">·</span>
                {formatTimeAgo(nowPlayingGame.rtime_last_played, t)}
              </p>
            </div>
          </button>
        )}

        {/* All games */}
        <SidebarItem
          active={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
          icon={<GameController size={15} weight={activeCategory === "all" ? "fill" : "duotone"} />}
          label={t("sidebar.all")}
          count={gameCount}
        />

        {/* Uncategorized */}
        {(showEmptyLists || uncategorizedCount > 0) && (
          <SidebarItem
            active={activeCategory === "uncategorized"}
            onClick={() => setActiveCategory("uncategorized")}
            icon={<Question size={15} weight={activeCategory === "uncategorized" ? "fill" : "duotone"} />}
            label={t("sidebar.uncategorized")}
            count={uncategorizedCount}
          />
        )}

        {showSmartLists && (
          <>
            <div className="my-2 mx-2 border-t border-repressurizer-border-subtle" />

            {/* Smart Lists */}
            <p className="mb-1 px-2.5 text-[10px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("sidebar.smartLists")}</p>
            <SidebarItem
              active={activeCategory === "backlog"}
              onClick={() => setActiveCategory("backlog")}
              icon={<Stack size={15} weight={activeCategory === "backlog" ? "fill" : "duotone"} />}
              label={t("sidebar.backlog")}
              count={backlogCount}
            />
            <SidebarItem
              active={activeCategory === "recently-played"}
              onClick={() => setActiveCategory("recently-played")}
              icon={<Lightning size={15} weight={activeCategory === "recently-played" ? "fill" : "duotone"} />}
              label={t("sidebar.recentlyPlayed")}
              count={recentlyPlayedCount}
            />
            <SidebarItem
              active={activeCategory === "steam-family"}
              onClick={() => setActiveCategory("steam-family")}
              icon={<UsersThree size={15} weight={activeCategory === "steam-family" ? "fill" : "duotone"} />}
              label={t("sidebar.steamFamily")}
              count={sharedFamilyCount}
            />
          </>
        )}

        <div className="my-2 mx-2 border-t border-repressurizer-border-subtle" />

        {/* Categories */}
        {sortedCollections.map((col) => (
          <div
            key={col.key}
            draggable={!col.is_dynamic && editingKey !== col.key}
            onDragStart={(e) => {
              if (col.is_dynamic) return;
              // If there are selected games, this is a game-to-category drag — don't intercept
              if (Object.keys(selectedGameIds).length > 0) return;
              e.dataTransfer.setData("text/x-category-key", col.key);
              handleCategoryDragStart(col.key);
            }}
            onDragOver={(e) => {
              // Category reorder drag
              if (reorderDragKey && !col.is_dynamic) {
                handleCategoryDragOver(e, col.key);
                return;
              }
              // Game drop on category
              if (!col.is_dynamic) {
                e.preventDefault();
                setDragOver(col.key);
              }
            }}
            onDragLeave={() => { setDragOver(null); setReorderOverKey(null); }}
            onDrop={() => {
              if (reorderDragKey) {
                handleCategoryDrop(col.key);
                return;
              }
              if (!col.is_dynamic) handleDrop(col.key);
            }}
            onDragEnd={() => { setReorderDragKey(null); setReorderOverKey(null); }}
            className={`rounded-lg transition-all ${
              dragOver === col.key ? "ring-1 ring-repressurizer-accent bg-repressurizer-accent/5" : ""
            } ${reorderDragKey === col.key ? "opacity-50" : ""} ${
              reorderOverKey === col.key && reorderDragKey !== col.key ? "border-t-2 border-repressurizer-accent" : ""
            }`}
          >
            {editingKey === col.key && !col.is_dynamic ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  renameCategory(col.key, editName);
                  setEditingKey(null);
                }}
                className="px-1 py-0.5"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => setEditingKey(null)}
                  className="w-full rounded-md border border-repressurizer-accent bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:outline-none"
                />
              </form>
            ) : (
              <button
                onClick={(e) => {
                  if (col.is_dynamic) {
                    setActiveCategory(col.key);
                    return;
                  }
                  if (e.shiftKey && categoryAnchorRef.current) {
                    e.preventDefault();
                    const fromIdx = sortedCollections.findIndex(
                      (c) => c.key === categoryAnchorRef.current
                    );
                    const toIdx = sortedCollections.findIndex((c) => c.key === col.key);
                    if (fromIdx === -1 || toIdx === -1) return;
                    const start = Math.min(fromIdx, toIdx);
                    const end = Math.max(fromIdx, toIdx);
                    const keys = sortedCollections
                      .slice(start, end + 1)
                      .filter((c) => !c.is_dynamic)
                      .map((c) => c.key);
                    if (keys.length) setSelectedCategoryKeys(keys);
                    return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (
                      selectedCategoryKeys.length === 0 &&
                      activeCategory !== col.key &&
                      isRemovableCategory(activeCategory)
                    ) {
                      setSelectedCategoryKeys([activeCategory!, col.key]);
                    } else {
                      toggleCategorySelection(col.key);
                    }
                    categoryAnchorRef.current = col.key;
                    return;
                  }
                  setActiveCategory(col.key);
                  categoryAnchorRef.current = col.key;
                }}
                onDoubleClick={() => {
                  if (col.is_dynamic) return;
                  setEditingKey(col.key);
                  setEditName(col.name);
                }}
                onContextMenu={(e) => handleContextMenu(e, col)}
                className={`group flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm transition-colors ${
                  activeCategory === col.key
                    ? "bg-repressurizer-surface-hover text-repressurizer-text"
                    : "text-repressurizer-text hover:bg-repressurizer-surface-hover"
                } ${col.is_dynamic ? "italic text-repressurizer-text-muted" : ""} ${
                  !col.is_dynamic && selectedCategoryKeys.includes(col.key)
                    ? "ring-1 ring-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : ""
                }`}
              >
                {!col.is_dynamic && (
                  <DotsSixVertical size={10} weight="bold" className="shrink-0 text-repressurizer-text-faint opacity-0 group-hover:opacity-50 transition-opacity cursor-grab" />
                )}
                {col.is_dynamic ? (
                  <Robot size={14} weight="duotone" className="shrink-0 text-repressurizer-text-faint" />
                ) : (
                  <FolderOpen size={14} weight={activeCategory === col.key ? "fill" : "duotone"} className="shrink-0 text-repressurizer-text-faint" />
                )}
                <span className="flex-1 truncate">{col.name}</span>
                <span className="font-mono text-[10px] text-repressurizer-text-faint tabular-nums pr-1">
                  {col.is_dynamic ? t("sidebar.auto") : col.added.length}
                </span>
              </button>
            )}
          </div>
        ))}
        {/* Hidden */}
        {hiddenCount > 0 && (
          <>
            <div className="my-2 mx-2 border-t border-repressurizer-border-subtle" />
            <SidebarItem
              active={activeCategory === "hidden"}
              onClick={() => setActiveCategory("hidden")}
              icon={<EyeSlash size={15} weight={activeCategory === "hidden" ? "fill" : "duotone"} />}
              label={t("sidebar.hidden")}
              count={hiddenCount}
            />
          </>
        )}
      </div>

      {/* Multi-select actions */}
      {selectedCategoryKeys.length > 0 && (
        <div className="border-t border-repressurizer-border-subtle bg-repressurizer-bg/90 px-2 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-repressurizer-text-muted tabular-nums">
            {t("sidebar.category.selectedCount", { count: selectedCategoryKeys.length })}
            </span>
            <button
              type="button"
              onClick={() => clearCategorySelection()}
              className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
              title={t("sidebar.category.clearSelection")}
              aria-label={t("sidebar.category.clearSelection")}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              openExportDialog({ initialScope: "categories_pick" });
            }}
            className="btn-press flex min-w-0 items-center justify-center gap-1 rounded-lg bg-repressurizer-accent/15 px-2 py-1.5 text-[11px] font-medium text-repressurizer-accent hover:bg-repressurizer-accent/25"
          >
            <Export size={12} weight="bold" />
            <span className="truncate">{t("sidebar.category.exportSelectedShort")}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMerge(true)}
            disabled={selectedCategoryKeys.length < 2}
            className="btn-press flex min-w-0 items-center justify-center gap-1 rounded-lg border border-repressurizer-border px-2 py-1.5 text-[11px] font-medium text-repressurizer-text hover:bg-repressurizer-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowsMerge size={12} />
            <span className="truncate">{t("sidebar.category.mergeShort")}</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteKeys([...selectedCategoryKeys])}
            className="btn-press col-span-2 flex min-w-0 items-center justify-center gap-1 rounded-lg border border-repressurizer-danger/30 px-2 py-1.5 text-[11px] font-medium text-repressurizer-danger hover:bg-repressurizer-danger/10"
          >
            <TrashSimple size={12} />
            <span className="truncate">{t("sidebar.category.deleteSelected")}</span>
          </button>
          </div>
        </div>
      )}

      {/* New category */}
      <div className="border-t border-repressurizer-border-subtle p-2">
        {showNewCat ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCategory();
            }}
            className="flex min-w-0 gap-1"
          >
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={() => {
                if (!newCatName.trim()) setShowNewCat(false);
              }}
              placeholder={t("sidebar.categoryName")}
              className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
            <button
              type="submit"
              aria-label={t("sidebar.createCategory")}
              className="btn-press flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-repressurizer-accent text-sm text-white hover:bg-repressurizer-accent-hover"
            >
              <Plus size={14} weight="bold" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowNewCat(true)}
            className="btn-press flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
          >
            <Plus size={12} weight="bold" />
            {t("sidebar.newCategory")}
          </button>
        )}
      </div>

      {/* Game detail overlay */}
      {detailGame && (
        <GameDetailPage game={detailGame} onClose={() => setDetailGame(null)} />
      )}

      {/* Category context menu */}
      {contextMenu && (
        <CategoryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          collection={contextMenu.collection}
          multiExportMode={
            selectedCategoryKeys.length > 1 &&
            selectedCategoryKeys.includes(contextMenu.collection.key)
          }
          exportSelectedCount={selectedCategoryKeys.length}
          onClose={() => setContextMenu(null)}
          onRename={(col) => {
            setEditingKey(col.key);
            setEditName(col.name);
            setContextMenu(null);
          }}
          onDelete={(col) => {
            setConfirmDeleteKeys([col.key]);
            setContextMenu(null);
          }}
          onDeleteSelected={() => {
            setConfirmDeleteKeys([...selectedCategoryKeys]);
            setContextMenu(null);
          }}
          onExportCategory={(col) => {
            openExportDialog({
              initialScope: "category",
              overrideCategoryKey: col.key,
            });
            setContextMenu(null);
          }}
          onExportSelected={() => {
            openExportDialog({ initialScope: "categories_pick" });
            setContextMenu(null);
          }}
          onMergeSelected={() => {
            setShowMerge(true);
            setContextMenu(null);
          }}
          onDuplicate={(col) => {
            setDuplicateFor(col);
            setDuplicateName(`${col.name} (copy)`);
            setContextMenu(null);
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteKeys && (
        <DeleteConfirmDialog
          names={confirmDeleteKeys
            .map((key) => collections.find((c) => c.key === key)?.name)
            .filter((name): name is string => !!name)}
          onConfirm={() => {
            if (confirmDeleteKeys.length === 1) {
              removeCategory(confirmDeleteKeys[0]);
            } else {
              removeCategories(confirmDeleteKeys);
            }
            setConfirmDeleteKeys(null);
          }}
          onCancel={() => setConfirmDeleteKeys(null)}
        />
      )}

      {showMerge && selectedCategoryKeys.length >= 2 && (
        <MergeCategoriesDialog
          selectedKeys={selectedCategoryKeys}
          onClose={() => setShowMerge(false)}
        />
      )}

      {duplicateFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDuplicateFor(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-xl">
            <p className="text-sm font-medium text-white mb-3">{t("duplicate.title")}</p>
            <p className="text-xs text-repressurizer-text-muted mb-2 truncate">{duplicateFor.name}</p>
            <input
              autoFocus
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder={t("duplicate.placeholder")}
              className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text mb-4 focus:border-repressurizer-accent focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateFor(null)}
                className="btn-press rounded-lg px-3 py-1.5 text-sm text-repressurizer-text-muted hover:text-white"
              >
                {t("duplicate.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = duplicateName.trim();
                  if (n) duplicateCategory(duplicateFor.key, n);
                  setDuplicateFor(null);
                }}
                className="btn-press rounded-lg bg-repressurizer-accent px-3 py-1.5 text-sm text-white hover:bg-repressurizer-accent-hover"
              >
                {t("duplicate.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function formatTimeAgo(unixSecs: number, t: ReturnType<typeof useT>): string {
  const diffSecs = Math.floor(Date.now() / 1000) - unixSecs;
  if (diffSecs < 3600) return t("time.minutesAgo", { count: Math.floor(diffSecs / 60) });
  if (diffSecs < 86400) return t("time.hoursAgo", { count: Math.floor(diffSecs / 3600) });
  return t("time.daysAgo", { count: Math.floor(diffSecs / 86400) });
}

function SidebarItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        active
          ? "bg-repressurizer-accent/10 text-repressurizer-accent"
          : "text-repressurizer-text hover:bg-repressurizer-surface-hover"
      }`}
    >
      <span className={active ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="font-mono text-[10px] text-repressurizer-text-faint tabular-nums">{count}</span>
    </button>
  );
}

function CategoryContextMenu({
  x,
  y,
  collection,
  multiExportMode,
  exportSelectedCount,
  onClose,
  onRename,
  onDelete,
  onDeleteSelected,
  onExportCategory,
  onExportSelected,
  onMergeSelected,
  onDuplicate,
}: {
  x: number;
  y: number;
  collection: SteamCollection;
  multiExportMode: boolean;
  exportSelectedCount: number;
  onClose: () => void;
  onRename: (col: SteamCollection) => void;
  onDelete: (col: SteamCollection) => void;
  onDeleteSelected: () => void;
  onExportCategory: (col: SteamCollection) => void;
  onExportSelected: () => void;
  onMergeSelected: () => void;
  onDuplicate: (col: SteamCollection) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - (multiExportMode ? 230 : 200)),
    zIndex: 100,
  };

  if (multiExportMode) {
    return (
      <div
        ref={ref}
        style={style}
        className="min-w-[180px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <div className="border-b border-repressurizer-border px-3 py-2">
          <p className="truncate text-sm font-medium text-white">
            {t("sidebar.category.multiTitle", { count: exportSelectedCount })}
          </p>
        </div>
        <div className="py-1">
          <button
            onClick={() => onExportSelected()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-accent hover:bg-repressurizer-accent/10 transition-colors"
          >
            <Export size={14} weight="bold" />
            {t("sidebar.category.exportSelected", { count: exportSelectedCount })}
          </button>
          {exportSelectedCount >= 2 && (
            <button
              onClick={() => onMergeSelected()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
            >
              <ArrowsMerge size={14} className="text-repressurizer-text-muted" />
              {t("sidebar.category.merge")}
            </button>
          )}
          <button
            onClick={() => onDeleteSelected()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-danger hover:bg-repressurizer-danger/10 transition-colors"
          >
            <TrashSimple size={14} />
            {t("sidebar.category.deleteSelected")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[180px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="border-b border-repressurizer-border px-3 py-2">
        <p className="truncate text-sm font-medium text-white">
          {String(collection.name ?? "")}
        </p>
      </div>
      <div className="py-1">
        <button
          onClick={() => onExportCategory(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <Export size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.download")}
        </button>
        <button
          onClick={() => onDuplicate(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <CopySimple size={14} className="text-repressurizer-text-muted" />
          {t("sidebar.category.duplicate")}
        </button>
        <button
          onClick={() => onRename(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
        >
          <PencilSimple size={14} className="text-repressurizer-text-muted" />
          {t("category.rename")}
        </button>
        <button
          onClick={() => onDelete(collection)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-repressurizer-danger hover:bg-repressurizer-danger/10 transition-colors"
        >
          <TrashSimple size={14} />
          {t("category.delete")}
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  names,
  onConfirm,
  onCancel,
}: {
  names: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const isBatch = names.length > 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xs animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <p className="mb-1 text-sm font-medium text-white">
          {isBatch
            ? t("category.deleteSelectedConfirm", { count: names.length })
            : t("category.deleteConfirm")}
        </p>
        <p className="mb-5 text-sm text-repressurizer-text-muted leading-relaxed">
          {isBatch
            ? t("category.deleteSelectedDesc", { count: names.length })
            : t("category.deleteDesc", { name: names[0] ?? "" })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn-press rounded-lg px-3.5 py-1.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            {t("category.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="btn-press rounded-lg bg-repressurizer-danger px-3.5 py-1.5 text-sm text-white transition-colors hover:bg-repressurizer-danger/80"
          >
            {t("category.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
