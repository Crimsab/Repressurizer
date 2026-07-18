import { useCallback, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useGameStore } from "../../../stores/gameStore";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useAchievementsStore } from "../../../stores/achievementsStore";
import {
  fetchGameDetails,
  fetchAchievements,
  currencyToCountryCode,
  listSamBackups,
  loadSamAchievementSchema,
  openSamBackupDir,
  probeSamBridge,
  runSamAchievementAction,
} from "../../../lib/tauri";
import { detailsPriceMatchesCurrency, detailsWithPriceForCurrency } from "../../../lib/prices";
import { scheduleOriginalReleaseDateFetch } from "../../../lib/releaseDateQueue";
import { SteamImage } from "../SteamImage";
import { GameInfoTab } from "./GameInfoTab";
import {
  SamBackupViewerDialog,
} from "./SamAchievementPanels";
import {
  mergeAchievementsWithSamSchema,
  sortAchievements,
} from "./AchievementRow";
import { GameAchievementsTab } from "./GameAchievementsTab";
import { DialogOverlay } from "../../ui/DialogOverlay";
import { ResizableDialogPanel } from "../../ui/ResizableDialogPanel";
import type {
  OwnedGame,
  GameDetails,
  AchievementSummary,
  SamBridgeProbe,
  SamAchievementAction,
  SamAchievementActionResult,
  SamBackupInfo,
} from "../../../lib/types";
import { useT } from "../../../lib/i18n";
import {
  X,
  Clock,
  CalendarBlank,
  Trophy,
  ArrowSquareOut,
  ArrowsClockwise,
} from "@phosphor-icons/react";

interface GameDetailPageProps {
  game: OwnedGame;
  onClose: () => void;
}

export function GameDetailPage({ game, onClose }: GameDetailPageProps) {
  const t = useT();
  const {
    apiKey,
    steamId64,
    currency,
    showDetailHltb,
    showDetailMetacritic,
    showDetailPrice,
    steamPath,
    steamToolsEnabled,
    steamToolsAchievementWritesEnabled,
  } = useSettingsStore();
  const collections = useCategoryStore((s) => s.collections);
  const addGameToCategory = useCategoryStore((s) => s.addGameToCategory);
  const removeGameFromCategory = useCategoryStore(
    (s) => s.removeGameFromCategory
  );

  const [details, setDetails] = useState<GameDetails | null>(null);
  const [achievements, setAchievements] = useState<AchievementSummary | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const [achError, setAchError] = useState("");
  const [samProbe, setSamProbe] = useState<SamBridgeProbe | null>(null);
  const [samActionRunning, setSamActionRunning] = useState("");
  const [samActionMessage, setSamActionMessage] = useState("");
  const [samActionError, setSamActionError] = useState("");
  const [samSchemaKey, setSamSchemaKey] = useState("");
  const [samBackupsOpen, setSamBackupsOpen] = useState(false);
  const [samBackups, setSamBackups] = useState<SamBackupInfo[]>([]);
  const [samBackupsLoading, setSamBackupsLoading] = useState(false);
  const [samBackupsError, setSamBackupsError] = useState("");
  const [tab, setTab] = useState<"info" | "achievements">("info");

  const cachedAchievementSummary = useAchievementsStore((s) => s.summaries[game.appid]);
  const steamToolsSamEnabled = steamToolsEnabled && steamToolsAchievementWritesEnabled;

  const gameCategories = useMemo(
    () =>
      collections.filter(
        (c) => c.added.includes(game.appid) && !c.is_dynamic && c.id !== "hidden" && c.id !== "favorite"
      ),
    [collections, game.appid]
  );

  const editableCollections = useMemo(
    () =>
      [...collections]
        .filter((c) => !c.is_dynamic && c.id !== "hidden" && c.id !== "favorite")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [collections]
  );

  const gameHasSteamAchievements = (value: GameDetails | null) =>
    value?.categories?.includes("Steam Achievements") === true;

  useEffect(() => {
    let cancelled = false;
    const cachedDetails = useGameStore.getState().details[game.appid];
    setAchievements(null);
    setLoadingAchievements(false);
    setAchError("");
    setSamProbe(null);
    setSamSchemaKey("");
    const cachedAchievements = useAchievementsStore.getState().summaries[game.appid];
    if (cachedAchievements?.achievements?.length) {
      setAchievements(cachedAchievements);
    }

    const cachedDetailsForCurrency = detailsWithPriceForCurrency(cachedDetails, currency);
    if (cachedDetails && detailsPriceMatchesCurrency(cachedDetails, currency) && cachedDetailsForCurrency) {
      setDetails(cachedDetailsForCurrency);
      if (cachedDetailsForCurrency.price_currency !== cachedDetails.price_currency) {
        useGameStore.getState().setDetails(game.appid, cachedDetailsForCurrency);
      }
      setLoadingDetails(false);
      return () => {
        cancelled = true;
      };
    } else {
      setDetails(cachedDetails ?? null);
      setLoadingDetails(!cachedDetails);
      fetchGameDetails(game.appid, currencyToCountryCode(currency))
        .then((d) => {
          if (cancelled) return;
          setDetails(d);
          useGameStore.getState().setDetails(game.appid, d);
          scheduleOriginalReleaseDateFetch(game.appid, d.name);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoadingDetails(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [currency, game.appid]);

  const loadAchievementData = useCallback(
    async (force = false, detailsOverride?: GameDetails | null) => {
      const activeDetails = detailsOverride === undefined ? details : detailsOverride;
      if (!force && (achievements || achError)) return;
      if (!activeDetails && loadingDetails) {
        setLoadingAchievements(true);
        return;
      }
      if (activeDetails && !gameHasSteamAchievements(activeDetails)) {
        const empty: AchievementSummary = { total: 0, achieved: 0, achievements: [] };
        setAchievements(empty);
        setAchError("");
        setLoadingAchievements(false);
        useAchievementsStore.getState().setSummary(game.appid, empty);
        return;
      }

      setLoadingAchievements(true);
      setAchError("");
      try {
        const summary = await fetchAchievements(apiKey, steamId64, game.appid);
        setAchievements(summary);
        useAchievementsStore.getState().setSummary(game.appid, summary);
      } catch (e) {
        setAchError(String(e));
      } finally {
        setLoadingAchievements(false);
      }
    },
    [achError, achievements, apiKey, details, game.appid, loadingDetails, steamId64]
  );

  const refreshSamProbe = useCallback(async () => {
    if (!steamToolsSamEnabled) {
      setSamProbe(null);
      return;
    }
    try {
      const probe = await probeSamBridge(steamPath, game.appid);
      setSamProbe(probe);
    } catch {
      setSamProbe((current) => current);
    }
  }, [game.appid, steamPath, steamToolsSamEnabled]);

  useEffect(() => {
    if (
      tab !== "achievements" ||
      !steamToolsSamEnabled ||
      !achievements?.achievements.length
    ) {
      return;
    }
    const key = `${game.appid}:${steamPath}`;
    if (samSchemaKey === key) return;

    let cancelled = false;
    loadSamAchievementSchema(steamPath, game.appid)
      .then((schema) => {
        if (cancelled || schema.length === 0) return;
        setAchievements((current) => {
          if (!current) return current;
          const next = mergeAchievementsWithSamSchema(current, schema);
          useAchievementsStore.getState().setSummary(game.appid, next);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSamSchemaKey(key);
      });

    return () => {
      cancelled = true;
    };
  }, [
    achievements?.achievements.length,
    game.appid,
    samSchemaKey,
    steamPath,
    steamToolsSamEnabled,
    tab,
  ]);

  useEffect(() => {
    if (tab !== "achievements") return;
    if (details && !gameHasSteamAchievements(details)) {
      const empty: AchievementSummary = { total: 0, achieved: 0, achievements: [] };
      setAchievements(empty);
      setLoadingAchievements(false);
      setSamProbe(null);
      return;
    }
    void loadAchievementData(false);
    if (details && steamToolsSamEnabled) void refreshSamProbe();
  }, [details, loadAchievementData, refreshSamProbe, tab]);

  const hours = (game.playtime_forever / 60).toFixed(1);
  const lastPlayed = game.rtime_last_played
    ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
    : t("common.never");

  const achPercent =
    achievements && achievements.total > 0
      ? Math.round((achievements.achieved / achievements.total) * 100)
      : 0;
  const achievementTabSummary = achievements ?? cachedAchievementSummary;

  const handleRefreshDetails = async () => {
    setRefreshingDetails(true);
    try {
      const next = await fetchGameDetails(game.appid, currencyToCountryCode(currency));
      setDetails(next);
      useGameStore.getState().setDetails(game.appid, next);
      scheduleOriginalReleaseDateFetch(game.appid, next.name);
      if (tab === "achievements") {
        await loadAchievementData(true, next);
        if (gameHasSteamAchievements(next) && steamToolsSamEnabled) {
          await refreshSamProbe();
        } else {
          setSamProbe(null);
        }
      }
    } finally {
      setRefreshingDetails(false);
    }
  };

  const applySamResultToAchievements = useCallback(
    (result: SamAchievementActionResult) => {
      setAchievements((current) => {
        if (!current) return current;
        const states = new Map(
          result.after.achievements
            .filter((state) => state.valid)
            .map((state) => [state.apiName, state])
        );
        if (states.size === 0) return current;

        const nextAchievements = current.achievements.map((achievement) => {
          const state = states.get(achievement.api_name);
          if (!state) return achievement;
          return {
            ...achievement,
            achieved: state.achieved,
            unlock_time: state.unlockTime,
          };
        });
        const next: AchievementSummary = {
          total: current.total,
          achieved: nextAchievements.filter((achievement) => achievement.achieved).length,
          achievements: sortAchievements(nextAchievements),
        };
        useAchievementsStore.getState().setSummary(game.appid, next);
        return next;
      });
    },
    [game.appid]
  );

  const handleSamAchievementAction = useCallback(
    async (
      action: SamAchievementAction,
      achievementIds: string[],
      backupPath: string | null = null
    ) => {
      const count = achievementIds.length;
      const isRestoreAction = action === "restore_backup";
      const isUnlockAction =
        action === "unlock" || action === "unlock_selected" || action === "unlock_all";
      const confirmMessage =
        isRestoreAction
          ? t("detail.sam.confirmRestore")
          : isUnlockAction
          ? t("detail.sam.confirmUnlock", { count })
          : t("detail.sam.confirmLock", { count });
      setSamActionMessage("");
      setSamActionError("");

      let confirmed = false;
      try {
        confirmed = await confirmDialog(confirmMessage, {
          title: t("detail.sam.title"),
          kind: "warning",
        });
      } catch (error) {
        setSamActionError(String(error));
        return false;
      }
      if (!confirmed) return false;

      setSamActionRunning(action);
      try {
        const result = await runSamAchievementAction({
          steamPath,
          appId: game.appid,
          action,
          achievementIds,
          backupPath,
        });
        applySamResultToAchievements(result);
        const beforeBackup = result.beforeBackupPath ?? t("common.unknown");
        const afterBackup = result.afterBackupPath ?? t("common.unknown");
        if (result.failed.length > 0) {
          const diagnostics = result.diagnostics?.slice(0, 6).join(" · ") ?? "";
          setSamActionError(
            [
              t("detail.sam.actionFailed", {
                count: result.failed.length,
                ids: result.failed.join(", "),
                backup: beforeBackup,
                afterBackup,
              }),
              result.message,
              diagnostics
                ? t("detail.sam.actionDiagnostics", { details: diagnostics })
                : "",
            ]
              .filter(Boolean)
              .join(" ")
          );
        } else {
          setSamActionMessage(
            t("detail.sam.actionDone", {
              count: result.changed,
              backup: beforeBackup,
              afterBackup,
            })
          );
        }
        void refreshSamProbe();
        return result.failed.length === 0;
      } catch (error) {
        setSamActionError(String(error));
        return false;
      } finally {
        setSamActionRunning("");
      }
    },
    [
      applySamResultToAchievements,
      game.appid,
      refreshSamProbe,
      steamPath,
      t,
    ]
  );

  const loadSamBackupList = useCallback(async () => {
    setSamBackupsLoading(true);
    setSamBackupsError("");
    try {
      setSamBackups(await listSamBackups(game.appid));
    } catch (error) {
      setSamBackupsError(String(error));
    } finally {
      setSamBackupsLoading(false);
    }
  }, [game.appid]);

  const handleOpenSamBackups = useCallback(async () => {
    setSamBackupsOpen(true);
    await loadSamBackupList();
  }, [loadSamBackupList]);

  const handleRestoreSamBackup = useCallback(async () => {
    setSamBackupsOpen(true);
    await loadSamBackupList();
  }, [loadSamBackupList]);

  const handleRestoreSamBackupFromList = useCallback(
    async (backup: SamBackupInfo) => {
      const completed = await handleSamAchievementAction(
        "restore_backup",
        [],
        backup.path
      );
      if (completed) {
        setSamBackupsOpen(false);
      } else {
        await loadSamBackupList();
      }
    },
    [handleSamAchievementAction, loadSamBackupList]
  );

  const handleOpenSamBackupFolder = useCallback(async () => {
    try {
      await openSamBackupDir(game.appid);
    } catch (error) {
      setSamBackupsError(String(error));
    }
  }, [game.appid]);

  return createPortal(
    <DialogOverlay
      label={String(game.name ?? game.appid)}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <ResizableDialogPanel
        dialogId="game-detail"
        defaultSize={{ width: 900, height: 740 }}
        minSize={{ width: 640, height: 480 }}
        className="relative flex min-h-0 flex-col overflow-clip rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in-stable"
      >
        {({ sizeControls }) => (
          <>
        {/* Header image + overlay */}
        <div className="relative h-48 shrink-0 overflow-hidden bg-repressurizer-bg">
          <SteamImage
            appId={game.appid}
            alt=""
            kind="header"
            loading="eager"
            className="h-full w-full object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-repressurizer-surface via-repressurizer-surface/60 to-transparent" />
          <div className="absolute bottom-5 left-6 right-6">
            <h1 className="text-2xl font-semibold text-white tracking-tight drop-shadow-lg">
              {String(game.name ?? "")}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-repressurizer-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={13} />
                {t("detail.playedHours", { hours })}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarBlank size={13} />
                {t("detail.lastPlayedValue", { date: lastPlayed })}
              </span>
              {details?.metacritic_score && (
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    details.metacritic_score >= 75
                      ? "bg-emerald-600/80 text-white"
                      : details.metacritic_score >= 50
                        ? "bg-amber-600/80 text-white"
                        : "bg-red-600/80 text-white"
                  }`}
                >
                  {details.metacritic_score}
                </span>
              )}
            </div>
          </div>
          <div className="absolute right-14 top-4 rounded-lg bg-black/40 p-0.5 backdrop-blur-sm">
            {sizeControls}
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="btn-press absolute right-4 top-4 flex items-center justify-center w-8 h-8 rounded-lg bg-black/40 text-white/70 transition-colors hover:bg-black/60 hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex h-10 shrink-0 border-b border-repressurizer-border">
          <button
            onClick={() => setTab("info")}
            className={`flex h-full items-center px-6 text-sm transition-colors ${
              tab === "info"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            {t("detail.details")}
          </button>
          <button
            onClick={() => setTab("achievements")}
            className={`flex h-full items-center gap-2 px-6 text-sm transition-colors ${
              tab === "achievements"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            <Trophy size={14} weight={tab === "achievements" ? "fill" : "regular"} />
            {t("achievements.title")}
            {achievementTabSummary && achievementTabSummary.total > 0 && (
              <span className="rounded-md bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-mono text-repressurizer-accent tabular-nums">
                {achievementTabSummary.achieved}/{achievementTabSummary.total}
              </span>
            )}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleRefreshDetails}
            disabled={refreshingDetails}
            className="btn-press inline-flex h-full items-center gap-1.5 px-4 text-sm text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
          >
            <ArrowsClockwise size={14} className={refreshingDetails ? "animate-spin" : ""} />
            {t("settings.refresh")}
          </button>
          <button
            onClick={() => openPath(`https://store.steampowered.com/app/${game.appid}`)}
            className="btn-press inline-flex h-full items-center gap-1.5 px-4 text-sm text-repressurizer-text-muted transition-colors hover:text-white"
          >
            <ArrowSquareOut size={14} />
            {t("detail.steamStore")}
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 overflow-y-auto p-6" data-game-detail-scroll>
          {tab === "info" && (
            <GameInfoTab
              details={details}
              loading={loadingDetails}
              game={game}
              gameCategories={gameCategories}
              editableCollections={editableCollections}
              showDetailHltb={showDetailHltb}
              showDetailMetacritic={showDetailMetacritic}
              showDetailPrice={showDetailPrice}
              onAddToCategory={(key) => addGameToCategory(key, game.appid)}
              onRemoveFromCategory={(key) => removeGameFromCategory(key, game.appid)}
            />
          )}
          {tab === "achievements" && (
            <GameAchievementsTab
              achievements={achievements}
              loading={loadingAchievements}
              error={achError}
              percent={achPercent}
              samProbe={samProbe}
              steamToolsEnabled={steamToolsSamEnabled}
              steamToolsAchievementWritesEnabled={steamToolsSamEnabled}
              samActionRunning={samActionRunning}
              samActionMessage={samActionMessage}
              samActionError={samActionError}
              onSamAction={handleSamAchievementAction}
              onOpenSamBackups={handleOpenSamBackups}
              onRestoreSamBackup={handleRestoreSamBackup}
            />
          )}
        </div>
          </>
        )}
      </ResizableDialogPanel>
      {samBackupsOpen && (
        <SamBackupViewerDialog
          gameName={String(game.name ?? "")}
          appId={game.appid}
          backups={samBackups}
          loading={samBackupsLoading}
          error={samBackupsError}
          restoring={samActionRunning === "restore_backup"}
          onClose={() => setSamBackupsOpen(false)}
          onRefresh={loadSamBackupList}
          onRestore={handleRestoreSamBackupFromList}
          onOpenFolder={handleOpenSamBackupFolder}
        />
      )}
    </DialogOverlay>,
    document.body
  );
}
