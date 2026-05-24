import { Component, useEffect, useState } from "react";
import type { ReactNode, ErrorInfo } from "react";
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
import { fetchLibrary, loadCollections, createManualBackup } from "./lib/tauri";
import { mergeCollectionOnlyGames } from "./lib/libraryMerge";
import { useT } from "./lib/i18n";
import { SetupWizard } from "./components/setup/SetupWizard";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { GameGrid } from "./components/games/GameGrid";
import { StatusBar } from "./components/layout/StatusBar";
import { FilterBar } from "./components/layout/FilterBar";
import { ToastContainer } from "./components/ui/Toast";
import { OnboardingTour } from "./components/ui/OnboardingTour";
import { WarningCircle, ArrowCounterClockwise, GameController } from "@phosphor-icons/react";

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
  const setCollections = useCategoryStore((s) => s.setCollections);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const toast = useToastStore;

  const [showOnboarding, setShowOnboarding] = useState(false);

  // Apply saved accent color and theme on startup
  const accentColor = useSettingsStore((s) => s.accentColor);
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => { applyAccentColor(accentColor); }, [accentColor]);
  useEffect(() => { applyTheme(theme ?? "dark"); }, [theme]);

  // Load cached data from Rust file cache on startup
  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (settings.setupComplete && gameCount === 0) {
      setReloading(true);
      setReloadError("");
      Promise.all([
        fetchLibrary(settings.apiKey, settings.steamId64),
        loadCollections(settings.steamPath, settings.steamId3),
        useFamilyStore.getState().hydrate(),
      ])
        .then(([games, collections]) => {
          const familyGames = useFamilyStore.getState().sharedGamesAsOwned();
          const cachedDetails = useGameStore.getState().details;
          const mergedGames = mergeCollectionOnlyGames([...games, ...familyGames], collections, cachedDetails);
          console.log("Reloaded:", mergedGames.length, "games,", collections.length, "collections");
          setGames(mergedGames);
          usePlayHistoryStore.getState().observeLibrary(mergedGames);
          setCollections(collections);
          setReloading(false);

          // Show onboarding for first-time users
          if (!settings.onboardingComplete) {
            setShowOnboarding(true);
          }

          // Auto-backup on startup (non-fatal)
          if (settings.steamPath && settings.steamId3) {
            createManualBackup(settings.steamPath, settings.steamId3, "Auto-backup on startup").catch(() => {});
          }

          // Auto-start background fetches after library loads
          const { startDetailsFetch, startHltbFetch } = useBackgroundFetchStore.getState();
          const cachedHltb = useHltbStore.getState().data;

          if (settings.apiKey) {
            const missingDetails = mergedGames.map((g) => g.appid).filter((id) => !cachedDetails[id]);
            startDetailsFetch(missingDetails);
          }

          const missingHltb = mergedGames
            .filter((g) => !cachedHltb[g.appid])
            .map((g) => ({ appId: g.appid, name: g.name }));
          startHltbFetch(missingHltb);
        })
        .catch((e) => {
          console.error("Reload error:", e);
          setReloadError(String(e));
          setReloading(false);
          toast.getState().error(`Failed to load library: ${e}`);
        });
    }
  }, [settings.setupComplete]);

  if (!settings.setupComplete) return <SetupWizard />;
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
        <StatusBar />
      </div>
      {showOnboarding && (
        <OnboardingTour
          onComplete={() => {
            setShowOnboarding(false);
            settings.setSettings({ onboardingComplete: true });
          }}
        />
      )}
    </>
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
