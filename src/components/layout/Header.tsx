import { useState, useEffect, useRef } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SortBy } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFailedGamesStore } from "../../stores/failedGamesStore";
import { useToastStore } from "../../stores/toastStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import { saveCollections } from "../../lib/tauri";
import { hasAdvancedFilters } from "../../lib/search";
import { useT } from "../../lib/i18n";
import { SettingsPage } from "../settings/SettingsPage";
import { ExportDialog } from "../export/ExportDialog";
import { AutoCategorizeDialog } from "../categories/AutoCategorizeDialog";
import { StatsPage } from "../stats/StatsPage";
import { AchievementsPage } from "../achievements/AchievementsPage";
import { WishlistPage } from "../wishlist/WishlistPage";
import { FriendCompareDialog } from "../friends/FriendCompareDialog";
import { WhatToPlayNext } from "../recommend/WhatToPlayNext";
import { PlayHistoryTimeline } from "../timeline/PlayHistoryTimeline";
import {
  MagnifyingGlass,
  SquaresFour,
  List,
  SortAscending,
  SortDescending,
  ArrowUUpLeft,
  ArrowUUpRight,
  Trash,
  FloppyDisk,
  GearSix,
  Check,
  Export,
  Robot,
  ChartBar,
  Trophy,
  BookmarkSimple,
  UsersThree,
  GameController,
  CalendarBlank,
  CaretDown,
  Clock,
  Sparkle,
  Star,
  Hourglass,
  Tag,
  TextAa,
} from "@phosphor-icons/react";

const SORT_OPTIONS: { value: SortBy; label: string; icon: React.ReactNode; hint?: string }[] = [
  { value: "name",         label: "Name",          icon: <TextAa size={12} /> },
  { value: "playtime",     label: "Hours Played",  icon: <Clock size={12} /> },
  { value: "lastPlayed",   label: "Last Played",   icon: <CalendarBlank size={12} /> },
  { value: "appid",        label: "Newest",        icon: <Sparkle size={12} />, hint: "by App ID" },
  { value: "metacritic",   label: "Metacritic",    icon: <Star size={12} />, hint: "requires details" },
  { value: "hltb",         label: "HLTB Length",   icon: <Hourglass size={12} />, hint: "main story hours" },
  { value: "achievements", label: "Achievements",  icon: <Trophy size={12} />, hint: "completion %" },
  { value: "status",       label: "Status",        icon: <Tag size={12} /> },
];

export function Header() {
  const searchQuery = useGameStore((s) => s.searchQuery);
  const setSearchQuery = useGameStore((s) => s.setSearchQuery);
  const viewMode = useGameStore((s) => s.viewMode);
  const setViewMode = useGameStore((s) => s.setViewMode);
  const sortBy = useGameStore((s) => s.sortBy);
  const setSortBy = useGameStore((s) => s.setSortBy);
  const sortAsc = useGameStore((s) => s.sortAsc);
  const toggleSortAsc = useGameStore((s) => s.toggleSortAsc);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSortMenu]);

  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const cachedDetailsCount = useGameStore((s) => Object.keys(s.details).length);
  const ignoredCount = useFailedGamesStore((s) => s.ignoredIds().length);
  const collections = useCategoryStore((s) => s.collections);
  const dirty = useCategoryStore((s) => s.dirty);
  const markClean = useCategoryStore((s) => s.markClean);
  const undo = useCategoryStore((s) => s.undo);
  const redo = useCategoryStore((s) => s.redo);
  const discardChanges = useCategoryStore((s) => s.discardChanges);
  const historyLen = useCategoryStore((s) => s._history.length);
  const futureLen = useCategoryStore((s) => s._future.length);
  const { steamPath, steamId3 } = useSettingsStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const openExportDialog = useExportUiStore((s) => s.openExportDialog);
  const exportOpenVersion = useExportUiStore((s) => s.openVersion);
  const [showAutoCat, setShowAutoCat] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [showFriendCompare, setShowFriendCompare] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const t = useT();
  const toast = useToastStore;

  useEffect(() => {
    if (exportOpenVersion > 0) setShowExport(true);
  }, [exportOpenVersion]);

  const handleSave = async () => {
    try {
      await saveCollections(steamPath, steamId3, collections);
      markClean();
      toast.getState().success(t("toast.saveSuccess"));
    } catch (e) {
      toast.getState().error(t("toast.saveFailed", { error: String(e) }));
    }
  };

  return (
    <>
      <header className="relative z-30 flex items-center gap-3 border-b border-repressurizer-border-subtle bg-repressurizer-surface/80 px-4 py-2 backdrop-blur-sm">
        {/* Logo */}
        <h1 className="text-base font-semibold tracking-tight text-white select-none">
          Repressurizer
        </h1>

        {/* Search */}
        <div className="relative flex-1 max-w-md group">
          <MagnifyingGlass
            size={15}
            weight="bold"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none"
          />
          <input
            type="text"
            data-search-input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("header.search")}
            className={`w-full rounded-lg border bg-repressurizer-bg pl-9 pr-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none ${
              hasAdvancedFilters(searchQuery) ? "border-repressurizer-accent/50" : "border-repressurizer-border"
            }`}
          />
          {!searchQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-repressurizer-text-faint opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none">
              {t("search.advanced.hint")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <div className="flex rounded-lg border border-repressurizer-border overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={`btn-press flex items-center justify-center w-8 h-8 transition-colors ${
                viewMode === "grid"
                  ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                  : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
              }`}
            >
              <SquaresFour size={16} weight={viewMode === "grid" ? "fill" : "regular"} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`btn-press flex items-center justify-center w-8 h-8 border-l border-repressurizer-border transition-colors ${
                viewMode === "list"
                  ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                  : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
              }`}
            >
              <List size={16} weight={viewMode === "list" ? "bold" : "regular"} />
            </button>
          </div>

          {/* Sort */}
          <div className="relative" ref={sortMenuRef}>
            <div className="flex rounded-lg border border-repressurizer-border overflow-hidden">
              <button
                onClick={() => setShowSortMenu((v) => !v)}
                className="h-8 flex items-center gap-1.5 pl-2.5 pr-2 text-xs text-repressurizer-text hover:bg-repressurizer-surface-hover transition-colors"
              >
                <span className="text-repressurizer-text-faint">
                  {SORT_OPTIONS.find((o) => o.value === sortBy)?.icon}
                </span>
                <span className="max-w-[80px] truncate">
                  {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                </span>
                <CaretDown size={10} className={`text-repressurizer-text-faint transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={toggleSortAsc}
                title={sortAsc ? "Ascending" : "Descending"}
                className="btn-press flex items-center justify-center w-8 h-8 border-l border-repressurizer-border text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
              >
                {sortAsc ? <SortAscending size={16} /> : <SortDescending size={16} />}
              </button>
            </div>

            {showSortMenu && (
              <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[200px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <div className="p-1.5">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        sortBy === opt.value
                          ? "bg-repressurizer-accent/10 text-repressurizer-accent"
                          : "text-repressurizer-text hover:bg-repressurizer-surface-hover"
                      }`}
                    >
                      <span className={sortBy === opt.value ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}>
                        {opt.icon}
                      </span>
                      <span className="flex-1 text-left">{opt.label}</span>
                      {opt.hint && (
                        <span className="text-[10px] text-repressurizer-text-faint">{opt.hint}</span>
                      )}
                      {sortBy === opt.value && <Check size={11} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="mx-1 h-5 w-px bg-repressurizer-border" />

          {/* Undo / Redo / Discard */}
          {dirty && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={historyLen === 0}
                title="Undo (Ctrl+Z)"
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpLeft size={16} />
              </button>
              <button
                onClick={redo}
                disabled={futureLen === 0}
                title="Redo (Ctrl+Y)"
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpRight size={16} />
              </button>
              <button
                onClick={discardChanges}
                title="Discard all changes"
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-danger/70 transition-colors hover:text-repressurizer-danger hover:bg-repressurizer-danger/10"
              >
                <Trash size={16} />
              </button>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!dirty}
            className={`btn-press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
              dirty
                ? "bg-repressurizer-accent text-white shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:bg-repressurizer-accent-hover"
                : "bg-repressurizer-surface-hover text-repressurizer-text-faint"
            }`}
          >
            {dirty ? (
              <>
                <FloppyDisk size={14} weight="bold" />
                Save
              </>
            ) : (
              <>
                <Check size={14} weight="bold" />
                Saved
              </>
            )}
          </button>

          {/* Auto-Categorize */}
          <button
            onClick={() => setShowAutoCat(true)}
            title={`Auto-Categorize — ${cachedDetailsCount}/${gameCount} details cached`}
            className="btn-press relative flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Robot size={16} />
            {cachedDetailsCount + ignoredCount < gameCount && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black leading-none">
                !
              </span>
            )}
          </button>

          {/* Achievements */}
          <button
            onClick={() => setShowAchievements(true)}
            title="Achievements"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Trophy size={16} />
          </button>

          {/* Wishlist */}
          <button
            onClick={() => setShowWishlist(true)}
            title="Wishlist"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <BookmarkSimple size={16} />
          </button>

          {/* Friend Compare */}
          <button
            onClick={() => setShowFriendCompare(true)}
            title="Friend Comparison"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <UsersThree size={16} />
          </button>

          {/* What to Play Next */}
          <button
            onClick={() => setShowRecommend(true)}
            title="What to Play Next"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <GameController size={16} />
          </button>

          {/* Play History */}
          <button
            onClick={() => setShowTimeline(true)}
            title="Play History Timeline"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <CalendarBlank size={16} />
          </button>

          {/* Stats */}
          <button
            onClick={() => setShowStats(true)}
            title="Statistics"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <ChartBar size={16} />
          </button>

          {/* Export */}
          <button
            onClick={() => openExportDialog()}
            title="Export"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Export size={16} />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <GearSix size={16} />
          </button>
        </div>
      </header>

      {showAchievements && <AchievementsPage onClose={() => setShowAchievements(false)} />}
      {showWishlist && <WishlistPage onClose={() => setShowWishlist(false)} />}
      {showFriendCompare && <FriendCompareDialog onClose={() => setShowFriendCompare(false)} />}
      {showStats && <StatsPage onClose={() => setShowStats(false)} />}
      {showAutoCat && <AutoCategorizeDialog onClose={() => setShowAutoCat(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showRecommend && <WhatToPlayNext onClose={() => setShowRecommend(false)} />}
      {showTimeline && <PlayHistoryTimeline onClose={() => setShowTimeline(false)} />}
    </>
  );
}
