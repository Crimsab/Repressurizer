import { Check, Lock } from "@phosphor-icons/react";
import type {
  AchievementInfo,
  AchievementSummary,
  SamAchievementSchemaItem,
} from "../../lib/types";
import { useT } from "../../lib/i18n";

export function AchievementRow({
  achievement,
  canWrite,
  busy,
  selectable,
  selected,
  onSelectToggle,
  onToggle,
}: {
  achievement: AchievementInfo;
  canWrite: boolean;
  busy: boolean;
  selectable: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const protectedAchievement = isProtectedAchievement(achievement);
  const unlockDate = achievement.unlock_time
    ? new Date(achievement.unlock_time * 1000).toLocaleDateString()
    : null;

  return (
    <div
      data-achievement-row
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? "border-repressurizer-accent/80 bg-repressurizer-bg"
          : achievement.achieved
            ? "border-transparent bg-repressurizer-bg"
            : "border-transparent bg-repressurizer-bg/30 opacity-50"
      }`}
    >
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          className={`btn-press flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-repressurizer-border bg-repressurizer-surface text-repressurizer-accent transition-colors hover:border-repressurizer-accent ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          aria-label={t("detail.sam.selectAchievement", { name: achievement.name })}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onSelectToggle();
          }}
        >
          {selected && <Check size={15} weight="bold" />}
        </button>
      )}

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
        {protectedAchievement && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            <Lock size={10} weight="bold" />
            {t("detail.sam.protectedAchievement")}
            {achievement.protection_source && (
              <span className="text-amber-300/60">
                {t("detail.sam.localSchemaSource")}
              </span>
            )}
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
      {canWrite && !protectedAchievement && (
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className={`btn-press shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            achievement.achieved
              ? "border-repressurizer-border text-repressurizer-text-muted hover:border-repressurizer-danger hover:text-repressurizer-danger"
              : "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent hover:bg-repressurizer-accent/15"
          } disabled:opacity-40`}
        >
          {achievement.achieved ? t("detail.sam.lock") : t("detail.sam.unlock")}
        </button>
      )}
    </div>
  );
}

export function sortAchievements(achievements: AchievementInfo[]): AchievementInfo[] {
  return [...achievements].sort((a, b) => matchAchievementOrder(a, b));
}

export function mergeAchievementsWithSamSchema(
  summary: AchievementSummary,
  schema: SamAchievementSchemaItem[]
): AchievementSummary {
  const byId = new Map(schema.map((item) => [item.apiName, item]));
  return {
    ...summary,
    achievements: summary.achievements.map((achievement) => {
      const item = byId.get(achievement.api_name);
      if (!item) return achievement;
      return {
        ...achievement,
        permission: item.permission,
        protected_achievement: item.protectedAchievement,
        protection_source: "samLocalSchema",
        protection_flags: item.flags,
      };
    }),
  };
}

export function isProtectedAchievement(achievement: AchievementInfo): boolean {
  return achievement.protected_achievement === true;
}

function matchAchievementOrder(a: AchievementInfo, b: AchievementInfo): number {
  if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
  if (a.achieved && b.achieved) return b.unlock_time - a.unlock_time;
  return a.name.localeCompare(b.name);
}
