import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { scopedListener } from "../../lib/asyncListener";
import { captureCollectionOperation, isCurrentProfile, acceptSavedCollections, type CollectionOperation } from "../../lib/collectionOperations";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SortBy } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFailedGamesStore } from "../../stores/failedGamesStore";
import { useToastStore } from "../../stores/toastStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import { useLibraryInboxStore } from "../../stores/libraryInboxStore";
import { isSteamRunning, loadCollections, saveCollections, saveShortcuts } from "../../lib/tauri";
import { analyzeThreeWayCollectionMerge, type ThreeWayMergeAnalysis } from "../../lib/collectionConflictResolver";
import { buildSavePreview, type SavePreview } from "../../lib/savePreview";
import { hasAdvancedFilters } from "../../lib/search";
import { useT, type TranslationKey } from "../../lib/i18n";
import { type ToolbarToolId } from "../../lib/toolbarTools";
import { DialogOverlay } from "../ui/DialogOverlay";
import { Tooltip } from "../ui/Tooltip";
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
  ArrowClockwise,
  Sparkle,
  Star,
  Hourglass,
  Tag,
  TextAa,
  Warning,
  ChartLineUp,
  CurrencyDollar,
  Spinner,
  DotsThree,
  BellSimple,
  ClockCounterClockwise,
  UserCircle,
  HardDrives,
  Backpack,
  Package,
  Pulse,
} from "@phosphor-icons/react";

const loadSettingsPage = () => import("../settings/SettingsPage").then((m) => ({ default: m.SettingsPage }));
const loadExportDialog = () => import("../export/ExportDialog").then((m) => ({ default: m.ExportDialog }));
const loadAutoCategorizeDialog = () => import("../categories/auto-categorize/AutoCategorizeDialog").then((m) => ({ default: m.AutoCategorizeDialog }));
const loadStatsPage = () => import("../stats/StatsPage").then((m) => ({ default: m.StatsPage }));
const loadAchievementsPage = () => import("../achievements/AchievementsPage").then((m) => ({ default: m.AchievementsPage }));
const loadWishlistPage = () => import("../wishlist/WishlistPage").then((m) => ({ default: m.WishlistPage }));
const loadFriendCompareDialog = () => import("../friends/FriendCompareDialog").then((m) => ({ default: m.FriendCompareDialog }));
const loadWhatToPlayNext = () => import("../recommend/SessionPlanner").then((m) => ({ default: m.SessionPlanner }));
const loadPlayHistoryTimeline = () => import("../timeline/PlayHistoryTimeline").then((m) => ({ default: m.PlayHistoryTimeline }));
const loadLibraryChangesInbox = () => import("../inbox/LibraryChangesInbox").then((m) => ({ default: m.LibraryChangesInbox }));
const loadCollectionTimeMachine = () => import("../collections/CollectionTimeMachine").then((m) => ({ default: m.CollectionTimeMachine }));
const loadCollectionConflictResolver = () => import("../collections/CollectionConflictResolver").then((m) => ({ default: m.CollectionConflictResolver }));
const loadProfileManager = () => import("../profiles/ProfileManager").then((m) => ({ default: m.ProfileManager }));
const loadStoragePlanner = () => import("../storage/StoragePlanner").then((m) => ({ default: m.StoragePlanner }));
const loadPackMyDeck = () => import("../storage/PackMyDeck").then((m) => ({ default: m.PackMyDeck }));
const loadCommunityRulePacks = () => import("../community/CommunityRulePacks").then((m) => ({ default: m.CommunityRulePacks }));
const loadMetadataHealth = () => import("../metadata/MetadataHealthCenter").then((m) => ({ default: m.MetadataHealthCenter }));
const SettingsPage = lazy(loadSettingsPage);
const ExportDialog = lazy(loadExportDialog);
const AutoCategorizeDialog = lazy(loadAutoCategorizeDialog);
const StatsPage = lazy(loadStatsPage);
const AchievementsPage = lazy(loadAchievementsPage);
const WishlistPage = lazy(loadWishlistPage);
const FriendCompareDialog = lazy(loadFriendCompareDialog);
const WhatToPlayNext = lazy(loadWhatToPlayNext);
const PlayHistoryTimeline = lazy(loadPlayHistoryTimeline);
const LibraryChangesInbox = lazy(loadLibraryChangesInbox);
const CollectionTimeMachine = lazy(loadCollectionTimeMachine);
const CollectionConflictResolver = lazy(loadCollectionConflictResolver);
const ProfileManager = lazy(loadProfileManager);
const StoragePlanner = lazy(loadStoragePlanner);
const PackMyDeck = lazy(loadPackMyDeck);
const CommunityRulePacks = lazy(loadCommunityRulePacks);
const MetadataHealthCenter = lazy(loadMetadataHealth);
const preload = (loader: () => Promise<unknown>) => { void loader().catch(() => {}); };

function LazyOverlay({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />}>
      {children}
    </Suspense>
  );
}

function ToolbarIconButton({
  label,
  shortcut,
  wrapperClassName = "",
  className = "",
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  shortcut?: string;
  wrapperClassName?: string;
}) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <Tooltip content={tooltip} className={wrapperClassName || "inline-flex"}>
      <button {...props} aria-label={label} className={className}>
        {children}
      </button>
    </Tooltip>
  );
}

const SORT_OPTIONS: { value: SortBy; labelKey: TranslationKey; icon: React.ReactNode; hintKey?: TranslationKey }[] = [
  { value: "name",         labelKey: "sort.name",          icon: <TextAa size={12} /> },
  { value: "playtime",     labelKey: "sort.playtime",      icon: <Clock size={12} /> },
  { value: "lastPlayed",   labelKey: "sort.lastPlayed",    icon: <CalendarBlank size={12} /> },
  { value: "appid",        labelKey: "sort.newest",        icon: <Sparkle size={12} />, hintKey: "sort.hint.appid" },
  { value: "metacritic",   labelKey: "sort.metacritic",    icon: <Star size={12} />, hintKey: "sort.hint.metacritic" },
  { value: "steamReviews", labelKey: "sort.steamReviews",  icon: <ChartLineUp size={12} />, hintKey: "sort.hint.steamReviews" },
  { value: "reviewCount",  labelKey: "sort.reviewCount",   icon: <ChartBar size={12} />, hintKey: "sort.hint.reviewCount" },
  { value: "hltb",         labelKey: "sort.hltb",          icon: <Hourglass size={12} />, hintKey: "sort.hint.hltb" },
  { value: "achievements", labelKey: "sort.achievements",  icon: <Trophy size={12} />, hintKey: "sort.hint.achievements" },
  { value: "releaseDate",  labelKey: "sort.releaseDate",   icon: <CalendarBlank size={12} />, hintKey: "sort.hint.releaseDate" },
  { value: "price",        labelKey: "sort.price",         icon: <CurrencyDollar size={12} />, hintKey: "sort.hint.price" },
  { value: "userRating",   labelKey: "sort.userRating",    icon: <GameController size={12} />, hintKey: "sort.hint.userRating" },
  { value: "status",       labelKey: "sort.status",        icon: <Tag size={12} /> },
];

interface HeaderProps {
  refreshingLibrary: boolean;
  onRefreshLibrary: () => void;
}

export function Header({ refreshingLibrary, onRefreshLibrary }: HeaderProps) {
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
  const details = useGameStore((s) => s.details);
  const cachedDetailsCount = Object.keys(details).length;
  const ignoredCount = useFailedGamesStore((s) => s.ignoredIds().length);
  const collections = useCategoryStore((s) => s.collections);
  const setActiveCategory = useCategoryStore((s) => s.setActiveCategory);
  const savedCollections = useCategoryStore((s) => s._saved);
  const dirty = useCategoryStore((s) => s.dirty);
  const undo = useCategoryStore((s) => s.undo);
  const redo = useCategoryStore((s) => s.redo);
  const discardChanges = useCategoryStore((s) => s.discardChanges);
  const historyLen = useCategoryStore((s) => s._history.length);
  const futureLen = useCategoryStore((s) => s._future.length);
  const { steamPath, steamId3, toolbarToolOrder, toolbarPinnedToolIds, toolbarHiddenToolIds, toolbarVisibleCount, setSettings } = useSettingsStore(useShallow((s) => ({
    steamPath: s.steamPath, steamId3: s.steamId3, toolbarToolOrder: s.toolbarToolOrder,
    toolbarPinnedToolIds: s.toolbarPinnedToolIds, toolbarHiddenToolIds: s.toolbarHiddenToolIds,
    toolbarVisibleCount: s.toolbarVisibleCount, setSettings: s.setSettings,
  })));

  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const openExportDialog = useExportUiStore((s) => s.openExportDialog);
  const exportOpenVersion = useExportUiStore((s) => s.openVersion);
  const [showAutoCat, setShowAutoCat] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [achievementsView, setAchievementsView] = useState<"manager" | "hunter">("manager");
    const [showWishlist, setShowWishlist] = useState(false);
  const [showFriendCompare, setShowFriendCompare] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showTimeMachine, setShowTimeMachine] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<ThreeWayMergeAnalysis | null>(null);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [showDeckPack, setShowDeckPack] = useState(false);
  const [showCommunityPacks, setShowCommunityPacks] = useState(false);
  const [showMetadataHealth, setShowMetadataHealth] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [toolbarContextKey, setToolbarContextKey] = useState<ToolbarToolId | null>(null);
  const [showSavePreview, setShowSavePreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const saveOperationRef = useRef<CollectionOperation | null>(null);
  const [steamRunningForSave, setSteamRunningForSave] = useState<boolean | null>(null);
  const moreToolsRef = useRef<HTMLDivElement>(null);

  const t = useT();
  const toast = useToastStore;
  const inboxEvents = useLibraryInboxStore((state) => state.events);
  const inboxUnread = inboxEvents.filter((event) => event.status === "unread" || (event.status === "snoozed" && (event.snoozedUntil ?? 0) <= Date.now())).length;

  const secondaryTools = [
    { key: "inbox", label: t("toolbar.inbox"), Icon: BellSimple, open: () => setShowInbox(true), loader: loadLibraryChangesInbox, badge: inboxUnread },
    { key: "time-machine", label: t("toolbar.timeMachine"), Icon: ClockCounterClockwise, open: () => setShowTimeMachine(true), loader: loadCollectionTimeMachine, badge: 0 },
    { key: "profiles", label: t("toolbar.profiles"), Icon: UserCircle, open: () => setShowProfiles(true), loader: loadProfileManager, badge: 0 },
    { key: "storage", label: t("toolbar.storage"), Icon: HardDrives, open: () => setShowStorage(true), loader: loadStoragePlanner, badge: 0 },
    { key: "deck-pack", label: t("toolbar.deckPack"), Icon: Backpack, open: () => setShowDeckPack(true), loader: loadPackMyDeck, badge: 0 },
    { key: "community-packs", label: t("toolbar.communityPacks"), Icon: Package, open: () => setShowCommunityPacks(true), loader: loadCommunityRulePacks, badge: 0 },
    { key: "metadata-health", label: t("toolbar.metadataHealth"), Icon: Pulse, open: () => setShowMetadataHealth(true), loader: loadMetadataHealth, badge: 0 },
    { key: "achievements", label: t("toolbar.achievements"), Icon: Trophy, open: () => { setAchievementsView("manager"); setShowAchievements(true); }, loader: loadAchievementsPage, badge: 0 },
    { key: "wishlist", label: t("toolbar.wishlist"), Icon: BookmarkSimple, open: () => setShowWishlist(true), loader: loadWishlistPage, badge: 0 },
    { key: "friends", label: t("toolbar.friendCompare"), Icon: UsersThree, open: () => setShowFriendCompare(true), loader: loadFriendCompareDialog, badge: 0 },
    { key: "recommend", label: t("toolbar.recommend"), Icon: GameController, open: () => setShowRecommend(true), loader: loadWhatToPlayNext, badge: 0 },
    { key: "timeline", label: t("toolbar.timeline"), Icon: CalendarBlank, open: () => setShowTimeline(true), loader: loadPlayHistoryTimeline, badge: 0 },
    { key: "stats", label: t("toolbar.stats"), Icon: ChartBar, open: () => setShowStats(true), loader: loadStatsPage, badge: 0 },
    { key: "export", label: t("toolbar.export"), Icon: Export, open: () => openExportDialog(), loader: loadExportDialog, badge: 0 },
  ];
  const hiddenToolKeys = new Set(toolbarHiddenToolIds);
  const toolsByKey = new Map(secondaryTools.map((tool) => [tool.key, tool]));
  const orderedTools = toolbarToolOrder.flatMap((key) => {
    const tool = toolsByKey.get(key);
    return tool && !hiddenToolKeys.has(key) ? [tool] : [];
  });
  const pinnedKeySet = new Set(toolbarPinnedToolIds);
  const pinnedTools = orderedTools.filter((tool) => pinnedKeySet.has(tool.key)).slice(0, toolbarVisibleCount);
  const visiblePinnedKeys = new Set(pinnedTools.map((tool) => tool.key));
  const configureTool = (key: ToolbarToolId, action: "pin" | "hide") => {
    if (action === "hide") {
      setSettings({
        toolbarHiddenToolIds: [...new Set([...toolbarHiddenToolIds, key])],
        toolbarPinnedToolIds: toolbarPinnedToolIds.filter((id) => id !== key),
      });
    }
    else setSettings({ toolbarPinnedToolIds: pinnedKeySet.has(key) ? toolbarPinnedToolIds.filter((id) => id !== key) : [...toolbarPinnedToolIds, key] });
    setToolbarContextKey(null);
  };

  useEffect(() => {
    if (exportOpenVersion > 0) setShowExport(true);
  }, [exportOpenVersion]);

  useEffect(() => {
    if (!showMoreTools && !toolbarContextKey) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!moreToolsRef.current?.contains(event.target as Node)) { setShowMoreTools(false); setToolbarContextKey(null); }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setShowMoreTools(false); setToolbarContextKey(null); }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMoreTools, toolbarContextKey]);

  useEffect(() => scopedListener("repressurizer-open-settings-requested", () => setShowSettings(true)), []);

  useEffect(() => {
    const onOpenTool = (event: Event) => {
      switch ((event as CustomEvent<string>).detail) {
        case "settings":
          setShowSettings(true);
          break;
        case "export":
          setShowExport(true);
          break;
        case "stats":
          setShowStats(true);
          break;
        case "hunter":
          setAchievementsView("hunter");
          setShowAchievements(true);
          break;
        case "achievements":
          setAchievementsView("manager");
          setShowAchievements(true);
          break;
        case "wishlist":
          setShowWishlist(true);
          break;
        case "recommend":
          setShowRecommend(true);
          break;
        case "profiles":
          setShowProfiles(true);
          break;
        case "storage":
          setShowStorage(true);
          break;
        case "deck-pack":
          setShowDeckPack(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener("repressurizer-open-tool", onOpenTool);
    return () => window.removeEventListener("repressurizer-open-tool", onOpenTool);
  }, []);

  useEffect(() => {
    if (!showSavePreview) {
      setSteamRunningForSave(null);
      return;
    }

    let cancelled = false;
    setSteamRunningForSave(null);
    isSteamRunning()
      .then((running) => {
        if (!cancelled) setSteamRunningForSave(running);
      })
      .catch(() => {
        if (!cancelled) setSteamRunningForSave(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showSavePreview]);

  const savePreview = useMemo(() => showSavePreview ? buildSavePreview(savedCollections, collections, games, details) : null,
    [showSavePreview, savedCollections, collections, games, details]);

  const writeResolvedCollections = async (resolvedCollections: typeof collections) => {
    const operation = saveOperationRef.current;
    if (!operation) throw new Error("Save context is missing. Open the save preview again.");
    if (await isSteamRunning()) throw new Error(t("savePreview.steamRunning.desc"));
    const current = useCategoryStore.getState();
    if (!isCurrentProfile(operation) || current._saved !== operation.saved || current.collections !== operation.collections) {
      throw new Error("The library changed during save preparation. Review the current changes and retry.");
    }
    await saveCollections(steamPath, steamId3, resolvedCollections);
    try {
      const shortcutUpdates = await saveShortcuts(steamPath, steamId3, resolvedCollections);
      if (shortcutUpdates > 0) toast.getState().info(`Updated ${shortcutUpdates} non-Steam shortcuts.`);
    } catch (shortcutError) {
      toast.getState().warning(`Collections saved, but shortcuts.vdf update failed: ${String(shortcutError)}`);
    }
    const accepted = acceptSavedCollections(operation, resolvedCollections, pendingConflict ? "sync" : "manual");
    if (accepted) useLibraryInboxStore.getState().recordCollectionsBaseline(resolvedCollections);
    setShowSavePreview(false);
    setPendingConflict(null);
    toast.getState().success(t("toast.saveSuccess"));
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const operation = captureCollectionOperation();
    saveOperationRef.current = operation;
    setSaving(true);
    try {
      if (await isSteamRunning()) throw new Error(t("savePreview.steamRunning.desc"));
      const currentSteamCollections = await loadCollections(steamPath, steamId3);
      const current = useCategoryStore.getState();
      if (!isCurrentProfile(operation) || current.collections !== operation.collections || current._saved !== operation.saved) {
        throw new Error("The library changed during save preparation. Review the current changes and retry.");
      }
      const analysis = analyzeThreeWayCollectionMerge({ base: operation.saved, steam: currentSteamCollections, proposed: operation.collections });
      if (analysis.steamChanged) {
        setPendingConflict(analysis);
        setShowSavePreview(false);
        return;
      }
      await writeResolvedCollections(analysis.autoMerged);
    } catch (e) {
      toast.getState().error(t("toast.saveFailed", { error: String(e) }));
    } finally {
      savingRef.current = false;
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
        <form
          role="search"
          className="group relative min-w-0 max-w-md flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchQuery.trim()) setActiveCategory("all");
          }}
        >
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
        </form>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* View toggle */}
          <div className="hidden rounded-lg border border-repressurizer-border overflow-hidden min-[720px]:flex">
            <ToolbarIconButton
              label={t("header.gridView")}
              onClick={() => setViewMode("grid")}
              className={`btn-press flex items-center justify-center w-8 h-8 transition-colors ${
                viewMode === "grid"
                  ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                  : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
              }`}
            >
              <SquaresFour size={16} weight={viewMode === "grid" ? "fill" : "regular"} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={t("header.listView")}
              onClick={() => setViewMode("list")}
              className={`btn-press flex items-center justify-center w-8 h-8 border-l border-repressurizer-border transition-colors ${
                viewMode === "list"
                  ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                  : "text-repressurizer-text-muted hover:text-white hover:bg-repressurizer-surface-hover"
              }`}
            >
              <List size={16} weight={viewMode === "list" ? "bold" : "regular"} />
            </ToolbarIconButton>
          </div>

          {/* Sort */}
          <div className="relative hidden min-[720px]:block" ref={sortMenuRef}>
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
              <ToolbarIconButton
                label={sortAsc ? t("header.sortAscending") : t("header.sortDescending")}
                onClick={toggleSortAsc}
                className="btn-press flex items-center justify-center w-8 h-8 border-l border-repressurizer-border text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
              >
                {sortAsc ? <SortAscending size={16} /> : <SortDescending size={16} />}
              </ToolbarIconButton>
            </div>

            {showSortMenu && (
              <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[200px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-pop">
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
          <div className="mx-1 hidden h-5 w-px bg-repressurizer-border min-[720px]:block" />

          {/* Undo / Redo / Discard */}
          {dirty && (
            <div className="flex items-center gap-0.5">
              <ToolbarIconButton
                label={t("header.undo")}
                shortcut="Ctrl+Z"
                onClick={undo}
                disabled={historyLen === 0}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpLeft size={16} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label={t("header.redo")}
                shortcut="Ctrl+Shift+Z"
                onClick={redo}
                disabled={futureLen === 0}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover disabled:opacity-25 disabled:hover:text-repressurizer-text-muted disabled:hover:bg-transparent"
              >
                <ArrowUUpRight size={16} />
              </ToolbarIconButton>
              <ToolbarIconButton
                label={t("header.discard")}
                onClick={discardChanges}
                className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-danger/70 transition-colors hover:text-repressurizer-danger hover:bg-repressurizer-danger/10"
              >
                <Trash size={16} />
              </ToolbarIconButton>
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

          {/* Refresh Steam library */}
          <ToolbarIconButton
            label={t("toolbar.refreshLibrary")}
            type="button"
            onClick={onRefreshLibrary}
            disabled={refreshingLibrary}
            className={`btn-press flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              refreshingLibrary
                ? "bg-repressurizer-accent/10 text-repressurizer-accent"
                : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"
            } disabled:cursor-wait`}
          >
            {refreshingLibrary ? (
              <Spinner size={16} className="animate-spin" />
            ) : (
              <ArrowClockwise size={16} />
            )}
          </ToolbarIconButton>

          {/* Auto-Categorize */}
          <ToolbarIconButton
            label={`${t("toolbar.autoCategorize")} - ${cachedDetailsCount}/${gameCount} ${t("settings.cache")}`}
            wrapperClassName="hidden min-[960px]:inline-flex"
            onClick={() => setShowAutoCat(true)}
            onPointerEnter={() => preload(loadAutoCategorizeDialog)}
            onFocus={() => preload(loadAutoCategorizeDialog)}
            className="btn-press relative flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <Robot size={16} />
            {cachedDetailsCount + ignoredCount < gameCount && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black leading-none">
                !
              </span>
            )}
          </ToolbarIconButton>

          {pinnedTools.map(({ key, label, Icon, open, loader, badge }) => (
            <ToolbarIconButton
              key={key}
              label={label}
              wrapperClassName="hidden min-[1120px]:inline-flex"
              onClick={open}
              onContextMenu={(event) => { event.preventDefault(); setShowMoreTools(false); setToolbarContextKey(key as ToolbarToolId); }}
              onPointerEnter={() => preload(loader)}
              onFocus={() => preload(loader)}
              className="btn-press relative flex h-8 w-8 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              <Icon size={16} />
              {badge > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-repressurizer-danger px-1 text-[8px] font-bold leading-4 text-white">{badge > 99 ? "99+" : badge}</span>}
            </ToolbarIconButton>
          ))}

          <div ref={moreToolsRef} className="relative">
            <ToolbarIconButton
              label={t("toolbar.more")}
              type="button"
              onClick={() => { setToolbarContextKey(null); setShowMoreTools((open) => !open); }}
              aria-haspopup="menu"
              aria-expanded={showMoreTools}
              className="btn-press flex h-8 w-8 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              <DotsThree size={18} weight="bold" />
            </ToolbarIconButton>
            {showMoreTools && (
              <div
                role="menu"
                aria-label={t("toolbar.more")}
                className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-repressurizer-border bg-repressurizer-surface p-1.5 shadow-pop"
              >
                {orderedTools.map(({ key, label, Icon, open, loader, badge }) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowMoreTools(false);
                      open();
                    }}
                    onPointerEnter={() => preload(loader)}
                    onFocus={() => preload(loader)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover focus:bg-repressurizer-surface-hover focus:outline-none ${visiblePinnedKeys.has(key) ? "min-[1120px]:hidden" : ""}`}
                  >
                    <Icon size={15} className="text-repressurizer-text-muted" />
                    <span className="min-w-0 flex-1">{label}</span>
                    {badge > 0 && <span className="rounded-full bg-repressurizer-danger/15 px-1.5 font-mono text-[9px] text-repressurizer-danger">{badge}</span>}
                  </button>
                ))}
                <div className="my-1 border-t border-repressurizer-border-subtle min-[960px]:hidden" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreTools(false);
                    setShowAutoCat(true);
                  }}
                  onPointerEnter={() => preload(loadAutoCategorizeDialog)}
                  onFocus={() => preload(loadAutoCategorizeDialog)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover focus:bg-repressurizer-surface-hover focus:outline-none min-[960px]:hidden"
                >
                  <Robot size={15} className="text-repressurizer-text-muted" />
                  <span className="min-w-0 flex-1">{t("toolbar.autoCategorize")}</span>
                  <span className="font-mono text-[10px] text-repressurizer-text-faint tabular-nums">
                    {cachedDetailsCount}/{gameCount}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMoreTools(false);
                    setShowSettings(true);
                  }}
                  onPointerEnter={() => preload(loadSettingsPage)}
                  onFocus={() => preload(loadSettingsPage)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover focus:bg-repressurizer-surface-hover focus:outline-none min-[960px]:hidden"
                >
                  <GearSix size={15} className="text-repressurizer-text-muted" />
                  {t("toolbar.settings")}
                </button>
              </div>
            )}
            {toolbarContextKey && <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-repressurizer-border bg-repressurizer-surface p-1.5 shadow-pop"><button type="button" role="menuitem" onClick={() => configureTool(toolbarContextKey, "pin")} className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white">{t(pinnedKeySet.has(toolbarContextKey) ? "settings.toolbar.inMore" : "settings.toolbar.pinned")}</button><button type="button" role="menuitem" onClick={() => configureTool(toolbarContextKey, "hide")} className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white">{t("settings.toolbar.hidden")}</button></div>}
          </div>

          {/* Settings */}
          <ToolbarIconButton
            label={t("toolbar.settings")}
            wrapperClassName="hidden min-[960px]:inline-flex"
            onClick={() => setShowSettings(true)}
            onPointerEnter={() => preload(loadSettingsPage)}
            onFocus={() => preload(loadSettingsPage)}
            className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <GearSix size={16} />
          </ToolbarIconButton>
        </div>
      </header>

      {showAchievements && (
        <LazyOverlay>
          <AchievementsPage onClose={() => setShowAchievements(false)} initialView={achievementsView} />
        </LazyOverlay>
      )}
      {showWishlist && (
        <LazyOverlay>
          <WishlistPage onClose={() => setShowWishlist(false)} />
        </LazyOverlay>
      )}
      {showFriendCompare && (
        <LazyOverlay>
          <FriendCompareDialog onClose={() => setShowFriendCompare(false)} />
        </LazyOverlay>
      )}
      {showStats && (
        <LazyOverlay>
          <StatsPage onClose={() => setShowStats(false)} />
        </LazyOverlay>
      )}
      {showAutoCat && (
        <LazyOverlay>
          <AutoCategorizeDialog onClose={() => setShowAutoCat(false)} />
        </LazyOverlay>
      )}
      {showExport && (
        <LazyOverlay>
          <ExportDialog onClose={() => setShowExport(false)} />
        </LazyOverlay>
      )}
      {showSettings && (
        <LazyOverlay>
          <SettingsPage onClose={() => setShowSettings(false)} />
        </LazyOverlay>
      )}
      {showRecommend && (
        <LazyOverlay>
          <WhatToPlayNext onClose={() => setShowRecommend(false)} />
        </LazyOverlay>
      )}
      {showTimeline && (
        <LazyOverlay>
          <PlayHistoryTimeline onClose={() => setShowTimeline(false)} />
        </LazyOverlay>
      )}
      {showInbox && (
        <LazyOverlay>
          <LibraryChangesInbox
            onClose={() => setShowInbox(false)}
            onOpenAutoCat={() => setShowAutoCat(true)}
            onRefresh={onRefreshLibrary}
          />
        </LazyOverlay>
      )}
      {showTimeMachine && (
        <LazyOverlay>
          <CollectionTimeMachine onClose={() => setShowTimeMachine(false)} />
        </LazyOverlay>
      )}
      {showProfiles && (
        <LazyOverlay>
          <ProfileManager onClose={() => setShowProfiles(false)} />
        </LazyOverlay>
      )}
      {showStorage && (
        <LazyOverlay>
          <StoragePlanner onClose={() => setShowStorage(false)} />
        </LazyOverlay>
      )}
      {showDeckPack && (
        <LazyOverlay>
          <PackMyDeck onClose={() => setShowDeckPack(false)} />
        </LazyOverlay>
      )}
      {showCommunityPacks && (
        <LazyOverlay>
          <CommunityRulePacks onClose={() => setShowCommunityPacks(false)} />
        </LazyOverlay>
      )}
      {showMetadataHealth && (
        <LazyOverlay>
          <MetadataHealthCenter onClose={() => setShowMetadataHealth(false)} onRefreshLibrary={onRefreshLibrary} />
        </LazyOverlay>
      )}
      {pendingConflict && (
        <LazyOverlay>
          <CollectionConflictResolver
            analysis={pendingConflict}
            onCancel={() => setPendingConflict(null)}
            onConfirm={async (resolvedCollections) => {
              if (savingRef.current) return;
              savingRef.current = true;
              setSaving(true);
              try { await writeResolvedCollections(resolvedCollections); }
              catch (error) { toast.getState().error(t("toast.saveFailed", { error: String(error) })); throw error; }
              finally { savingRef.current = false; setSaving(false); }
            }}
          />
        </LazyOverlay>
      )}
      {showSavePreview && savePreview && (
        <SavePreviewDialog
          preview={savePreview}
          saving={saving}
          steamRunning={steamRunningForSave === true}
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
  steamRunning,
  onCancel,
  onConfirm,
}: {
  preview: SavePreview;
  saving: boolean;
  steamRunning: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [showAllChanges, setShowAllChanges] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const hasDetails =
    preview.addedCollections.length > 0 ||
    preview.removedCollections.length > 0 ||
    preview.changedCollections.length > 0;
  const t = useT();

  return (
    <DialogOverlay
      label={t("savePreview.title")}
      onClose={onCancel}
      initialFocusRef={titleRef}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
        <div className="border-b border-repressurizer-border px-5 py-4">
          <h2 ref={titleRef} tabIndex={-1} className="text-base font-semibold tracking-tight text-white focus:outline-none">
            {t("savePreview.title")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
            {t("savePreview.desc")}
          </p>
        </div>

        <div data-save-preview-scroll className="max-h-[55vh] space-y-4 overflow-auto p-5">
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

          {steamRunning && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-200">{t("savePreview.steamRunning.title")}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                  {t("savePreview.steamRunning.desc")}
                </p>
              </div>
            </div>
          )}

          {preview.addedCollections.length > 0 && (
            <PreviewList title={t("savePreview.collectionsToAdd")} items={preview.addedCollections} />
          )}
          {preview.removedCollections.length > 0 && (
            <PreviewList title={t("savePreview.collectionsToRemove")} items={preview.removedCollections} danger />
          )}

          {preview.changedCollections
            .slice(0, showAllChanges ? preview.changedCollections.length : 10)
            .map((change) => (
              <div key={change.collection} className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
                <p className="truncate text-sm font-medium text-white">{change.collection}</p>
                <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                  <ChangeSample label={t("savePreview.add")} items={change.added} />
                  <ChangeSample label={t("savePreview.remove")} items={change.removed} danger />
                </div>
              </div>
            ))}
          {!showAllChanges && preview.changedCollections.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllChanges(true)}
              className="btn-press flex w-full items-center justify-center gap-1.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-accent"
            >
              <CaretDown size={12} weight="bold" />
              {t("savePreview.moreChanged", { count: preview.changedCollections.length - 10 })}
            </button>
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
            disabled={saving || steamRunning}
            className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
          >
            {saving ? t("header.saving") : t("savePreview.createBackupAndSave")}
          </button>
        </div>
      </div>
    </DialogOverlay>
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
