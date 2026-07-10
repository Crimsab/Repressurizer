import { useCallback, useEffect, useState } from "react";
import {
  MagnifyingGlass,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import type {
  AchievementSummary,
  SamAchievementAction,
  SamBridgeProbe,
} from "../../../lib/types";
import { useT } from "../../../lib/i18n";
import {
  AchievementRow,
  isProtectedAchievement,
} from "./AchievementRow";
import { SamBridgePanel } from "./SamAchievementPanels";

export function GameAchievementsTab({
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
  onOpenSamBackups,
  onRestoreSamBackup,
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
  onSamAction: (
    action: SamAchievementAction,
    achievementIds: string[],
    backupPath?: string | null
  ) => Promise<boolean>;
  onOpenSamBackups: () => void;
  onRestoreSamBackup: () => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [selectedAchievementIds, setSelectedAchievementIds] = useState<Set<string>>(
    () => new Set()
  );
  const toggleAchievementSelection = useCallback((id: string) => {
    setSelectedAchievementIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const replaceSelection = useCallback((ids: string[]) => {
    setSelectedAchievementIds(new Set(ids));
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedAchievementIds(new Set());
  }, []);
  const runSelectedAction = useCallback(
    async (action: SamAchievementAction, ids: string[]) => {
      if (ids.length === 0) return;
      const completed = await onSamAction(action, ids);
      if (completed) {
        clearSelection();
      }
    },
    [clearSelection, onSamAction]
  );

  useEffect(() => {
    if (!achievements) {
      setSelectedAchievementIds(new Set());
      return;
    }
    const availableIds = new Set(
      achievements.achievements
        .filter((achievement) => !isProtectedAchievement(achievement))
        .map((achievement) => achievement.api_name)
    );
    setSelectedAchievementIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [achievements]);

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
    .filter((achievement) => achievement.achieved && !isProtectedAchievement(achievement))
    .map((achievement) => achievement.api_name);
  const lockedIds = achievements.achievements
    .filter((achievement) => !achievement.achieved && !isProtectedAchievement(achievement))
    .map((achievement) => achievement.api_name);
  const manageableIds = achievements.achievements
    .filter((achievement) => !isProtectedAchievement(achievement))
    .map((achievement) => achievement.api_name);
  const samWritesAvailable =
    steamToolsEnabled &&
    steamToolsAchievementWritesEnabled &&
    !!samProbe?.available &&
    !!samProbe?.writesSteam;
  const samActionBusy = !!samActionRunning;
  const selectedIds = achievements.achievements
    .filter((achievement) => selectedAchievementIds.has(achievement.api_name))
    .map((achievement) => achievement.api_name);
  const selectedLockedIds = achievements.achievements
    .filter(
      (achievement) =>
        selectedAchievementIds.has(achievement.api_name) &&
        !achievement.achieved &&
        !isProtectedAchievement(achievement)
    )
    .map((achievement) => achievement.api_name);
  const selectedUnlockedIds = achievements.achievements
    .filter(
      (achievement) =>
        selectedAchievementIds.has(achievement.api_name) &&
        achievement.achieved &&
        !isProtectedAchievement(achievement)
    )
    .map((achievement) => achievement.api_name);

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
          onOpenBackups={onOpenSamBackups}
          onRestoreBackup={onRestoreSamBackup}
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

      {samWritesAvailable && (
        <AchievementSelectionStrip
          selectedCount={selectedIds.length}
          selectedLockedCount={selectedLockedIds.length}
          selectedUnlockedCount={selectedUnlockedIds.length}
          runningAction={samActionRunning}
          onSelectAll={() =>
            replaceSelection(manageableIds)
          }
          onSelectLocked={() => replaceSelection(lockedIds)}
          onSelectUnlocked={() => replaceSelection(unlockedIds)}
          onClear={clearSelection}
          onUnlockSelected={() => void runSelectedAction("unlock_selected", selectedLockedIds)}
          onLockSelected={() => void runSelectedAction("lock_selected", selectedUnlockedIds)}
        />
      )}

      {/* Achievement list */}
      <div className="space-y-1 pr-1" data-achievement-list>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-repressurizer-text-muted">
            {t("detail.noAchievementMatches", { query: search })}
          </p>
        ) : (
          filtered.map((ach) => (
            <AchievementRow
              key={ach.api_name}
              achievement={ach}
              canWrite={samWritesAvailable}
              busy={samActionBusy}
              selectable={samWritesAvailable && !isProtectedAchievement(ach)}
              selected={selectedAchievementIds.has(ach.api_name)}
              onSelectToggle={() => toggleAchievementSelection(ach.api_name)}
              onToggle={() =>
                void onSamAction(ach.achieved ? "lock" : "unlock", [ach.api_name])
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function AchievementSelectionStrip({
  selectedCount,
  selectedLockedCount,
  selectedUnlockedCount,
  runningAction,
  onSelectAll,
  onSelectLocked,
  onSelectUnlocked,
  onClear,
  onUnlockSelected,
  onLockSelected,
}: {
  selectedCount: number;
  selectedLockedCount: number;
  selectedUnlockedCount: number;
  runningAction: string;
  onSelectAll: () => void;
  onSelectLocked: () => void;
  onSelectUnlocked: () => void;
  onClear: () => void;
  onUnlockSelected: () => void;
  onLockSelected: () => void;
}) {
  const t = useT();
  const unlocking = runningAction === "unlock_selected";
  const locking = runningAction === "lock_selected";
  const busy = !!runningAction;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-repressurizer-border-subtle pb-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={busy}
          className="btn-press rounded-md px-2 py-1 text-[11px] text-repressurizer-text-faint transition-colors hover:bg-repressurizer-bg hover:text-repressurizer-text disabled:opacity-40"
        >
          {t("detail.sam.selectAll")}
        </button>
        <button
          type="button"
          onClick={onSelectLocked}
          disabled={busy}
          className="btn-press rounded-md px-2 py-1 text-[11px] text-repressurizer-text-faint transition-colors hover:bg-repressurizer-bg hover:text-repressurizer-text disabled:opacity-40"
        >
          {t("detail.sam.selectLocked")}
        </button>
        <button
          type="button"
          onClick={onSelectUnlocked}
          disabled={busy}
          className="btn-press rounded-md px-2 py-1 text-[11px] text-repressurizer-text-faint transition-colors hover:bg-repressurizer-bg hover:text-repressurizer-text disabled:opacity-40"
        >
          {t("detail.sam.selectUnlocked")}
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            aria-label={t("detail.sam.clearSelection")}
            title={t("detail.sam.clearSelection")}
            className="btn-press inline-flex h-7 w-7 items-center justify-center rounded-md text-repressurizer-text-faint transition-colors hover:bg-repressurizer-bg hover:text-repressurizer-text disabled:opacity-40"
          >
            <Trash size={14} weight="bold" />
          </button>
        )}
      </div>
      {selectedCount > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-repressurizer-text">
            {t("detail.sam.selected", { count: selectedCount })}
          </span>
          {selectedLockedCount > 0 && (
            <button
              type="button"
              onClick={onUnlockSelected}
              disabled={!!runningAction}
              className="btn-press rounded-lg border border-repressurizer-accent/40 bg-repressurizer-accent/10 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/15 disabled:opacity-40"
            >
              {unlocking
                ? t("detail.sam.working")
                : t("detail.sam.unlockSelected", { count: selectedLockedCount })}
            </button>
          )}
          {selectedUnlockedCount > 0 && (
            <button
              type="button"
              onClick={onLockSelected}
              disabled={!!runningAction}
              className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger disabled:opacity-40"
            >
              {locking
                ? t("detail.sam.working")
                : t("detail.sam.lockSelected", { count: selectedUnlockedCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
