import { useState, useEffect, useMemo, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useNotesStore } from "../../stores/notesStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useReviewStore } from "../../stores/reviewStore";
import {
  fetchGameDetails,
  fetchAchievements,
  fetchHltb,
  currencyToCountryCode,
} from "../../lib/tauri";
import { useT } from "../../lib/i18n";
import { extractReleaseYear } from "../../lib/search";
import { SteamImage } from "./SteamImage";
import { useHltbStore } from "../../stores/hltbStore";
import type {
  OwnedGame,
  GameDetails,
  AchievementSummary,
  AchievementInfo,
} from "../../lib/types";
import {
  X,
  Clock,
  CalendarBlank,
  Trophy,
  ArrowSquareOut,
  Check,
  Lock,
  MagnifyingGlass,
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
  const { apiKey, steamId64, currency } = useSettingsStore();
  const collections = useCategoryStore((s) => s.collections);
  const addGameToCategory = useCategoryStore((s) => s.addGameToCategory);
  const removeGameFromCategory = useCategoryStore(
    (s) => s.removeGameFromCategory
  );

  const [details, setDetails] = useState<GameDetails | null>(null);
  const [achievements, setAchievements] = useState<AchievementSummary | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingAchievements, setLoadingAchievements] = useState(true);
  const [achError, setAchError] = useState("");
  const [tab, setTab] = useState<"info" | "achievements">("info");

  const cachedDetails = useGameStore((s) => s.details[game.appid]);

  const gameCategories = useMemo(
    () =>
      collections.filter(
        (c) => c.added.includes(game.appid) && !c.is_dynamic && c.id !== "hidden"
      ),
    [collections, game.appid]
  );

  const editableCollections = useMemo(
    () =>
      [...collections]
        .filter((c) => !c.is_dynamic && c.id !== "hidden")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [collections]
  );

  useEffect(() => {
    if (cachedDetails) {
      setDetails(cachedDetails);
      setLoadingDetails(false);
    } else {
      fetchGameDetails(game.appid, currencyToCountryCode(currency))
        .then((d) => {
          setDetails(d);
          useGameStore.getState().setDetails(game.appid, d);
        })
        .catch(() => {})
        .finally(() => setLoadingDetails(false));
    }

    fetchAchievements(apiKey, steamId64, game.appid)
      .then(setAchievements)
      .catch((e) => setAchError(String(e)))
      .finally(() => setLoadingAchievements(false));
  }, [game.appid]);

  const hours = (game.playtime_forever / 60).toFixed(1);
  const lastPlayed = game.rtime_last_played
    ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
    : t("gameDetails.never");

  const achPercent =
    achievements && achievements.total > 0
      ? Math.round((achievements.achieved / achievements.total) * 100)
      : 0;

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
                {t("gameDetails.header.playedHours", { hours })}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarBlank size={13} />
                {t("gameDetails.header.lastPlayed", { date: lastPlayed })}
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
            {t("gameDetails.infoTab")}
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
            {achievements && achievements.total > 0 && (
              <span className="rounded-md bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-mono text-repressurizer-accent tabular-nums">
                {achievements.achieved}/{achievements.total}
              </span>
            )}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => open(`https://store.steampowered.com/app/${game.appid}`)}
            className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 text-sm text-repressurizer-text-muted transition-colors hover:text-white"
          >
            <ArrowSquareOut size={14} />
            {t("gameDetails.steamStore")}
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
  onAddToCategory,
  onRemoveFromCategory,
}: {
  details: GameDetails | null;
  loading: boolean;
  game: OwnedGame;
  gameCategories: ReturnType<typeof useCategoryStore.getState>["collections"];
  editableCollections: ReturnType<typeof useCategoryStore.getState>["collections"];
  onAddToCategory: (key: string) => void;
  onRemoveFromCategory: (key: string) => void;
}) {
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
      else setHltbError(t("gameDetails.noHltbFound"));
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
  const t = useT();

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
            label={t("gameDetails.stat.appId")}
            value={`#${game.appid}`}
            icon={<Hash size={16} weight="duotone" />}
          />
          <StatCard
            label={t("gameDetails.stat.playtime")}
            value={`${(game.playtime_forever / 60).toFixed(1)}h`}
            icon={<Clock size={16} weight="duotone" />}
          />
          <StatCard
            label={t("gameDetails.stat.lastPlayed")}
            value={
              game.rtime_last_played
                ? new Date(game.rtime_last_played * 1000).toLocaleDateString()
                : t("gameDetails.never")
            }
            icon={<CalendarBlank size={16} weight="duotone" />}
          />
          <StatCard
            label={t("gameDetails.stat.release")}
            value={details?.release_date ?? (loading ? "..." : t("gameDetails.unknown"))}
            icon={<CalendarBlank size={16} weight="duotone" />}
          />
      </div>

      {/* HLTB + Metacritic + Price — single row */}
      <div className="border-t border-repressurizer-border pt-5">
        <div className="flex gap-8">
          {/* HowLongToBeat */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5">
                  <Timer size={12} />
                  {t("gameDetails.hltb")}
                </h3>
                <button
                  onClick={handleFetchHltb}
                disabled={fetchingHltb}
                className="inline-flex items-center gap-1 rounded-lg border border-repressurizer-border px-2 py-0.5 text-[11px] text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
                >
                  <ArrowsClockwise size={11} className={fetchingHltb ? "animate-spin" : ""} />
                  {hltbData ? t("common.refresh") : t("common.fetch")}
                </button>
              </div>
              {hltbData ? (
                <div className="flex gap-4 text-sm">
                  {hltbData.main_story != null && (
                    <div>
                      <p className="text-[10px] text-repressurizer-text-faint mb-0.5">{t("gameDetails.main")}</p>
                      <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_story}h</p>
                    </div>
                  )}
                  {hltbData.main_extra != null && (
                    <div>
                      <p className="text-[10px] text-repressurizer-text-faint mb-0.5">{t("gameDetails.extras")}</p>
                      <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.main_extra}h</p>
                    </div>
                  )}
                {hltbData.completionist != null && (
                  <div>
                    <p className="text-[10px] text-repressurizer-text-faint mb-0.5">{t("gameDetails.completionist")}</p>
                    <p className="font-mono tabular-nums text-repressurizer-text">{hltbData.completionist}h</p>
                  </div>
                )}
              </div>
            ) : hltbError ? (
              <p className="text-xs text-repressurizer-danger">{hltbError}</p>
            ) : (
              <p className="text-xs text-repressurizer-text-faint">{t("gameDetails.noDataFetch")}</p>
            )}
          </div>

          {/* Metacritic */}
          {details?.metacritic_score != null && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium flex items-center gap-1.5 mb-2">
                <Star size={12} weight="duotone" />
                {t("gameDetails.metacritic.title")}
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
                  {details.metacritic_score >= 75 ? t("gameDetails.metacritic.favorable") :
                   details.metacritic_score >= 50 ? t("gameDetails.metacritic.mixed") : t("gameDetails.metacritic.unfavorable")}
                </span>
              </div>
            </div>
          )}

          {/* Price */}
          {details && (details.price_initial != null || details.is_free) && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium mb-2">
                {t("gameDetails.price")}
              </h3>
              <p className="text-sm font-mono tabular-nums text-repressurizer-text">
                {details.is_free ? t("gameDetails.freeToPlay") : details.price_initial != null
                  ? `${(details.price_initial / 100).toFixed(2)} ${details.price_currency ?? ""}`.trim()
                  : t("gameDetails.unknown")}
              </p>
            </div>
          )}
        </div>
      </div>

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
                  {t("gameDetails.genres")}
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
                  {t("gameDetails.developer")}
                </h3>
                <p className="text-sm text-repressurizer-text">
                  {details.developers.join(", ")}
                </p>
              </div>
            )}
            {details.publishers.length > 0 && (
              <div>
                <h3 className="mb-1 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                  {t("gameDetails.publisher")}
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
                {t("gameDetails.platforms")}
              </h3>
            <div className="flex gap-2">
              {details.platforms.windows && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <WindowsLogo size={13} weight="fill" /> {t("gameDetails.platform.windows")}
                </span>
              )}
              {details.platforms.mac && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <AppleLogo size={13} weight="fill" /> {t("gameDetails.platform.mac")}
                </span>
              )}
              {details.platforms.linux && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-surface-raised px-2.5 py-1 text-xs text-repressurizer-text">
                  <LinuxLogo size={13} weight="fill" /> {t("gameDetails.platform.linux")}
                </span>
              )}
            </div>
          </div>

          {/* Steam categories (features) */}
          {details.categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("gameDetails.features")}
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
            {t("gameDetails.loadFailed")}
          </div>
        )}

        {/* Your categories */}
        <div className="border-t border-repressurizer-border pt-5">
          <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
            {t("gameDetails.categories")}
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
            {t("gameDetails.tags")}
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
            placeholder={t("gameDetails.addTag")}
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
            {t("common.add")}
          </button>
        </div>
      </div>

      {/* Your Rating */}
      <RatingWidget appId={game.appid} />

      {/* Notes */}
        <div className="border-t border-repressurizer-border pt-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
            {t("gameDetails.notes")}
          </h3>
        <textarea
          value={noteText}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder={t("gameDetails.notesPlaceholder")}
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

function AchievementsTab({
  achievements,
  loading,
  error,
  percent,
}: {
  achievements: AchievementSummary | null;
  loading: boolean;
  error: string;
  percent: number;
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
            {t("achievements.noData")}
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

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="rounded-xl bg-repressurizer-bg p-4 border border-repressurizer-border-subtle">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-medium text-white">
            {t("gameDetails.achievementCount", {
              achieved: achievements.achieved,
              total: achievements.total,
            })}
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
          placeholder={t("gameDetails.searchAchievements")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg pl-9 pr-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
        />
      </div>

      {/* Achievement list */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-repressurizer-text-muted">
            {t("grid.noMatch", { query: search })}
          </p>
        ) : (
          filtered.map((ach) => (
            <AchievementRow key={ach.api_name} achievement={ach} />
          ))
        )}
      </div>
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: AchievementInfo }) {
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
          {t("gameDetails.locked")}
        </span>
      )}
    </div>
  );
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
