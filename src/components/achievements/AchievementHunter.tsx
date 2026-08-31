import { useMemo, useState } from "react";
import { useT } from "../../lib/i18n";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useGameStore } from "../../stores/gameStore";
import { SteamImage } from "../games/SteamImage";
import { SelectMenu } from "../ui/SelectMenu";

type HunterSort = "closest" | "remaining" | "name";
type HunterFilter = "started" | "perfectable" | "all";

interface HunterRow {
  appId: number;
  name: string;
  achieved: number;
  total: number;
  remaining: number;
  percent: number;
}

export function AchievementHunterContent() {
  const t = useT();
  const summaries = useAchievementsStore((state) => state.summaries);
  const games = useGameStore((state) => state.games);
  const [sort, setSort] = useState<HunterSort>("closest");
  const [filter, setFilter] = useState<HunterFilter>("started");

  const rows = useMemo<HunterRow[]>(() => {
    const list: HunterRow[] = [];
    for (const [appIdText, summary] of Object.entries(summaries)) {
      const appId = Number(appIdText);
      const game = games[appId];
      if (!game || !summary || summary.total <= 0) continue;
      const achieved = Math.min(summary.achieved, summary.total);
      const remaining = summary.total - achieved;
      if (remaining <= 0) continue;
      if (filter === "started" && achieved === 0) continue;
      if (filter === "perfectable" && remaining > 3) continue;
      list.push({ appId, name: String(game.name ?? ""), achieved, total: summary.total, remaining, percent: achieved / summary.total });
    }
    const byName = (left: HunterRow, right: HunterRow) => left.name.localeCompare(right.name);
    list.sort((left, right) => {
      if (sort === "name") return byName(left, right);
      if (sort === "remaining") return left.remaining - right.remaining || right.percent - left.percent || byName(left, right);
      return right.percent - left.percent || left.remaining - right.remaining || byName(left, right);
    });
    return list.slice(0, 60);
  }, [filter, games, sort, summaries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-repressurizer-border-subtle px-5 py-3">
        <div className="w-44">
          <SelectMenu<HunterSort>
            value={sort}
            options={[
              { value: "closest", label: t("hunter.sortClosest") },
              { value: "remaining", label: t("hunter.sortRemaining") },
              { value: "name", label: t("hunter.sortName") },
            ]}
            onChange={(value) => setSort(value)}
            ariaLabel={t("hunter.sort")}
            size="sm"
            buttonClassName="border-repressurizer-border-subtle bg-repressurizer-bg text-[11px]"
          />
        </div>
        <div className="w-44">
          <SelectMenu<HunterFilter>
            value={filter}
            options={[
              { value: "started", label: t("hunter.filterStarted") },
              { value: "perfectable", label: t("hunter.filterPerfectable") },
              { value: "all", label: t("hunter.filterAll") },
            ]}
            onChange={(value) => setFilter(value)}
            ariaLabel={t("hunter.filter")}
            size="sm"
            buttonClassName="border-repressurizer-border-subtle bg-repressurizer-bg text-[11px]"
          />
        </div>
        <p className="min-w-0 flex-1 truncate text-[10px] text-repressurizer-text-faint">{t("hunter.desc")}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-repressurizer-text-faint">{t("hunter.empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) => (
              <button
                key={row.appId}
                type="button"
                data-testid={`hunter-row-${row.appId}`}
                onClick={() => window.dispatchEvent(new CustomEvent("repressurizer-open-game", { detail: { appId: row.appId } }))}
                className="focus-ring flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-repressurizer-border-subtle hover:bg-repressurizer-surface/70"
              >
                <span className="relative h-10 w-[68px] shrink-0 overflow-hidden rounded-lg bg-repressurizer-bg">
                  <SteamImage appId={row.appId} alt="" kind="capsule" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-repressurizer-text">{row.name}</span>
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-repressurizer-bg">
                    <span className="block h-full rounded-full bg-repressurizer-accent" style={{ width: `${Math.round(row.percent * 100)}%` }} />
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-repressurizer-text-muted">{row.achieved}/{row.total}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums ${row.remaining <= 3 ? "border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-faint"}`}>
                  {row.remaining <= 3 ? t("hunter.toPerfect", { count: row.remaining }) : `-${row.remaining}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
