import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useNotesStore } from "../../stores/notesStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import {
  fetchGameDetails,
  fetchAchievements,
  fetchHltb,
  currencyToCountryCode,
  probeSamBridge,
  runSamAchievementAction,
} from "../../lib/tauri";
import { extractReleaseYear } from "../../lib/search";
import { SteamImage } from "./SteamImage";
import { useHltbStore } from "../../stores/hltbStore";
import type {
  OwnedGame,
  GameDetails,
  AchievementSummary,
  AchievementInfo,
  SamBridgeProbe,
  SamAchievementAction,
  SamAchievementActionResult,
} from "../../lib/types";
import { useT, type TranslationKey } from "../../lib/i18n";
import {
  X,
  Clock,
  CalendarBlank,
  Trophy,
  ArrowSquareOut,
  Check,
  Lock,
  MagnifyingGlass,
  ShieldCheck,
  Wrench,
  WindowsLogo,
  LinuxLogo,
  AppleLogo,
  Timer,
  ArrowsClockwise,
  Star,
  Hash,
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
  const [tab, setTab] = useState<"info" | "achievements">("info");

  const cachedAchievementSummary = useAchievementsStore((s) => s.summaries[game.appid]);

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
    const cachedAchievements = useAchievementsStore.getState().summaries[game.appid];
    if (cachedAchievements?.achievements?.length) {
      setAchievements(cachedAchievements);
    }

    if (cachedDetails) {
      setDetails(cachedDetails);
      setLoadingDetails(false);
      return () => {
        cancelled = true;
      };
    } else {
      setDetails(null);
      setLoadingDetails(true);
      fetchGameDetails(game.appid, currencyToCountryCode(currency))
        .then((d) => {
          if (cancelled) return;
          setDetails(d);
          useGameStore.getState().setDetails(game.appid, d);
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
    if (!steamToolsEnabled) {
      setSamProbe(null);
      return;
    }
    setSamProbe(null);
    try {
      const probe = await probeSamBridge(steamPath, game.appid);
      setSamProbe(probe);
    } catch {
      setSamProbe(null);
    }
  }, [game.appid, steamPath, steamToolsEnabled]);

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
    if (details && steamToolsEnabled) void refreshSamProbe();
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
      if (tab === "achievements") {
        await loadAchievementData(true, next);
        if (gameHasSteamAchievements(next) && steamToolsEnabled) {
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
    async (action: SamAchievementAction, achievementIds: string[]) => {
      const count = achievementIds.length;
      const confirmMessage =
        action === "unlock" || action === "unlock_all"
          ? t("detail.sam.confirmUnlock", { count })
          : t("detail.sam.confirmLock", { count });
      if (!window.confirm(confirmMessage)) return;

      setSamActionRunning(action);
      setSamActionMessage("");
      setSamActionError("");
      try {
        const result = await runSamAchievementAction({
          steamPath,
          appId: game.appid,
          action,
          achievementIds,
          backupPath: null,
        });
        applySamResultToAchievements(result);
        const backup = result.beforeBackupPath ?? t("common.unknown");
        setSamActionMessage(
          t("detail.sam.actionDone", {
            count: result.changed,
            backup,
          })
        );
        void refreshSamProbe();
      } catch (error) {
        setSamActionError(String(error));
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in" style={{ maxHeight: "90vh" }}>
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
          <button
            onClick={onClose}
            className="btn-press absolute right-4 top-4 flex items-center justify-center w-8 h-8 rounded-lg bg-black/40 text-white/70 transition-colors hover:bg-black/60 hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-repressurizer-border">
          <button
            onClick={() => setTab("info")}
            className={`px-6 py-2.5 text-sm transition-colors ${
              tab === "info"
                ? "border-b-2 border-repressurizer-accent text-white"
                : "text-repressurizer-text-muted hover:text-white"
            }`}
          >
            {t("detail.details")}
          </button>
          <button
            onClick={() => setTab("achievements")}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm transition-colors ${
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
            className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
          >
            <ArrowsClockwise size={14} className={refreshingDetails ? "animate-spin" : ""} />
            {t("settings.refresh")}
          </button>
          <button
            onClick={() => open(`https://store.steampowered.com/app/${game.appid}`)}
            className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white"
          >
            <ArrowSquareOut size={14} />
            {t("detail.steamStore")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {tab === "info" && (
            <InfoTab
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
            <AchievementsTab
              achievements={achievements}
              loading={loadingAchievements}
              error={achError}
              percent={achPercent}
              samProbe={samProbe}
              steamToolsEnabled={steamToolsEnabled}
              steamToolsAchievementWritesEnabled={steamToolsAchievementWritesEnabled}
              samActionRunning={samActionRunning}
              samActionMessage={samActionMessage}
              samActionError={samActionError}
              onSamAction={handleSamAchievementAction}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoTab({
  details,
  loading,
  game,
  gameCategories,
  editableCollections,
  showDetailHltb,
  showDetailMetacritic,
  showDetailPrice,
  onAddToCategory,
  onRemoveFromCategory,
}: {
  details: GameDetails | null;
  loading: boolean;
  game: OwnedGame;
  gameCategories: ReturnType<typeof useCategoryStore.getState>["collections"];
  editableCollections: ReturnType<typeof useCategoryStore.getState>["collections"];
  showDetailHltb: boolean;
  showDetailMetacritic: boolean;
  showDetailPrice: boolean;
  onAddToCategory: (key: string) => void;
  onRemoveFromCategory: (key: string) => void;
}) {
  const t = useT();
  const gameCatKeys = new Set(gameCategories.map((c) => c.key));
  const note = useNotesStore((s) => s.notes[game.appid] ?? "");
  const setNote = useNotesStore((s) => s.setNote);
  const [noteText, setNoteText] = useState(note);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setNote(game.appid, text), 500);
  };

  const hltbData = useHltbStore((s) => s.data[game.appid] ?? null);
  const setHltbData = useHltbStore((s) => s.setData);
  const [fetchingHltb, setFetchingHltb] = useState(false);
  const [hltbError, setHltbError] = useState("");

  const handleFetchHltb = async () => {
    const name = String(game.name ?? "");
    if (!name) return;
    setFetchingHltb(true);
    setHltbError("");
    try {
      const data = await fetchHltb(name, game.appid, extractReleaseYear(details?.release_date));
      if (data) setHltbData(game.appid, data);
      else setHltbError(t("detail.hltbNotFound"));
    } catch (e) {
      setHltbError(String(e));
    } finally {
      setFetchingHltb(false);
    }
  };

  const gameTags = useTagsStore((s) => s.tags[game.appid]) ?? [];
  const addTag = useTagsStore((s) => s.addTag);
  const removeTag = useTagsStore((s) => s.removeTag);
  const getAllTags = useTagsStore((s) => s.getAllTags);
  const [tagInput, setTagInput] = useState("");
  const allTags = getAllTags();

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !gameTags.includes(trimmed)) {
      addTag(game.appid, trimmed);
    }
    setTagInput("");
  };

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("detail.appId")}
          value={`#${game.appid}`}
          icon={<Hash size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.playtime")}
          value={`${(game.playtime_forever / 60).toFixed(1)}h`}
          icon={<Clock size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.lastPlayed")}
          value={
            game.rtime_last_played
              ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
              : t("common.never")
          }
          icon={<CalendarBlank size={16} weight="duotone" />}
        />
        <StatCard
          label={t("detail.release")}
          value={details?.release_date ?? (loading ? "..." : t("common.unknown"))}
          icon={<CalendarBlank size={16} weight="duotone" />}
        />
      </div>

      {/* HLTB + Metacritic + Price — single row */}
      {(showDetailHltb !== false || showDetailMetacritic !== false || showDetailPrice !== false) && (
      <div className="border-t border-repressurizer-border pt-5">
        <div className="flex gap-8">
          {/* HowLongToBeat */}
          {showDetailHltb !== false && (
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5">
                <Timer size={12} />
                HowLongToBeat
              </h3>
              <button
                onClick={handleFetchHltb}
                disabled={fetchingHltb}
                className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-2 py-0.5 text-[11px] text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
              >
                <ArrowsClockwise size={11} className={fetchingHltb ? "animate-spin" : ""} />
                {hltbData ? t("settings.refresh") : t("detail.fetch")}
              </button>
            </div>
            {hltbData ? (
              <div className="flex gap-4 text-sm">
                {hltbData.main_story != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">{t("detail.hltbMain")}</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_story}h</p>
                  </div>
                )}
                {hltbData.main_extra != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">+Extras</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_extra}h</p>
                  </div>
                )}
                {hltbData.completionist != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">100%</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.completionist}h</p>
                  </div>
                )}
              </div>
            ) : hltbError ? (
              <p className="text-xs text-repressurizer-danger">{hltbError}</p>
            ) : (
              <p className="text-xs text-repressurizer-text-faint">{t("detail.noDataFetch")}</p>
            )}
          </div>
          )}

          {/* Metacritic */}
          {showDetailMetacritic !== false && details?.metacritic_score != null && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5 mb-2">
                <Star size={12} weight="duotone" />
                Metacritic
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold ${
                    details.metacritic_score >= 75
                      ? "bg-emerald-600/20 text-emerald-400"
                      : details.metacritic_score >= 50
                        ? "bg-amber-600/20 text-amber-400"
                        : "bg-red-600/20 text-red-400"
                  }`}
                >
                  {details.metacritic_score}
                </span>
                <span className="text-[10px] text-repressurizer-text-faint leading-tight">
                  {details.metacritic_score >= 75 ? t("detail.favorable") :
                   details.metacritic_score >= 50 ? t("detail.mixed") : t("detail.unfavorable")}
                </span>
              </div>
            </div>
          )}

          {/* Price */}
          {showDetailPrice !== false && details && (details.price_initial != null || details.price_final != null || details.is_free) && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium mb-2">
                {t("detail.price")}
              </h3>
              <PriceBlock details={details} />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Game info */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="flex gap-2">
            <div className="skeleton h-7 w-20 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-16 rounded-full" />
          </div>
          <div className="skeleton h-4 w-32 mt-4" />
          <div className="skeleton h-4 w-48" />
        </div>
      ) : details ? (
        <div className="space-y-5">
          {/* Genres */}
          {details.genres.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("detail.genres")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Developer / Publisher */}
          <div className="grid grid-cols-2 gap-4">
            {details.developers.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("detail.developer")}
                </h3>
                <p className="text-sm text-repressurizer-text">
                  {details.developers.join(", ")}
                </p>
              </div>
            )}
            {details.publishers.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("detail.publisher")}
                </h3>
                <p className="text-sm text-repressurizer-text">
                  {details.publishers.join(", ")}
                </p>
              </div>
            )}
          </div>

          {/* Platforms */}
          <div>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
              {t("detail.platforms")}
            </h3>
            <div className="flex gap-2">
              {details.platforms.windows && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <WindowsLogo size={13} weight="fill" /> Windows
                </span>
              )}
              {details.platforms.mac && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <AppleLogo size={13} weight="fill" /> macOS
                </span>
              )}
              {details.platforms.linux && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <LinuxLogo size={13} weight="fill" /> Linux
                </span>
              )}
            </div>
          </div>

          {/* Steam categories (features) */}
          {details.categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("detail.features")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {details.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-lg bg-repressurizer-bg px-2.5 py-1 text-xs text-repressurizer-text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-repressurizer-text-muted">
          {t("detail.loadFailed")}
        </div>
      )}

      {/* Your categories */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.yourCategories")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {editableCollections.map((col) => {
            const inCat = gameCatKeys.has(col.key);
            return (
              <button
                key={col.key}
                onClick={() =>
                  inCat
                    ? onRemoveFromCategory(col.key)
                    : onAddToCategory(col.key)
                }
                className={`btn-press inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  inCat
                    ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border text-repressurizer-text-muted hover:border-repressurizer-text-faint hover:text-repressurizer-text"
                }`}
              >
                {inCat && <Check size={11} weight="bold" />}
                {String(col.name ?? "")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Personal Tags */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.tags")}
        </h3>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {gameTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs text-sky-400"
            >
              {tag}
              <button
                onClick={() => removeTag(game.appid, tag)}
                className="ml-0.5 text-sky-400/50 hover:text-sky-400 transition-colors"
              >
                <X size={9} weight="bold" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
            }}
            placeholder={t("detail.addTag")}
            list="tag-suggestions"
            className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none transition-colors"
          />
          <datalist id="tag-suggestions">
            {allTags.filter((t) => !gameTags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button
            onClick={handleAddTag}
            disabled={!tagInput.trim()}
            className="btn-press rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs text-sky-400 hover:bg-sky-500/25 disabled:opacity-40 transition-colors"
          >
            {t("detail.add")}
          </button>
        </div>
      </div>

      {/* Your Rating */}
      <RatingWidget appId={game.appid} />

      {/* Notes */}
      <div className="border-t border-repressurizer-border pt-5">
        <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("detail.notes")}
        </h3>
        <textarea
          value={noteText}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder={t("detail.notesPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-xl border border-repressurizer-border bg-repressurizer-bg px-3 py-2.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none transition-colors"
        />
      </div>
    </div>
  );
}

function RatingWidget({ appId }: { appId: number }) {
  const t = useT();
  const rating = useReviewStore((s) => s.reviews[appId]?.rating ?? 0);
  const setRating = useReviewStore((s) => s.setRating);
  const clearRating = useReviewStore((s) => s.clearRating);
  const [hovered, setHovered] = useState(0);

  const display = hovered || rating;

  return (
    <div className="border-t border-repressurizer-border pt-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5">
          <Star size={12} weight="duotone" />
          {t("review.title")}
        </h3>
        {rating > 0 && (
          <button
            onClick={() => clearRating(appId)}
            className="text-[11px] text-repressurizer-text-faint hover:text-repressurizer-text-muted transition-colors"
          >
            {t("review.clear")}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onClick={() => setRating(appId, n)}
            className="btn-press p-0.5 transition-colors"
          >
            <Star
              size={20}
              weight={n <= display ? "fill" : "regular"}
              className={
                n <= display
                  ? "text-amber-400"
                  : "text-repressurizer-text-faint hover:text-repressurizer-text-muted"
              }
            />
          </button>
        ))}
        {display > 0 && (
          <span className="ml-2 font-mono text-sm font-bold text-amber-400 tabular-nums">
            {display}/10
          </span>
        )}
      </div>
    </div>
  );
}

function PriceBlock({ details }: { details: GameDetails }) {
  const t = useT();
  if (details.is_free) {
    return <p className="text-sm font-mono tabular-nums text-repressurizer-text">{t("detail.freeToPlay")}</p>;
  }

  const currency = details.price_currency ?? "";
  const initial = details.price_initial;
  const final = details.price_final ?? details.price_initial;
  if (final == null) {
    return <p className="text-sm text-repressurizer-text-faint">{t("common.unknown")}</p>;
  }

  const format = (value: number) => `${(value / 100).toFixed(2)} ${currency}`.trim();
  const discounted = initial != null && initial > final;
  const discountPercent = discounted ? Math.round(((initial - final) / initial) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {discounted && (
          <span className="rounded-md bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
            -{discountPercent}%
          </span>
        )}
        <p className="text-sm font-mono font-semibold tabular-nums text-repressurizer-text">
          {format(final)}
        </p>
      </div>
      {discounted && (
        <p className="font-mono text-[11px] tabular-nums text-repressurizer-text-faint line-through">
          {format(initial)}
        </p>
      )}
    </div>
  );
}

function AchievementsTab({
  achievements,
  loading,
  error,
  percent,
  samProbe,
  steamToolsEnabled,
  steamToolsAchievementWritesEnabled,
  samActionRunning,
  samActionMessage,
  samActionError,
  onSamAction,
}: {
  achievements: AchievementSummary | null;
  loading: boolean;
  error: string;
  percent: number;
  samProbe: SamBridgeProbe | null;
  steamToolsEnabled: boolean;
  steamToolsAchievementWritesEnabled: boolean;
  samActionRunning: string;
  samActionMessage: string;
  samActionError: string;
  onSamAction: (action: SamAchievementAction, achievementIds: string[]) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="space-y-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-repressurizer-text-muted">
        {error}
      </div>
    );
  }

  if (!achievements || achievements.total === 0) {
    return (
      <div className="py-8 text-center animate-fade-in">
        <Trophy size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
        <p className="text-sm text-repressurizer-text-muted">
          {t("detail.noAchievements")}
        </p>
      </div>
    );
  }

  const q = search.toLowerCase();
  const filtered = q
    ? achievements.achievements.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      )
    : achievements.achievements;
  const unlockedIds = achievements.achievements
    .filter((achievement) => achievement.achieved)
    .map((achievement) => achievement.api_name);
  const lockedIds = achievements.achievements
    .filter((achievement) => !achievement.achieved)
    .map((achievement) => achievement.api_name);
  const canWrite =
    steamToolsEnabled &&
    steamToolsAchievementWritesEnabled &&
    !!samProbe?.available &&
    !!samProbe?.writesSteam &&
    !samActionRunning;

  return (
    <div className="space-y-4">
      {steamToolsEnabled && (
        <SamBridgePanel
          probe={samProbe}
          writesEnabled={steamToolsAchievementWritesEnabled}
          runningAction={samActionRunning}
          message={samActionMessage}
          error={samActionError}
          lockedCount={lockedIds.length}
          unlockedCount={unlockedIds.length}
          onUnlockAll={() => onSamAction("unlock_all", lockedIds)}
          onLockAll={() => onSamAction("lock_all", unlockedIds)}
        />
      )}

      {/* Progress bar */}
      <div className="rounded-xl bg-repressurizer-bg p-4 border border-repressurizer-border-subtle">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-medium text-white">
            {t("detail.achievementProgress", { achieved: achievements.achieved, total: achievements.total })}
          </span>
          <span className="font-mono text-sm font-bold text-repressurizer-accent tabular-nums">
            {percent}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-repressurizer-surface">
          <div
            className="h-full rounded-full bg-gradient-to-r from-repressurizer-accent to-emerald-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass
          size={14}
          weight="bold"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint pointer-events-none"
        />
        <input
          type="text"
          placeholder={t("detail.searchAchievements")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg pl-9 pr-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
        />
      </div>

      {/* Achievement list */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-repressurizer-text-muted">
            {t("detail.noAchievementMatches", { query: search })}
          </p>
        ) : (
          filtered.map((ach) => (
            <AchievementRow
              key={ach.api_name}
              achievement={ach}
              canWrite={canWrite}
              onToggle={() =>
                onSamAction(ach.achieved ? "lock" : "unlock", [ach.api_name])
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function SamBridgePanel({
  probe,
  writesEnabled,
  runningAction,
  message,
  error,
  lockedCount,
  unlockedCount,
  onUnlockAll,
  onLockAll,
}: {
  probe: SamBridgeProbe | null;
  writesEnabled: boolean;
  runningAction: string;
  message: string;
  error: string;
  lockedCount: number;
  unlockedCount: number;
  onUnlockAll: () => void;
  onLockAll: () => void;
}) {
  const t = useT();
  const readiness = samReadinessLabel(t, probe);
  const canWrite = writesEnabled && !!probe?.available && !!probe?.writesSteam && !runningAction;
  const lockBlocked = !canWrite || unlockedCount === 0;
  const unlockBlocked = !canWrite || lockedCount === 0;

  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Wrench size={17} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("detail.sam.title")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {writesEnabled ? t("detail.sam.writeDesc") : t("detail.sam.desc")}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${probe?.available ? "border-repressurizer-success/30 bg-repressurizer-success/10 text-repressurizer-success" : "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-muted"}`}>
          {readiness}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SamBridgeFact
          icon={<ShieldCheck size={14} />}
          label={t("detail.sam.webApi")}
          value={t("steamTools.status.ready")}
        />
        <SamBridgeFact
          icon={<Wrench size={14} />}
          label={t("detail.sam.localBridge")}
          value={readiness}
        />
      </div>

      <div className="mt-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-repressurizer-text">{t("detail.sam.writeActions")}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
              {!writesEnabled
                ? t("detail.sam.enableWrites")
                : probe?.available
                  ? t("detail.sam.backupNote")
                  : t("detail.sam.bridgeRequired")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={onUnlockAll}
              disabled={unlockBlocked}
              className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-40"
            >
              {runningAction === "unlock_all" ? t("detail.sam.working") : t("detail.sam.unlockAll", { count: lockedCount })}
            </button>
            <button
              type="button"
              onClick={onLockAll}
              disabled={lockBlocked}
              className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger disabled:opacity-40"
            >
              {runningAction === "lock_all" ? t("detail.sam.working") : t("detail.sam.lockAll", { count: unlockedCount })}
            </button>
          </div>
        </div>
        {message && (
          <p className="mt-2 rounded-lg border border-repressurizer-success/20 bg-repressurizer-success/10 px-3 py-2 text-xs text-repressurizer-success">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-lg border border-repressurizer-danger/20 bg-repressurizer-danger/10 px-3 py-2 text-xs text-repressurizer-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SamBridgeFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2">
      <span className="shrink-0 text-repressurizer-text-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-repressurizer-text-muted">{label}</span>
      <span className="shrink-0 truncate font-mono text-[11px] text-repressurizer-text tabular-nums">{value}</span>
    </div>
  );
}

function samReadinessLabel(t: ReturnType<typeof useT>, probe: SamBridgeProbe | null): string {
  if (!probe) return t("steamTools.sam.checking");
  return t(`steamTools.sam.readiness.${probe.readiness}` as TranslationKey);
}

function AchievementRow({
  achievement,
  canWrite,
  onToggle,
}: {
  achievement: AchievementInfo;
  canWrite: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const unlockDate = achievement.unlock_time
    ? new Date(achievement.unlock_time * 1000).toLocaleDateString()
    : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        achievement.achieved ? "bg-repressurizer-bg" : "bg-repressurizer-bg/30 opacity-50"
      }`}
    >
      {/* Icon */}
      {(achievement.icon || achievement.icon_gray) && (
        <img
          src={
            achievement.achieved
              ? achievement.icon ?? undefined
              : achievement.icon_gray ?? undefined
          }
          alt=""
          className="h-9 w-9 rounded-lg"
        />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${achievement.achieved ? "font-medium text-white" : "text-repressurizer-text-muted"}`}
        >
          {achievement.name}
        </span>
        {achievement.description && (
          <p className="truncate text-xs text-repressurizer-text-muted mt-0.5">
            {achievement.description}
          </p>
        )}
      </div>

      {/* Status */}
      {achievement.achieved ? (
        <span className="shrink-0 font-mono text-xs text-repressurizer-success tabular-nums">
          {unlockDate}
        </span>
      ) : (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-repressurizer-text-faint">
          <Lock size={11} />
          {t("detail.locked")}
        </span>
      )}
      {canWrite && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className={`btn-press shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            achievement.achieved
              ? "border-repressurizer-border text-repressurizer-text-muted hover:border-repressurizer-danger hover:text-repressurizer-danger"
              : "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent hover:bg-repressurizer-accent/15"
          }`}
        >
          {achievement.achieved ? t("detail.sam.lock") : t("detail.sam.unlock")}
        </button>
      )}
    </div>
  );
}

function sortAchievements(achievements: AchievementInfo[]): AchievementInfo[] {
  return [...achievements].sort((a, b) => matchAchievementOrder(a, b));
}

function matchAchievementOrder(a: AchievementInfo, b: AchievementInfo): number {
  if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
  if (a.achieved && b.achieved) return b.unlock_time - a.unlock_time;
  return a.name.localeCompare(b.name);
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle p-3.5">
      <div className="flex items-center gap-1.5 text-repressurizer-text-faint mb-1">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}
