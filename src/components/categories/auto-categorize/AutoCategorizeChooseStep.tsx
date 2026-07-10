import { useCallback, useMemo, useState } from "react";
import {
  Buildings,
  Calendar,
  Clock,
  CopySimple,
  Desktop,
  Flag,
  Funnel,
  Globe,
  Playlist,
  Spinner,
  Star,
  Tag,
  TextAa,
  Timer,
  Trash,
  Warning,
  ArrowDown,
  ArrowRight,
  ArrowUp,
} from "@phosphor-icons/react";
import {
  detailsCacheNeedsRefresh,
  isDetailsCacheCurrent,
  useGameStore,
} from "../../../stores/gameStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useSteamRatingsStore } from "../../../stores/steamRatingsStore";
import { useBackgroundFetchStore } from "../../../stores/backgroundFetchStore";
import { useHltbStore } from "../../../stores/hltbStore";
import { MAX_FAIL_RUNS, useFailedGamesStore } from "../../../stores/failedGamesStore";
import { HLTB_MAX_FAILS, useHltbIgnoredStore } from "../../../stores/hltbIgnoredStore";
import { detailsPriceNeedsCurrencyRefresh } from "../../../lib/prices";
import { storeReleaseDateNeedsRefresh } from "../../../lib/releaseDates";
import { steamRatingIdsNeedingFetch } from "../../../lib/steamRatings";
import type { AutoCategorizePreset } from "../../../stores/autoCategorizeStore";
import { useT, type TranslationKey } from "../../../lib/i18n";
import {
  categorizerNeedsDetails,
  categorizerNeedsRatings,
  type CategorizerType,
} from "./autoCategorizeModel";

const CATEGORIZERS: {
  value: CategorizerType;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: typeof Clock;
}[] = [
  { value: "custom", labelKey: "auto.byCustom", descriptionKey: "auto.byCustom.desc", icon: Funnel },
  { value: "name", labelKey: "auto.byName", descriptionKey: "auto.byName.desc", icon: TextAa },
  { value: "genre", labelKey: "auto.byGenre", descriptionKey: "auto.byGenre.desc", icon: Tag },
  { value: "year", labelKey: "auto.byYear", descriptionKey: "auto.byYear.desc", icon: Calendar },
  { value: "rating", labelKey: "auto.byRating", descriptionKey: "auto.byRating.desc", icon: Star },
  { value: "score", labelKey: "auto.byScore", descriptionKey: "auto.byScore.desc", icon: Star },
  { value: "tags", labelKey: "auto.byTags", descriptionKey: "auto.byTags.desc", icon: Playlist },
  { value: "flags", labelKey: "auto.byFlags", descriptionKey: "auto.byFlags.desc", icon: Flag },
  { value: "hltb", labelKey: "auto.byHltb", descriptionKey: "auto.byHltb.desc", icon: Timer },
  { value: "hours", labelKey: "auto.byPlaytime", descriptionKey: "auto.byPlaytime.desc", icon: Clock },
  { value: "platform", labelKey: "auto.byPlatform", descriptionKey: "auto.byPlatform.desc", icon: Desktop },
  { value: "devpub", labelKey: "auto.byDevPub", descriptionKey: "auto.byDevPub.desc", icon: Buildings },
  { value: "language", labelKey: "auto.byLanguage", descriptionKey: "auto.byLanguage.desc", icon: Globe },
];

export function categorizerLabel(type: CategorizerType, t: ReturnType<typeof useT>): string {
  const option = CATEGORIZERS.find((item) => item.value === type);
  if (!option) return type;
  return t(option.labelKey);
}

export function ChooseStep({
  presets,
  onChoose,
  onRunPresets,
  onRunPresetsCachedOnly,
  onLoadPreset,
  onDeletePreset,
  onMovePreset,
  error,
}: {
  presets: AutoCategorizePreset[];
  onChoose: (t: CategorizerType) => void;
  onRunPresets: () => void;
  onRunPresetsCachedOnly: () => void;
  onLoadPreset: (preset: AutoCategorizePreset) => void;
  onDeletePreset: (id: string) => void;
  onMovePreset: (id: string, direction: -1 | 1) => void;
  error: string;
}) {
  const t = useT();
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const detailsCacheMaxAgeDays = useSettingsStore((s) => s.detailsCacheMaxAgeDays);
  const ratings = useSteamRatingsStore((s) => s.ratings);
  const ratingsHydrated = useSteamRatingsStore((s) => s.hydrated);
  const ratingsHydrating = useSteamRatingsStore((s) => s.hydrating);
  const hydrateRatingsCache = useSteamRatingsStore((s) => s.hydrateCache);
  const hltbData = useHltbStore((s) => s.data);
  const ignoredDetailFails = useFailedGamesStore((s) => s.fails);
  const ignoredHltbFails = useHltbIgnoredStore((s) => s.fails);
  const currency = useSettingsStore((s) => s.currency);
  const [cacheNotice, setCacheNotice] = useState("");
  const gameIds = useMemo(() => Object.keys(games).map(Number), [games]);
  const ignoredDetailsSet = useMemo(
    () =>
      new Set(
        Object.entries(ignoredDetailFails)
          .filter(([, count]) => count >= MAX_FAIL_RUNS)
          .map(([id]) => Number(id))
      ),
    [ignoredDetailFails]
  );
  const ignoredHltbSet = useMemo(
    () =>
      new Set(
        Object.entries(ignoredHltbFails)
          .filter(([, count]) => count >= HLTB_MAX_FAILS)
          .map(([id]) => Number(id))
      ),
    [ignoredHltbFails]
  );
  const detailIdsNeedingRefresh = useMemo(
    () => gameIds.filter((id) => detailsCacheNeedsRefresh(details[id], detailsCacheMaxAgeDays) || detailsPriceNeedsCurrencyRefresh(details[id], currency)),
    [currency, details, detailsCacheMaxAgeDays, gameIds]
  );
  const fetchableDetailIds = useMemo(
    () => detailIdsNeedingRefresh.filter((id) => !ignoredDetailsSet.has(id)),
    [detailIdsNeedingRefresh, ignoredDetailsSet]
  );
  const staleDetailCount = gameIds.filter((id) => !!details[id] && detailsCacheNeedsRefresh(details[id], detailsCacheMaxAgeDays)).length;
  const wrongCurrencyDetailCount = gameIds.filter((id) => detailsPriceNeedsCurrencyRefresh(details[id], currency)).length;
  const ignoredDetailCount = detailIdsNeedingRefresh.length - fetchableDetailIds.length;
  const cachedCount = gameCount - detailIdsNeedingRefresh.length;
  const missingHltbIds = useMemo(
    () => gameIds.filter((id) => !hltbData[id]),
    [gameIds, hltbData]
  );
  const fetchableHltbIds = useMemo(
    () => missingHltbIds.filter((id) => !ignoredHltbSet.has(id)),
    [ignoredHltbSet, missingHltbIds]
  );
  const hltbIgnoredCount = missingHltbIds.length - fetchableHltbIds.length;
  const hltbCount = gameCount - missingHltbIds.length;
  const storeReleaseDateIdsNeedingRefresh = useMemo(
    () => gameIds.filter((id) => isDetailsCacheCurrent(details[id]) && storeReleaseDateNeedsRefresh(details[id])),
    [details, gameIds]
  );
  const storeReleaseDateCount = gameIds.filter((id) =>
    isDetailsCacheCurrent(details[id]) && !storeReleaseDateNeedsRefresh(details[id])
  ).length;
  const storeReleaseDatesBlockedByDetails =
    gameCount - storeReleaseDateCount - storeReleaseDateIdsNeedingRefresh.length;
  const missingRatings = ratingsHydrated ? steamRatingIdsNeedingFetch(games, ratings) : [];
  const ratingCount = ratingsHydrated ? gameCount - missingRatings.length : 0;
  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const startDetailsFetch = useBackgroundFetchStore((s) => s.startDetailsFetch);
  const hltbRunning = useBackgroundFetchStore((s) => s.hltbRunning);
  const hltbFetched = useBackgroundFetchStore((s) => s.hltbFetched);
  const hltbTotal = useBackgroundFetchStore((s) => s.hltbTotal);
  const ratingsRunning = useBackgroundFetchStore((s) => s.ratingsRunning);
  const ratingsFetched = useBackgroundFetchStore((s) => s.ratingsFetched);
  const ratingsTotal = useBackgroundFetchStore((s) => s.ratingsTotal);
  const startRatingsFetch = useBackgroundFetchStore((s) => s.startRatingsFetch);
  const releaseDatesRunning = useBackgroundFetchStore((s) => s.releaseDatesRunning);
  const releaseDatesFetched = useBackgroundFetchStore((s) => s.releaseDatesFetched);
  const releaseDatesTotal = useBackgroundFetchStore((s) => s.releaseDatesTotal);
  const startStoreReleaseDateFetch = useBackgroundFetchStore((s) => s.startStoreReleaseDateFetch);
  const startHltbFetch = useBackgroundFetchStore((s) => s.startHltbFetch);

  const fetchItemsForIds = useCallback((ids: number[]) => (
    ids.map((id) => ({ appId: id, name: games[id]?.name ?? `#${id}` }))
  ), [games]);

  const handleFetchDetails = () => {
    setCacheNotice("");
    if (fetchableDetailIds.length > 0) {
      startDetailsFetch(fetchableDetailIds);
      return;
    }
    if (detailIdsNeedingRefresh.length > 0) {
      setCacheNotice(t("auto.cache.onlyIgnored"));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  const handleFetchRatings = async (): Promise<boolean> => {
    if (!ratingsHydrated) await hydrateRatingsCache();
    const currentRatings = useSteamRatingsStore.getState().ratings;
    const missing = steamRatingIdsNeedingFetch(games, currentRatings);
    if (missing.length > 0) {
      startRatingsFetch(fetchItemsForIds(missing));
      return true;
    }
    return false;
  };

  const handleFetchHltb = () => {
    setCacheNotice("");
    if (fetchableHltbIds.length > 0) {
      startHltbFetch(fetchItemsForIds(fetchableHltbIds));
      return;
    }
    if (missingHltbIds.length > 0) {
      setCacheNotice(t("auto.cache.hltbOnlyIgnored"));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  const handleFetchStoreReleaseDates = () => {
    setCacheNotice("");
    if (storeReleaseDateIdsNeedingRefresh.length > 0) {
      startStoreReleaseDateFetch(fetchItemsForIds(storeReleaseDateIdsNeedingRefresh));
      return;
    }
    setCacheNotice(t("auto.cache.ready"));
  };

  return (
    <div className="space-y-2">
      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CacheStatusCard
          label={t("auto.cache.details")}
          cached={cachedCount}
          total={gameCount}
          running={detailsRunning}
          progress={detailsFetched}
          progressTotal={detailsTotal}
          missing={detailIdsNeedingRefresh.length}
          fetchable={fetchableDetailIds.length}
          notes={[
            staleDetailCount > 0 ? t("auto.cache.detailsStale", { count: staleDetailCount }) : "",
            wrongCurrencyDetailCount > 0 ? t("auto.cache.wrongCurrency", { count: wrongCurrencyDetailCount }) : "",
            ignoredDetailCount > 0 ? t("auto.cache.ignored", { count: ignoredDetailCount }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchDetails}
        />
        <CacheStatusCard
          label={t("auto.cache.releaseDates")}
          cached={storeReleaseDateCount}
          total={gameCount}
          running={releaseDatesRunning}
          progress={releaseDatesFetched}
          progressTotal={releaseDatesTotal}
          missing={gameCount - storeReleaseDateCount}
          fetchable={storeReleaseDateIdsNeedingRefresh.length}
          notes={[
            storeReleaseDateIdsNeedingRefresh.length > 0 ? t("auto.cache.releaseDatesMissing", { count: storeReleaseDateIdsNeedingRefresh.length }) : "",
            storeReleaseDatesBlockedByDetails > 0 ? t("auto.cache.releaseDatesNeedDetails", { count: storeReleaseDatesBlockedByDetails }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchStoreReleaseDates}
        />
        <CacheStatusCard
          label={t("auto.cache.ratings")}
          cached={ratingCount}
          total={gameCount}
          running={ratingsRunning}
          progress={ratingsFetched}
          progressTotal={ratingsTotal}
          missing={ratingsHydrated ? missingRatings.length : gameCount}
          fetchable={ratingsHydrated ? missingRatings.length : gameCount}
          loading={ratingsHydrating || !ratingsHydrated}
          onFetch={handleFetchRatings}
        />
        <CacheStatusCard
          label={t("auto.cache.hltb")}
          cached={hltbCount}
          total={gameCount}
          running={hltbRunning}
          progress={hltbFetched}
          progressTotal={hltbTotal}
          missing={missingHltbIds.length}
          fetchable={fetchableHltbIds.length}
          notes={[
            hltbIgnoredCount > 0 ? t("auto.cache.hltbIgnored", { count: hltbIgnoredCount }) : "",
          ].filter(Boolean)}
          onFetch={handleFetchHltb}
        />
      </div>

      {cacheNotice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text-muted">
          <Warning size={14} weight="duotone" className="shrink-0 text-repressurizer-text-faint" />
          {cacheNotice}
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-repressurizer-danger/20 bg-repressurizer-danger/8 p-3 text-sm text-repressurizer-danger">
          <Warning size={16} weight="fill" />
          {error}
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-4 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              {t("auto.presets.saved")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onRunPresetsCachedOnly}
                className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
              >
                <CopySimple size={12} weight="duotone" />
                {t("auto.presets.runCached")}
              </button>
              <button
                type="button"
                onClick={onRunPresets}
                className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-2.5 py-1 text-[11px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
              >
                <Playlist size={12} weight="duotone" />
                {t("auto.presets.runAll")}
                <span className="font-mono text-[10px] tabular-nums text-repressurizer-accent/70">
                  {presets.length}
                </span>
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {presets.map((preset, index) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-2"
              >
                <button
                  type="button"
                  onClick={() => onLoadPreset(preset)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-repressurizer-text">
                    {preset.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-repressurizer-text-faint">
                    {categorizerLabel(preset.type, t)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onMovePreset(preset.id, -1)}
                  disabled={index === 0}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text disabled:opacity-30"
                  title={t("auto.moveUp")}
                  aria-label={t("auto.moveUp")}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onMovePreset(preset.id, 1)}
                  disabled={index === presets.length - 1}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text disabled:opacity-30"
                  title={t("auto.moveDown")}
                  aria-label={t("auto.moveDown")}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(preset.id)}
                  className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-danger/70 hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"
                  title={t("auto.delete")}
                  aria-label={t("auto.delete")}
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-sm text-repressurizer-text-muted">{t("auto.choose.desc")}</p>
      {CATEGORIZERS.map((c) => {
        const Icon = c.icon;
        const label = t(c.labelKey);
        const description = t(c.descriptionKey);
        return (
          <button
            key={c.value}
            onClick={() => onChoose(c.value)}
            className="btn-press flex w-full items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3.5 py-2.5 text-left transition-colors hover:border-repressurizer-accent hover:bg-repressurizer-accent/5"
          >
            <Icon size={18} weight="duotone" className="shrink-0 text-repressurizer-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="mt-0.5 truncate text-xs text-repressurizer-text-faint">{description}</p>
            </div>
            {categorizerNeedsDetails(c.value) && (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                {t("auto.needsDetails")}
              </span>
            )}
            {c.value === "hltb" && (
              <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                {t("auto.needsHltb")}
              </span>
            )}
            {categorizerNeedsRatings(c.value) && (
              <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                {t("auto.needsRatings")}
              </span>
            )}
            <ArrowRight size={16} className="shrink-0 text-repressurizer-text-faint" />
          </button>
        );
      })}
    </div>
  );
}

function CacheStatusCard({
  label,
  cached,
  total,
  running,
  progress,
  progressTotal,
  missing,
  fetchable,
  notes,
  loading,
  onFetch,
}: {
  label: string;
  cached: number;
  total: number;
  running: boolean;
  progress: number;
  progressTotal: number;
  missing: number;
  fetchable?: number;
  notes?: string[];
  loading?: boolean;
  onFetch?: () => void;
}) {
  const t = useT();
  const isComplete = total > 0 && missing === 0;
  const fetchableCount = fetchable ?? missing;
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-repressurizer-text-faint">
          {label}
        </p>
        {loading ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
            <Spinner size={9} className="animate-spin" />
            {t("auto.loadingCache")}
          </span>
        ) : running ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
            <Spinner size={9} className="animate-spin" />
            {progress}/{progressTotal}
          </span>
        ) : isComplete ? (
          <span className="shrink-0 rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent">
            {t("auto.allCached")}
          </span>
        ) : onFetch && fetchableCount > 0 ? (
          <button
            type="button"
            onClick={onFetch}
            className="btn-press shrink-0 rounded-md bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            {t("auto.fetchNow")}
          </button>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-sm font-medium tabular-nums text-repressurizer-text">
        {cached} / {total}
      </p>
      {notes && notes.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {notes.map((note) => (
            <p key={note} className="truncate text-[10px] text-repressurizer-text-faint">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
