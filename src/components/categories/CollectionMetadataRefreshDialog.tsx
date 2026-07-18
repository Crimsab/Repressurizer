import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowClockwise, X } from "@phosphor-icons/react";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { useFailedGamesStore } from "../../stores/failedGamesStore";
import { useGameStore } from "../../stores/gameStore";
import { useHltbIgnoredStore } from "../../stores/hltbIgnoredStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSteamRatingsStore } from "../../stores/steamRatingsStore";
import { useToastStore } from "../../stores/toastStore";
import { useT } from "../../lib/i18n";
import {
  appIdsForCollections,
  buildMetadataRefreshPlan,
  DEFAULT_METADATA_REFRESH_OPTIONS,
  metadataRefreshPlanTotal,
  type MetadataRefreshOptions,
} from "../../lib/metadataRefresh";
import type { SteamCollection } from "../../lib/types";
import { DialogOverlay } from "../ui/DialogOverlay";

interface CollectionMetadataRefreshDialogProps {
  collections: SteamCollection[];
  onClose: () => void;
}

export function CollectionMetadataRefreshDialog({
  collections,
  onClose,
}: CollectionMetadataRefreshDialogProps) {
  const t = useT();
  const toastInfo = useToastStore((s) => s.info);
  const [options, setOptions] = useState<MetadataRefreshOptions>(DEFAULT_METADATA_REFRESH_OPTIONS);

  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const ratings = useSteamRatingsStore((s) => s.ratings);
  const ratingsHydrated = useSteamRatingsStore((s) => s.hydrated);
  const hydrateRatingsCache = useSteamRatingsStore((s) => s.hydrateCache);
  const hltbData = useHltbStore((s) => s.data);
  const achievements = useAchievementsStore((s) => s.summaries);
  const achievementsHydrated = useAchievementsStore((s) => s.hydrated);
  const hydrateAchievements = useAchievementsStore((s) => s.hydrate);
  const ignoredDetailFails = useFailedGamesStore((s) => s.fails);
  const ignoredHltbFails = useHltbIgnoredStore((s) => s.fails);
  const currency = useSettingsStore((s) => s.currency);
  const detailsMaxAgeDays = useSettingsStore((s) => s.detailsCacheMaxAgeDays);

  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const ratingsRunning = useBackgroundFetchStore((s) => s.ratingsRunning);
  const hltbRunning = useBackgroundFetchStore((s) => s.hltbRunning);
  const releaseDatesRunning = useBackgroundFetchStore((s) => s.releaseDatesRunning);
  const achievementsRunning = useBackgroundFetchStore((s) => s.achievementsRunning);

  useEffect(() => {
    if (!ratingsHydrated) void hydrateRatingsCache();
    if (!achievementsHydrated) void hydrateAchievements();
  }, [achievementsHydrated, hydrateAchievements, hydrateRatingsCache, ratingsHydrated]);

  const appIds = useMemo(() => appIdsForCollections(collections), [collections]);
  const plan = useMemo(
    () =>
      buildMetadataRefreshPlan({
        appIds,
        games,
        details,
        ratings,
        hltbData,
        achievements,
        ignoredDetailFails,
        ignoredHltbFails,
        currency: currency ?? "EUR",
        detailsMaxAgeDays: detailsMaxAgeDays ?? 30,
        options,
      }),
    [
      achievements,
      appIds,
      currency,
      details,
      detailsMaxAgeDays,
      games,
      hltbData,
      ignoredDetailFails,
      ignoredHltbFails,
      options,
      ratings,
    ]
  );
  const runnableTotal = metadataRefreshPlanTotal(plan);
  const canStart =
    runnableTotal > 0 &&
    (options.includeDetails ||
      options.includeRatings ||
      options.includeHltb ||
      options.includeReleaseDates ||
      options.includeAchievements);

  const updateOptions = (patch: Partial<MetadataRefreshOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
  };

  const startRefresh = async () => {
    if (!useSteamRatingsStore.getState().hydrated) {
      await useSteamRatingsStore.getState().hydrateCache();
    }
    if (!useAchievementsStore.getState().hydrated) {
      await useAchievementsStore.getState().hydrate();
    }

    const currentOptions = options;
    const currentPlan = buildMetadataRefreshPlan({
      appIds,
      games: useGameStore.getState().games,
      details: useGameStore.getState().details,
      ratings: useSteamRatingsStore.getState().ratings,
      hltbData: useHltbStore.getState().data,
      achievements: useAchievementsStore.getState().summaries,
      ignoredDetailFails: useFailedGamesStore.getState().fails,
      ignoredHltbFails: useHltbIgnoredStore.getState().fails,
      currency: useSettingsStore.getState().currency ?? "EUR",
      detailsMaxAgeDays: useSettingsStore.getState().detailsCacheMaxAgeDays ?? 30,
      options: currentOptions,
    });
    const currentTotal = metadataRefreshPlanTotal(currentPlan);
    if (currentTotal === 0) {
      toastInfo(t("metadataRefresh.toast.none"));
      onClose();
      return;
    }

    const background = useBackgroundFetchStore.getState();
    let startedTotal = 0;
    if (currentPlan.detailIds.length > 0) {
      background.startDetailsFetch(currentPlan.detailIds, { force: currentOptions.forceDetails });
      startedTotal += currentPlan.detailIds.length;
    }
    if (currentPlan.ratingItems.length > 0) {
      background.startRatingsFetch(currentPlan.ratingItems, { force: currentOptions.forceRatings });
      startedTotal += currentPlan.ratingItems.length;
    }
    if (currentPlan.hltbItems.length > 0) {
      background.startHltbFetch(currentPlan.hltbItems);
      startedTotal += currentPlan.hltbItems.length;
    }
    if (currentPlan.releaseDateItems.length > 0) {
      background.startStoreReleaseDateFetch(currentPlan.releaseDateItems, { force: currentOptions.forceReleaseDates });
      startedTotal += currentPlan.releaseDateItems.length;
    }
    if (currentPlan.achievementItems.length > 0) {
      background.startAchievementsFetch(currentPlan.achievementItems);
      startedTotal += currentPlan.achievementItems.length;
    }

    toastInfo(
      startedTotal > 0
        ? t("metadataRefresh.toast.started", { count: startedTotal })
        : t("metadataRefresh.toast.none")
    );
    onClose();
  };

  const scopeLabel =
    collections.length === 1
      ? collections[0]?.name ?? t("metadataRefresh.scope.one")
      : t("metadataRefresh.scope.many", { count: collections.length });

  return (
    <DialogOverlay
      label={t("metadataRefresh.title")}
      onClose={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-repressurizer-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{t("metadataRefresh.title")}</h2>
            <p className="mt-1 truncate text-sm text-repressurizer-text-muted">
              {t("metadataRefresh.scope", { scope: scopeLabel, count: appIds.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press rounded-lg p-2 text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
            aria-label={t("common.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <RefreshOptionRow
            checked={options.includeDetails}
            onCheckedChange={(includeDetails) => updateOptions({ includeDetails })}
            title={t("metadataRefresh.details")}
            description={t("metadataRefresh.details.desc", { days: detailsMaxAgeDays ?? 30 })}
            count={plan.detailIds.length}
            disabled={detailsRunning}
            busy={detailsRunning}
          >
            <SubOption
              checked={options.forceDetails}
              onChange={(forceDetails) => updateOptions({ forceDetails })}
              label={t("metadataRefresh.details.force")}
              disabled={!options.includeDetails || detailsRunning}
            />
          </RefreshOptionRow>

          <RefreshOptionRow
            checked={options.includeRatings}
            onCheckedChange={(includeRatings) => updateOptions({ includeRatings })}
            title={t("metadataRefresh.ratings")}
            description={t("metadataRefresh.ratings.desc")}
            count={plan.ratingItems.length}
            disabled={ratingsRunning}
            busy={ratingsRunning}
          >
            <SubOption
              checked={options.forceRatings}
              onChange={(forceRatings) => updateOptions({ forceRatings })}
              label={t("metadataRefresh.ratings.force")}
              disabled={!options.includeRatings || ratingsRunning}
            />
          </RefreshOptionRow>

          <RefreshOptionRow
            checked={options.includeHltb}
            onCheckedChange={(includeHltb) => updateOptions({ includeHltb })}
            title={t("metadataRefresh.hltb")}
            description={t("metadataRefresh.hltb.desc")}
            count={plan.hltbItems.length}
            disabled={hltbRunning}
            busy={hltbRunning}
          >
            <SubOption
              checked={options.forceHltb}
              onChange={(forceHltb) => updateOptions({ forceHltb })}
              label={t("metadataRefresh.hltb.force")}
              disabled={!options.includeHltb || hltbRunning}
            />
          </RefreshOptionRow>

          <RefreshOptionRow
            checked={options.includeReleaseDates}
            onCheckedChange={(includeReleaseDates) => updateOptions({ includeReleaseDates })}
            title={t("metadataRefresh.releaseDates")}
            description={t("metadataRefresh.releaseDates.desc")}
            count={plan.releaseDateItems.length}
            disabled={releaseDatesRunning}
            busy={releaseDatesRunning}
          >
            <SubOption
              checked={options.forceReleaseDates}
              onChange={(forceReleaseDates) => updateOptions({ forceReleaseDates })}
              label={t("metadataRefresh.releaseDates.force")}
              disabled={!options.includeReleaseDates || releaseDatesRunning}
            />
          </RefreshOptionRow>

          <RefreshOptionRow
            checked={options.includeAchievements}
            onCheckedChange={(includeAchievements) => updateOptions({ includeAchievements })}
            title={t("metadataRefresh.achievements")}
            description={t("metadataRefresh.achievements.desc")}
            count={plan.achievementItems.length}
            disabled={achievementsRunning}
            busy={achievementsRunning}
          >
            <SubOption
              checked={options.forceAchievements}
              onChange={(forceAchievements) => updateOptions({ forceAchievements })}
              label={t("metadataRefresh.achievements.force")}
              disabled={!options.includeAchievements || achievementsRunning}
            />
          </RefreshOptionRow>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle px-5 py-4">
          <p className="text-sm text-repressurizer-text-muted">
            {runnableTotal > 0
              ? t("metadataRefresh.total", { count: runnableTotal })
              : t("metadataRefresh.none")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-press rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={startRefresh}
              disabled={!canStart}
              className="btn-press inline-flex items-center gap-2 rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowClockwise size={16} weight="bold" />
              {t("metadataRefresh.start")}
            </button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

function RefreshOptionRow({
  checked,
  onCheckedChange,
  title,
  description,
  count,
  disabled,
  busy,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description: string;
  count: number;
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-repressurizer-accent disabled:opacity-40"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-repressurizer-text">{title}</span>
            <span className="font-mono text-xs text-repressurizer-accent tabular-nums">
              {busy ? t("metadataRefresh.busy") : count}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-repressurizer-text-faint">{description}</span>
        </span>
      </label>
      <div className="mt-2 pl-7">{children}</div>
    </div>
  );
}

function SubOption({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-repressurizer-text-muted">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-repressurizer-accent disabled:opacity-40"
      />
      {label}
    </label>
  );
}
