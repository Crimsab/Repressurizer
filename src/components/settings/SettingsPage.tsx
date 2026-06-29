import { useState, useEffect, useMemo, useRef } from "react";
import type { ClipboardEvent } from "react";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useFamilyStore } from "../../stores/familyStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useWishlistStore } from "../../stores/wishlistStore";
import { useSteamAppIndexStore } from "../../stores/steamAppIndexStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import {
  useAutoCategorizeStore,
  type AutoCategorizePreset,
} from "../../stores/autoCategorizeStore";
import {
  useAdvancedFilterStore,
  type AdvancedSpecialState,
  type SavedAdvancedFilter,
} from "../../stores/advancedFilterStore";
import { familyAppsToOwnedGames } from "../../lib/familyLibrary";
import { isSteamAppIndexStale } from "../../lib/steamAppIndex";
import { useFailedGamesStore, getIgnoredGameName, MAX_FAIL_RUNS } from "../../stores/failedGamesStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useHltbIgnoredStore, getHltbIgnoredGameName, HLTB_MAX_FAILS } from "../../stores/hltbIgnoredStore";

import {
  listBackups,
  restoreBackup,
  deleteBackup,
  createManualBackup,
  loadCollections,
  getCacheInfo,
  exportDiagnostics,
  fetchFamilyLibrary,
  importDepressurizerProfile,
  loadLegacySharedConfig,
  loadLocalLicenseLibrary,
  loadShortcuts,
  saveAppData,
  testProxyProfile,
} from "../../lib/tauri";
import type {
  CacheInfo,
  FamilyLibraryResult,
  LegacySharedConfigGame,
  LocalLicenseApp,
  SteamShortcut,
} from "../../lib/tauri";
import {
  clearSteamFamilyToken,
  extractStoreWebApiToken,
  loadSteamFamilyToken,
  saveSteamFamilyToken,
  type SteamFamilyTokenCache,
} from "../../lib/steamFamilyToken";
import { depressurizerAutoCatsToPresets } from "../../lib/depressurizerAutoCats";
import { isPlaceholderGameName } from "../../lib/libraryMerge";
import type {
  AppSettings,
  AutomationPublishLogEntry,
  BackupInfo,
  DepressurizerImportedFilter,
  DepressurizerProfileImport,
  OwnedGame,
  ProxyProfile,
  ProxyRotationMode,
  ProxyType,
  SteamCollection,
} from "../../lib/types";
import {
  X,
  Key,
  ArrowCounterClockwise,
  TrashSimple,
  Plus,
  Star,
  CaretRight,
  CaretDown,
  Info,
  Warning,
  CheckCircle,
  ClockCounterClockwise,
  Eye,
  Heart,
  Database,
  Palette,
  Stack,
  Funnel,
  Timer,
  Monitor,
  Globe,
  Moon,
  Sun,
  CloudMoon,
  Tray,
  BellRinging,
  Bug,
  CloudArrowDown,
  GameController,
  UsersThree,
  MagnifyingGlass,
  Trophy,
  Wrench,
  UploadSimple,
} from "@phosphor-icons/react";
import { ACCENT_PRESETS, applyAccentColor, applyTheme } from "../../stores/settingsStore";
import { getLocaleDisplayName, getLocaleFlag, normalizeLocale, SUPPORTED_LOCALES, useT } from "../../lib/i18n";
import type { AppStartupMode, AppTheme } from "../../lib/types";
import { automationPublishStatusPatch, publishAutomationSnapshot } from "../../lib/automationPublish";
import { SelectMenu } from "../ui/SelectMenu";

interface SettingsPageProps {
  onClose: () => void;
}

type SettingsTab =
  | "general"
  | "steam"
  | "automation"
  | "appearance"
  | "data"
  | "backups"
  | "ignored"
  | "tools"
  | "about";
type AutomationLogFilter = "all" | "success" | "failed" | "skipped";
type AutomationLogSort = "desc" | "asc";

const LIBRARY_REFRESH_INTERVAL_OPTIONS = [15, 30, 60, 180, 360] as const;
const UPDATE_CHECK_INTERVAL_OPTIONS = [6, 12, 24, 72, 168] as const;

interface SettingsTabItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

function redactTail(value: string | null | undefined): string | null {
  if (!value) return null;
  return `***${value.slice(-4)}`;
}

function clampIntegerInput(value: string, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const settings = useSettingsStore();
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const hltbData = useHltbStore((s) => s.data);
  const gameCount = Object.keys(games).length;
  const mergeGames = useGameStore((s) => s.mergeGames);
  const setGames = useGameStore((s) => s.setGames);
  const cachedDetailsCount = useGameStore((s) => Object.keys(s.details).length);
  const clearDetailsCache = useGameStore((s) => s.clearDetailsCache);
  const failedGamesStore = useFailedGamesStore();
  const ignoredIds = failedGamesStore.ignoredIds();
  const hltbIgnoredStore = useHltbIgnoredStore();
  const hltbIgnoredIds = hltbIgnoredStore.ignoredIds();
  const categoryCount = useCategoryStore((s) => s.collections.length);
  const dynamicCount = useCategoryStore((s) =>
    s.collections.filter((c) => c.is_dynamic).length
  );
  const setCollections = useCategoryStore((s) => s.setCollections);
  const applyImportedCollections = useCategoryStore((s) => s.applyImportedCollections);

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [showAutomationLogs, setShowAutomationLogs] = useState(false);
  const [showAutomationGuide, setShowAutomationGuide] = useState(false);
  const [automationLogFilter, setAutomationLogFilter] = useState<AutomationLogFilter>("all");
  const [automationLogSort, setAutomationLogSort] = useState<AutomationLogSort>("desc");
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [diagnosticsExporting, setDiagnosticsExporting] = useState(false);
  const [importingDepressurizer, setImportingDepressurizer] = useState(false);
  const [importingShortcuts, setImportingShortcuts] = useState(false);
  const [importingLegacyConfig, setImportingLegacyConfig] = useState(false);
  const [importingLocalLibrary, setImportingLocalLibrary] = useState(false);
  const [lastDepressurizerImport, setLastDepressurizerImport] =
    useState<DepressurizerProfileImport | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [publishingAutomation, setPublishingAutomation] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [familyAccessToken, setFamilyAccessToken] = useState("");
  const [familyTokenSavedAt, setFamilyTokenSavedAt] = useState<number | null>(null);
  const [familyTokenValidatedAt, setFamilyTokenValidatedAt] = useState<number | null>(null);
  const [familyChecking, setFamilyChecking] = useState(false);
  const [familyResult, setFamilyResult] = useState<FamilyLibraryResult | null>(null);
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);
  const familyLastFetched = useFamilyStore((s) => s.lastFetched);
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

  useEffect(() => {
    if (!updateMessage) return;
    const timer = window.setTimeout(() => setUpdateMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [updateMessage]);

  useEffect(() => {
    let cancelled = false;
    loadSteamFamilyToken()
      .then((cache) => {
        if (cancelled || !cache) return;
        applyFamilyTokenCache(cache);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
        setMessage(t("backups.deleted"));
        loadBackups();
        setTimeout(() => setMessage(""), 2000);
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
      setMessage(t("backups.created"));
      loadBackups();
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(t("toast.backupFailed", { error: String(e) }));
    }
  };

  const handleSaveApiKey = () => {
    settings.setSettings({ apiKey });
    setMessage(t("settings.apiKey.saved"));
    setTimeout(() => setMessage(""), 2000);
  };

  const updateProxySettings = (patch: Partial<AppSettings["proxySettings"]>) => {
    settings.setSettings({
      proxySettings: {
        ...settings.proxySettings,
        ...patch,
        scopes: {
          ...settings.proxySettings.scopes,
          ...(patch.scopes ?? {}),
        },
        profiles: patch.profiles ?? settings.proxySettings.profiles,
      },
    });
  };

  const updateProxyProfile = (id: string, patch: Partial<ProxyProfile>) => {
    const profiles = settings.proxySettings.profiles.map((profile) =>
      profile.id === id ? { ...profile, ...patch } : profile
    );
    updateProxySettings({ profiles });
  };

  const handleAddProxyProfile = () => {
    const id = `proxy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const profile: ProxyProfile = {
      id,
      name: `Proxy ${settings.proxySettings.profiles.length + 1}`,
      type: "http",
      host: "",
      port: 8080,
      username: "",
      password: "",
      enabled: true,
      batchSize: 1,
      lastTestStatus: "",
      lastTestMessage: "",
      lastTestLatencyMs: 0,
      lastTestAt: 0,
    };
    updateProxySettings({
      activeProfileId: settings.proxySettings.activeProfileId || id,
      profiles: [...settings.proxySettings.profiles, profile],
    });
  };

  const handleRemoveProxyProfile = (id: string) => {
    const profiles = settings.proxySettings.profiles.filter((profile) => profile.id !== id);
    updateProxySettings({
      profiles,
      activeProfileId:
        settings.proxySettings.activeProfileId === id
          ? profiles[0]?.id ?? ""
          : settings.proxySettings.activeProfileId,
    });
  };

  const handleTestProxyProfile = async (profile: ProxyProfile) => {
    setTestingProxyId(profile.id);
    try {
      const result = await testProxyProfile(profile);
      updateProxyProfile(profile.id, {
        lastTestStatus: result.ok ? "ok" : "failed",
        lastTestMessage: result.message,
        lastTestLatencyMs: result.latencyMs,
        lastTestAt: Date.now(),
      });
    } catch (e) {
      updateProxyProfile(profile.id, {
        lastTestStatus: "failed",
        lastTestMessage: String(e),
        lastTestLatencyMs: 0,
        lastTestAt: Date.now(),
      });
    } finally {
      setTestingProxyId(null);
    }
  };

  const handleRefreshSteamAppIndex = async () => {
    setMessage("");
    try {
      await useSteamAppIndexStore.getState().refresh(settings.apiKey);
      const current = Object.values(useGameStore.getState().games);
      if (current.length > 0) setGames(current);
      setMessage(t("settings.steamAppIndex.refreshed"));
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(t("settings.steamAppIndex.failed", { error: String(e) }));
    }
  };

  const handleExportDiagnostics = async () => {
    setDiagnosticsExporting(true);
    setMessage("");
    try {
      const content = await exportDiagnostics(settings.steamPath, settings.steamId3, settings.steamId64);
      const path = await save({
        defaultPath: `repressurizer-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, content);
      setMessage(t("settings.diagnostics.exported"));
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(t("settings.diagnostics.failed", { error: String(e) }));
    } finally {
      setDiagnosticsExporting(false);
    }
  };

  const handleImportDepressurizerProfile = async () => {
    setImportingDepressurizer(true);
    setMessage("");
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Depressurizer Profile", extensions: ["profile", "xml"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;

      const imported = await importDepressurizerProfile(selected);
      await hydrateSteamAppIndexForNames(settings.apiKey || imported.steamWebApiKey || "");
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        imported.collections
      );
      applyImportedCollections(mergedCollections);

      const importedGames = depressurizerGamesToOwnedGames(imported);
      if (importedGames.length > 0) {
        mergeGames(importedGames);
        fetchDetailsForPlaceholderNames(importedGames);
      }

      const importedPresets = depressurizerAutoCatsToPresets(imported);
      const savedPresets = mergeAutoCategorizePresets(importedPresets);
      const importedAdvancedFilters = depressurizerFiltersToSavedAdvancedFilters(
        imported.filters,
        mergedCollections
      );
      const savedAdvancedFilters = mergeSavedAdvancedFilters(importedAdvancedFilters);

      await saveAppData("depressurizer-profile-import.json", JSON.stringify(imported)).catch(() => {});

      const patch: Partial<AppSettings> = {};
      if (!settings.steamId64 && imported.steamId64) patch.steamId64 = imported.steamId64;
      if (!settings.steamId3 && imported.steamId3) patch.steamId3 = imported.steamId3;
      if (!settings.apiKey && imported.steamWebApiKey) {
        patch.apiKey = imported.steamWebApiKey;
        setApiKey(imported.steamWebApiKey);
      }
      if (Object.keys(patch).length > 0) settings.setSettings(patch);

      setLastDepressurizerImport(imported);
      setMessage(
        `Imported ${imported.stats.categories} categories, ${imported.stats.steamGames} Steam games, ` +
          `${imported.stats.filters} filters, ${imported.stats.autoCats} AutoCats, ` +
          `${savedPresets} saved AutoCat presets and ${savedAdvancedFilters} saved advanced filters from Depressurizer.`
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setMessage(`Depressurizer import failed: ${String(e)}`);
    } finally {
      setImportingDepressurizer(false);
    }
  };

  const handleImportShortcuts = async () => {
    setImportingShortcuts(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
        setMessage("Steam path and user are required before importing shortcuts.");
        return;
      }
      const shortcuts = await loadShortcuts(settings.steamPath, settings.steamId3);
      if (shortcuts.length === 0) {
        setMessage("No non-Steam shortcuts found for this Steam user.");
        return;
      }

      mergeGames(shortcutsToOwnedGames(shortcuts));
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        shortcutsToCollections(shortcuts)
      );
      applyImportedCollections(mergedCollections);

      setMessage(
        `Imported ${shortcuts.length} non-Steam shortcuts and ${new Set(shortcuts.flatMap((shortcut) => shortcut.tags)).size} shortcut tags.`
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setMessage(`Shortcut import failed: ${String(e)}`);
    } finally {
      setImportingShortcuts(false);
    }
  };

  const handleImportLegacySharedConfig = async () => {
    setImportingLegacyConfig(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
        setMessage("Steam path and user are required before importing legacy sharedconfig.");
        return;
      }
      const legacyGames = await loadLegacySharedConfig(settings.steamPath, settings.steamId3);
      if (legacyGames.length === 0) {
        setMessage("No legacy sharedconfig categories found for this Steam user.");
        return;
      }

      await hydrateSteamAppIndexForNames(settings.apiKey);
      const importedGames = legacySharedConfigToOwnedGames(legacyGames);
      mergeGames(importedGames);
      fetchDetailsForPlaceholderNames(importedGames);
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        legacySharedConfigToCollections(legacyGames)
      );
      applyImportedCollections(mergedCollections);

      setMessage(
        `Imported ${legacyGames.length} legacy sharedconfig entries and ${new Set(legacyGames.flatMap((game) => game.tags)).size} legacy tags.`
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setMessage(`Legacy sharedconfig import failed: ${String(e)}`);
    } finally {
      setImportingLegacyConfig(false);
    }
  };

  const handleImportLocalLicenseLibrary = async () => {
    setImportingLocalLibrary(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
        setMessage("Steam path and user are required before importing the local license library.");
        return;
      }

      await hydrateSteamAppIndexForNames(settings.apiKey);
      const localApps = await loadLocalLicenseLibrary(settings.steamPath, settings.steamId3);
      if (localApps.length === 0) {
        setMessage("No local license library apps found for this Steam user.");
        return;
      }

      const importedGames = localLicenseAppsToOwnedGames(localApps);
      mergeGames(importedGames);
      fetchDetailsForPlaceholderNames(importedGames);
      setMessage(
        `Imported ${localApps.length} local license library apps from licensecache/packageinfo.`
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setMessage(`Local license library import failed: ${String(e)}`);
    } finally {
      setImportingLocalLibrary(false);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setAvailableUpdate(null);
    setUpdateMessage(null);
    try {
      const update = await check();
      setAvailableUpdate(update);
      setUpdateMessage({
        text: update ? t("settings.updates.available", { version: update.version }) : t("settings.updates.current"),
        tone: "success",
      });
    } catch (e) {
      setUpdateMessage({
        text: t("settings.updates.checkFailed", { error: String(e) }),
        tone: "error",
      });
    } finally {
      setCheckingUpdates(false);
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

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setInstallingUpdate(true);
    setUpdateMessage(null);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setUpdateMessage({
        text: t("settings.updates.installFailed", { error: String(e) }),
        tone: "error",
      });
      setInstallingUpdate(false);
    }
  };

  const applyFamilyTokenCache = (cache: SteamFamilyTokenCache) => {
    setFamilyAccessToken(cache.accessToken);
    setFamilyTokenSavedAt(cache.savedAt);
    setFamilyTokenValidatedAt(cache.lastValidatedAt);
  };

  const handleOpenFamilyTokenPage = async () => {
    try {
      await open("https://store.steampowered.com/pointssummary/ajaxgetasyncconfig");
      setMessage(t("settings.family.tokenPageOpened"));
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(t("settings.family.tokenPageFailed", { error: String(e) }));
    }
  };

  const handleFamilyTokenPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const token = extractStoreWebApiToken(pasted);
    if (token && token !== pasted.trim()) {
      event.preventDefault();
      setFamilyAccessToken(token);
      setMessage(t("settings.family.tokenExtracted"));
      setTimeout(() => setMessage(""), 2000);
    }
  };

  const handleSaveFamilyToken = async () => {
    const token = extractStoreWebApiToken(familyAccessToken);
    if (!token) {
      setMessage(t("settings.family.tokenRequired"));
      return;
    }
    setFamilyAccessToken(token);
    try {
      const cache = await saveSteamFamilyToken(token, false);
      if (cache) {
        applyFamilyTokenCache(cache);
        setMessage(t("settings.family.tokenSaved"));
        setTimeout(() => setMessage(""), 2000);
      }
    } catch (e) {
      setMessage(String(e));
    }
  };

  const handleClearFamilyToken = async () => {
    try {
      await clearSteamFamilyToken();
      setFamilyAccessToken("");
      setFamilyTokenSavedAt(null);
      setFamilyTokenValidatedAt(null);
      setMessage(t("settings.family.tokenCleared"));
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const handleProbeFamily = async () => {
    setFamilyChecking(true);
    setFamilyResult(null);
    setMessage("");
    const accessToken = extractStoreWebApiToken(familyAccessToken);
    if (accessToken && accessToken !== familyAccessToken) {
      setFamilyAccessToken(accessToken);
    }
    const startedAt = performance.now();
    console.groupCollapsed("[Repressurizer] Steam Family probe");
    console.info("Starting Steam Family probe", {
      hasSavedWebApiKey: Boolean(settings.apiKey),
      hasStoreWebApiToken: Boolean(accessToken),
      includeNonGames: familyIncludeNonGames,
      steamId64: redactTail(settings.steamId64),
    });
    try {
      if (accessToken) {
        const cache = await saveSteamFamilyToken(accessToken, false);
        if (cache) applyFamilyTokenCache(cache);
      }

      const result = await fetchFamilyLibrary(
        settings.apiKey,
        accessToken || undefined,
        settings.steamId64 || undefined,
        familyIncludeNonGames
      );
      console.info("Steam Family probe result", {
        authUsed: result.auth_used,
        familyGroupId: redactTail(result.family_groupid),
        ownerSteamId: redactTail(result.owner_steamid),
        totalApps: result.total_apps,
        ownedApps: result.owned_apps,
        sharedApps: result.shared_apps,
        excludedApps: result.excluded_apps,
        nonGameApps: result.non_game_apps,
        playtimeEntries: result.playtime_entries,
        playtimeUnavailable: Boolean(result.playtime_unavailable_reason),
        durationMs: Math.round(performance.now() - startedAt),
      });
      setFamilyResult(result);
      useFamilyStore.getState().setResult(result);
      mergeGames(familyAppsToOwnedGames(result.apps));
      if (result.auth_used === "access_token" && accessToken) {
        const cache = await saveSteamFamilyToken(accessToken, true);
        if (cache) applyFamilyTokenCache(cache);
      }
      setMessage(t("settings.family.loaded", { auth: result.auth_used }));
    } catch (e) {
      console.error("Steam Family probe failed", {
        error: String(e),
        durationMs: Math.round(performance.now() - startedAt),
      });
      const tokenHint = accessToken
        ? t("settings.family.expiredHint")
        : "";
      setMessage(t("settings.family.failed", { error: String(e), hint: tokenHint }));
    } finally {
      console.groupEnd();
      setFamilyChecking(false);
    }
  };

  const handleReset = () => {
    setPendingAction({
      type: "reset",
      message: t("settings.reset.confirm"),
    });
  };

  const hasFamilyStoreToken = Boolean(extractStoreWebApiToken(familyAccessToken));
  const familyIncludeNonGames = settings.includeSteamFamilyNonGames ?? false;
  const steamAppIndexCount = Object.keys(steamAppIndex.apps).length;
  const steamAppIndexStale = isSteamAppIndexStale(steamAppIndex);
  const settingsSearchText = settingsSearch.trim().toLowerCase();
  const settingsSections = useMemo(
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
          "family shared library token webapi",
        ],
      },
      {
        id: "steamtools",
        tab: "tools" as const,
        label: t("settings.steamTools"),
        keywords: [
          t("settings.steamTools"),
          t("steamTools.sam.title"),
          "sam achievement bridge steam tools lab",
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
        keywords: [t("settings.defaultCurrency"), "currency price regional"],
      },
      {
        id: "performance",
        tab: "data" as const,
        label: t("settings.fetchSpeed"),
        keywords: [t("settings.hltbConcurrency"), t("settings.achievementsConcurrency"), "hltb achievements speed concurrency"],
      },
      {
        id: "data",
        tab: "data" as const,
        label: t("settings.cache"),
        keywords: [t("settings.steamAppIndex"), t("settings.cache"), t("settings.clearCache"), "cache index data steam apps"],
      },
      {
        id: "api",
        tab: "steam" as const,
        label: t("settings.apiKey"),
        keywords: [t("settings.apiKey"), "api key steam web api"],
      },
      {
        id: "maintenance",
        tab: "data" as const,
        label: t("settings.maintenance"),
        keywords: [t("settings.diagnostics.export"), "diagnostics maintenance import"],
      },
      {
        id: "automation",
        tab: "automation" as const,
        label: t("settings.automationExport"),
        keywords: [
          t("settings.automationExport.enabled"),
          t("settings.automationExport.url"),
          t("settings.automationExport.token"),
          "automation export snapshot publish endpoint webhook game vault http hltb",
        ],
      },
      {
        id: "updates",
        tab: "about" as const,
        label: t("settings.updates.section"),
        keywords: [t("settings.updates.check"), t("settings.updates.autoCheck"), "about version update install"],
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
        keywords: [t("appearance.accentColor"), t("appearance.customAccent"), "color accent theme"],
      },
      {
        id: "visibility",
        tab: "appearance" as const,
        label: t("appearance.visibility"),
        keywords: [
          t("appearance.smartLists"),
          t("appearance.emptyLists"),
          t("appearance.filterBar"),
          t("appearance.nowPlaying"),
          "visibility panels ui empty zero sidebar uncategorized",
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
        keywords: [t("appearance.language"), "language locale translation"],
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
          "steam library refresh games polling new games interval",
        ],
      },
      {
        id: "backups",
        tab: "backups" as const,
        label: t("settings.backups"),
        keywords: [t("settings.backups"), "backup restore delete manual"],
      },
      {
        id: "ignored",
        tab: "ignored" as const,
        label: t("settings.ignored"),
        keywords: [t("ignored.steamDetails"), t("ignored.hltb"), "ignored failed retry"],
      },
    ],
    [t]
  );
  const matchedSettingsSections = useMemo(() => {
    if (!settingsSearchText) return settingsSections;
    return settingsSections.filter((section) =>
      `${section.label} ${section.keywords.join(" ")}`.toLowerCase().includes(settingsSearchText)
    );
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
  const automationStatusTone =
    settings.automationPublishLastStatus === "success"
      ? "success"
      : settings.automationPublishLastStatus === "failed"
        ? "danger"
        : settings.automationPublishLastStatus === "skipped"
          ? "muted"
          : "default";
  const automationStatusLabel = settings.automationPublishLastStatus
    ? t(`settings.automationExport.status.${settings.automationPublishLastStatus}` as Parameters<typeof t>[0])
    : t("settings.automationExport.status.idle");
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
      badge: ignoredIds.length + hltbIgnoredIds.length,
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in"
        style={{
          width: "min(1040px, calc(100vw - 32px))",
          height: "min(760px, calc(100dvh - 48px))",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <h2 className="text-base font-semibold text-white tracking-tight">{t("settings.title")}</h2>
          <button
            onClick={onClose}
            className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="border-b border-repressurizer-border px-6 py-3">
          <div className="relative">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint"
            />
            <input
              type="search"
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
            <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3.5 text-sm ${
              message.includes("failed") || message.includes("Failed")
                ? "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
                : "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
            }`}>
              {message.includes("failed") || message.includes("Failed")
                ? <Warning size={16} weight="fill" />
                : <CheckCircle size={16} weight="fill" />}
              {message}
            </div>
          )}

          {settingsSearchText && matchedSettingsSections.length === 0 && (
            <div className="mb-4 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-sm text-repressurizer-text-muted">
              {t("settings.search.noResults")}
            </div>
          )}

          {(["general", "steam", "automation", "data", "tools", "about"] as SettingsTab[]).includes(tab) && (
            <div className="space-y-6">
              {/* Info grid */}
              {isSectionVisible("overview") && (
              <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.steamPath")}</span>
                    <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">{settings.steamPath}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.user")}</span>
                    <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">
                      {settings.steamPersonaName
                        ? `${settings.steamPersonaName} (${settings.steamId3})`
                        : settings.steamId3}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.steamId64")}</span>
                    <p className="mt-1 font-mono text-xs text-repressurizer-text-muted">{settings.steamId64}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.library")}</span>
                    <p className="mt-1 text-xs text-repressurizer-text-muted">
                      {t("statusbar.games", { count: gameCount })}, {t("statusbar.categories", { count: categoryCount })} (<span className="font-mono tabular-nums">{dynamicCount}</span> dynamic)
                    </p>
                  </div>
                </div>
              </div>
              )}

              <BackgroundSettingsSection isSectionVisible={isSectionVisible} />
              <SteamLibraryRefreshSection isSectionVisible={isSectionVisible} />

              {/* Steam Family */}
              {isSectionVisible("family") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.steamFamily")}</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <UsersThree size={16} weight="duotone" className="mt-0.5 text-repressurizer-text-faint" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-repressurizer-text">{t("settings.family.probeTitle")}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                        {t("settings.family.probeDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2 text-xs text-repressurizer-text-muted sm:grid-cols-2">
                    <p>
                      {t("settings.family.webApiKey")}: <span className="font-medium text-repressurizer-text">{settings.apiKey ? t("settings.family.configured") : t("settings.family.missing")}</span>
                    </p>
                    <p>
                      {t("settings.family.storeToken")}:{" "}
                      <span className="font-medium text-repressurizer-text">
                        {familyTokenSavedAt ? t("settings.family.savedDate", { date: new Date(familyTokenSavedAt).toLocaleDateString() }) : t("settings.family.notSaved")}
                      </span>
                      {familyTokenValidatedAt && (
                        <span className="text-repressurizer-text-faint">, {t("settings.family.validatedDate", { date: new Date(familyTokenValidatedAt).toLocaleDateString() })}</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-repressurizer-text-muted">
                      {t("settings.family.tokenLabel")}
                    </label>
                    <input
                      type="password"
                      value={familyAccessToken}
                      onChange={(e) => setFamilyAccessToken(e.target.value)}
                      onPaste={handleFamilyTokenPaste}
                      placeholder={t("settings.family.tokenPlaceholder")}
                      className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleOpenFamilyTokenPage}
                        className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
                      >
                        <Globe size={13} />
                        {t("settings.family.openTokenPage")}
                      </button>
                      <button
                        onClick={handleSaveFamilyToken}
                        disabled={!hasFamilyStoreToken}
                        className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-40"
                      >
                        {t("settings.family.saveToken")}
                      </button>
                      <button
                        onClick={handleClearFamilyToken}
                        disabled={!familyTokenSavedAt && !familyAccessToken}
                        className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger disabled:opacity-40"
                      >
                        <TrashSimple size={13} />
                        {t("settings.family.clearToken")}
                      </button>
                      <button
                        onClick={handleProbeFamily}
                        disabled={familyChecking || (!settings.apiKey && !hasFamilyStoreToken)}
                        className="btn-press flex min-w-[150px] flex-1 items-center justify-center rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40"
                      >
                        {familyChecking ? t("settings.family.checking") : t("settings.family.probe")}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={familyIncludeNonGames}
                      onChange={(e) => settings.setSettings({ includeSteamFamilyNonGames: e.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-repressurizer-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-repressurizer-text">{t("settings.family.includeNonGames")}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
                        {t("settings.family.includeNonGames.desc")}
                      </span>
                    </span>
                  </label>
                  {familyResult && (
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <MiniStat label={t("settings.family.total")} value={familyResult.total_apps} />
                      <MiniStat label={t("settings.family.owned")} value={familyResult.owned_apps} />
                      <MiniStat label={t("settings.family.shared")} value={familyResult.shared_apps} />
                      <MiniStat label={t("settings.family.excluded")} value={familyResult.excluded_apps} />
                    </div>
                  )}
                  {familyResult && (
                    <p className="text-xs leading-relaxed text-repressurizer-text-faint">
                      {familyResult.non_game_apps > 0 && !familyIncludeNonGames
                        ? `${t("settings.family.hiddenApps", { count: familyResult.non_game_apps })} `
                        : ""}
                      {familyResult.playtime_entries > 0
                        ? t("settings.family.playtimeLoaded", { count: familyResult.playtime_entries })
                        : familyResult.playtime_unavailable_reason
                          ? t("settings.family.playtimeUnavailable")
                          : t("settings.family.noPlaytime")}
                    </p>
                  )}
                  {familyLastFetched && !familyResult && (
                    <p className="text-xs text-repressurizer-text-faint">
                      {t("settings.family.cachedData", { date: new Date(familyLastFetched).toLocaleString() })}
                    </p>
                  )}
                </div>
              </div>
              )}

              {/* Steam Tools */}
              {isSectionVisible("steamtools") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.steamTools")}</h3>
                <div className="space-y-3">
                  <ToggleRow
                    icon={<Trophy size={15} weight="duotone" />}
                    label={t("steamTools.sam.title")}
                    description={t("settings.steamTools.achievementWrites.desc")}
                    checked={settings.steamToolsEnabled && settings.steamToolsAchievementWritesEnabled}
                    onChange={(v) =>
                      settings.setSettings({
                        steamToolsEnabled: v,
                        steamToolsAchievementWritesEnabled: v,
                      })
                    }
                  />
                </div>
              </div>
              )}

              {/* Display */}
              {isSectionVisible("display") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.display")}</h3>
                <ToggleRow
                  icon={<Eye size={15} weight="duotone" />}
                  label={t("settings.showDynamic")}
                  description={t("settings.showDynamic.desc")}
                  checked={settings.showDynamicCategories}
                  onChange={(v) => settings.setSettings({ showDynamicCategories: v })}
                />
                <ToggleRow
                  icon={<Heart size={15} weight="duotone" />}
                  label={t("settings.pinFavorites")}
                  description={t("settings.pinFavorites.desc")}
                  checked={settings.pinFavorites}
                  onChange={(v) => settings.setSettings({ pinFavorites: v })}
                />
              </div>
              )}

              {/* Currency */}
              {isSectionVisible("currency") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.currency")}</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-repressurizer-text">{t("settings.defaultCurrency")}</p>
                      <p className="mt-0.5 text-xs text-repressurizer-text-faint">{t("settings.currency.desc")}</p>
                    </div>
                    <SelectMenu
                      ariaLabel={t("settings.defaultCurrency")}
                      value={settings.currency ?? "EUR"}
                      onChange={(currency) => settings.setSettings({ currency })}
                      align="right"
                      size="sm"
                      className="w-[132px] shrink-0"
                      buttonClassName="bg-repressurizer-surface"
                      options={[
                        { value: "EUR", label: "EUR (€)" },
                        { value: "USD", label: "USD ($)" },
                        { value: "GBP", label: "GBP (£)" },
                        { value: "JPY", label: "JPY (¥)" },
                        { value: "CAD", label: "CAD (C$)" },
                        { value: "AUD", label: "AUD (A$)" },
                        { value: "CHF", label: "CHF (Fr)" },
                        { value: "BRL", label: "BRL (R$)" },
                        { value: "PLN", label: "PLN (zł)" },
                        { value: "RUB", label: "RUB (₽)" },
                      ]}
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Fetch Speed */}
              {isSectionVisible("performance") && (
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.fetchSpeed")}</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">{t("settings.hltbConcurrency")}</p>
                    <span className="font-mono text-sm text-repressurizer-accent tabular-nums">{settings.hltbConcurrency ?? 5}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={settings.hltbConcurrency ?? 5}
                    onChange={(e) => settings.setSettings({ hltbConcurrency: Number(e.target.value) })}
                    className="w-full accent-repressurizer-accent"
                  />
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("settings.hltbConcurrency.desc")}
                  </p>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">{t("settings.achievementsConcurrency")}</p>
                    <span className="font-mono text-sm text-repressurizer-accent tabular-nums">{settings.achievementsConcurrency ?? 5}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={settings.achievementsConcurrency ?? 5}
                    onChange={(e) => settings.setSettings({ achievementsConcurrency: Number(e.target.value) })}
                    className="w-full accent-repressurizer-accent"
                  />
                  <p className="text-xs text-repressurizer-text-faint">
                    {t("settings.achievementsConcurrency.desc")}
                  </p>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberSetting
                      label={t("settings.steamDetailsDelay")}
                      value={settings.steamDetailsDelayMs ?? 1200}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(steamDetailsDelayMs) => settings.setSettings({ steamDetailsDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.steamRatingsDelay")}
                      value={settings.steamRatingsDelayMs ?? 1200}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(steamRatingsDelayMs) => settings.setSettings({ steamRatingsDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.steamRatingsCooldown")}
                      value={settings.steamRatingsCooldownMinutes ?? 5}
                      suffix="min"
                      min={1}
                      max={60}
                      step={1}
                      onChange={(steamRatingsCooldownMinutes) => settings.setSettings({ steamRatingsCooldownMinutes })}
                    />
                    <NumberSetting
                      label={t("settings.hltbBatchDelay")}
                      value={settings.hltbBatchDelayMs ?? 500}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(hltbBatchDelayMs) => settings.setSettings({ hltbBatchDelayMs })}
                    />
                    <NumberSetting
                      label={t("settings.achievementsBatchDelay")}
                      value={settings.achievementsBatchDelayMs ?? 300}
                      suffix="ms"
                      min={100}
                      max={30000}
                      step={100}
                      onChange={(achievementsBatchDelayMs) => settings.setSettings({ achievementsBatchDelayMs })}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                    <span className="text-sm text-repressurizer-text">{t("settings.autoFetchDetailsOnRefresh")}</span>
                    <input
                      type="checkbox"
                      checked={settings.autoFetchDetailsOnRefresh !== false}
                      onChange={(e) => settings.setSettings({ autoFetchDetailsOnRefresh: e.target.checked })}
                      className="h-4 w-4 accent-repressurizer-accent"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                    <span className="text-sm text-repressurizer-text">{t("settings.autoFetchHltbOnRefresh")}</span>
                    <input
                      type="checkbox"
                      checked={settings.autoFetchHltbOnRefresh !== false}
                      onChange={(e) => settings.setSettings({ autoFetchHltbOnRefresh: e.target.checked })}
                      className="h-4 w-4 accent-repressurizer-accent"
                    />
                  </label>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-repressurizer-text">{t("settings.proxyRouting")}</p>
                      <p className="mt-0.5 text-xs text-repressurizer-text-faint">
                        {t("settings.proxyRouting.desc")}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.proxySettings.enabled}
                      onChange={(e) => updateProxySettings({ enabled: e.target.checked })}
                      className="h-4 w-4 accent-repressurizer-accent"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs text-repressurizer-text-faint">{t("settings.proxyRotationMode")}</p>
                      <SelectMenu
                        ariaLabel={t("settings.proxyRotationMode")}
                        value={settings.proxySettings.mode}
                        onChange={(mode) => updateProxySettings({ mode: mode as ProxyRotationMode })}
                        size="sm"
                        className="w-full"
                        options={[
                          { value: "fixed", label: t("settings.proxyMode.fixed") },
                          { value: "roundRobin", label: t("settings.proxyMode.roundRobin") },
                          { value: "batch", label: t("settings.proxyMode.batch") },
                          { value: "random", label: t("settings.proxyMode.random") },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs text-repressurizer-text-faint">{t("settings.proxyFixedProfile")}</p>
                      <SelectMenu
                        ariaLabel={t("settings.proxyFixedProfile")}
                        value={settings.proxySettings.activeProfileId}
                        onChange={(activeProfileId) => updateProxySettings({ activeProfileId })}
                        size="sm"
                        className="w-full"
                        options={[
                          { value: "", label: t("settings.proxyFirstEnabled") },
                          ...settings.proxySettings.profiles.map((profile) => ({
                            value: profile.id,
                            label: profile.name || profile.host || profile.id,
                          })),
                        ]}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ["steamApi", t("settings.proxyScope.steamApi")],
                      ["steamStore", t("settings.proxyScope.steamStore")],
                      ["hltb", t("settings.proxyScope.hltb")],
                      ["automation", t("settings.proxyScope.automation")],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                        <span className="text-xs text-repressurizer-text-muted">{label}</span>
                        <input
                          type="checkbox"
                          checked={settings.proxySettings.scopes[key]}
                          onChange={(e) => updateProxySettings({
                            scopes: { ...settings.proxySettings.scopes, [key]: e.target.checked },
                          })}
                          className="h-4 w-4 accent-repressurizer-accent"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {settings.proxySettings.profiles.map((profile) => (
                      <div key={profile.id} className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <input
                            value={profile.name}
                            onChange={(e) => updateProxyProfile(profile.id, { name: e.target.value })}
                            placeholder={t("settings.proxyName.placeholder")}
                            className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-repressurizer-text-muted">
                            <input
                              type="checkbox"
                              checked={profile.enabled}
                              onChange={(e) => updateProxyProfile(profile.id, { enabled: e.target.checked })}
                              className="h-4 w-4 accent-repressurizer-accent"
                            />
                            {t("settings.proxy.enabled")}
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveProxyProfile(profile.id)}
                            className="rounded-lg p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"
                          >
                            <TrashSimple size={14} />
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[110px_1fr_90px_90px]">
                          <SelectMenu
                            ariaLabel={t("settings.proxyType")}
                            value={profile.type}
                            onChange={(type) => updateProxyProfile(profile.id, { type: type as ProxyType })}
                            size="sm"
                            className="w-full"
                            options={[
                              { value: "http", label: "HTTP" },
                              { value: "https", label: "HTTPS" },
                              { value: "socks5", label: "SOCKS5" },
                            ]}
                          />
                          <input
                            value={profile.host}
                            onChange={(e) => updateProxyProfile(profile.id, { host: e.target.value })}
                            placeholder={t("settings.proxyHost.placeholder")}
                            className="min-w-0 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            value={profile.port}
                            onChange={(e) => updateProxyProfile(profile.id, {
                              port: clampIntegerInput(e.target.value, profile.port || 8080, 1, 65535),
                            })}
                            placeholder={t("settings.proxyPort.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={profile.batchSize}
                            onChange={(e) => updateProxyProfile(profile.id, {
                              batchSize: clampIntegerInput(e.target.value, profile.batchSize || 1, 1, 100),
                            })}
                            title={t("settings.proxyBatch.title")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            value={profile.username}
                            onChange={(e) => updateProxyProfile(profile.id, { username: e.target.value })}
                            placeholder={t("settings.proxyUsername.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                          <input
                            type="password"
                            value={profile.password}
                            onChange={(e) => updateProxyProfile(profile.id, { password: e.target.value })}
                            placeholder={t("settings.proxyPassword.placeholder")}
                            className="rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className={`min-w-0 truncate text-xs ${
                            profile.lastTestStatus === "ok"
                              ? "text-repressurizer-accent"
                              : profile.lastTestStatus === "failed"
                                ? "text-repressurizer-danger"
                                : "text-repressurizer-text-faint"
                          }`}>
                            {profile.lastTestMessage
                              ? `${profile.lastTestMessage}${profile.lastTestLatencyMs ? ` · ${profile.lastTestLatencyMs}ms` : ""}`
                              : t("settings.proxy.notTested")}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleTestProxyProfile(profile)}
                            disabled={testingProxyId === profile.id}
                            className="btn-press rounded-lg border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-50"
                          >
                            {testingProxyId === profile.id ? t("settings.proxy.testing") : t("settings.proxy.test")}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddProxyProfile}
                      className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-3 py-2 text-sm text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                    >
                      <Plus size={14} />
                      {t("settings.proxy.add")}
                    </button>
                  </div>
                </div>
              </div>
              )}

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

              {/* Maintenance */}
              {isSectionVisible("maintenance") && (
              <div className="space-y-3">
	                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.maintenance")}</h3>
	                <div className="grid gap-3 md:grid-cols-2">
	                  <button
	                    onClick={handleImportDepressurizerProfile}
	                    disabled={importingDepressurizer}
	                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
	                  >
	                    <UploadSimple size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
	                    <span>
	                      <span className="block text-sm text-repressurizer-text">
	                        {importingDepressurizer ? "Importing Depressurizer profile" : "Import Depressurizer profile"}
	                      </span>
	                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
	                        Merge categories, favorites, hidden games, filters and AutoCat metadata from a .profile file.
	                      </span>
	                    </span>
	                  </button>

	                  <button
	                    onClick={handleImportShortcuts}
	                    disabled={importingShortcuts}
	                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
	                  >
	                    <Stack size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
	                    <span>
	                      <span className="block text-sm text-repressurizer-text">
	                        {importingShortcuts ? "Importing non-Steam shortcuts" : "Import non-Steam shortcuts"}
	                      </span>
	                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
	                        Load shortcuts.vdf entries as local games and merge their Steam shortcut tags into collections.
	                      </span>
	                    </span>
	                  </button>

	                  <button
	                    onClick={handleImportLegacySharedConfig}
	                    disabled={importingLegacyConfig}
	                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
	                  >
	                    <ClockCounterClockwise size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
	                    <span>
	                      <span className="block text-sm text-repressurizer-text">
	                        {importingLegacyConfig ? "Importing legacy sharedconfig" : "Import legacy sharedconfig"}
	                      </span>
	                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
	                        Merge old Steam sharedconfig.vdf tags and hidden state into modern collections.
	                      </span>
	                    </span>
	                  </button>

	                  <button
	                    onClick={handleImportLocalLicenseLibrary}
	                    disabled={importingLocalLibrary}
	                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
	                  >
	                    <Database size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
	                    <span>
	                      <span className="block text-sm text-repressurizer-text">
	                        {importingLocalLibrary ? "Importing local license library" : "Import local license library"}
	                      </span>
	                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
	                        Load installed Steam licensecache and packageinfo.vdf ownership data without the Web API.
	                      </span>
	                    </span>
	                  </button>

	                  <button
	                    onClick={handleExportDiagnostics}
	                    disabled={diagnosticsExporting}
	                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
	                  >
	                    <Bug size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
	                    <span>
	                      <span className="block text-sm text-repressurizer-text">{diagnosticsExporting ? t("settings.diagnostics.exporting") : t("settings.diagnostics.export")}</span>
	                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">{t("settings.diagnostics.desc")}</span>
	                    </span>
	                  </button>

	                  {lastDepressurizerImport && (
	                    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 md:col-span-2">
	                      <p className="text-xs font-medium text-repressurizer-text">
	                        Last Depressurizer import: {lastDepressurizerImport.stats.categories} categories,{" "}
	                        {lastDepressurizerImport.stats.steamGames} Steam games,{" "}
	                        {lastDepressurizerImport.stats.nonSteamGames} non-Steam games,{" "}
	                        {lastDepressurizerImport.stats.supportedAutoCats}/{lastDepressurizerImport.stats.autoCats} AutoCats currently executable.
	                      </p>
	                      {lastDepressurizerImport.stats.nonSteamGames > 0 && (
	                        <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
	                          Non-Steam shortcut entries were preserved in the import metadata and will become active when shortcut support lands.
	                        </p>
	                      )}
	                    </div>
	                  )}
	                </div>
	              </div>
	              )}

              {/* Automation export */}
              {isSectionVisible("automation") && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.automationExport")}</h3>
                  <button
                    type="button"
                    onClick={() => setShowAutomationGuide(true)}
                    className="btn-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
                    aria-label={t("settings.automationExport.guideButton")}
                    title={t("settings.automationExport.guideButton")}
                  >
                    <Info size={14} weight="bold" />
                    {t("settings.automationExport.guideButton")}
                  </button>
                </div>
                <ToggleRow
                  icon={<CloudArrowDown size={15} weight="duotone" />}
                  label={t("settings.automationExport.enabled")}
                  description={t("settings.automationExport.enabled.desc")}
                  checked={settings.automationPublishEnabled}
                  onChange={(v) => settings.setSettings({ automationPublishEnabled: v })}
                />
                <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
                      {t("settings.automationExport.url")}
                    </label>
                    <input
                      type="url"
                      value={settings.automationPublishUrl}
                      onChange={(e) => settings.setSettings({ automationPublishUrl: e.target.value })}
                      placeholder={t("settings.automationExport.url.placeholder")}
                      className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
                        {t("settings.automationExport.token")}
                      </label>
                      <input
                        type="password"
                        value={settings.automationPublishBearerToken}
                        onChange={(e) => settings.setSettings({ automationPublishBearerToken: e.target.value })}
                        placeholder={t("settings.automationExport.token.placeholder")}
                        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
                        {t("settings.automationExport.interval")}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={settings.automationPublishIntervalHours}
                        onChange={(e) => settings.setSettings({ automationPublishIntervalHours: Number(e.target.value) || 24 })}
                        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-repressurizer-text-muted">
                        {settings.automationPublishLastPublishedAt
                          ? t("settings.automationExport.lastPublished", { date: new Date(settings.automationPublishLastPublishedAt).toLocaleString() })
                          : t("settings.automationExport.never")}
                      </p>
                      <p className="mt-0.5 break-words text-[11px] leading-relaxed text-repressurizer-text-faint">
                        {t("settings.automationExport.lastResult")}:{" "}
                        <span className={automationStatusTone === "success" ? "text-repressurizer-success" : automationStatusTone === "danger" ? "text-repressurizer-danger" : "text-repressurizer-text-muted"}>
                          {automationStatusLabel}
                        </span>
                        {settings.automationPublishLastAttemptedAt
                          ? ` · ${new Date(settings.automationPublishLastAttemptedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowAutomationLogs(true)}
                        className="btn-press flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text sm:flex-none"
                      >
                        {t("settings.automationExport.viewLogs")}
                      </button>
                      <button
                        onClick={handlePublishAutomation}
                        disabled={publishingAutomation || !settings.automationPublishUrl.trim() || gameCount === 0}
                        className="btn-press flex-1 rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40 sm:flex-none"
                      >
                        {publishingAutomation ? t("settings.automationExport.publishing") : t("settings.automationExport.publishNow")}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-repressurizer-text-faint">
                    {t("settings.automationExport.desc")}
                  </p>
                </div>
              </div>
              )}

              {/* Updates */}
              {isSectionVisible("updates") && (
                <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
                  <p className="font-medium text-repressurizer-text">Repressurizer v{__APP_VERSION__}</p>
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates || installingUpdate}
                    className="btn-press mt-3 flex w-full items-start gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2.5 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
                  >
                    <CloudArrowDown size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
                    <span>
                      <span className="block text-sm text-repressurizer-text">{checkingUpdates ? t("settings.updates.checking") : t("settings.updates.check")}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">{t("settings.updates.desc")}</span>
                    </span>
                  </button>
                  {availableUpdate && (
                    <button
                      onClick={handleInstallUpdate}
                      disabled={installingUpdate}
                      className="btn-press mt-3 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
                    >
                      {installingUpdate ? t("settings.updates.installing") : t("settings.updates.install", { version: availableUpdate.version })}
                    </button>
                  )}
                  {updateMessage && (
                    <div
                      className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        updateMessage.tone === "error"
                          ? "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
                          : "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
                      }`}
                    >
                      {updateMessage.tone === "error"
                        ? <Warning size={14} weight="fill" />
                        : <CheckCircle size={14} weight="fill" />}
                      {updateMessage.text}
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-repressurizer-text">{t("settings.updates.autoCheck")}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                          {t("settings.updates.autoCheck.desc", { hours: settings.updateAutoCheckIntervalHours || 12 })}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.checkUpdatesOnStartup ?? true}
                        onClick={() => settings.setSettings({ checkUpdatesOnStartup: !(settings.checkUpdatesOnStartup ?? true) })}
                        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                          settings.checkUpdatesOnStartup ?? true
                            ? "border-repressurizer-accent bg-repressurizer-accent/20"
                            : "border-repressurizer-border bg-repressurizer-surface"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full transition-transform ${
                            settings.checkUpdatesOnStartup ?? true
                              ? "translate-x-[22px] bg-repressurizer-accent"
                              : "translate-x-[3px] bg-repressurizer-text-muted"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle pt-3">
                      <span className="text-xs text-repressurizer-text-muted">{t("settings.updates.autoCheck.interval")}</span>
                      <SelectMenu
                        ariaLabel={t("settings.updates.autoCheck.interval")}
                        value={String(settings.updateAutoCheckIntervalHours || 12)}
                        onChange={(value) => settings.setSettings({ updateAutoCheckIntervalHours: Number(value) })}
                        align="right"
                        size="sm"
                        className="w-[140px] shrink-0"
                        buttonClassName="bg-repressurizer-bg"
                        options={UPDATE_CHECK_INTERVAL_OPTIONS.map((hours) => ({
                          value: String(hours),
                          label: t("settings.interval.hours", { count: hours }),
                        }))}
                      />
                    </div>
                  </div>
                  <div className="mt-4 border-t border-repressurizer-border-subtle pt-4">
                    <p className="text-xs font-medium text-repressurizer-text-muted">{t("settings.credits.title")}</p>
                    <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
                      {t("settings.credits.body")}{" "}
                      <button
                        type="button"
                        onClick={() => void open("https://github.com/Crimsab")}
                        className="text-repressurizer-accent underline-offset-2 transition-colors hover:underline"
                      >
                        @Crimsab
                      </button>
                      .
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
                      {t("settings.credits.thanks")}
                    </p>
                  </div>
                </div>
              )}

              {/* Reset */}
              {isSectionVisible("reset") && (
                <div className="pt-2">
                  <button
                    onClick={handleReset}
                    className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-danger/30 px-4 py-2 text-sm text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10"
                  >
                    <ArrowCounterClockwise size={14} />
                    {t("settings.reset")}
                  </button>
                  <p className="mt-1.5 text-xs text-repressurizer-text-faint">
                    {t("settings.reset.desc")}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "appearance" && <AppearanceTab isSectionVisible={isSectionVisible} />}

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

          {tab === "ignored" && (
            <div className="space-y-6">
              {/* Steam Details ignored */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-repressurizer-text-muted uppercase tracking-wider">
                  {t("ignored.steamDetails")} ({ignoredIds.length})
                </h3>
                <p className="text-xs text-repressurizer-text-faint">
                  {t("ignored.steamDetails.desc", { count: MAX_FAIL_RUNS })}
                </p>

                {ignoredIds.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-repressurizer-text-faint">
                    <CheckCircle size={16} weight="duotone" className="text-repressurizer-accent/50" />
                    <p className="text-xs">{t("ignored.none")}</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg divide-y divide-repressurizer-border-subtle max-h-48 overflow-auto">
                      {ignoredIds.map((id) => (
                        <div key={id} className="flex items-center gap-3 px-4 py-2">
                          <span className="flex-1 truncate text-sm text-repressurizer-text">
                            {getIgnoredGameName(id)}
                          </span>
                          <span className="font-mono text-[10px] text-repressurizer-text-faint shrink-0">
                            {t("ignored.failed", { count: failedGamesStore.fails[id] })}
                          </span>
                          <button
                            onClick={() => failedGamesStore.resetFailure(id)}
                            className="shrink-0 text-xs text-repressurizer-accent hover:underline"
                          >
                            {t("ignored.retry")}
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => failedGamesStore.resetAll()}
                      className="btn-press text-xs text-repressurizer-danger/70 hover:text-repressurizer-danger transition-colors"
                    >
                      {t("ignored.resetAll", { count: ignoredIds.length })}
                    </button>
                  </>
                )}
              </div>

              {/* HLTB ignored */}
              <div className="space-y-3 border-t border-repressurizer-border pt-5">
                <h3 className="text-xs font-semibold text-repressurizer-text-muted uppercase tracking-wider">
                  {t("ignored.hltb")} ({hltbIgnoredIds.length})
                </h3>
                <p className="text-xs text-repressurizer-text-faint">
                  {t("ignored.hltb.desc", { count: HLTB_MAX_FAILS })}
                </p>

                {hltbIgnoredIds.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-repressurizer-text-faint">
                    <CheckCircle size={16} weight="duotone" className="text-repressurizer-accent/50" />
                    <p className="text-xs">{t("ignored.none")}</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg divide-y divide-repressurizer-border-subtle max-h-48 overflow-auto">
                      {hltbIgnoredIds.map((id) => (
                        <div key={id} className="flex items-center gap-3 px-4 py-2">
                          <span className="flex-1 truncate text-sm text-repressurizer-text">
                            {getHltbIgnoredGameName(id)}
                          </span>
                          <button
                            onClick={() => hltbIgnoredStore.resetGame(id)}
                            className="shrink-0 text-xs text-repressurizer-accent hover:underline"
                          >
                            {t("ignored.retry")}
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => hltbIgnoredStore.resetAll()}
                      className="btn-press text-xs text-repressurizer-danger/70 hover:text-repressurizer-danger transition-colors"
                    >
                      {t("ignored.resetAll", { count: hltbIgnoredIds.length })}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </div>

        {showAutomationLogs && (
          <AutomationLogsDialog
            logs={filteredAutomationLogs}
            filter={automationLogFilter}
            sort={automationLogSort}
            onFilterChange={setAutomationLogFilter}
            onSortChange={setAutomationLogSort}
            onClose={() => setShowAutomationLogs(false)}
          />
        )}

        {showAutomationGuide && (
          <AutomationGuideDialog onClose={() => setShowAutomationGuide(false)} />
        )}

        {/* Confirmation dialog */}
        {pendingAction && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-2xl backdrop-blur-sm">
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
          </div>
        )}
      </div>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="truncate text-xs text-repressurizer-text-muted">{label}</p>
        <span className="font-mono text-xs tabular-nums text-repressurizer-accent">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-repressurizer-accent"
      />
    </div>
  );
}

function SettingsNavigation({
  tabs,
  activeTab,
  onTabChange,
  countTabMatches,
  variant,
}: {
  tabs: SettingsTabItem[];
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  countTabMatches: (tab: SettingsTab) => number;
  variant: "desktop" | "mobile";
}) {
  const t = useT();

  if (variant === "mobile") {
    return (
      <nav className="border-b border-repressurizer-border px-3 md:hidden" aria-label={t("settings.sections")}>
        <div className="flex gap-1 overflow-x-auto py-2">
          {tabs.map((item) => (
            <SettingsNavButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              matchCount={countTabMatches(item.id)}
              onClick={() => onTabChange(item.id)}
              variant="mobile"
            />
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="hidden w-48 shrink-0 border-r border-repressurizer-border bg-repressurizer-bg/35 p-3 md:block" aria-label={t("settings.sections")}>
      <div className="space-y-1">
        {tabs.map((item) => (
          <SettingsNavButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            matchCount={countTabMatches(item.id)}
            onClick={() => onTabChange(item.id)}
            variant="desktop"
          />
        ))}
      </div>
    </nav>
  );
}

function SettingsNavButton({
  item,
  active,
  matchCount,
  onClick,
  variant,
}: {
  item: SettingsTabItem;
  active: boolean;
  matchCount: number;
  onClick: () => void;
  variant: "desktop" | "mobile";
}) {
  const showMatch = matchCount > 0;
  const showBadge = item.badge != null && item.badge > 0;
  const base =
    variant === "desktop"
      ? "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors"
      : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors";
  const state = active
    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
    : "border-transparent text-repressurizer-text-muted hover:border-repressurizer-border hover:bg-repressurizer-surface/50 hover:text-repressurizer-text";
  const iconState = active ? "text-repressurizer-accent" : "text-repressurizer-text-faint";

  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      <span className={`shrink-0 ${iconState}`}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {showMatch && (
        <span className="ml-auto rounded-full bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent tabular-nums">
          {matchCount}
        </span>
      )}
      {showBadge && !showMatch && (
        <span className="ml-auto rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 tabular-nums">
          {item.badge}
        </span>
      )}
    </button>
  );
}

function mergeImportedCollections(
  current: SteamCollection[],
  imported: SteamCollection[]
): SteamCollection[] {
  const next = structuredClone(current);
  const byKey = new Map(next.map((collection, index) => [collection.key, index]));
  const byName = new Map(
    next
      .map((collection, index) => [collection.name.trim().toLowerCase(), index] as const)
      .filter(([, index]) => !next[index].is_dynamic)
  );

  for (const incoming of imported) {
    const normalizedName = incoming.name.trim().toLowerCase();
    const targetIndex =
      byKey.get(incoming.key) ??
      (isSpecialCollectionKey(incoming.key) ? undefined : byName.get(normalizedName));

    if (targetIndex == null) {
      byKey.set(incoming.key, next.length);
      byName.set(normalizedName, next.length);
      next.push(structuredClone(incoming));
      continue;
    }

    const target = next[targetIndex];
    const added = new Set([...(target.added ?? []), ...(incoming.added ?? [])]);
    const removed = new Set([...(target.removed ?? [])]);
    for (const appId of incoming.removed ?? []) {
      if (!added.has(appId)) removed.add(appId);
    }
    next[targetIndex] = {
      ...target,
      added: [...added],
      removed: [...removed],
      is_deleted: false,
    };
  }

  return next;
}

function isSpecialCollectionKey(key: string): boolean {
  return key === "user-collections.hidden" || key === "user-collections.favorite";
}

async function hydrateSteamAppIndexForNames(apiKey: string | null | undefined) {
  const store = useSteamAppIndexStore.getState();
  await store.hydrate().catch(() => {});
  const key = apiKey?.trim();
  if (!key) return;
  await store.ensureFresh(key).catch(() => {});
}

function resolveImportedSteamGameName(appId: number, preferredName?: string | null): string {
  const preferred = preferredName?.trim();
  if (preferred && !isPlaceholderGameName(appId, preferred)) return preferred;

  const cachedDetailName = useGameStore.getState().details[appId]?.name?.trim();
  if (cachedDetailName) return cachedDetailName;

  return useSteamAppIndexStore.getState().resolveName(appId) ?? preferred ?? `App ${appId}`;
}

function fetchDetailsForPlaceholderNames(games: OwnedGame[]) {
  const details = useGameStore.getState().details;
  const ids = games
    .filter((game) => isPlaceholderGameName(game.appid, game.name) && !details[game.appid])
    .map((game) => game.appid);
  if (ids.length > 0) useBackgroundFetchStore.getState().startDetailsFetch(ids);
}

function depressurizerGamesToOwnedGames(imported: DepressurizerProfileImport): OwnedGame[] {
  return imported.games
    .filter((game) => !game.nonSteam && game.appid > 0)
    .map((game) => ({
      appid: game.appid,
      name: resolveImportedSteamGameName(game.appid, game.name),
      playtime_forever: Math.max(0, Math.round((game.hoursPlayed ?? 0) * 60)),
      img_icon_url: null,
      rtime_last_played: game.lastPlayed ?? 0,
      is_collection_only: true,
    }));
}

function mergeAutoCategorizePresets(importedPresets: AutoCategorizePreset[]): number {
  if (importedPresets.length === 0) return 0;
  const autoCatStore = useAutoCategorizeStore.getState();
  const existingKeys = new Set(
    autoCatStore.presets.map((preset) => autoCategorizePresetKey(preset))
  );
  const next = [...autoCatStore.presets];
  let saved = 0;

  for (const preset of importedPresets) {
    const key = autoCategorizePresetKey(preset);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    next.push(preset);
    saved++;
  }

  if (saved > 0) autoCatStore.set({ presets: next });
  return saved;
}

function autoCategorizePresetKey(preset: AutoCategorizePreset): string {
  return `${preset.type}:${preset.name.trim().toLowerCase()}:${JSON.stringify(preset.config)}`;
}

function depressurizerFiltersToSavedAdvancedFilters(
  filters: DepressurizerImportedFilter[],
  collections: SteamCollection[]
): SavedAdvancedFilter[] {
  const now = Date.now();
  const categoryKeysByName = categoryKeyMap(collections);

  return filters
    .map((filter, index) => {
      const saved: SavedAdvancedFilter = {
        id: `dep-filter-${now}-${index}-${hashName(filter.name)}`,
        name: filter.name.trim() || "Depressurizer filter",
        allowCategoryKeys: depressurizerCategoryNamesToKeys(filter.allow, categoryKeysByName),
        requireCategoryKeys: depressurizerCategoryNamesToKeys(filter.require, categoryKeysByName),
        excludeCategoryKeys: depressurizerCategoryNamesToKeys(filter.exclude, categoryKeysByName),
        hidden: depressurizerSpecialState(filter.hidden),
        uncategorized: depressurizerSpecialState(filter.uncategorized),
        createdAt: now,
        updatedAt: now,
      };

      const hasCompatibleCriteria =
        saved.allowCategoryKeys.length > 0 ||
        saved.requireCategoryKeys.length > 0 ||
        saved.excludeCategoryKeys.length > 0 ||
        saved.hidden !== "any" ||
        saved.uncategorized !== "any";

      return hasCompatibleCriteria ? saved : null;
    })
    .filter((filter): filter is SavedAdvancedFilter => filter !== null);
}

function mergeSavedAdvancedFilters(importedFilters: SavedAdvancedFilter[]): number {
  if (importedFilters.length === 0) return 0;
  const advancedFilterStore = useAdvancedFilterStore.getState();
  const existingKeys = new Set(
    advancedFilterStore.filters.map((filter) => savedAdvancedFilterKey(filter))
  );
  const next = [...advancedFilterStore.filters];
  let saved = 0;

  for (const filter of importedFilters) {
    const key = savedAdvancedFilterKey(filter);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    next.push(filter);
    saved++;
  }

  if (saved > 0) advancedFilterStore.setFilters(next);
  return saved;
}

function savedAdvancedFilterKey(filter: SavedAdvancedFilter): string {
  return [
    filter.name.trim().toLowerCase(),
    [...filter.allowCategoryKeys].sort().join(","),
    [...filter.requireCategoryKeys].sort().join(","),
    [...filter.excludeCategoryKeys].sort().join(","),
    filter.hidden,
    filter.uncategorized,
  ].join(":");
}

function categoryKeyMap(collections: SteamCollection[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const collection of collections) {
    if (collection.is_dynamic || isSpecialCollectionKey(collection.key)) continue;
    map.set(normalizeCategoryName(collection.name), collection.key);
  }
  return map;
}

function depressurizerCategoryNamesToKeys(
  names: string[],
  categoryKeysByName: Map<string, string>
): string[] {
  const keys = new Set<string>();
  for (const name of names) {
    const key = categoryKeysByName.get(normalizeCategoryName(name));
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function depressurizerSpecialState(value: number): AdvancedSpecialState {
  if (value === 1) return "require";
  if (value === 2) return "exclude";
  return "any";
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

function shortcutsToOwnedGames(shortcuts: SteamShortcut[]): OwnedGame[] {
  return shortcuts
    .filter((shortcut) => shortcut.appid > 0)
    .map((shortcut) => ({
      appid: shortcut.appid,
      name: shortcut.appname?.trim() || `Shortcut ${shortcut.appid}`,
      playtime_forever: 0,
      img_icon_url: null,
      rtime_last_played: shortcut.lastPlayTime ?? 0,
      is_collection_only: true,
    }));
}

function shortcutsToCollections(shortcuts: SteamShortcut[]): SteamCollection[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const hidden = new Set<number>();
  const tagMap = new Map<string, Set<number>>();

  for (const shortcut of shortcuts) {
    if (shortcut.appid <= 0) continue;
    if (shortcut.hidden) hidden.add(shortcut.appid);
    for (const tag of shortcut.tags) {
      const name = tag.trim();
      if (!name) continue;
      const ids = tagMap.get(name) ?? new Set<number>();
      ids.add(shortcut.appid);
      tagMap.set(name, ids);
    }
  }

  const collections: SteamCollection[] = [
    {
      id: "hidden",
      key: "user-collections.hidden",
      name: "Hidden",
      added: [...hidden],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    },
  ];

  for (const [name, ids] of [...tagMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `uc-shortcut-${hashName(name)}-${slugName(name)}`;
    collections.push({
      id,
      key: `user-collections.${id}`,
      name,
      added: [...ids],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    });
  }

  return collections;
}

function legacySharedConfigToOwnedGames(games: LegacySharedConfigGame[]): OwnedGame[] {
  return games.map((game) => ({
    appid: game.appid,
    name: resolveImportedSteamGameName(game.appid),
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: game.lastPlayed ?? 0,
    is_collection_only: true,
  }));
}

function localLicenseAppsToOwnedGames(apps: LocalLicenseApp[]): OwnedGame[] {
  return apps.map((app) => ({
    appid: app.appid,
    name: resolveImportedSteamGameName(app.appid),
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
    is_collection_only: true,
  }));
}

function legacySharedConfigToCollections(games: LegacySharedConfigGame[]): SteamCollection[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const hidden = new Set<number>();
  const tagMap = new Map<string, Set<number>>();

  for (const game of games) {
    if (game.hidden) hidden.add(game.appid);
    for (const tag of game.tags) {
      const name = tag.trim();
      if (!name) continue;
      const ids = tagMap.get(name) ?? new Set<number>();
      ids.add(game.appid);
      tagMap.set(name, ids);
    }
  }

  const collections: SteamCollection[] = [
    {
      id: "hidden",
      key: "user-collections.hidden",
      name: "Hidden",
      added: [...hidden],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    },
  ];

  for (const [name, ids] of [...tagMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `uc-legacy-${hashName(name)}-${slugName(name)}`;
    collections.push({
      id,
      key: `user-collections.${id}`,
      name,
      added: [...ids],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    });
  }

  return collections;
}

function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "tag";
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function BackgroundSettingsSection({ isSectionVisible }: { isSectionVisible: (id: string) => boolean }) {
  const {
    minimizeToTray,
    startOnLogin,
    startOnLoginMode,
    desktopNotifications,
    setSettings,
  } = useSettingsStore();
  const t = useT();
  const [autostartRegistered, setAutostartRegistered] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState("");

  useEffect(() => {
    let cancelled = false;
    isAutostartEnabled()
      .then((enabled) => {
        if (cancelled) return;
        setAutostartRegistered(enabled);
        if (enabled !== startOnLogin) {
          setSettings({ startOnLogin: enabled });
        }
      })
      .catch((error) => {
        if (!cancelled) setAutostartError(t("settings.startOnLogin.failed", { error: String(error) }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartOnLoginChange = async (enabled: boolean) => {
    setAutostartBusy(true);
    setAutostartError("");
    try {
      if (enabled) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      const registered = await isAutostartEnabled();
      setAutostartRegistered(registered);
      setSettings({ startOnLogin: registered });
      if (enabled && !registered) {
        setAutostartError(t("settings.startOnLogin.notRegistered"));
      }
    } catch (error) {
      setAutostartError(t("settings.startOnLogin.failed", { error: String(error) }));
    } finally {
      setAutostartBusy(false);
    }
  };

  if (!isSectionVisible("background")) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.background")}</h3>
      <ToggleRow
        icon={<Tray size={15} weight="duotone" />}
        label={autostartBusy ? t("settings.startOnLogin.checking") : t("settings.startOnLogin")}
        description={t("settings.startOnLogin.desc")}
        checked={startOnLogin ?? false}
        onChange={handleStartOnLoginChange}
      />
      {(startOnLogin || autostartRegistered) && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-repressurizer-text">{t("settings.startOnLoginMode")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                {autostartRegistered === true
                  ? t("settings.startOnLogin.registered")
                  : t("settings.startOnLogin.notRegistered")}
              </p>
            </div>
            {autostartError && (
              <p className="max-w-[280px] text-right text-xs leading-relaxed text-repressurizer-danger">
                {autostartError}
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              {
                value: "tray" as const,
                label: t("settings.startOnLoginMode.tray"),
                description: t("settings.startOnLoginMode.tray.desc"),
                icon: <Tray size={15} weight="duotone" />,
              },
              {
                value: "window" as const,
                label: t("settings.startOnLoginMode.window"),
                description: t("settings.startOnLoginMode.window.desc"),
                icon: <Monitor size={15} weight="duotone" />,
              },
            ] satisfies Array<{ value: AppStartupMode; label: string; description: string; icon: React.ReactNode }>).map((option) => {
              const selected = (startOnLoginMode ?? "tray") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSettings({ startOnLoginMode: option.value })}
                  className={`btn-press flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                      : "border-repressurizer-border-subtle bg-repressurizer-surface/40 text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${selected ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>{option.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ToggleRow
        icon={<BellRinging size={15} weight="duotone" />}
        label={t("settings.desktopNotifications")}
        description={t("settings.desktopNotifications.desc")}
        checked={desktopNotifications ?? true}
        onChange={(v) => setSettings({ desktopNotifications: v })}
      />
      <ToggleRow
        icon={<Tray size={15} weight="duotone" />}
        label={t("settings.minimizeToTray")}
        description={t("settings.minimizeToTray.desc")}
        checked={minimizeToTray ?? false}
        onChange={(v) => setSettings({ minimizeToTray: v })}
      />
    </div>
  );
}

function SteamLibraryRefreshSection({ isSectionVisible }: { isSectionVisible: (id: string) => boolean }) {
  const settings = useSettingsStore();
  const t = useT();
  const intervalMinutes = settings.libraryAutoRefreshIntervalMinutes || 30;

  if (!isSectionVisible("libraryRefresh")) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("settings.libraryAutoRefresh")}</h3>
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <GameController size={15} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
            <div className="min-w-0">
              <p className="text-sm text-repressurizer-text">{t("settings.libraryAutoRefresh")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                {t("settings.libraryAutoRefresh.desc", { minutes: intervalMinutes })}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoRefreshLibraryEnabled ?? false}
            onClick={() => settings.setSettings({ autoRefreshLibraryEnabled: !(settings.autoRefreshLibraryEnabled ?? false) })}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
              settings.autoRefreshLibraryEnabled
                ? "border-repressurizer-accent bg-repressurizer-accent/20"
                : "border-repressurizer-border bg-repressurizer-surface"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full transition-transform ${
                settings.autoRefreshLibraryEnabled
                  ? "translate-x-[22px] bg-repressurizer-accent"
                  : "translate-x-[3px] bg-repressurizer-text-muted"
              }`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle pt-3">
          <span className="text-xs text-repressurizer-text-muted">{t("settings.libraryAutoRefresh.interval")}</span>
          <SelectMenu
            ariaLabel={t("settings.libraryAutoRefresh.interval")}
            value={String(intervalMinutes)}
            onChange={(value) => settings.setSettings({ libraryAutoRefreshIntervalMinutes: Number(value) })}
            align="right"
            size="sm"
            className="w-[140px] shrink-0"
            buttonClassName="bg-repressurizer-surface"
            options={LIBRARY_REFRESH_INTERVAL_OPTIONS.map((minutes) => ({
              value: String(minutes),
              label: t("settings.interval.minutes", { count: minutes }),
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function AppearanceTab({ isSectionVisible }: { isSectionVisible: (id: string) => boolean }) {
  const {
    accentColor,
    recentAccentColors,
    showSmartLists,
    showEmptyLists,
    showNowPlaying,
    showFilterBar,
    showDetailHltb,
    showDetailMetacritic,
    showDetailPrice,
    sidebarWidth,
    theme,
    language,
    setSettings,
  } = useSettingsStore();
  const t = useT();
  const [customHex, setCustomHex] = useState(accentColor);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewAccent, setPreviewAccent] = useState(accentColor);
  const pickerRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<number | null>(null);
  const activeAccent = /^#[0-9a-fA-F]{6}$/.test(previewAccent) ? previewAccent : "#10b981";

  useEffect(() => {
    setPreviewAccent(accentColor);
    setCustomHex(accentColor);
  }, [accentColor]);

  useEffect(() => {
    return () => {
      if (previewFrameRef.current != null) cancelAnimationFrame(previewFrameRef.current);
    };
  }, []);

  const commitAccent = (hex: string, saveRecent = false) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const normalized = hex.toLowerCase();
    const nextSettings: Partial<ReturnType<typeof useSettingsStore.getState>> = { accentColor: normalized };
    if (saveRecent) {
      nextSettings.recentAccentColors = [normalized, ...(recentAccentColors ?? []).filter((c) => c !== normalized)].slice(0, 8);
    }
    setSettings(nextSettings);
    setCustomHex(normalized);
    setPreviewAccent(normalized);
    applyAccentColor(normalized);
  };

  const handlePickPreset = (hex: string) => {
    commitAccent(hex, false);
  };

  const handleCustomHex = (hex: string) => {
    setCustomHex(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const normalized = hex.toLowerCase();
      setPreviewAccent(normalized);
      applyAccentColor(normalized);
      if (previewFrameRef.current != null) cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = requestAnimationFrame(() => {
        applyAccentColor(normalized);
        previewFrameRef.current = null;
      });
    }
  };

  const closePicker = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(customHex)) {
      commitAccent(customHex, true);
    }
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const handleDown = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      closePicker();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen, customHex]);

  const handleResetColor = () => {
    setSettings({ accentColor: "" });
    applyAccentColor("");
    setCustomHex("");
    setPreviewAccent("");
  };

  return (
    <div className="space-y-6">
      {/* Accent color */}
      {isSectionVisible("accent") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.accentColor")}</h3>
        <p className="text-xs text-repressurizer-text-faint -mt-1">{t("appearance.accentColor.desc")}</p>

        <div className="relative rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-press relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              title={accentColor || t("appearance.defaultAccent")}
              aria-label={accentColor || t("appearance.defaultAccent")}
              style={{
                background: activeAccent,
              }}
            >
              <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            </button>
            <div className="mr-1 min-w-[120px]">
              <p className="text-sm font-medium text-repressurizer-text">{accentColor ? accentColor : t("appearance.defaultAccent")}</p>
              <p className="text-[10px] text-repressurizer-text-faint">{t("appearance.accentCompact.desc")}</p>
            </div>
            {ACCENT_PRESETS.map((p) => (
              <AccentSwatch
                key={p.id}
                color={p.accent}
                label={p.label}
                active={accentColor === p.accent}
                onClick={() => handlePickPreset(p.accent)}
              />
            ))}
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className={`btn-press relative h-8 w-8 shrink-0 rounded-full transition-transform hover:scale-105 ${pickerOpen ? "ring-2 ring-white ring-offset-2 ring-offset-repressurizer-bg" : ""}`}
              title={t("appearance.pickAccentColor")}
              aria-label={t("appearance.pickAccentColor")}
              style={{
                background: "conic-gradient(from 90deg, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
              }}
            >
              <span className="absolute inset-[3px] rounded-full bg-repressurizer-bg/70" />
            </button>
            {accentColor && (
              <button
                onClick={handleResetColor}
                title={t("appearance.resetColor")}
                className="btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-repressurizer-border text-repressurizer-text-faint transition-colors hover:border-repressurizer-text-muted hover:text-repressurizer-text"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </div>
          {recentAccentColors?.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-repressurizer-border-subtle pt-3">
              <span className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">
                {t("appearance.recentColors")}
              </span>
              {recentAccentColors.map((color) => (
                <AccentSwatch
                  key={color}
                  color={color}
                  label={color}
                  active={accentColor === color}
                  onClick={() => commitAccent(color, false)}
                  small
                />
              ))}
            </div>
          )}
          {pickerOpen && (
            <div ref={pickerRef} className="absolute right-3 top-14 z-20 w-72 rounded-xl border border-repressurizer-border bg-repressurizer-surface p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              <div className="mb-3 flex items-center gap-3">
                <label className="relative block h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-repressurizer-border">
                  <span className="block h-full w-full" style={{ backgroundColor: activeAccent }} />
                  <input
                    type="color"
                    value={activeAccent}
                    onChange={(e) => handleCustomHex(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t("appearance.pickAccentColor")}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-repressurizer-text">{t("appearance.customAccent")}</p>
                  <p className="mt-0.5 text-xs text-repressurizer-text-faint">{t("appearance.customAccent.desc")}</p>
                </div>
              </div>
              <label className="mb-1.5 block text-xs text-repressurizer-text-muted">{t("appearance.hexValue")}</label>
              <input
                type="text"
                value={customHex}
                onChange={(e) => handleCustomHex(e.target.value)}
                placeholder="#10b981"
                maxLength={7}
                className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 font-mono text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
              />
              <button
                onClick={closePicker}
                className="mt-3 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
              >
                {t("common.done")}
              </button>
              {accentColor && (
                <button
                  onClick={handleResetColor}
                  className="mt-3 w-full rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
                >
                  {t("appearance.resetColor")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* UI visibility */}
      {isSectionVisible("visibility") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.visibility")}</h3>
        <ToggleRow
          icon={<Stack size={15} weight="duotone" />}
          label={t("appearance.smartLists")}
          description={t("appearance.smartLists.desc")}
          checked={showSmartLists}
          onChange={(v) => setSettings({ showSmartLists: v })}
        />
        <ToggleRow
          icon={<Eye size={15} weight="duotone" />}
          label={t("appearance.emptyLists")}
          description={t("appearance.emptyLists.desc")}
          checked={showEmptyLists}
          onChange={(v) => setSettings({ showEmptyLists: v })}
        />
        <ToggleRow
          icon={<Monitor size={15} weight="duotone" />}
          label={t("appearance.nowPlaying")}
          description={t("appearance.nowPlaying.desc")}
          checked={showNowPlaying}
          onChange={(v) => setSettings({ showNowPlaying: v })}
        />
        <ToggleRow
          icon={<Funnel size={15} weight="duotone" />}
          label={t("appearance.filterBar")}
          description={t("appearance.filterBar.desc")}
          checked={showFilterBar}
          onChange={(v) => setSettings({ showFilterBar: v })}
        />
        <ToggleRow
          icon={<Timer size={15} weight="duotone" />}
          label={t("appearance.detailHltb")}
          description={t("appearance.detailHltb.desc")}
          checked={showDetailHltb}
          onChange={(v) => setSettings({ showDetailHltb: v })}
        />
        <ToggleRow
          icon={<Star size={15} weight="duotone" />}
          label={t("appearance.detailMetacritic")}
          description={t("appearance.detailMetacritic.desc")}
          checked={showDetailMetacritic}
          onChange={(v) => setSettings({ showDetailMetacritic: v })}
        />
        <ToggleRow
          icon={<Database size={15} weight="duotone" />}
          label={t("appearance.detailPrice")}
          description={t("appearance.detailPrice.desc")}
          checked={showDetailPrice}
          onChange={(v) => setSettings({ showDetailPrice: v })}
        />
      </div>
      )}

      {/* Theme */}
      {isSectionVisible("theme") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.theme")}</h3>
        <div className="flex gap-2">
          {([
            { value: "dark", label: t("appearance.theme.dark"), icon: <Moon size={16} weight="duotone" /> },
            { value: "dim", label: t("appearance.theme.dim"), icon: <CloudMoon size={16} weight="duotone" /> },
            { value: "light", label: t("appearance.theme.light"), icon: <Sun size={16} weight="duotone" /> },
          ] as { value: AppTheme; label: string; icon: React.ReactNode }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setSettings({ theme: opt.value });
                applyTheme(opt.value);
              }}
              className={`btn-press flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                (theme ?? "dark") === opt.value
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Language */}
      {isSectionVisible("language") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.language")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => setSettings({ language: locale })}
              className={`btn-press flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                normalizeLocale(language) === locale
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">{getLocaleFlag(locale)}</span>
              <span className="truncate">{getLocaleDisplayName(locale, normalizeLocale(language))}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Sidebar width */}
      {isSectionVisible("sidebar") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.sidebarWidth")}</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={160}
            max={400}
            step={8}
            value={sidebarWidth}
            onChange={(e) => setSettings({ sidebarWidth: Number(e.target.value) })}
            className="flex-1 accent-[var(--color-repressurizer-accent)]"
          />
          <span className="w-14 text-right font-mono text-sm tabular-nums text-repressurizer-text-muted">
            {sidebarWidth}px
          </span>
        </div>
        <p className="text-xs text-repressurizer-text-faint">{t("appearance.sidebarWidth.desc")}</p>
      </div>
      )}

    </div>
  );
}

function AccentSwatch({
  color,
  label,
  active,
  onClick,
  small = false,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`btn-press relative shrink-0 rounded-full transition-transform hover:scale-105 ${
        small ? "h-6 w-6" : "h-8 w-8"
      } ${active ? "ring-2 ring-white ring-offset-2 ring-offset-repressurizer-bg" : ""}`}
      style={{ backgroundColor: color }}
    >
      {active && (
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <CheckCircle size={small ? 10 : 13} weight="fill" />
        </span>
      )}
    </button>
  );
}

function formatTimestamp(ts: string): string {
  if (ts.length >= 15) {
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  }
  return ts;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AutomationLogsDialog({
  logs,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onClose,
}: {
  logs: AutomationPublishLogEntry[];
  filter: AutomationLogFilter;
  sort: AutomationLogSort;
  onFilterChange: (value: AutomationLogFilter) => void;
  onSortChange: (value: AutomationLogSort) => void;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_16px_48px_rgba(0,0,0,0.5)]" style={{ maxHeight: "min(640px, calc(100vh - 96px))" }}>
        <div className="flex items-center justify-between border-b border-repressurizer-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("settings.automationExport.logsTitle")}</h3>
            <p className="mt-0.5 text-[11px] text-repressurizer-text-faint">
              {t("settings.automationExport.logsDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-repressurizer-border px-4 py-3">
          <SelectMenu<AutomationLogFilter>
            ariaLabel={t("settings.automationExport.logsTitle")}
            value={filter}
            onChange={onFilterChange}
            size="sm"
            className="w-40"
            options={[
              { value: "all", label: t("settings.automationExport.logs.all") },
              { value: "success", label: t("settings.automationExport.status.success") },
              { value: "failed", label: t("settings.automationExport.status.failed") },
              { value: "skipped", label: t("settings.automationExport.status.skipped") },
            ]}
          />
          <SelectMenu<AutomationLogSort>
            ariaLabel={t("settings.automationExport.logsTitle")}
            value={sort}
            onChange={onSortChange}
            size="sm"
            className="w-40"
            options={[
              { value: "desc", label: t("settings.automationExport.logs.newest") },
              { value: "asc", label: t("settings.automationExport.logs.oldest") },
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-repressurizer-text-muted">
              {t("settings.automationExport.logs.empty")}
            </div>
          ) : (
            <div className="divide-y divide-repressurizer-border-subtle">
              {logs.map((entry) => (
                <div key={entry.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_132px_minmax(0,1fr)]">
                  <p className="font-mono text-[11px] text-repressurizer-text-faint tabular-nums sm:whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                  <p className={`whitespace-nowrap text-xs font-medium ${
                    entry.status === "success"
                      ? "text-repressurizer-success"
                      : entry.status === "failed"
                        ? "text-repressurizer-danger"
                        : "text-repressurizer-text-muted"
                  }`}>
                    {t(`settings.automationExport.status.${entry.status}` as Parameters<typeof t>[0])}
                    {entry.httpStatus > 0 && (
                      <span className="ml-2 font-mono text-repressurizer-text-muted">HTTP {entry.httpStatus}</span>
                    )}
                  </p>
                  <p className="min-w-0 text-xs leading-relaxed text-repressurizer-text-muted">
                    {entry.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutomationGuideDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const docsUrl = "https://github.com/Crimsab/Repressurizer/blob/main/docs/automation-export.md";
  const schemaUrl = "https://github.com/Crimsab/Repressurizer/blob/main/docs/integrations/repressurizer-snapshot-v1.md";
  const items = [
    {
      title: t("settings.automationExport.guide.endpointTitle"),
      body: t("settings.automationExport.guide.endpointBody"),
    },
    {
      title: t("settings.automationExport.guide.payloadTitle"),
      body: t("settings.automationExport.guide.payloadBody"),
    },
    {
      title: t("settings.automationExport.guide.changeTitle"),
      body: t("settings.automationExport.guide.changeBody"),
    },
    {
      title: t("settings.automationExport.guide.receiverTitle"),
      body: t("settings.automationExport.guide.receiverBody"),
    },
    {
      title: t("settings.automationExport.guide.limitsTitle"),
      body: t("settings.automationExport.guide.limitsBody"),
    },
    {
      title: t("settings.automationExport.guide.packagesTitle"),
      body: t("settings.automationExport.guide.packagesBody"),
    },
  ];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_16px_48px_rgba(0,0,0,0.5)]" style={{ maxHeight: "min(640px, calc(100vh - 96px))" }}>
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("settings.automationExport.guideTitle")}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
              {t("settings.automationExport.guideDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3"
              >
                <p className="text-xs font-semibold text-repressurizer-text">{item.title}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/60 px-3 py-2 text-[11px] leading-relaxed text-repressurizer-text-muted">
            {t("settings.automationExport.guideFooter")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void open(docsUrl)}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
            >
              <Globe size={13} weight="duotone" />
              {t("settings.automationExport.guideOpenAutomationDocs")}
            </button>
            <button
              type="button"
              onClick={() => void open(schemaUrl)}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
            >
              <Globe size={13} weight="duotone" />
              {t("settings.automationExport.guideOpenSchemaDocs")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-repressurizer-text tabular-nums">{value}</p>
    </div>
  );
}

function formatTime(ts: string): string {
  if (ts.length >= 15) {
    return `${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  }
  return ts;
}

function formatDate(ts: string): string {
  if (ts.length >= 8) {
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  }
  return ts;
}

function groupBackupsByDay(backups: BackupInfo[]): Map<string, BackupInfo[]> {
  const groups = new Map<string, BackupInfo[]>();
  for (const b of backups) {
    const day = b.timestamp.slice(0, 8);
    const arr = groups.get(day) ?? [];
    arr.push(b);
    groups.set(day, arr);
  }
  return groups;
}

function BackupsTab({
  backups,
  loading,
  restoring,
  onRestore,
  onDelete,
  onManualBackup,
}: {
  backups: BackupInfo[];
  loading: boolean;
  restoring: boolean;
  onRestore: (b: BackupInfo) => void;
  onDelete: (b: BackupInfo) => void;
  onManualBackup: () => void;
}) {
  const games = useGameStore((s) => s.games);
  const t = useT();

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("repressurizer-backup-favorites");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set<string>();
    }
  });

  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => groupBackupsByDay(backups), [backups]);
  const days = useMemo(() => [...grouped.keys()], [grouped]);

  useEffect(() => {
    if (days.length > 1) {
      setCollapsedDays(new Set(days.slice(1)));
    }
  }, [days.length > 0 ? days[0] : ""]);

  const toggleFavorite = (filename: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      localStorage.setItem("repressurizer-backup-favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-repressurizer-text-faint">
            {t("backups.desc")}
          </p>
          <button
            onClick={onManualBackup}
            className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            <Plus size={12} weight="bold" />
            {t("backups.create")}
          </button>
        </div>
        <div className="py-8 text-center animate-fade-in">
          <ClockCounterClockwise size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
          <p className="text-sm text-repressurizer-text-muted">{t("backups.noBackups")}</p>
        </div>
      </div>
    );
  }

  const favoriteBackups = backups.filter((b) => favorites.has(b.filename));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-repressurizer-text-faint">
          {t("backups.pinDesc")}
        </p>
        <button
          onClick={onManualBackup}
          className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
        >
          <Plus size={12} weight="bold" />
          {t("backups.create")}
        </button>
      </div>

      {/* Pinned favorites */}
      {favoriteBackups.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-500">
            <Star size={12} weight="fill" />
            {t("backups.pinned")}
          </h3>
          <div className="space-y-1">
            {favoriteBackups.map((backup) => (
              <BackupRow
                key={backup.filename}
                backup={backup}
                games={games}
                isFavorite={true}
                restoring={restoring}
                onRestore={onRestore}
                onDelete={onDelete}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </div>
      )}

      {/* Day groups */}
      {days.map((day) => {
        const dayBackups = grouped.get(day) ?? [];
        const isCollapsed = collapsedDays.has(day);
        return (
          <div key={day}>
            <button
              onClick={() => toggleDay(day)}
              className="mb-2 flex w-full items-center gap-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
            >
              {isCollapsed ? <CaretRight size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
              {formatDate(day)}
              <span className="font-normal text-repressurizer-text-faint">({dayBackups.length})</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1">
                {dayBackups.map((backup) => (
                  <BackupRow
                    key={backup.filename}
                    backup={backup}
                    games={games}
                    isFavorite={favorites.has(backup.filename)}
                    restoring={restoring}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BackupRow({
  backup,
  games,
  isFavorite,
  restoring,
  onRestore,
  onDelete,
  onToggleFavorite,
}: {
  backup: BackupInfo;
  games: Record<number, import("../../lib/types").OwnedGame>;
  isFavorite: boolean;
  restoring: boolean;
  onRestore: (b: BackupInfo) => void;
  onDelete: (b: BackupInfo) => void;
  onToggleFavorite: (filename: string) => void;
}) {
  const desc = renderDescription(backup.description, games);
  const t = useT();

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-3.5 py-2.5 transition-colors hover:border-repressurizer-border">
      <button
        onClick={() => onToggleFavorite(backup.filename)}
        className={`mt-0.5 shrink-0 transition-colors ${isFavorite ? "text-amber-500" : "text-repressurizer-border hover:text-amber-500/50"}`}
        title={isFavorite ? t("backups.unpin") : t("backups.pin")}
      >
        <Star size={14} weight={isFavorite ? "fill" : "regular"} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-repressurizer-text tabular-nums">
            {formatTime(backup.timestamp)}
          </span>
          <span className="font-mono text-xs text-repressurizer-text-faint tabular-nums">
            {formatSize(backup.size)}
          </span>
          {backup.is_pre_restore && (
            <span className="rounded-md bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
              {t("backups.preRestore")}
            </span>
          )}
        </div>
        {desc && (
          <p className="mt-0.5 text-xs text-repressurizer-text-faint leading-relaxed truncate" title={backup.description}>
            {desc}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 mt-0.5">
        <button
          onClick={() => onRestore(backup)}
          disabled={restoring}
          className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent/10 px-2.5 py-1 text-xs text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/20 disabled:opacity-50"
        >
          <ArrowCounterClockwise size={11} />
          {t("backups.restore")}
        </button>
        <button
          onClick={() => onDelete(backup)}
          className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-danger/8 px-2.5 py-1 text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/15"
        >
          <TrashSimple size={11} />
          {t("backups.delete")}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`btn-press flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
        checked
          ? "border-repressurizer-accent bg-repressurizer-accent/10"
          : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
      }`}
    >
      <span className={`mt-0.5 ${checked ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-repressurizer-text">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">{description}</p>
      </div>
      <span
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked
            ? "border-repressurizer-accent bg-repressurizer-accent/20"
            : "border-repressurizer-border bg-repressurizer-surface"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${
            checked ? "translate-x-[22px] bg-repressurizer-accent" : "translate-x-[3px] bg-repressurizer-text-muted"
          }`}
        />
      </span>
    </button>
  );
}

function renderDescription(
  description: string,
  games: Record<number, import("../../lib/types").OwnedGame>
): string {
  if (!description) return "";
  if (description === "Pre-restore snapshot") return description;

  if (description.startsWith("{")) {
    try {
      const d = JSON.parse(description);
      const parts: string[] = [];
      const gameName = (id: number) => games[id]?.name ?? `#${id}`;

      if (d.added_collections?.length > 0) {
        parts.push(`Added: ${d.added_collections.join(", ")}`);
      }
      if (d.removed_collections?.length > 0) {
        parts.push(`Removed: ${d.removed_collections.join(", ")}`);
      }

      for (const c of d.game_changes ?? []) {
        const items: string[] = [];
        for (const id of (c.added ?? []).slice(0, 5)) {
          items.push(`+${gameName(id)}`);
        }
        if ((c.added?.length ?? 0) > 5) {
          items.push(`+${c.added.length - 5} more`);
        }
        for (const id of (c.removed ?? []).slice(0, 5)) {
          items.push(`-${gameName(id)}`);
        }
        if ((c.removed?.length ?? 0) > 5) {
          items.push(`-${c.removed.length - 5} more`);
        }
        if (items.length > 0) {
          parts.push(`${c.collection}: ${items.join(", ")}`);
        }
      }

      return parts.join(" | ") || "No changes";
    } catch {
      return description;
    }
  }

  return description;
}
