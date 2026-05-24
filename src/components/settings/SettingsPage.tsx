import { useState, useEffect, useMemo } from "react";
import type { ClipboardEvent } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useFamilyStore } from "../../stores/familyStore";
import { useSteamAppIndexStore } from "../../stores/steamAppIndexStore";
import { familyAppsToOwnedGames } from "../../lib/familyLibrary";
import { isSteamAppIndexStale } from "../../lib/steamAppIndex";
import { useFailedGamesStore, getIgnoredGameName, MAX_FAIL_RUNS } from "../../stores/failedGamesStore";
import { useHltbIgnoredStore, getHltbIgnoredGameName, HLTB_MAX_FAILS } from "../../stores/hltbIgnoredStore";

import { listBackups, restoreBackup, deleteBackup, createManualBackup, loadCollections, getCacheInfo, exportDiagnostics, fetchFamilyLibrary } from "../../lib/tauri";
import type { CacheInfo, FamilyLibraryResult } from "../../lib/tauri";
import {
  clearSteamFamilyToken,
  extractStoreWebApiToken,
  loadSteamFamilyToken,
  saveSteamFamilyToken,
  type SteamFamilyTokenCache,
} from "../../lib/steamFamilyToken";
import type { BackupInfo } from "../../lib/types";
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
  Monitor,
  Globe,
  Moon,
  Sun,
  CloudMoon,
  Tray,
  Bug,
  CloudArrowDown,
  UsersThree,
} from "@phosphor-icons/react";
import { ACCENT_PRESETS, applyAccentColor, applyTheme } from "../../stores/settingsStore";
import { useT } from "../../lib/i18n";
import type { AppTheme, AppLocale } from "../../lib/types";

interface SettingsPageProps {
  onClose: () => void;
}

function redactTail(value: string | null | undefined): string | null {
  if (!value) return null;
  return `***${value.slice(-4)}`;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const settings = useSettingsStore();
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
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

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"general" | "appearance" | "backups" | "ignored">("general");
  const [customHex, setCustomHex] = useState(settings.accentColor);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [diagnosticsExporting, setDiagnosticsExporting] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [familyAccessToken, setFamilyAccessToken] = useState("");
  const [familyTokenSavedAt, setFamilyTokenSavedAt] = useState<number | null>(null);
  const [familyTokenValidatedAt, setFamilyTokenValidatedAt] = useState<number | null>(null);
  const [familyChecking, setFamilyChecking] = useState(false);
  const [familyResult, setFamilyResult] = useState<FamilyLibraryResult | null>(null);
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
    if (tab === "general") getCacheInfo().then(setCacheInfo).catch(() => {});
  }, [tab]);

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
      setMessage(`Failed to load backups: ${e}`);
    }
    setLoadingBackups(false);
  };

  const handleRestore = (backup: BackupInfo) => {
    setPendingAction({
      type: "restore",
      backup,
      message: `Restore backup from ${formatTimestamp(backup.timestamp)}? This will overwrite your current collections. A pre-restore backup will be created automatically.`,
    });
  };

  const handleDeleteBackup = (backup: BackupInfo) => {
    setPendingAction({
      type: "delete",
      backup,
      message: `Delete backup from ${formatTimestamp(backup.timestamp)}? This cannot be undone.`,
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
        setMessage("Backup restored successfully! Reload Steam to see changes.");
        loadBackups();
      } catch (e) {
        setMessage(`Restore failed: ${e}`);
      }
      setRestoring(false);
    } else if (action.type === "delete" && action.backup) {
      try {
        await deleteBackup(settings.steamPath, settings.steamId3, action.backup.filename);
        setMessage("Backup deleted.");
        loadBackups();
        setTimeout(() => setMessage(""), 2000);
      } catch (e) {
        setMessage(`Delete failed: ${e}`);
      }
    } else if (action.type === "reset") {
      settings.reset();
    }
  };

  const handleManualBackup = async () => {
    try {
      await createManualBackup(settings.steamPath, settings.steamId3, "");
      setMessage("Manual backup created.");
      loadBackups();
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(`Backup failed: ${e}`);
    }
  };

  const handleSaveApiKey = () => {
    settings.setSettings({ apiKey });
    setMessage("API key saved.");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleRefreshSteamAppIndex = async () => {
    setMessage("");
    try {
      await useSteamAppIndexStore.getState().refresh(settings.apiKey);
      const current = Object.values(useGameStore.getState().games);
      if (current.length > 0) setGames(current);
      setMessage("Steam app index refreshed.");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(`Steam app index refresh failed: ${e}`);
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
      setMessage("Diagnostics exported.");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(`Diagnostics failed: ${e}`);
    } finally {
      setDiagnosticsExporting(false);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setAvailableUpdate(null);
    setMessage("");
    try {
      const update = await check();
      setAvailableUpdate(update);
      setMessage(update ? `Update ${update.version} is available.` : "Repressurizer is up to date.");
    } catch (e) {
      setMessage(`Update check failed: ${e}`);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setInstallingUpdate(true);
    setMessage("");
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setMessage(`Update install failed: ${e}`);
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
      setMessage("Steam token page opened.");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(`Could not open Steam token page: ${e}`);
    }
  };

  const handleFamilyTokenPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const token = extractStoreWebApiToken(pasted);
    if (token && token !== pasted.trim()) {
      event.preventDefault();
      setFamilyAccessToken(token);
      setMessage("Steam Store token extracted from pasted JSON.");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  const handleSaveFamilyToken = async () => {
    const token = extractStoreWebApiToken(familyAccessToken);
    if (!token) {
      setMessage("Paste a Steam Store webapi_token first.");
      return;
    }
    setFamilyAccessToken(token);
    const cache = await saveSteamFamilyToken(token, false);
    if (cache) {
      applyFamilyTokenCache(cache);
      setMessage("Steam Store token saved.");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  const handleClearFamilyToken = async () => {
    await clearSteamFamilyToken();
    setFamilyAccessToken("");
    setFamilyTokenSavedAt(null);
    setFamilyTokenValidatedAt(null);
    setMessage("Saved Steam Store token cleared.");
    setTimeout(() => setMessage(""), 2000);
  };

  const handleProbeFamily = async () => {
    setFamilyChecking(true);
    setFamilyResult(null);
    setMessage("");
    const accessToken = extractStoreWebApiToken(familyAccessToken);
    if (accessToken && accessToken !== familyAccessToken) {
      setFamilyAccessToken(accessToken);
    }
    if (accessToken) {
      const cache = await saveSteamFamilyToken(accessToken, false);
      if (cache) applyFamilyTokenCache(cache);
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
      setMessage(`Steam Family loaded with ${result.auth_used}.`);
    } catch (e) {
      console.error("Steam Family probe failed", {
        error: String(e),
        durationMs: Math.round(performance.now() - startedAt),
      });
      const tokenHint = accessToken
        ? " Saved Steam Store token may be expired; paste a fresh one."
        : "";
      setMessage(`Steam Family probe failed: ${e}.${tokenHint}`);
    } finally {
      console.groupEnd();
      setFamilyChecking(false);
    }
  };

  const handleReset = () => {
    setPendingAction({
      type: "reset",
      message: "Reset all settings? You will need to set up again.",
    });
  };

  const hasFamilyStoreToken = Boolean(extractStoreWebApiToken(familyAccessToken));
  const familyIncludeNonGames = settings.includeSteamFamilyNonGames ?? false;
  const steamAppIndexCount = Object.keys(steamAppIndex.apps).length;
  const steamAppIndexStale = isSteamAppIndexStale(steamAppIndex);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <h2 className="text-base font-semibold text-white tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-repressurizer-border">
          <button
            onClick={() => setTab("general")}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 text-sm transition-colors ${
              tab === "general"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            <Info size={14} />
            General
          </button>
          <button
            onClick={() => setTab("appearance")}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 text-sm transition-colors ${
              tab === "appearance"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            <Palette size={14} />
            Appearance
          </button>
          <button
            onClick={() => setTab("backups")}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 text-sm transition-colors ${
              tab === "backups"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            <ClockCounterClockwise size={14} />
            Backups
          </button>
          <button
            onClick={() => setTab("ignored")}
            className={`inline-flex items-center gap-1.5 px-6 py-2.5 text-sm transition-colors ${
              tab === "ignored"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            <Warning size={14} />
            Ignored
            {(ignoredIds.length + hltbIgnoredIds.length) > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 tabular-nums">
                {ignoredIds.length + hltbIgnoredIds.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
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

          {tab === "general" && (
            <div className="space-y-6">
              {/* Info grid */}
              <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Steam Path</span>
                    <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">{settings.steamPath}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">User</span>
                    <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">
                      {settings.steamPersonaName
                        ? `${settings.steamPersonaName} (${settings.steamId3})`
                        : settings.steamId3}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Steam ID64</span>
                    <p className="mt-1 font-mono text-xs text-repressurizer-text-muted">{settings.steamId64}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Library</span>
                    <p className="mt-1 text-xs text-repressurizer-text-muted">
                      <span className="font-mono tabular-nums">{gameCount}</span> games, <span className="font-mono tabular-nums">{categoryCount}</span> categories (<span className="font-mono tabular-nums">{dynamicCount}</span> dynamic)
                    </p>
                  </div>
                </div>
              </div>

              {/* Steam Family */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Steam Family</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <UsersThree size={16} weight="duotone" className="mt-0.5 text-repressurizer-text-faint" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-repressurizer-text">Probe shared family library</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
                        Uses your saved Steam Web API key first. A saved Steam Store webapi_token is reused automatically when Family needs Store auth.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2 text-xs text-repressurizer-text-muted sm:grid-cols-2">
                    <p>
                      Steam Web API key: <span className="font-medium text-repressurizer-text">{settings.apiKey ? "configured" : "missing"}</span>
                    </p>
                    <p>
                      Store token:{" "}
                      <span className="font-medium text-repressurizer-text">
                        {familyTokenSavedAt ? `saved ${new Date(familyTokenSavedAt).toLocaleDateString()}` : "not saved"}
                      </span>
                      {familyTokenValidatedAt && (
                        <span className="text-repressurizer-text-faint">, validated {new Date(familyTokenValidatedAt).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-repressurizer-text-muted">
                      Steam Store webapi_token
                    </label>
                    <input
                      type="password"
                      value={familyAccessToken}
                      onChange={(e) => setFamilyAccessToken(e.target.value)}
                      onPaste={handleFamilyTokenPaste}
                      placeholder="Paste token or full Steam JSON"
                      className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleOpenFamilyTokenPage}
                        className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
                      >
                        <Globe size={13} />
                        Open token page
                      </button>
                      <button
                        onClick={handleSaveFamilyToken}
                        disabled={!hasFamilyStoreToken}
                        className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-40"
                      >
                        Save token
                      </button>
                      <button
                        onClick={handleClearFamilyToken}
                        disabled={!familyTokenSavedAt && !familyAccessToken}
                        className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger disabled:opacity-40"
                      >
                        <TrashSimple size={13} />
                        Clear
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
                      <span className="block text-xs font-medium text-repressurizer-text">Include tools and non-game apps</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
                        Hidden by default so map editors, SDKs, and utilities do not pollute the game list.
                      </span>
                    </span>
                  </label>
                  <div className="flex justify-end">
                    <button
                      onClick={handleProbeFamily}
                      disabled={familyChecking || (!settings.apiKey && !hasFamilyStoreToken)}
                      className="btn-press shrink-0 rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40"
                    >
                      {familyChecking ? "Checking..." : "Probe"}
                    </button>
                  </div>
                  {familyResult && (
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <MiniStat label="Total" value={familyResult.total_apps} />
                      <MiniStat label="Owned" value={familyResult.owned_apps} />
                      <MiniStat label="Shared" value={familyResult.shared_apps} />
                      <MiniStat label="Excluded" value={familyResult.excluded_apps} />
                    </div>
                  )}
                  {familyResult && (
                    <p className="text-xs leading-relaxed text-repressurizer-text-faint">
                      {familyResult.non_game_apps > 0 && !familyIncludeNonGames
                        ? `${familyResult.non_game_apps} tool/non-game app${familyResult.non_game_apps === 1 ? "" : "s"} hidden. `
                        : ""}
                      {familyResult.playtime_entries > 0
                        ? `Family playtime loaded for ${familyResult.playtime_entries} app${familyResult.playtime_entries === 1 ? "" : "s"}.`
                        : familyResult.playtime_unavailable_reason
                          ? "Family playtime was unavailable for this probe."
                          : "No Family playtime entries returned."}
                    </p>
                  )}
                  {familyLastFetched && !familyResult && (
                    <p className="text-xs text-repressurizer-text-faint">
                      Cached Family data loaded from {new Date(familyLastFetched).toLocaleString()}.
                    </p>
                  )}
                </div>
              </div>

              {/* Display */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Display</h3>
                <ToggleRow
                  icon={<Eye size={15} weight="duotone" />}
                  label="Show dynamic categories"
                  description="Display Steam's auto-generated categories (prefixed with ~) in the sidebar"
                  checked={settings.showDynamicCategories}
                  onChange={(v) => settings.setSettings({ showDynamicCategories: v })}
                />
                <ToggleRow
                  icon={<Heart size={15} weight="duotone" />}
                  label="Pin Favorites"
                  description="Keep the Favorites collection pinned at the top of the sidebar"
                  checked={settings.pinFavorites}
                  onChange={(v) => settings.setSettings({ pinFavorites: v })}
                />
              </div>

              {/* Currency */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Currency</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-repressurizer-text">Default currency</p>
                      <p className="mt-0.5 text-xs text-repressurizer-text-faint">Used for library value calculations in Statistics</p>
                    </div>
                    <select
                      value={settings.currency ?? "EUR"}
                      onChange={(e) => settings.setSettings({ currency: e.target.value })}
                      className="rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="CAD">CAD (C$)</option>
                      <option value="AUD">AUD (A$)</option>
                      <option value="CHF">CHF (Fr)</option>
                      <option value="BRL">BRL (R$)</option>
                      <option value="PLN">PLN (zł)</option>
                      <option value="RUB">RUB (₽)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Fetch Speed */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Fetch Speed</h3>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">HLTB concurrent requests</p>
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
                    How many HLTB lookups to run in parallel. Higher = faster but may get rate-limited.
                  </p>
                </div>
                <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-repressurizer-text">Achievements concurrent requests</p>
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
                    How many achievement lookups to run in parallel. Steam API key allows high throughput.
                  </p>
                </div>
              </div>

              {/* Cache */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Steam App Index</h3>
                <div className="flex items-center gap-3 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
                  <CloudArrowDown size={15} weight="duotone" className="text-repressurizer-text-faint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-repressurizer-text">
                      <span className="font-mono tabular-nums">{steamAppIndexCount}</span> Steam apps indexed
                    </p>
                    <p className="mt-0.5 text-xs text-repressurizer-text-faint">
                      {steamAppIndex.fetchedAt > 0
                        ? `Last refreshed ${new Date(steamAppIndex.fetchedAt).toLocaleDateString()}${steamAppIndexStale ? " · refresh recommended" : ""}`
                        : "Used to resolve collection-only app names instantly."}
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
                    {steamAppIndexRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Game Details Cache</h3>
                <div className="flex items-center gap-3 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3">
                  <Database size={15} weight="duotone" className="text-repressurizer-text-faint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-repressurizer-text">
                      <span className="font-mono tabular-nums">{cachedDetailsCount}</span> games cached
                    </p>
                    <p className="mt-0.5 text-xs text-repressurizer-text-faint">Used by Auto-Categorize for genre, tags, year and score</p>
                  </div>
                  <button
                    onClick={clearDetailsCache}
                    disabled={cachedDetailsCount === 0}
                    className="btn-press shrink-0 rounded-lg border border-repressurizer-danger/30 px-3 py-1.5 text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Clear Cache
                  </button>
                </div>
                {cacheInfo && (
                  <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-2">
                    <p className="text-[10px] font-mono text-repressurizer-text-faint break-all">{cacheInfo.path}</p>
                    <div className="flex gap-4 text-xs text-repressurizer-text-muted">
                      <span>Details: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.details_bytes)}</span></span>
                      <span>HLTB: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.hltb_bytes)}</span></span>
                      <span>Ignored: <span className="font-mono text-repressurizer-text">{formatSize(cacheInfo.failed_bytes)}</span></span>
                    </div>
                  </div>
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  Steam Web API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none" />
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg pl-9 pr-3 py-2 text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSaveApiKey}
                    className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Maintenance */}
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Maintenance</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    onClick={handleExportDiagnostics}
                    disabled={diagnosticsExporting}
                    className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
                  >
                    <Bug size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
                    <span>
                      <span className="block text-sm text-repressurizer-text">{diagnosticsExporting ? "Exporting diagnostics..." : "Export diagnostics"}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">Writes a privacy-safe JSON report without API keys.</span>
                    </span>
                  </button>

                  <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
                    <button
                      onClick={handleCheckUpdates}
                      disabled={checkingUpdates || installingUpdate}
                      className="btn-press flex w-full items-start gap-3 text-left transition-colors disabled:opacity-50"
                    >
                      <CloudArrowDown size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
                      <span>
                        <span className="block text-sm text-repressurizer-text">{checkingUpdates ? "Checking updates..." : "Check for updates"}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">Uses the latest GitHub Release updater manifest.</span>
                      </span>
                    </button>
                    {availableUpdate && (
                      <button
                        onClick={handleInstallUpdate}
                        disabled={installingUpdate}
                        className="btn-press mt-3 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
                      >
                        {installingUpdate ? "Installing..." : `Install ${availableUpdate.version}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Reset */}
              <div className="border-t border-repressurizer-border pt-5">
                <button
                  onClick={handleReset}
                  className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-danger/30 px-4 py-2 text-sm text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/10"
                >
                  <ArrowCounterClockwise size={14} />
                  Reset All Settings
                </button>
                <p className="mt-1.5 text-xs text-repressurizer-text-faint">
                  Clears saved credentials and returns to setup.
                </p>
              </div>

              {/* About */}
              <div className="border-t border-repressurizer-border pt-5 text-xs text-repressurizer-text-muted">
                <p className="font-medium text-repressurizer-text">Repressurizer v{__APP_VERSION__}</p>
                <p className="mt-1 text-repressurizer-text-faint">Personal Steam Library Manager</p>
                <p className="text-repressurizer-text-faint">Dynamic categories (prefixed with ~) are managed by Steam and are read-only.</p>
              </div>
            </div>
          )}

          {tab === "appearance" && (
            <AppearanceTab
              customHex={customHex}
              setCustomHex={setCustomHex}
            />
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

          {tab === "ignored" && (
            <div className="space-y-6">
              {/* Steam Details ignored */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-repressurizer-text-muted uppercase tracking-wider">
                  Steam Details — Ignored ({ignoredIds.length})
                </h3>
                <p className="text-xs text-repressurizer-text-faint">
                  Games with {MAX_FAIL_RUNS}+ confirmed unavailable Steam Store responses. Transient network/rate-limit errors are retried later.
                </p>

                {ignoredIds.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-repressurizer-text-faint">
                    <CheckCircle size={16} weight="duotone" className="text-repressurizer-accent/50" />
                    <p className="text-xs">No ignored games</p>
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
                            {failedGamesStore.fails[id]}× failed
                          </span>
                          <button
                            onClick={() => failedGamesStore.resetFailure(id)}
                            className="shrink-0 text-xs text-repressurizer-accent hover:underline"
                          >
                            Retry
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => failedGamesStore.resetAll()}
                      className="btn-press text-xs text-repressurizer-danger/70 hover:text-repressurizer-danger transition-colors"
                    >
                      Reset all ({ignoredIds.length})
                    </button>
                  </>
                )}
              </div>

              {/* HLTB ignored */}
              <div className="space-y-3 border-t border-repressurizer-border pt-5">
                <h3 className="text-xs font-semibold text-repressurizer-text-muted uppercase tracking-wider">
                  HLTB — Ignored ({hltbIgnoredIds.length})
                </h3>
                <p className="text-xs text-repressurizer-text-faint">
                  Games not found on HowLongToBeat after {HLTB_MAX_FAILS}+ confirmed search{HLTB_MAX_FAILS > 1 ? "es" : ""}. Skipped on future fetches.
                </p>

                {hltbIgnoredIds.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-repressurizer-text-faint">
                    <CheckCircle size={16} weight="duotone" className="text-repressurizer-accent/50" />
                    <p className="text-xs">No ignored games</p>
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
                            Retry
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => hltbIgnoredStore.resetAll()}
                      className="btn-press text-xs text-repressurizer-danger/70 hover:text-repressurizer-danger transition-colors"
                    >
                      Reset all ({hltbIgnoredIds.length})
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

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
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  className={`btn-press rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors ${
                    pendingAction.type === "delete" || pendingAction.type === "reset"
                      ? "bg-repressurizer-danger hover:bg-repressurizer-danger/80"
                      : "bg-repressurizer-accent hover:bg-repressurizer-accent-hover"
                  }`}
                >
                  {pendingAction.type === "restore" ? "Restore" : pendingAction.type === "delete" ? "Delete" : "Reset"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppearanceTab({
  customHex,
  setCustomHex,
}: {
  customHex: string;
  setCustomHex: (v: string) => void;
}) {
  const { accentColor, showSmartLists, showNowPlaying, showFilterBar, sidebarWidth, theme, language, minimizeToTray, setSettings } = useSettingsStore();
  const t = useT();

  const handlePickPreset = (hex: string) => {
    setCustomHex(hex);
    setSettings({ accentColor: hex });
    applyAccentColor(hex);
  };

  const handleCustomHex = (hex: string) => {
    setCustomHex(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      setSettings({ accentColor: hex });
      applyAccentColor(hex);
    }
  };

  const handleResetColor = () => {
    setSettings({ accentColor: "" });
    applyAccentColor("");
    setCustomHex("");
  };

  return (
    <div className="space-y-6">
      {/* Accent color */}
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Accent Color</h3>
        <p className="text-xs text-repressurizer-text-faint -mt-1">Changes the highlight color throughout the app</p>

        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
          <div className="flex items-center gap-3">
            <label className="relative block h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-repressurizer-border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <span
                className="block h-full w-full"
                style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(customHex || accentColor) ? (customHex || accentColor) : "#10b981" }}
              />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(customHex || accentColor) ? (customHex || accentColor) : "#10b981"}
                onChange={(e) => handleCustomHex(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Pick accent color"
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-repressurizer-text">Custom accent</p>
              <p className="mt-0.5 text-xs text-repressurizer-text-faint">Click the swatch to pick a color. Hex stays available for precision.</p>
            </div>
            {accentColor && (
              <button
                onClick={handleResetColor}
                title="Reset to default"
                className="btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-repressurizer-border text-repressurizer-text-faint transition-colors hover:border-repressurizer-text-muted hover:text-repressurizer-text"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </div>
          <div className="mt-3">
            <label className="mb-1.5 block text-xs text-repressurizer-text-muted">Hex value</label>
            <input
              type="text"
              value={customHex}
              onChange={(e) => handleCustomHex(e.target.value)}
              placeholder="#10b981"
              maxLength={7}
              className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 font-mono text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePickPreset(p.accent)}
              title={p.label}
              className={`relative h-8 w-8 rounded-full transition-all ${
                accentColor === p.accent
                  ? "ring-2 ring-white ring-offset-2 ring-offset-repressurizer-surface scale-110"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: p.accent }}
            >
              {accentColor === p.accent && (
                <span className="absolute inset-0 flex items-center justify-center text-white">
                  <CheckCircle size={14} weight="fill" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* UI visibility */}
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">Visibility</h3>
        <ToggleRow
          icon={<Stack size={15} weight="duotone" />}
          label="Show Smart Lists"
          description="Backlog and Recently Played shortcuts in the sidebar"
          checked={showSmartLists}
          onChange={(v) => setSettings({ showSmartLists: v })}
        />
        <ToggleRow
          icon={<Monitor size={15} weight="duotone" />}
          label="Show Now Playing"
          description="Display the last-played game card at the top of the sidebar"
          checked={showNowPlaying}
          onChange={(v) => setSettings({ showNowPlaying: v })}
        />
        <ToggleRow
          icon={<Funnel size={15} weight="duotone" />}
          label="Show Filter Bar"
          description="Show the filter and sort bar below the header"
          checked={showFilterBar}
          onChange={(v) => setSettings({ showFilterBar: v })}
        />
      </div>

      {/* Theme */}
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
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-white"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.language")}</h3>
        <div className="flex gap-2">
          {([
            { value: "en", label: "English", flag: "🇬🇧" },
            { value: "it", label: "Italiano", flag: "🇮🇹" },
          ] as { value: AppLocale; label: string; flag: string }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ language: opt.value })}
              className={`btn-press flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                (language ?? "en") === opt.value
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-white"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              <Globe size={16} weight="duotone" />
              <span>{opt.flag}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar width */}
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

      {/* System tray */}
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">System Tray</h3>
        <ToggleRow
          icon={<Tray size={15} weight="duotone" />}
          label="Minimize to tray on close"
          description="When you close the window, Repressurizer will minimize to the system tray instead of quitting"
          checked={minimizeToTray ?? false}
          onChange={(v) => setSettings({ minimizeToTray: v })}
        />
      </div>
    </div>
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

function MiniStat({ label, value }: { label: string; value: number }) {
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
            A backup is created automatically every time you save.
          </p>
          <button
            onClick={onManualBackup}
            className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            <Plus size={12} weight="bold" />
            Create Backup
          </button>
        </div>
        <div className="py-8 text-center animate-fade-in">
          <ClockCounterClockwise size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
          <p className="text-sm text-repressurizer-text-muted">No backups found.</p>
        </div>
      </div>
    );
  }

  const favoriteBackups = backups.filter((b) => favorites.has(b.filename));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-repressurizer-text-faint">
          Backups are created automatically on save. Star important ones to pin them.
        </p>
        <button
          onClick={onManualBackup}
          className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
        >
          <Plus size={12} weight="bold" />
          Create Backup
        </button>
      </div>

      {/* Pinned favorites */}
      {favoriteBackups.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-500">
            <Star size={12} weight="fill" />
            Pinned
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

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-3.5 py-2.5 transition-colors hover:border-repressurizer-border">
      <button
        onClick={() => onToggleFavorite(backup.filename)}
        className={`mt-0.5 shrink-0 transition-colors ${isFavorite ? "text-amber-500" : "text-repressurizer-border hover:text-amber-500/50"}`}
        title={isFavorite ? "Unpin" : "Pin"}
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
              pre-restore
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
          Restore
        </button>
        <button
          onClick={() => onDelete(backup)}
          className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-danger/8 px-2.5 py-1 text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/15"
        >
          <TrashSimple size={11} />
          Delete
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
    <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 transition-colors hover:border-repressurizer-border">
      <span className="mt-0.5 text-repressurizer-text-faint">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-repressurizer-text">{label}</p>
        <p className="mt-0.5 text-xs text-repressurizer-text-faint leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-repressurizer-accent" : "bg-repressurizer-border"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </label>
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
