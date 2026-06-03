import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useStatusStore, STATUS_META, type GameStatus } from "../../stores/statusStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { useT } from "../../lib/i18n";
import { Circle, X, FolderSimplePlus, Spinner, FolderMinus } from "@phosphor-icons/react";

// ---- Fetch detail popover ----
function FetchPopover({
  title, color, fetched, total, succeeded, failed,
  currentName, recentNames, coolingDown, cooldownSecs,
  onStop, onClose,
}: {
  title: string; color: "amber" | "sky" | "violet";
  fetched: number; total: number;
  succeeded?: number; failed?: number;
  currentName: string; recentNames: string[];
  coolingDown?: boolean; cooldownSecs?: number;
  onStop: () => void; onClose: () => void;
}) {
  const t = useT();
  const remaining = total - fetched;
  const percent = total > 0 ? Math.round((fetched / total) * 100) : 0;
  const barColor = color === "amber" ? "bg-amber-500" : color === "violet" ? "bg-violet-500" : "bg-sky-500";
  const textColor = color === "amber" ? "text-amber-400" : color === "violet" ? "text-violet-400" : "text-sky-400";
  const borderColor = color === "amber" ? "border-amber-500/20" : color === "violet" ? "border-violet-500/20" : "border-sky-500/20";

  return (
    <div
      className={`absolute bottom-8 right-0 z-50 w-72 animate-fade-in rounded-xl border ${borderColor} bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.6)]`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-repressurizer-border px-3 py-2">
        <span className={`text-xs font-semibold ${textColor}`}>{title}</span>
        <button onClick={onClose} className="text-repressurizer-text-faint hover:text-white transition-colors">
          <X size={12} weight="bold" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Cooldown banner */}
        {coolingDown && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[10px] text-amber-400">
            <Spinner size={10} className="animate-spin shrink-0" />
            <span>{t("statusbar.fetch.slowingDelay", { secs: cooldownSecs ?? 0 })}</span>
          </div>
        )}

        {/* Progress bar */}
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-repressurizer-bg">
            <div className={`h-full rounded-full ${barColor} transition-all duration-300`} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 grid grid-cols-3 text-[10px] text-repressurizer-text-faint font-mono tabular-nums">
            <span>{t("statusbar.fetch.done", { count: fetched })}</span>
            <span className="text-center">{percent}%</span>
            <span className="text-right">{t("statusbar.fetch.left", { count: remaining })}</span>
          </div>
          {(succeeded != null || (failed != null && failed > 0)) && (
            <div className="mt-1 flex gap-3 text-[10px] font-mono tabular-nums">
              {succeeded != null && <span className="text-repressurizer-accent">✓ {t("statusbar.fetch.ok", { count: succeeded })}</span>}
              {failed != null && failed > 0 && <span className="text-repressurizer-danger">✗ {t("statusbar.fetch.failed", { count: failed })}</span>}
            </div>
          )}
        </div>

        {/* Current game */}
        {currentName && !coolingDown && (
          <div className="text-[10px] text-repressurizer-text-faint">
            <span className="text-repressurizer-text-muted">{t("statusbar.fetch.now")} </span>
            <span className="text-repressurizer-text truncate block">{currentName}</span>
          </div>
        )}

        {/* Recent */}
        {recentNames.length > 0 && (
          <div>
            <p className="text-[10px] text-repressurizer-text-faint mb-1 uppercase tracking-wider font-medium">{t("statusbar.fetch.recent")}</p>
            <div className="space-y-0.5 max-h-36 overflow-auto">
              {recentNames.map((name, i) => (
                <p key={i} className={`text-[10px] truncate leading-relaxed ${
                  name.startsWith("⚠") ? "text-amber-400" :
                  name.startsWith("↻") ? "text-sky-400" :
                  "text-repressurizer-text-muted"
                }`}>
                  {name}
                </p>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { onStop(); onClose(); }}
          className="w-full rounded-lg border border-repressurizer-danger/30 py-1.5 text-[10px] text-repressurizer-danger/70 transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger"
        >
          {t("statusbar.fetch.stop")}
        </button>
      </div>
    </div>
  );
}

export function StatusBar() {
  const t = useT();
  const STATUS_OPTIONS: { value: GameStatus; label: string }[] = [
    { value: "playing", label: t("status.playing") },
    { value: "beaten", label: t("status.beaten") },
    { value: "completed", label: t("status.completed") },
    { value: "abandoned", label: t("status.abandoned") },
    { value: "none", label: t("status.clear") },
  ];
  const gameCount = useGameStore((s) => Object.keys(s.games).length);
  const selectedGameIds = useGameStore((s) => s.selectedGameIds);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const categoryCount = useCategoryStore((s) => s.collections.length);
  const dirty = useCategoryStore((s) => s.dirty);

  const detailsRunning = useBackgroundFetchStore((s) => s.detailsRunning);
  const detailsFetched = useBackgroundFetchStore((s) => s.detailsFetched);
  const detailsTotal = useBackgroundFetchStore((s) => s.detailsTotal);
  const detailsSucceeded = useBackgroundFetchStore((s) => s.detailsSucceeded);
  const detailsFailed = useBackgroundFetchStore((s) => s.detailsFailed);
  const detailsCurrentName = useBackgroundFetchStore((s) => s.detailsCurrentName);
  const detailsRecentNames = useBackgroundFetchStore((s) => s.detailsRecentNames);
  const detailsCoolingDown = useBackgroundFetchStore((s) => s.detailsCoolingDown);
  const detailsCooldownSecs = useBackgroundFetchStore((s) => s.detailsCooldownSecs);
  const stopDetailsFetch = useBackgroundFetchStore((s) => s.stopDetailsFetch);

  const hltbRunning = useBackgroundFetchStore((s) => s.hltbRunning);
  const hltbFetched = useBackgroundFetchStore((s) => s.hltbFetched);
  const hltbTotal = useBackgroundFetchStore((s) => s.hltbTotal);
  const hltbCurrentName = useBackgroundFetchStore((s) => s.hltbCurrentName);
  const hltbRecentNames = useBackgroundFetchStore((s) => s.hltbRecentNames);
  const stopHltbFetch = useBackgroundFetchStore((s) => s.stopHltbFetch);

  const achievementsRunning = useBackgroundFetchStore((s) => s.achievementsRunning);
  const achievementsFetched = useBackgroundFetchStore((s) => s.achievementsFetched);
  const achievementsTotal = useBackgroundFetchStore((s) => s.achievementsTotal);
  const achievementsCurrentName = useBackgroundFetchStore((s) => s.achievementsCurrentName);
  const achievementsRecentNames = useBackgroundFetchStore((s) => s.achievementsRecentNames);
  const stopAchievementsFetch = useBackgroundFetchStore((s) => s.stopAchievementsFetch);

  const collections = useCategoryStore((s) => s.collections);
  const activeCategory = useCategoryStore((s) => s.activeCategory);
  const addGamesToCategory = useCategoryStore((s) => s.addGamesToCategory);
  const removeGamesFromCategory = useCategoryStore((s) => s.removeGamesFromCategory);
  const setStatus = useStatusStore((s) => s.setStatus);

  // The active category, if it's a removable user collection
  const activeColl = collections.find(
    (c) => c.key === activeCategory && !c.is_dynamic && c.id !== "hidden"
  ) ?? null;

  const [showCatMenu, setShowCatMenu] = useState(false);
  const [showDetailsPopover, setShowDetailsPopover] = useState(false);
  const [showHltbPopover, setShowHltbPopover] = useState(false);
  const [showAchievementsPopover, setShowAchievementsPopover] = useState(false);

  const selectedCount = Object.keys(selectedGameIds).length;
  const selectedIds = Object.keys(selectedGameIds).map(Number);

  const editableCollections = [...collections]
    .filter((c) => !c.is_dynamic && c.id !== "hidden")
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleBulkCategory = (key: string) => {
    addGamesToCategory(key, selectedIds);
    setShowCatMenu(false);
  };

  const handleBulkStatus = (status: GameStatus) => {
    for (const id of selectedIds) setStatus(id, status);
  };

  return (
    <footer
      className="flex items-center gap-4 border-t border-repressurizer-border-subtle bg-repressurizer-surface/50 px-4 py-1 text-[11px] text-repressurizer-text-faint font-mono tabular-nums"
      onMouseDown={() => { setShowDetailsPopover(false); setShowHltbPopover(false); setShowAchievementsPopover(false); }}
    >
      <span>{t("statusbar.games", { count: gameCount })}</span>
      <span>{t("statusbar.categories", { count: categoryCount })}</span>

      {selectedCount > 1 && (
        <span className="inline-flex items-center gap-2 text-repressurizer-accent font-sans text-[11px]">
          {t("statusbar.selected", { count: selectedCount })}

          {/* Bulk assign category */}
          <div className="relative">
            <button
              onClick={() => setShowCatMenu(!showCatMenu)}
              className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border bg-repressurizer-surface px-2 py-0.5 text-[10px] text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
            >
              <FolderSimplePlus size={11} />
              {t("statusbar.addTo")}
            </button>
            {showCatMenu && (
              <div className="absolute bottom-7 left-0 z-50 min-w-[160px] animate-fade-in rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <div className="max-h-48 overflow-auto py-1">
                  {editableCollections.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => handleBulkCategory(col.key)}
                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover"
                    >
                      {String(col.name ?? "")}
                    </button>
                  ))}
                  {editableCollections.length === 0 && (
                    <p className="px-3 py-2 text-xs text-repressurizer-text-faint">{t("statusbar.noCategories")}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Remove from current category */}
          {activeColl && (
            <button
              onClick={() => { removeGamesFromCategory(activeColl.key, selectedIds); clearSelection(); }}
              className="inline-flex items-center gap-1 rounded-md border border-repressurizer-danger/30 bg-repressurizer-surface px-2 py-0.5 text-[10px] text-repressurizer-danger/70 transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger"
              title={`Remove from "${activeColl.name}"`}
            >
              <FolderMinus size={11} />
              {t("statusbar.remove")}
            </button>
          )}

          {/* Bulk set status */}
          {STATUS_OPTIONS.map((s) => {
            const meta = STATUS_META[s.value];
            return (
              <button
                key={s.value}
                onClick={() => handleBulkStatus(s.value)}
                className={`rounded-md border border-repressurizer-border px-2 py-0.5 text-[10px] transition-colors hover:border-current ${
                  s.value === "none"
                    ? "text-repressurizer-text-faint hover:text-repressurizer-danger"
                    : `${meta.color} ${meta.bg}`
                }`}
              >
                {s.label}
              </button>
            );
          })}

          <button
            onClick={clearSelection}
            className="ml-1 rounded p-0.5 hover:bg-repressurizer-surface-hover transition-colors text-repressurizer-text-faint hover:text-white"
            title={t("statusbar.clearSelection")}
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      )}

      {selectedCount === 1 && (
        <span className="inline-flex items-center gap-1 text-repressurizer-accent">
          {t("statusbar.selected", { count: 1 })}
          <button
            onClick={clearSelection}
            className="rounded p-0.5 hover:bg-repressurizer-surface-hover transition-colors"
            title={t("statusbar.clearSelection")}
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      )}

      <span className="flex-1" />

      {/* Background fetch progress — right side, clickable */}
      {detailsRunning && (
        <div className="relative">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowHltbPopover(false); setShowDetailsPopover((v) => !v); }}
            className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Spinner size={9} className={detailsCoolingDown ? "shrink-0" : "animate-spin shrink-0"} />
            <span>
              {detailsCoolingDown
                ? t("statusbar.fetch.slowingDelay", { secs: detailsCooldownSecs ?? 0 })
                : t("statusbar.fetch.detailsShort", { fetched: detailsFetched, total: detailsTotal })}
            </span>
          </button>
          {showDetailsPopover && (
            <FetchPopover
              title={t("statusbar.fetch.details")}
              color="amber"
              fetched={detailsFetched}
              total={detailsTotal}
              succeeded={detailsSucceeded}
              failed={detailsFailed}
              currentName={detailsCurrentName}
              recentNames={detailsRecentNames}
              coolingDown={detailsCoolingDown}
              cooldownSecs={detailsCooldownSecs}
              onStop={stopDetailsFetch}
              onClose={() => setShowDetailsPopover(false)}
            />
          )}
        </div>
      )}

      {hltbRunning && (
        <div className="relative">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowDetailsPopover(false); setShowAchievementsPopover(false); setShowHltbPopover((v) => !v); }}
            className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 transition-colors"
          >
            <Spinner size={9} className="animate-spin shrink-0" />
            <span>HLTB {hltbFetched}/{hltbTotal}</span>
          </button>
          {showHltbPopover && (
            <FetchPopover
              title={t("statusbar.fetch.hltb")}
              color="sky"
              fetched={hltbFetched}
              total={hltbTotal}
              currentName={hltbCurrentName}
              recentNames={hltbRecentNames}
              onStop={stopHltbFetch}
              onClose={() => setShowHltbPopover(false)}
            />
          )}
        </div>
      )}

      {achievementsRunning && (
        <div className="relative">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowDetailsPopover(false); setShowHltbPopover(false); setShowAchievementsPopover((v) => !v); }}
            className="inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Spinner size={9} className="animate-spin shrink-0" />
            <span>{t("statusbar.fetch.achievementsShort", { fetched: achievementsFetched, total: achievementsTotal })}</span>
          </button>
          {showAchievementsPopover && (
            <FetchPopover
              title={t("statusbar.fetch.achievements")}
              color="violet"
              fetched={achievementsFetched}
              total={achievementsTotal}
              currentName={achievementsCurrentName}
              recentNames={achievementsRecentNames}
              onStop={stopAchievementsFetch}
              onClose={() => setShowAchievementsPopover(false)}
            />
          )}
        </div>
      )}

      {dirty && (
        <span className="inline-flex items-center gap-1.5 text-repressurizer-warning">
          <Circle size={6} weight="fill" className="animate-breathe" />
          {t("statusbar.unsaved")}
        </span>
      )}
    </footer>
  );
}
