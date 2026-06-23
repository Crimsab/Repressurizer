import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore, applyAccentColor, applyTheme } from "./stores/settingsStore";
import { useGameStore } from "./stores/gameStore";
import { useCategoryStore } from "./stores/categoryStore";
import { useHltbStore } from "./stores/hltbStore";
import { useBackgroundFetchStore } from "./stores/backgroundFetchStore";
import { useFailedGamesStore } from "./stores/failedGamesStore";
import { useFriendsStore } from "./stores/friendsStore";
import { useWishlistStore } from "./stores/wishlistStore";
import { useAchievementsStore } from "./stores/achievementsStore";
import { useStatusStore } from "./stores/statusStore";
import { useNotesStore } from "./stores/notesStore";
import { useTagsStore } from "./stores/tagsStore";
import { useReviewStore } from "./stores/reviewStore";
import { useHltbIgnoredStore } from "./stores/hltbIgnoredStore";
import { useToastStore } from "./stores/toastStore";
import { useFamilyStore } from "./stores/familyStore";
import { usePlayHistoryStore } from "./stores/playHistoryStore";
import { useSteamAppIndexStore } from "./stores/steamAppIndexStore";
import { fetchLibrary, loadCollections, createManualBackup, fetchPlayerSummary, hideMainWindow, quitApp, getStartupContext } from "./lib/tauri";
import { mergeCollectionOnlyGames } from "./lib/libraryMerge";
import {
  automationPublishDue,
  automationPublishStatusPatch,
  buildAutomationSnapshotFromContext,
  publishAutomationSnapshot,
} from "./lib/automationPublish";
import { appLog } from "./lib/appLog";
import { notifyDesktop } from "./lib/desktopNotifications";
import { useT } from "./lib/i18n";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { GameGrid } from "./components/games/GameGrid";
import { StatusBar } from "./components/layout/StatusBar";
import { FilterBar } from "./components/layout/FilterBar";
import { ToastContainer } from "./components/ui/Toast";
import { WarningCircle, ArrowCounterClockwise, GameController, CloudArrowDown, X } from "@phosphor-icons/react";

const SetupWizard = lazy(() => import("./components/setup/SetupWizard").then((m) => ({ default: m.SetupWizard })));
const OnboardingTour = lazy(() => import("./components/ui/OnboardingTour").then((m) => ({ default: m.OnboardingTour })));

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React crash:", error, info.componentStack);
    void appLog.error("React crash", {
      error: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-repressurizer-bg p-8">
          <div className="max-w-lg text-center animate-fade-in">
            <WarningCircle size={48} weight="duotone" className="mx-auto mb-4 text-repressurizer-danger" />
            <h2 className="mb-2 text-lg font-medium text-white tracking-tight">
              Something went wrong
            </h2>
            <pre className="mb-6 max-h-40 overflow-auto rounded-xl bg-repressurizer-surface p-4 text-left font-mono text-xs text-repressurizer-text-muted border border-repressurizer-border">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="btn-press inline-flex items-center gap-2 rounded-lg bg-repressurizer-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover focus-ring"
            >
              <ArrowCounterClockwise size={16} weight="bold" />
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {
  const t = useT();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-repressurizer-bg">
      <div className="text-center animate-fade-in">
        <GameController size={48} weight="duotone" className="mx-auto mb-4 text-repressurizer-accent animate-breathe" />
        <h2 className="mb-1.5 text-lg font-medium text-white tracking-tight">
          {t("app.loading")}
        </h2>
        <p className="text-sm text-repressurizer-text-muted">
          {t("app.loading.sub")}
        </p>
        <div className="mx-auto mt-6 h-1 w-48 overflow-hidden rounded-full bg-repressurizer-surface">
          <div className="skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onReset }: { error: string; onReset: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-repressurizer-bg">
      <div className="max-w-md text-center animate-fade-in">
        <WarningCircle size={48} weight="duotone" className="mx-auto mb-4 text-repressurizer-danger" />
        <h2 className="mb-2 text-lg font-medium text-white tracking-tight">
          {t("app.error.loadFailed")}
        </h2>
        <p className="mb-6 text-sm text-repressurizer-text-muted leading-relaxed">{error}</p>
        <button
          onClick={onReset}
          className="btn-press inline-flex items-center gap-2 rounded-lg bg-repressurizer-surface border border-repressurizer-border px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-surface-hover focus-ring"
        >
          <ArrowCounterClockwise size={16} weight="bold" />
          {t("app.error.resetSetup")}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const settings = useSettingsStore();
  const t = useT();
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const setGames = useGameStore((s) => s.setGames);
  const hydrateDetailsCache = useGameStore((s) => s.hydrateDetailsCache);
  const hydrateHltbCache = useHltbStore((s) => s.hydrateCache);
  const hydrateFailedCache = useFailedGamesStore((s) => s.hydrateCache);
  const hydrateFriends = useFriendsStore((s) => s.hydrate);
  const hydrateWishlist = useWishlistStore((s) => s.hydrate);
  const hydrateAchievements = useAchievementsStore((s) => s.hydrate);
  const hydrateStatuses = useStatusStore((s) => s.hydrate);
  const hydrateNotes = useNotesStore((s) => s.hydrate);
  const hydrateTags = useTagsStore((s) => s.hydrate);
  const hydrateReviews = useReviewStore((s) => s.hydrate);
  const hydrateHltbIgnored = useHltbIgnoredStore((s) => s.hydrate);
  const hydrateFamily = useFamilyStore((s) => s.hydrate);
  const hydratePlayHistory = usePlayHistoryStore((s) => s.hydrate);
  const hydrateSteamAppIndex = useSteamAppIndexStore((s) => s.hydrate);
  const hydrateSettingsFromDisk = useSettingsStore((s) => s.hydrateFromDisk);
  const setCollections = useCategoryStore((s) => s.setCollections);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const toast = useToastStore;
  const reloadLibraryRef = useRef<(notify?: boolean, startupBackup?: boolean) => Promise<void>>(async () => {});
  const publishAutomationRef = useRef<(notify?: boolean, force?: boolean) => Promise<void>>(async () => {});

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCloseChoice, setShowCloseChoice] = useState(false);
  const [startupContext, setStartupContext] = useState<{ launchedFromAutostart: boolean; mainWindowCreated: boolean } | null>(null);
  const [windowActivated, setWindowActivated] = useState(false);

  const automationPublishConfigured =
    settings.automationPublishEnabled && settings.automationPublishUrl.trim().length > 0;
  const quietTrayStartup =
    startupContext?.launchedFromAutostart === true &&
    (settings.startOnLoginMode ?? "tray") !== "window" &&
    !automationPublishConfigured;
  const interactiveStartupReady = startupContext !== null && (!quietTrayStartup || windowActivated);

  const shouldNotifyDesktop = (userInitiated = false, isError = false) =>
    useSettingsStore.getState().desktopNotifications !== false && (userInitiated || isError);

  const sendWorkflowNotification = async (
    body: string,
    userInitiated = false,
    isError = false
  ) => {
    if (!shouldNotifyDesktop(userInitiated, isError)) return;
    await notifyDesktop({
      body,
      enabled: true,
      requestPermissionOnDemand: userInitiated,
    });
  };

  // Apply saved accent color and theme on startup
  const accentColor = useSettingsStore((s) => s.accentColor);
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => { applyAccentColor(accentColor); }, [accentColor]);
  useEffect(() => { applyTheme(theme ?? "dark"); }, [theme]);
  useEffect(() => {
    hydrateSettingsFromDisk().catch(() => {});
  }, [hydrateSettingsFromDisk]);

  useEffect(() => {
    let cancelled = false;
    getStartupContext()
      .then((context) => {
        if (cancelled) return;
        const next = context ?? { launchedFromAutostart: false, mainWindowCreated: true };
        setStartupContext(next);
        if (!next.launchedFromAutostart || next.mainWindowCreated) {
          setWindowActivated(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStartupContext({ launchedFromAutostart: false, mainWindowCreated: true });
        setWindowActivated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const publishAutomationFromStores = async (notify = false, force = false) => {
    const currentSettings = useSettingsStore.getState();
    const settingsStore = useSettingsStore.getState();

    if (!currentSettings.automationPublishUrl.trim()) {
      const message = t("settings.automationExport.skippedNotConfigured");
      settingsStore.setSettings(automationPublishStatusPatch(settingsStore, "skipped", message));
      if (notify) toast.getState().warning(message);
      await appLog.info("Automation export skipped: not configured");
      await sendWorkflowNotification(message, notify);
      return;
    }

    if (!force && !automationPublishDue(currentSettings)) return;

    const gameState = useGameStore.getState();
    const categoryState = useCategoryStore.getState();
    const hltbState = useHltbStore.getState();
    const achievementsState = useAchievementsStore.getState();
    const wishlistState = useWishlistStore.getState();
    const familyState = useFamilyStore.getState();
    if (Object.keys(gameState.games).length === 0 || categoryState.collections.length === 0) {
      const message = t("settings.automationExport.skippedNoData");
      settingsStore.setSettings(automationPublishStatusPatch(settingsStore, "skipped", message));
      if (notify) toast.getState().warning(message);
      await appLog.info("Automation export skipped: no library data");
      await sendWorkflowNotification(message, notify);
      return;
    }

    const context = {
      settings: currentSettings,
      games: gameState.games,
      collections: categoryState.collections,
      details: gameState.details,
      hltbData: hltbState.data,
      achievements: achievementsState.summaries,
      wishlistItems: wishlistState.items,
      wishlistLastFetched: wishlistState.lastFetched,
      familyApps: familyState.apps,
      familyAuthUsed: familyState.authUsed,
      familyOwnerSteamId: familyState.ownerSteamId,
      familyLastFetched: familyState.lastFetched,
      appVersion: __APP_VERSION__,
    };
    const snapshot = buildAutomationSnapshotFromContext(context);
    if (!force && snapshot.checksum === currentSettings.automationPublishLastChecksum) {
      const message = t("settings.automationExport.skippedUnchanged");
      settingsStore.setSettings(automationPublishStatusPatch(settingsStore, "skipped", message));
      if (notify) toast.getState().info(message);
      await appLog.info("Automation export skipped: unchanged snapshot", {
        checksum: snapshot.checksum,
      });
      await sendWorkflowNotification(message, notify);
      return;
    }

    try {
      const result = await publishAutomationSnapshot(context);
      const message = t("settings.automationExport.published", { status: result.http.status });
      settingsStore.setSettings({
        automationPublishLastChecksum: result.snapshot.checksum,
        automationPublishLastPublishedAt: new Date().toISOString(),
        ...automationPublishStatusPatch(settingsStore, "success", message, result.http.status),
      });
      if (notify) toast.getState().success(message);
      await appLog.info("Automation export published", {
        status: result.http.status,
        checksum: result.snapshot.checksum,
      });
      await sendWorkflowNotification(message, notify);
    } catch (error) {
      const message = t("settings.automationExport.failed", { error: String(error) });
      settingsStore.setSettings(automationPublishStatusPatch(settingsStore, "failed", message));
      if (notify) toast.getState().error(message);
      await appLog.error("Automation export failed", { error: String(error) });
      await sendWorkflowNotification(message, notify, true);
      throw error;
    }
  };

  const reloadLibraryFromStores = async (notify = false, startupBackup = false) => {
    const currentSettings = useSettingsStore.getState();
    if (!currentSettings.setupComplete) return;

    setReloading(true);
    setReloadError("");
    try {
      const [games, collections] = await Promise.all([
        fetchLibrary(currentSettings.apiKey, currentSettings.steamId64),
        loadCollections(currentSettings.steamPath, currentSettings.steamId3),
        useFamilyStore.getState().hydrate(),
      ]);
      const familyGames = useFamilyStore.getState().sharedGamesAsOwned();
      const cachedDetails = useGameStore.getState().details;
      const appIndex = useSteamAppIndexStore.getState().data;
      const mergedGames = mergeCollectionOnlyGames([...games, ...familyGames], collections, cachedDetails, appIndex);
      console.log("Reloaded:", mergedGames.length, "games,", collections.length, "collections");
      await appLog.info("Steam library refreshed", {
        games: mergedGames.length,
        collections: collections.length,
      });
      setGames(mergedGames);
      usePlayHistoryStore.getState().observeLibrary(mergedGames);
      setCollections(collections);
      useSteamAppIndexStore.getState().ensureFresh(currentSettings.apiKey).then(() => {
        const current = Object.values(useGameStore.getState().games);
        if (current.length > 0) useGameStore.getState().setGames(current);
      }).catch(() => {});
      setReloading(false);

      if (!currentSettings.onboardingComplete) {
        setShowOnboarding(true);
      }

      if (startupBackup && currentSettings.steamPath && currentSettings.steamId3) {
        createManualBackup(currentSettings.steamPath, currentSettings.steamId3, "Auto-backup on startup").catch(() => {});
      }

      const { startDetailsFetch, startHltbFetch } = useBackgroundFetchStore.getState();
      const cachedHltb = useHltbStore.getState().data;

      if (currentSettings.apiKey) {
        const missingDetails = mergedGames.map((g) => g.appid).filter((id) => !cachedDetails[id]);
        startDetailsFetch(missingDetails);
      }

      const missingHltb = mergedGames
        .filter((g) => !cachedHltb[g.appid])
        .map((g) => ({ appId: g.appid, name: g.name }));
      startHltbFetch(missingHltb);

      if (notify) toast.getState().success("Steam library refreshed.");
      if (notify) await sendWorkflowNotification("Steam library refreshed.", true);
    } catch (e) {
      console.error("Reload error:", e);
      await appLog.error("Steam library refresh failed", { error: String(e) });
      setReloadError(String(e));
      setReloading(false);
      toast.getState().error(`Failed to load library: ${e}`);
      await sendWorkflowNotification(`Failed to load library: ${e}`, notify, true);
    }
  };

  useEffect(() => {
    reloadLibraryRef.current = reloadLibraryFromStores;
    publishAutomationRef.current = publishAutomationFromStores;
  });

  useEffect(() => {
    if (!interactiveStartupReady || settings.steamPersonaName || !settings.apiKey || !settings.steamId64) return;
    fetchPlayerSummary(settings.apiKey, settings.steamId64)
      .then((summary) => {
        if (summary.personaname) {
          settings.setSettings({ steamPersonaName: summary.personaname });
        }
      })
      .catch(() => {});
  }, [interactiveStartupReady, settings.steamPersonaName, settings.apiKey, settings.steamId64]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("repressurizer-close-requested", () => setShowCloseChoice(true))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("repressurizer-window-shown", () => setWindowActivated(true))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const register = <T,>(event: string, handler: (event: { payload: T }) => void) => {
      listen<T>(event, handler)
        .then((fn) => {
          if (disposed) {
            fn();
          } else {
            unlisteners.push(fn);
          }
        })
        .catch(() => {});
    };

    register("repressurizer-refresh-library-requested", () => {
      void reloadLibraryRef.current(true).catch(() => {});
    });

    register("repressurizer-publish-automation-requested", () => {
      void publishAutomationRef.current(true, true).catch(() => {});
    });

    register<{ level: "success" | "error" | "warning" | "info"; message: string }>(
      "repressurizer-tray-message",
      ({ payload }) => {
        const level =
          payload.level === "warning" || payload.level === "info" || payload.level === "error"
            ? payload.level
            : "success";
        toast.getState()[level](payload.message);
      }
    );

    register("repressurizer-settings-updated", () => {
      void hydrateSettingsFromDisk().catch(() => {});
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (startupContext === null || quietTrayStartup || !settings.setupComplete || settings.checkUpdatesOnStartup === false) return;
    const timer = window.setTimeout(() => {
      check()
        .then((update) => {
          if (update) setAvailableUpdate(update);
        })
        .catch(() => {});
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [startupContext, quietTrayStartup, settings.setupComplete, settings.checkUpdatesOnStartup]);

  const installUpdate = async () => {
    if (!availableUpdate) return;
    setInstallingUpdate(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (e) {
      toast.getState().error(t("settings.updates.installFailed", { error: String(e) }));
      setInstallingUpdate(false);
    }
  };

  // Load cached data from Rust file cache on startup
  useEffect(() => {
    if (!interactiveStartupReady) return;
    hydrateDetailsCache();
    hydrateHltbCache();
    hydrateFailedCache();
    hydrateFriends();
    hydrateWishlist();
    hydrateAchievements();
    hydrateStatuses();
    hydrateNotes();
    hydrateTags();
    hydrateReviews();
    hydrateHltbIgnored();
    hydrateFamily();
    hydratePlayHistory();
    hydrateSteamAppIndex();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactiveStartupReady]);

  // Disable transitions during window resize to prevent layout thrashing
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      document.body.classList.add("resizing");
      clearTimeout(timer);
      timer = setTimeout(() => document.body.classList.remove("resizing"), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const store = useCategoryStore.getState();
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (
        (e.ctrlKey && e.key === "y") ||
        (e.ctrlKey && e.shiftKey && e.key === "Z")
      ) {
        e.preventDefault();
        store.redo();
      }
      // Ctrl+F to focus search
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("[data-search-input]");
        input?.focus();
        input?.select();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (interactiveStartupReady && settings.setupComplete && gameCount === 0) {
      void reloadLibraryFromStores(false, true);
    }
  }, [interactiveStartupReady, settings.setupComplete, gameCount]);

  if (!settings.setupComplete) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <SetupWizard />
      </Suspense>
    );
  }
  if (reloading) return <LoadingScreen />;
  if (reloadError) return <ErrorScreen error={reloadError} onReset={() => settings.reset()} />;

  return (
    <>
      <div className="flex h-screen flex-col bg-repressurizer-bg text-repressurizer-text">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex flex-1 flex-col overflow-hidden">
            {settings.showFilterBar !== false && <FilterBar />}
            <div className="flex-1 overflow-auto p-4">
              <GameGrid />
            </div>
          </main>
        </div>
        {availableUpdate && (
          <UpdateBanner
            version={availableUpdate.version}
            installing={installingUpdate}
            onInstall={installUpdate}
            onDismiss={() => setAvailableUpdate(null)}
          />
        )}
        <StatusBar />
      </div>
      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingTour
            onComplete={() => {
              setShowOnboarding(false);
              settings.setSettings({ onboardingComplete: true });
            }}
          />
        </Suspense>
      )}
      {showCloseChoice && (
        <CloseChoiceDialog
          onMinimize={() => {
            settings.setSettings({ minimizeToTray: true, trayCloseChoiceMade: true });
            setShowCloseChoice(false);
            window.setTimeout(() => void hideMainWindow(), 50);
          }}
          onQuit={() => {
            settings.setSettings({ minimizeToTray: false, trayCloseChoiceMade: true });
            setShowCloseChoice(false);
            window.setTimeout(() => void quitApp(), 50);
          }}
          onCancel={() => setShowCloseChoice(false)}
        />
      )}
    </>
  );
}

function CloseChoiceDialog({
  onMinimize,
  onQuit,
  onCancel,
}: {
  onMinimize: () => void;
  onQuit: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface p-5 shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
        <h2 className="text-base font-semibold text-white tracking-tight">{t("tray.closeChoice.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-repressurizer-text-muted">
          {t("tray.closeChoice.desc")}
        </p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onMinimize}
            className="btn-press flex w-full items-center justify-center rounded-xl bg-repressurizer-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
          >
            {t("tray.closeChoice.minimize")}
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="btn-press flex w-full items-center justify-center rounded-xl border border-repressurizer-border bg-repressurizer-bg px-4 py-2.5 text-sm font-medium text-repressurizer-text transition-colors hover:border-repressurizer-border hover:bg-repressurizer-surface-hover"
          >
            {t("tray.closeChoice.quit")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-press flex w-full items-center justify-center rounded-xl px-4 py-2 text-xs font-medium text-repressurizer-text-faint transition-colors hover:text-repressurizer-text"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function UpdateBanner({
  version,
  installing,
  onInstall,
  onDismiss,
}: {
  version: string;
  installing: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="border-t border-repressurizer-border bg-repressurizer-surface px-4 py-2">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <CloudArrowDown size={16} weight="duotone" className="text-repressurizer-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-repressurizer-text">
            {t("settings.updates.available", { version })}
          </p>
          <p className="text-[11px] text-repressurizer-text-faint">
            {t("settings.updates.banner.desc")}
          </p>
        </div>
        <button
          onClick={onInstall}
          disabled={installing}
          className="btn-press rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50"
        >
          {installing ? t("settings.updates.installing") : t("settings.updates.install", { version })}
        </button>
        <button
          onClick={onDismiss}
          className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          aria-label={t("common.close")}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <ToastContainer />
    </ErrorBoundary>
  );
}
