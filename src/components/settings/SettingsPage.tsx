import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useFamilyStore } from "../../stores/familyStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useWishlistStore } from "../../stores/wishlistStore";
import { useSteamAppIndexStore } from "../../stores/steamAppIndexStore";
import { isSteamAppIndexStale } from "../../lib/steamAppIndex";
import { useHltbStore } from "../../stores/hltbStore";
import {
  listBackups,
  restoreBackup,
  deleteBackup,
  createManualBackup,
  loadCollections,
  getCacheInfo,
} from "../../lib/tauri";
import type { CacheInfo } from "../../lib/tauri";
import type {
  BackupInfo,
} from "../../lib/types";
import {
  X,
  Key,
  Info,
  Warning,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  Palette,
  CloudArrowDown,
  UsersThree,
  MagnifyingGlass,
  Wrench,
} from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";
import { automationPublishStatusPatch, publishAutomationSnapshot } from "../../lib/automationPublish";
import {
  normalizeSettingsSearchText,
  rankSettingsSearchSections,
  type RankedSettingsSearchSection,
  type SettingsSearchSection,
} from "../../lib/settingsSearch";
import { NumberSetting } from "./SettingsControls";
import { BackgroundSettingsSection, SteamLibraryRefreshSection } from "./GeneralSettingsSections";
import { useTransientMessage } from "./useTransientMessage";
import {
  SettingsNavigation,
  type SettingsTab,
  type SettingsTabItem,
} from "./SettingsNavigation";
import { BackupsTab, formatSize } from "./data/SettingsDataPanels";
import {
  type AutomationLogFilter,
  type AutomationLogSort,
} from "./automation/AutomationSettingsDialogs";
import {
  DepressurizerDatabaseImportDialog,
} from "./data/DepressurizerDatabaseImportDialog";
import { IgnoredSettingsTab, useIgnoredSettingsCount } from "./IgnoredSettingsTab";
import { PerformanceSettingsSection } from "./PerformanceSettingsSection";
import { AboutSettingsSections } from "./AboutSettingsSections";
import { SteamFamilySettingsSection } from "./steam-family/SteamFamilySettingsSection";
import { useSteamFamilySettings } from "./steam-family/useSteamFamilySettings";
import { AutomationSettingsSection } from "./automation/AutomationSettingsSection";
import { CoreSettingsSection } from "./CoreSettingsSections";
import { MaintenanceSettingsSection } from "./data/MaintenanceSettingsSection";
import { useMaintenanceSettings } from "./data/useMaintenanceSettings";

const AppearanceTab = lazy(() =>
  import("./AppearanceSettingsTab").then((module) => ({ default: module.AppearanceTab }))
);
const AutomationLogsDialog = lazy(() =>
  import("./automation/AutomationSettingsDialogs").then((module) => ({ default: module.AutomationLogsDialog }))
);
const AutomationGuideDialog = lazy(() =>
  import("./automation/AutomationSettingsDialogs").then((module) => ({ default: module.AutomationGuideDialog }))
);

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const settings = useSettingsStore();
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const hltbData = useHltbStore((s) => s.data);
  const gameCount = Object.keys(games).length;
  const setGames = useGameStore((s) => s.setGames);
  const cachedDetailsCount = useGameStore((s) => Object.keys(s.details).length);
  const clearDetailsCache = useGameStore((s) => s.clearDetailsCache);
  const ignoredSettingsCount = useIgnoredSettingsCount();
  const setCollections = useCategoryStore((s) => s.setCollections);

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { message, messageIsError, setMessage, clearMessage } = useTransientMessage();
  const maintenance = useMaintenanceSettings(setMessage, setApiKey);
  const steamFamilySettings = useSteamFamilySettings(setMessage);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [showAutomationLogs, setShowAutomationLogs] = useState(false);
  const [showAutomationGuide, setShowAutomationGuide] = useState(false);
  const [automationLogFilter, setAutomationLogFilter] = useState<AutomationLogFilter>("all");
  const [automationLogSort, setAutomationLogSort] = useState<AutomationLogSort>("desc");
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [publishingAutomation, setPublishingAutomation] = useState(false);
  const steamAppIndex = useSteamAppIndexStore((s) => s.data);
  const steamAppIndexRefreshing = useSteamAppIndexStore((s) => s.refreshing);
  const steamAppIndexError = useSteamAppIndexStore((s) => s.error);
  const [pendingAction, setPendingAction] = useState<{
    type: "restore" | "delete" | "reset";
    backup?: BackupInfo;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (tab === "backups") loadBackups();
    if (tab === "data") getCacheInfo().then(setCacheInfo).catch(() => {});
  }, [tab]);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const list = await listBackups(settings.steamPath, settings.steamId3);
      setBackups(list);
    } catch (e) {
      setMessage(t("settings.backups.loadFailed", { error: String(e) }));
    }
    setLoadingBackups(false);
  };

  const handleRestore = (backup: BackupInfo) => {
    setPendingAction({
      type: "restore",
      backup,
      message: t("backups.restoreConfirm", { date: formatTimestamp(backup.timestamp) }),
    });
  };

  const handleDeleteBackup = (backup: BackupInfo) => {
    setPendingAction({
      type: "delete",
      backup,
      message: t("backups.deleteConfirm", { date: formatTimestamp(backup.timestamp) }),
    });
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);

    if (action.type === "restore" && action.backup) {
      setRestoring(true);
      setMessage("");
      try {
        await restoreBackup(settings.steamPath, settings.steamId3, action.backup.filename);
        const collections = await loadCollections(settings.steamPath, settings.steamId3);
        setCollections(collections);
        setMessage(t("backups.restored"));
        loadBackups();
      } catch (e) {
        setMessage(t("toast.restoreFailed", { error: String(e) }));
      }
      setRestoring(false);
    } else if (action.type === "delete" && action.backup) {
      try {
        await deleteBackup(settings.steamPath, settings.steamId3, action.backup.filename);
        setMessage(t("backups.deleted"), 2000);
        loadBackups();
      } catch (e) {
        setMessage(t("toast.deleteFailed", { error: String(e) }));
      }
    } else if (action.type === "reset") {
      settings.reset();
    }
  };

  const handleManualBackup = async () => {
    try {
      await createManualBackup(settings.steamPath, settings.steamId3, "");
      setMessage(t("backups.created"), 2000);
      loadBackups();
    } catch (e) {
      setMessage(t("toast.backupFailed", { error: String(e) }));
    }
  };

  const handleSaveApiKey = () => {
    settings.setSettings({ apiKey });
    setMessage(t("settings.apiKey.saved"), 2000);
  };

  const handleRefreshSteamAppIndex = async () => {
    setMessage("");
    try {
      await useSteamAppIndexStore.getState().refresh(settings.apiKey);
      const current = Object.values(useGameStore.getState().games);
      if (current.length > 0) setGames(current);
      setMessage(t("settings.steamAppIndex.refreshed"), 2000);
    } catch (e) {
      setMessage(t("settings.steamAppIndex.failed", { error: String(e) }));
    }
  };

  const handlePublishAutomation = async () => {
    setPublishingAutomation(true);
    setMessage("");
    try {
      const achievementState = useAchievementsStore.getState();
      const wishlistState = useWishlistStore.getState();
      const familyState = useFamilyStore.getState();
      const result = await publishAutomationSnapshot({
        settings,
        games,
        collections: useCategoryStore.getState().collections,
        details,
        hltbData,
        achievements: achievementState.summaries,
        wishlistItems: wishlistState.items,
        wishlistLastFetched: wishlistState.lastFetched,
        familyApps: familyState.apps,
        familyAuthUsed: familyState.authUsed,
        familyOwnerSteamId: familyState.ownerSteamId,
        familyLastFetched: familyState.lastFetched,
        appVersion: __APP_VERSION__,
      });
      settings.setSettings({
        automationPublishLastChecksum: result.snapshot.checksum,
        automationPublishLastPublishedAt: new Date().toISOString(),
        ...automationPublishStatusPatch(
          settings,
          "success",
          t("settings.automationExport.published", { status: result.http.status }),
          result.http.status
        ),
      });
      setMessage(t("settings.automationExport.published", { status: result.http.status }));
    } catch (e) {
      const errorMessage = t("settings.automationExport.failed", { error: String(e) });
      settings.setSettings(automationPublishStatusPatch(settings, "failed", errorMessage));
      setMessage(errorMessage);
    } finally {
      setPublishingAutomation(false);
    }
  };

  const handleReset = () => {
    setPendingAction({
      type: "reset",
      message: t("settings.reset.confirm"),
    });
  };

  const steamAppIndexCount = Object.keys(steamAppIndex.apps).length;
  const steamAppIndexStale = isSteamAppIndexStale(steamAppIndex);
  const settingsSearchText = normalizeSettingsSearchText(settingsSearch);
  const settingsSections = useMemo<SettingsSearchSection<SettingsTab>[]>(
    () => [
      {
        id: "overview",
        tab: "general" as const,
        label: t("settings.general"),
        keywords: [
          t("settings.steamPath"),
          t("settings.user"),
          t("settings.steamId64"),
          t("settings.library"),
          "profile account steam path library",
        ],
      },
      {
        id: "family",
        tab: "steam" as const,
        label: t("settings.steamFamily"),
        keywords: [
          t("settings.family.probeTitle"),
          t("settings.family.tokenLabel"),
          t("settings.family.includeNonGames"),
          "family sharing shared library access token store token webapi owner household",
        ],
      },
      {
        id: "steamtools",
        tab: "tools" as const,
        label: t("settings.steamTools"),
        keywords: [
          t("settings.steamTools"),
          t("steamTools.sam.title"),
          "sam achievement achievements achievement manager bridge steam tools lab unlock lock schema preflight",
        ],
      },
      {
        id: "display",
        tab: "general" as const,
        label: t("settings.display"),
        keywords: [t("settings.showDynamic"), t("settings.pinFavorites"), "display favorites dynamic"],
      },
      {
        id: "currency",
        tab: "general" as const,
        label: t("settings.currency"),
        keywords: [t("settings.defaultCurrency"), "currency price prices regional region country eur usd gbp cc store"],
      },
      {
        id: "performance",
        tab: "data" as const,
        label: t("settings.fetchSpeed"),
        keywords: [
          t("settings.hltbConcurrency"),
          t("settings.hltbTimeMode"),
          t("settings.achievementsConcurrency"),
          t("settings.steamDetailsDelay"),
          t("settings.steamRatingsDelay"),
          t("settings.steamRatingsCooldown"),
          t("settings.hltbBatchDelay"),
          t("settings.achievementsBatchDelay"),
          t("settings.libraryRefreshCacheMode"),
          t("settings.libraryRefreshCacheMode.full"),
          t("settings.libraryRefreshCacheMode.basic"),
          t("settings.proxyRouting"),
          t("settings.proxyRouting.desc"),
          t("settings.proxyRotationMode"),
          t("settings.proxyFixedProfile"),
          t("settings.proxyType"),
          t("settings.proxyMode.fixed"),
          t("settings.proxyMode.roundRobin"),
          t("settings.proxyMode.batch"),
          t("settings.proxyMode.random"),
          t("settings.proxyScope.steamApi"),
          t("settings.proxyScope.steamStore"),
          t("settings.proxyScope.hltb"),
          t("settings.proxyScope.automation"),
          t("settings.proxyBatch.title"),
          t("settings.proxy.test"),
          t("settings.proxy.add"),
          "hltb achievements speed concurrency requests delay cooldown throttle batch details ratings reviews auto fetch refresh prepare cache proxy proxies http https socks socks5 rotation round robin per request random fixed profile validator test host port username password scope steam store automation",
        ],
      },
      {
        id: "data",
        tab: "data" as const,
        label: t("settings.cache"),
        keywords: [
          t("settings.steamAppIndex"),
          t("settings.cache"),
          t("settings.cache.desc"),
          t("settings.detailsCacheMaxAge"),
          t("settings.detailsCacheMaxAge.desc"),
          t("settings.clearCache"),
          "cache index data steam apps details metadata hltb ignored failed size path clear refresh stale max age ttl days scadenza vecchi",
        ],
      },
      {
        id: "api",
        tab: "steam" as const,
        label: t("settings.apiKey"),
        keywords: [t("settings.apiKey"), "api key steam web api credential credentials token developer"],
      },
      {
        id: "maintenance",
        tab: "data" as const,
        label: t("settings.maintenance"),
        keywords: [
          t("settings.diagnostics.export"),
          "diagnostics maintenance import export depressurizer profile database database.json json zip metadata tags hltb reviews names shortcuts non steam sharedconfig local license licensecache packageinfo categories favorites hidden filters autocat",
        ],
      },
      {
        id: "automation",
        tab: "automation" as const,
        label: t("settings.automationExport"),
        keywords: [
          t("settings.automationExport.enabled"),
          t("settings.automationExport.url"),
          t("settings.automationExport.token"),
          t("settings.automationExport.interval"),
          t("settings.automationExport.publishNow"),
          t("settings.automationExport.viewLogs"),
          "automation export snapshot publish endpoint webhook bearer token game vault http hltb guide logs interval schedule",
        ],
      },
      {
        id: "updates",
        tab: "about" as const,
        label: t("settings.updates.section"),
        keywords: [
          t("settings.updates.check"),
          t("settings.updates.autoCheck"),
          t("settings.updates.autoCheck.interval"),
          "about version update updater updates install release latest automatic manifest github",
        ],
      },
      {
        id: "changelog",
        tab: "about" as const,
        label: t("settings.changelog.title"),
        keywords: [
          t("settings.changelog.title"),
          t("settings.changelog.desc"),
          "release notes changelog changes novita novità version versions aggiornamenti modifiche whats new",
        ],
      },
      {
        id: "reset",
        tab: "about" as const,
        label: t("settings.reset"),
        keywords: [t("settings.reset"), "reset about version"],
      },
      {
        id: "accent",
        tab: "appearance" as const,
        label: t("appearance.accentColor"),
        keywords: [
          t("appearance.accentColor"),
          t("appearance.customAccent"),
          t("appearance.customHex"),
          t("appearance.resetColor"),
          "color accent theme palette hex custom highlight",
        ],
      },
      {
        id: "categoryChips",
        tab: "appearance" as const,
        label: t("appearance.categoryChips"),
        keywords: [
          t("appearance.categoryChips"),
          t("appearance.categoryChips.desc"),
          t("appearance.categoryChips.presets"),
          t("appearance.categoryChips.custom"),
          "chips tags badges categories category style preset border radius compact pill square round preview",
        ],
      },
      {
        id: "visibility",
        tab: "appearance" as const,
        label: t("appearance.visibility"),
        keywords: [
          t("appearance.smartLists"),
          t("appearance.emptyLists"),
          t("appearance.hideCollectionOnly"),
          t("appearance.hideCollectionOnly.desc"),
          t("filter.localCollectionOnly"),
          t("appearance.filterBar"),
          t("appearance.nowPlaying"),
          "visibility panels ui empty zero sidebar uncategorized local only local-only local collection collection-only solo locali raccolta locale nascondi hide",
        ],
      },
      {
        id: "theme",
        tab: "appearance" as const,
        label: t("appearance.theme"),
        keywords: [t("appearance.theme.dark"), t("appearance.theme.dim"), t("appearance.theme.light"), "theme dark light"],
      },
      {
        id: "language",
        tab: "appearance" as const,
        label: t("appearance.language"),
        keywords: [t("appearance.language"), "language translation i18n lingua idioma"],
      },
      {
        id: "sidebar",
        tab: "appearance" as const,
        label: t("appearance.sidebarWidth"),
        keywords: [t("appearance.sidebarWidth"), "sidebar width layout"],
      },
      {
        id: "background",
        tab: "general" as const,
        label: t("settings.background"),
        keywords: [
          t("settings.background"),
          t("settings.startOnLogin"),
          t("settings.desktopNotifications"),
          t("settings.minimizeToTray"),
          t("settings.systemTray"),
          "tray close background startup autostart login boot window notifications",
        ],
      },
      {
        id: "libraryRefresh",
        tab: "steam" as const,
        label: t("settings.libraryAutoRefresh"),
        keywords: [
          t("settings.libraryAutoRefresh"),
          "steam library refresh games polling new games interval automatic startup fetch",
        ],
      },
      {
        id: "backups",
        tab: "backups" as const,
        label: t("settings.backups"),
        keywords: [t("settings.backups"), "backup backups restore delete manual snapshot collections history"],
      },
      {
        id: "ignored",
        tab: "ignored" as const,
        label: t("settings.ignored"),
        keywords: [t("ignored.steamDetails"), t("ignored.hltb"), "ignored failed retry skipped skip steam details hltb errors"],
      },
    ],
    [t]
  );
  const matchedSettingsSections = useMemo<RankedSettingsSearchSection<SettingsTab>[]>(() => {
    return rankSettingsSearchSections(settingsSearchText, settingsSections);
  }, [settingsSearchText, settingsSections]);
  const visibleSectionIds = useMemo(
    () => new Set(matchedSettingsSections.map((section) => section.id)),
    [matchedSettingsSections]
  );
  const sectionTabById = useMemo(
    () => new Map(settingsSections.map((section) => [section.id, section.tab])),
    [settingsSections]
  );
  const isSectionVisible = (id: string) =>
    sectionTabById.get(id) === tab && (!settingsSearchText || visibleSectionIds.has(id));
  const countTabMatches = (targetTab: SettingsTab) =>
    settingsSearchText ? matchedSettingsSections.filter((section) => section.tab === targetTab).length : 0;
  const settingsTabs: SettingsTabItem[] = [
    { id: "general", label: t("settings.general"), icon: <Info size={14} /> },
    { id: "steam", label: t("settings.steam"), icon: <UsersThree size={14} /> },
    { id: "automation", label: t("settings.automation"), icon: <CloudArrowDown size={14} /> },
    { id: "appearance", label: t("settings.appearance"), icon: <Palette size={14} /> },
    { id: "data", label: t("settings.data"), icon: <Database size={14} /> },
    { id: "backups", label: t("settings.backups"), icon: <ClockCounterClockwise size={14} /> },
    {
      id: "ignored",
      label: t("settings.ignored"),
      icon: <Warning size={14} />,
      badge: ignoredSettingsCount,
    },
    { id: "tools", label: t("settings.steamTools"), icon: <Wrench size={14} /> },
    { id: "about", label: t("settings.aboutTab"), icon: <Info size={14} /> },
  ];
  const filteredAutomationLogs = useMemo(() => {
    const logs = [...(settings.automationPublishLogs ?? [])];
    const filtered =
      automationLogFilter === "all"
        ? logs
        : logs.filter((entry) => entry.status === automationLogFilter);
    return filtered.sort((a, b) => {
      const delta = Date.parse(a.timestamp) - Date.parse(b.timestamp);
      return automationLogSort === "asc" ? delta : -delta;
    });
  }, [settings.automationPublishLogs, automationLogFilter, automationLogSort]);

  useEffect(() => {
    if (!settingsSearchText || matchedSettingsSections.length === 0) return;
    if (matchedSettingsSections.some((section) => section.tab === tab)) return;
    setTab(matchedSettingsSections[0].tab);
  }, [settingsSearchText, matchedSettingsSections, tab]);

  return (
    <DialogOverlay
      label={t("settings.title")}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <ResizableDialogPanel
        dialogId="settings"
        defaultSize={{ width: 1040, height: 760 }}
        minSize={{ width: 720, height: 520 }}
        viewportMargin={24}
        className="relative flex flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in"
      >
        {({ sizeControls }) => (
          <>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <h2 className="text-base font-semibold text-white tracking-tight">{t("settings.title")}</h2>
          <div className="flex items-center gap-1">
            {sizeControls}
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="border-b border-repressurizer-border px-6 py-3">
          <div className="relative">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint"
            />
            <input
              type="text"
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              placeholder={t("settings.search.placeholder")}
              className="w-full rounded-xl border border-repressurizer-border bg-repressurizer-bg py-2 pl-9 pr-9 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
            />
            {settingsSearch && (
              <button
                type="button"
                onClick={() => setSettingsSearch("")}
                aria-label={t("settings.search.clear")}
                className="btn-press absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          {settingsSearchText && matchedSettingsSections.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-repressurizer-text-faint">
                {t("settings.search.matches", { count: matchedSettingsSections.length })}
              </span>
              {matchedSettingsSections.slice(0, 7).map((section) => (
                <button
                  key={`${section.tab}-${section.id}`}
                  type="button"
                  onClick={() => setTab(section.tab)}
                  className={`btn-press rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                    tab === section.tab
                      ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <SettingsNavigation
            tabs={settingsTabs}
            activeTab={tab}
            onTabChange={setTab}
            countTabMatches={countTabMatches}
            variant="mobile"
          />
          <SettingsNavigation
            tabs={settingsTabs}
            activeTab={tab}
            onTabChange={setTab}
            countTabMatches={countTabMatches}
            variant="desktop"
          />

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {message && (
            <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3.5 text-sm ${
              messageIsError
                ? "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
                : "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
            }`}>
              {messageIsError
                ? <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
                : <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" />}
              <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
              <button
                type="button"
                onClick={clearMessage}
                aria-label={t("settings.message.dismiss")}
                className="btn-press -mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current opacity-60 transition-opacity hover:bg-white/5 hover:opacity-100"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          )}

          {settingsSearchText && matchedSettingsSections.length === 0 && (
            <div className="mb-4 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-sm text-repressurizer-text-muted">
              {t("settings.search.noResults")}
            </div>
          )}

          {(["general", "steam", "automation", "data", "tools", "about"] as SettingsTab[]).includes(tab) && (
            <div className="space-y-6">
              {isSectionVisible("overview") && (
                <CoreSettingsSection section="overview" gameCount={gameCount} />
              )}

              {isSectionVisible("background") && <BackgroundSettingsSection />}
              {isSectionVisible("libraryRefresh") && <SteamLibraryRefreshSection />}

              {isSectionVisible("family") && (
                <SteamFamilySettingsSection controller={steamFamilySettings} />
              )}

              {isSectionVisible("steamtools") && (
                <CoreSettingsSection section="steamtools" gameCount={gameCount} />
              )}

              {isSectionVisible("display") && (
                <CoreSettingsSection section="display" gameCount={gameCount} />
              )}

              {isSectionVisible("currency") && (
                <CoreSettingsSection section="currency" gameCount={gameCount} />
              )}

              {/* Fetch Speed */}
              {isSectionVisible("performance") && <PerformanceSettingsSection />}

              {/* Cache */}
              {isSectionVisible("data") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.steamAppIndex")}</h3>
                <div className="flex items-center gap-3 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
                  <CloudArrowDown size={15} weight="duotone" className="text-repressurizer-text-faint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-repressurizer-text">
                      {t("settings.steamAppsIndexed", { count: steamAppIndexCount })}
                    </p>
                    <p className="mt-0.5 text-xs text-repressurizer-text-faint">
                      {steamAppIndex.fetchedAt > 0
                        ? t("settings.steamAppIndex.lastRefreshed", {
                            date: new Date(steamAppIndex.fetchedAt).toLocaleDateString(),
                            suffix: steamAppIndexStale ? t("settings.steamAppIndex.refreshRecommended") : "",
                          })
                        : t("settings.steamAppIndex.desc")}
                    </p>
                    {steamAppIndexError && (
                      <p className="mt-1 text-xs text-repressurizer-danger">{steamAppIndexError}</p>
                    )}
                  </div>
                  <button
                    onClick={handleRefreshSteamAppIndex}
                    disabled={steamAppIndexRefreshing}
                    className="btn-press shrink-0 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25 disabled:opacity-40"
                  >
                    {steamAppIndexRefreshing ? t("settings.refreshing") : t("settings.refresh")}
                  </button>
                </div>

                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.cache")}</h3>
                <div className="flex items-center gap-3 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
                  <Database size={15} weight="duotone" className="text-repressurizer-text-faint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-repressurizer-text">
                      {t("settings.cached", { count: cachedDetailsCount })}
                    </p>
                    <p className="mt-0.5 text-xs text-repressurizer-text-faint">{t("settings.cache.desc")}</p>
                  </div>
                  <button
                    onClick={clearDetailsCache}
                    disabled={cachedDetailsCount === 0}
                    className="btn-press shrink-0 rounded-lg border border-repressurizer-danger/30 px-3 py-1.5 text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("settings.clearCache")}
                  </button>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
                  <NumberSetting
                    label={t("settings.detailsCacheMaxAge")}
                    value={settings.detailsCacheMaxAgeDays ?? 30}
                    suffix={t("settings.detailsCacheMaxAge.suffix")}
                    min={0}
                    max={3650}
                    step={1}
                    onChange={(detailsCacheMaxAgeDays) => settings.setSettings({ detailsCacheMaxAgeDays })}
                  />
                  <p className="mt-2 text-xs leading-relaxed text-repressurizer-text-faint">
                    {t("settings.detailsCacheMaxAge.desc")}
                  </p>
                </div>
                {cacheInfo && (
                  <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                    <p className="text-[10px] font-mono text-repressurizer-text-faint break-all">{cacheInfo.path}</p>
                    <div className="flex gap-4 text-xs text-repressurizer-text-muted">
                      <span>{t("settings.cache.details")}: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.details_bytes)}</span></span>
                      <span>HLTB: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.hltb_bytes)}</span></span>
                      <span>{t("settings.cache.ignored")}: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.failed_bytes)}</span></span>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* API Key */}
              {isSectionVisible("api") && (
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("settings.apiKey")}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-10 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg pl-9 pr-3 text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSaveApiKey}
                    className="btn-press h-10 rounded-lg bg-repressurizer-accent px-5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
                  >
                    {t("settings.apiKey.save")}
                  </button>
                </div>
              </div>
              )}

              {isSectionVisible("maintenance") && (
                <MaintenanceSettingsSection
                  diagnosticsExporting={maintenance.diagnosticsExporting}
                  importingDepressurizer={maintenance.importingDepressurizer}
                  importingDepressurizerDatabase={maintenance.importingDepressurizerDatabase}
                  importingShortcuts={maintenance.importingShortcuts}
                  importingLegacyConfig={maintenance.importingLegacyConfig}
                  importingLocalLibrary={maintenance.importingLocalLibrary}
                  lastDepressurizerImport={maintenance.lastDepressurizerImport}
                  lastDepressurizerDatabaseImport={
                    maintenance.lastDepressurizerDatabaseImport
                  }
                  onImportDepressurizerProfile={maintenance.handleImportDepressurizerProfile}
                  onShowDepressurizerDatabaseImport={
                    maintenance.openDepressurizerDatabaseImport
                  }
                  onImportShortcuts={maintenance.handleImportShortcuts}
                  onImportLegacyConfig={maintenance.handleImportLegacySharedConfig}
                  onImportLocalLibrary={maintenance.handleImportLocalLicenseLibrary}
                  onExportDiagnostics={maintenance.handleExportDiagnostics}
                />
              )}

              {isSectionVisible("automation") && (
                <AutomationSettingsSection
                  gameCount={gameCount}
                  publishing={publishingAutomation}
                  onPublish={handlePublishAutomation}
                  onShowGuide={() => setShowAutomationGuide(true)}
                  onShowLogs={() => setShowAutomationLogs(true)}
                />
              )}

              <AboutSettingsSections
                isSectionVisible={isSectionVisible}
                onReset={handleReset}
              />
            </div>
          )}

          {tab === "appearance" && (
            <Suspense fallback={<div className="skeleton h-40 w-full rounded-xl" />}>
              <AppearanceTab isSectionVisible={isSectionVisible} />
            </Suspense>
          )}

          {tab === "backups" && (
            <BackupsTab
              backups={backups}
              loading={loadingBackups}
              restoring={restoring}
              onRestore={handleRestore}
              onDelete={handleDeleteBackup}
              onManualBackup={handleManualBackup}
            />
          )}

          {tab === "ignored" && <IgnoredSettingsTab />}
        </div>
        </div>

        {showAutomationLogs && (
          <Suspense fallback={null}>
            <AutomationLogsDialog
              logs={filteredAutomationLogs}
              filter={automationLogFilter}
              sort={automationLogSort}
              onFilterChange={setAutomationLogFilter}
              onSortChange={setAutomationLogSort}
              onClose={() => setShowAutomationLogs(false)}
            />
          </Suspense>
        )}

        {showAutomationGuide && (
          <Suspense fallback={null}>
            <AutomationGuideDialog onClose={() => setShowAutomationGuide(false)} />
          </Suspense>
        )}

        {maintenance.showDepressurizerDatabaseImport && (
          <DepressurizerDatabaseImportDialog
            options={maintenance.depressurizerDatabaseOptions}
            gameCount={gameCount}
            importing={maintenance.importingDepressurizerDatabase}
            onChange={maintenance.updateDepressurizerDatabaseOptions}
            onSelectFile={() => void maintenance.handleChooseDepressurizerDatabaseFile()}
            onImport={() => void maintenance.handleImportDepressurizerDatabase()}
            onClose={maintenance.closeDepressurizerDatabaseImport}
          />
        )}

        {/* Confirmation dialog */}
        {pendingAction && (
          <DialogOverlay
            label={pendingAction.message}
            onClose={() => setPendingAction(null)}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-2xl backdrop-blur-sm"
          >
            <div className="mx-6 w-full max-w-sm animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
              <p className="text-sm text-repressurizer-text leading-relaxed">{pendingAction.message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setPendingAction(null)}
                  className="btn-press rounded-lg px-4 py-1.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleConfirmAction}
                  className={`btn-press rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors ${
                    pendingAction.type === "delete" || pendingAction.type === "reset"
                      ? "bg-repressurizer-danger hover:bg-repressurizer-danger/80"
                      : "bg-repressurizer-accent hover:bg-repressurizer-accent-hover"
                  }`}
                >
                  {pendingAction.type === "restore" ? t("backups.restore") : pendingAction.type === "delete" ? t("common.delete") : t("settings.reset")}
                </button>
              </div>
            </div>
          </DialogOverlay>
        )}
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}

function formatTimestamp(ts: string): string {
  if (ts.length >= 15) {
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  }
  return ts;
}
