import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGameStore } from "../../stores/gameStore";
import type { SortBy } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFailedGamesStore } from "../../stores/failedGamesStore";
import { useToastStore } from "../../stores/toastStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import { saveCollections } from "../../lib/tauri";
import { buildSavePreview, type SavePreview } from "../../lib/savePreview";
import { hasAdvancedFilters } from "../../lib/search";
import { useT, type TranslationKey } from "../../lib/i18n";
import { SettingsPage } from "../settings/SettingsPage";
import { ExportDialog } from "../export/ExportDialog";
import { AutoCategorizeDialog } from "../categories/AutoCategorizeDialog";
import { StatsPage } from "../stats/StatsPage";
import { AchievementsPage } from "../achievements/AchievementsPage";
import { SteamToolsPage } from "../steam-tools/SteamToolsPage";
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
  SteamLogo,
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

const SORT_OPTIONS: { value: SortBy; labelKey: TranslationKey; icon: React.ReactNode; hintKey?: TranslationKey }[] = [
  { value: "name",         labelKey: "sort.name",          icon: <TextAa size={12} /> },
  { value: "playtime",     labelKey: "sort.playtime",      icon: <Clock size={12} /> },
  { value: "lastPlayed",   labelKey: "sort.lastPlayed",    icon: <CalendarBlank size={12} /> },
  { value: "appid",        labelKey: "sort.newest",        icon: <Sparkle size={12} />, hintKey: "sort.hint.appid" },
  { value: "metacritic",   labelKey: "sort.metacritic",    icon: <Star size={12} />, hintKey: "sort.hint.metacritic" },
  { value: "hltb",         labelKey: "sort.hltb",          icon: <Hourglass size={12} />, hintKey: "sort.hint.hltb" },
  { value: "achievements", labelKey: "sort.achievements",  icon: <Trophy size={12} />, hintKey: "sort.hint.achievements" },
  { value: "status",       labelKey: "sort.status",        icon: <Tag size={12} /> },
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

  const games = useGameStore((s) => s.games);
  const gameCount = Object.keys(games).length;
  const cachedDetailsCount = useGameStore((s) => Object.keys(s.details).length);
  const ignoredCount = useFailedGamesStore((s) => s.ignoredIds().length);
  const collections = useCategoryStore((s) => s.collections);
  const savedCollections = useCategoryStore((s) => s._saved);
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
  const [showSteamTools, setShowSteamTools] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [showFriendCompare, setShowFriendCompare] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showSavePreview, setShowSavePreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const t = useT();
  const toast = useToastStore;

  useEffect(() => {
    if (exportOpenVersion > 0) setShowExport(true);
  }, [exportOpenVersion]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("repressurizer-open-settings-requested", () => setShowSettings(true))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  const savePreview = buildSavePreview(savedCollections, collections, games);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCollections(steamPath, steamId3, collections);
      markClean();
      setShowSavePreview(false);
      toast.getState().success(t("toast.saveSuccess"));
    } catch (e) {
      toast.getState().error(t("toast.saveFailed", { error: String(e) }));
    } finally {
      setSaving(false);
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
              title={t("header.gridView")}
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
              title={t("header.listView")}
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
                  {t(SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey ?? "sort.name")}
                </span>
                <CaretDown size={10} className={`text-repressurizer-text-faint transition-transform ${showSortMenu ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={toggleSortAsc}
                title={sortAsc ? t("header.sortAscending") : t("header.sortDescending")}
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
                      <span className="flex-1 text-left">{t(opt.labelKey)}</span>
                      {opt.hintKey && (
                        <span className="text-[10px] text-repressurizer-text-faint">{t(opt.hintKey)}</span>
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
                title={t("header.undo")}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpLeft size={16} />
              </button>
              <button
                onClick={redo}
                disabled={futureLen === 0}
                title={t("header.redo")}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpRight size={16} />
              </button>
              <button
                onClick={discardChanges}
                title={t("header.discard")}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-danger/70 transition-colors hover:text-repressurizer-danger hover:bg-repressurizer-danger/10"
              >
                <Trash size={16} />
              </button>
            </div>
          )}

          {/* Save */}
          <button
            onClick={() => dirty && setShowSavePreview(true)}
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
                {saving ? t("header.saving") : t("header.save")}
              </>
            ) : (
              <>
                <Check size={14} weight="bold" />
                {t("header.saved")}
              </>
            )}
          </button>

          {/* Auto-Categorize */}
          <button
            onClick={() => setShowAutoCat(true)}
            title={`${t("toolbar.autoCategorize")} - ${cachedDetailsCount}/${gameCount} ${t("settings.cache")}`}
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
            title={t("toolbar.achievements")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Trophy size={16} />
          </button>

          {/* Steam Tools */}
          <button
            onClick={() => setShowSteamTools(true)}
            title={t("toolbar.steamTools")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <SteamLogo size={16} />
          </button>

          {/* Wishlist */}
          <button
            onClick={() => setShowWishlist(true)}
            title={t("toolbar.wishlist")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <BookmarkSimple size={16} />
          </button>

          {/* Friend Compare */}
          <button
            onClick={() => setShowFriendCompare(true)}
            title={t("toolbar.friendCompare")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <UsersThree size={16} />
          </button>

          {/* What to Play Next */}
          <button
            onClick={() => setShowRecommend(true)}
            title={t("toolbar.recommend")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <GameController size={16} />
          </button>

          {/* Play History */}
          <button
            onClick={() => setShowTimeline(true)}
            title={t("toolbar.timeline")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <CalendarBlank size={16} />
          </button>

          {/* Stats */}
          <button
            onClick={() => setShowStats(true)}
            title={t("toolbar.stats")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <ChartBar size={16} />
          </button>

          {/* Export */}
          <button
            onClick={() => openExportDialog()}
            title={t("toolbar.export")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Export size={16} />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            title={t("toolbar.settings")}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <GearSix size={16} />
          </button>
        </div>
      </header>

      {showAchievements && <AchievementsPage onClose={() => setShowAchievements(false)} />}
      {showSteamTools && (
        <SteamToolsPage
          onClose={() => setShowSteamTools(false)}
          onOpenAchievements={() => {
            setShowSteamTools(false);
            setShowAchievements(true);
          }}
        />
      )}
      {showWishlist && <WishlistPage onClose={() => setShowWishlist(false)} />}
      {showFriendCompare && <FriendCompareDialog onClose={() => setShowFriendCompare(false)} />}
      {showStats && <StatsPage onClose={() => setShowStats(false)} />}
      {showAutoCat && <AutoCategorizeDialog onClose={() => setShowAutoCat(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showRecommend && <WhatToPlayNext onClose={() => setShowRecommend(false)} />}
      {showTimeline && <PlayHistoryTimeline onClose={() => setShowTimeline(false)} />}
      {showSavePreview && (
        <SavePreviewDialog
          preview={savePreview}
          saving={saving}
          onCancel={() => setShowSavePreview(false)}
          onConfirm={handleSave}
        />
      )}
    </>
  );
}

function SavePreviewDialog({
  preview,
  saving,
  onCancel,
  onConfirm,
}: {
  preview: SavePreview;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasDetails =
    preview.addedCollections.length > 0 ||
    preview.removedCollections.length > 0 ||
    preview.changedCollections.length > 0;
  const t = useT();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="border-b border-repressurizer-border px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight text-white">{t("savePreview.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
            {t("savePreview.desc")}
          </p>
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-auto p-5">
          <div className="grid grid-cols-4 gap-2">
            <PreviewMetric label={t("savePreview.newCollections")} value={preview.addedCollections.length} />
            <PreviewMetric label={t("savePreview.removed")} value={preview.removedCollections.length} danger />
            <PreviewMetric label={t("savePreview.gamesAdded")} value={preview.addedGamesCount} />
            <PreviewMetric label={t("savePreview.gamesRemoved")} value={preview.removedGamesCount} danger />
          </div>

          {!hasDetails && (
            <p className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-sm text-repressurizer-text-muted">
              {t("savePreview.noDiff")}
            </p>
          )}

          {preview.addedCollections.length > 0 && (
            <PreviewList title={t("savePreview.collectionsToAdd")} items={preview.addedCollections} />
          )}
          {preview.removedCollections.length > 0 && (
            <PreviewList title={t("savePreview.collectionsToRemove")} items={preview.removedCollections} danger />
          )}

          {preview.changedCollections.slice(0, 10).map((change) => (
            <div key={change.collection} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
              <p className="truncate text-sm font-medium text-white">{change.collection}</p>
              <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                <ChangeSample label={t("savePreview.add")} items={change.added} />
                <ChangeSample label={t("savePreview.remove")} items={change.removed} danger />
              </div>
            </div>
          ))}
          {preview.changedCollections.length > 10 && (
            <p className="text-xs text-repressurizer-text-faint">
              {t("savePreview.moreChanged", { count: preview.changedCollections.length - 10 })}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-repressurizer-border px-5 py-4">
          <button
            onClick={onCancel}
            disabled={saving}
            className="btn-press rounded-lg px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
          >
            {saving ? t("header.saving") : t("savePreview.createBackupAndSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
      <p className="truncate text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${danger ? "text-repressurizer-danger" : "text-repressurizer-accent"}`}>
        {value}
      </p>
    </div>
  );
}

function PreviewList({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
      <p className={`text-xs font-medium ${danger ? "text-repressurizer-danger" : "text-repressurizer-accent"}`}>{title}</p>
      <p className="mt-1 truncate text-sm text-repressurizer-text-muted" title={items.join(", ")}>
        {items.slice(0, 8).join(", ")}
        {items.length > 8 ? `, +${t("common.more", { count: items.length - 8 })}` : ""}
      </p>
    </div>
  );
}

function ChangeSample({ label, items, danger = false }: { label: string; items: string[]; danger?: boolean }) {
  const t = useT();
  if (items.length === 0) {
    return <p className="text-repressurizer-text-faint">{label}: {t("common.none")}</p>;
  }
  return (
    <p className={danger ? "text-repressurizer-danger/80" : "text-repressurizer-accent/90"} title={items.join(", ")}>
      {label}: {items.slice(0, 4).join(", ")}
      {items.length > 4 ? `, +${t("common.more", { count: items.length - 4 })}` : ""}
    </p>
  );
}
