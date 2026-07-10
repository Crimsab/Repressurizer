import type { ReactNode } from "react";
import { useT } from "../../../lib/i18n";

export function formatTimeAgo(unixSecs: number, t: ReturnType<typeof useT>): string {
  const diffSecs = Math.floor(Date.now() / 1000) - unixSecs;
  if (diffSecs < 3600) return t("time.minutesAgo", { count: Math.floor(diffSecs / 60) });
  if (diffSecs < 86400) return t("time.hoursAgo", { count: Math.floor(diffSecs / 3600) });
  return t("time.daysAgo", { count: Math.floor(diffSecs / 86400) });
}

export function SidebarItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`grid min-h-8 w-full grid-cols-[1.25rem_minmax(0,1fr)_0.75rem_2.5rem] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        active
          ? "bg-repressurizer-accent/10 text-repressurizer-accent"
          : "text-repressurizer-text hover:bg-repressurizer-surface-hover"
      }`}
    >
      <span className={`flex h-5 w-5 items-center justify-center ${active ? "text-repressurizer-accent" : "text-repressurizer-text-faint"}`}>{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      <span aria-hidden="true" />
      <span className="text-right font-mono text-[10px] text-repressurizer-text-faint tabular-nums">{count}</span>
    </button>
  );
}
