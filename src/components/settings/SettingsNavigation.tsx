import type { ReactNode } from "react";
import { useT } from "../../lib/i18n";

export type SettingsTab =
  | "general"
  | "steam"
  | "automation"
  | "appearance"
  | "data"
  | "backups"
  | "ignored"
  | "tools"
  | "about";

export interface SettingsTabItem {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export function SettingsNavigation({
  tabs,
  activeTab,
  onTabChange,
  countTabMatches,
  variant,
}: {
  tabs: SettingsTabItem[];
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  countTabMatches: (tab: SettingsTab) => number;
  variant: "desktop" | "mobile";
}) {
  const t = useT();

  if (variant === "mobile") {
    return (
      <nav className="border-b border-repressurizer-border px-3 md:hidden" aria-label={t("settings.sections")}>
        <div className="flex gap-1 overflow-x-auto py-2">
          {tabs.map((item) => (
            <SettingsNavButton
              key={item.id}
              item={item}
              active={activeTab === item.id}
              matchCount={countTabMatches(item.id)}
              onClick={() => onTabChange(item.id)}
              variant="mobile"
            />
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="hidden w-48 shrink-0 border-r border-repressurizer-border bg-repressurizer-bg/35 p-3 md:block" aria-label={t("settings.sections")}>
      <div className="space-y-1">
        {tabs.map((item) => (
          <SettingsNavButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            matchCount={countTabMatches(item.id)}
            onClick={() => onTabChange(item.id)}
            variant="desktop"
          />
        ))}
      </div>
    </nav>
  );
}

function SettingsNavButton({
  item,
  active,
  matchCount,
  onClick,
  variant,
}: {
  item: SettingsTabItem;
  active: boolean;
  matchCount: number;
  onClick: () => void;
  variant: "desktop" | "mobile";
}) {
  const showMatch = matchCount > 0;
  const showBadge = item.badge != null && item.badge > 0;
  const base =
    variant === "desktop"
      ? "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors"
      : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors";
  const state = active
    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
    : "border-transparent text-repressurizer-text-muted hover:border-repressurizer-border hover:bg-repressurizer-surface/50 hover:text-repressurizer-text";
  const iconState = active ? "text-repressurizer-accent" : "text-repressurizer-text-faint";

  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      <span className={`shrink-0 ${iconState}`}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {showMatch && (
        <span className="ml-auto rounded-full bg-repressurizer-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent tabular-nums">
          {matchCount}
        </span>
      )}
      {showBadge && !showMatch && (
        <span className="ml-auto rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 tabular-nums">
          {item.badge}
        </span>
      )}
    </button>
  );
}
