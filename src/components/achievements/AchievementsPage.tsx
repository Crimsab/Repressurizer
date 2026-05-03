import { useState, useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { useBackgroundFetchStore } from "../../stores/backgroundFetchStore";
import { getHeaderImageUrl } from "../../lib/tauri";
import type { OwnedGame } from "../../lib/types";
import { X, Trophy, ArrowsClockwise } from "@phosphor-icons/react";

interface AchievementsPageProps {
  onClose: () => void;
  onOpenGame?: (game: OwnedGame) => void;
}

export function AchievementsPage({ onClose, onOpenGame }: AchievementsPageProps) {
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const summaries = useAchievementsStore((s) => s.summaries);

  const achievementsRunning = useBackgroundFetchStore((s) => s.achievementsRunning);
  const achievementsFetched = useBackgroundFetchStore((s) => s.achievementsFetched);
  const achievementsTotal = useBackgroundFetchStore((s) => s.achievementsTotal);
  const startAchievementsFetch = useBackgroundFetchStore((s) => s.startAchievementsFetch);
  const stopAchievementsFetch = useBackgroundFetchStore((s) => s.stopAchievementsFetch);

  const [onlyIncomplete, setOnlyIncomplete] = useState(true);

  // Games that have achievements according to details
  const achievementGames = useMemo(() => {
    return Object.values(games).filter((g) => {
      const d = details[g.appid];
      return d?.categories?.includes("Steam Achievements");
    });
  }, [games, details]);

  // Rows: games with fetched summaries, sorted by % descending (nearest to complete first)
  const rows = useMemo(() => {
    return achievementGames
      .map((g) => ({ game: g, summary: summaries[g.appid] ?? null }))
      .filter((r) => {
        if (!r.summary || r.summary.total === 0) return false;
        if (onlyIncomplete) return r.summary.achieved > 0 && r.summary.achieved < r.summary.total;
        return r.summary.achieved > 0;
      })
      .sort((a, b) => {
        const pctA = a.summary!.total > 0 ? a.summary!.achieved / a.summary!.total : 0;
        const pctB = b.summary!.total > 0 ? b.summary!.achieved / b.summary!.total : 0;
        return pctB - pctA;
      });
  }, [achievementGames, summaries, onlyIncomplete]);

  const fetchedCount = achievementGames.filter((g) => summaries[g.appid]).length;
  const toFetchCount = achievementGames.filter((g) => !summaries[g.appid]).length;

  const handleFetchAll = () => {
    const toFetch = achievementGames
      .filter((g) => !summaries[g.appid])
      .map((g) => ({ appId: g.appid, name: String(g.name) }));
    startAchievementsFetch(toFetch);
  };

  const noDetails = achievementGames.length === 0 && Object.keys(details).length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 pb-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Trophy size={18} className="text-repressurizer-accent" weight="fill" />
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">Achievements</h2>
              <p className="text-[10px] text-repressurizer-text-faint">Sorted by completion % — find what you can platinum</p>
            </div>
            <span className="rounded-full bg-repressurizer-bg px-2 py-0.5 text-[11px] font-mono text-repressurizer-text-faint">
              {fetchedCount}/{achievementGames.length} loaded
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Only incomplete toggle */}
            <button
              onClick={() => setOnlyIncomplete(!onlyIncomplete)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                onlyIncomplete
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
              }`}
            >
              Incomplete only
            </button>

            {/* Fetch / Stop */}
            {achievementsRunning ? (
              <button
                onClick={stopAchievementsFetch}
                className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-danger/30 bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-danger transition-colors hover:border-repressurizer-danger"
              >
                <ArrowsClockwise size={12} className="animate-spin" />
                {achievementsFetched}/{achievementsTotal} — Stop
              </button>
            ) : (
              <button
                onClick={handleFetchAll}
                disabled={toFetchCount === 0 || noDetails}
                className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
                title={noDetails ? "Fetch game details first (Auto-Categorize)" : undefined}
              >
                <ArrowsClockwise size={12} />
                Fetch All
              </button>
            )}

            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {noDetails ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <Trophy size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">Fetch game details first using Auto-Categorize (🤖)</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <Trophy size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">
                {fetchedCount === 0
                  ? "Click \"Fetch All\" to load achievement data"
                  : achievementsRunning
                  ? `Fetching… ${achievementsFetched}/${achievementsTotal}`
                  : onlyIncomplete
                  ? "All fetched games are complete!"
                  : "No achievement data yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-repressurizer-border-subtle">
              {rows.map(({ game, summary }) => {
                const pct = summary!.total > 0
                  ? Math.round((summary!.achieved / summary!.total) * 100)
                  : 0;
                return (
                  <button
                    key={game.appid}
                    onClick={() => onOpenGame?.(game)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-repressurizer-surface-hover"
                  >
                    {/* Banner */}
                    <div className="h-9 w-16 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
                      <img
                        src={getHeaderImageUrl(game.appid)}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>

                    {/* Name + bar */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {String(game.name ?? "")}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-repressurizer-bg">
                          <div
                            className="h-full rounded-full bg-repressurizer-accent transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-repressurizer-text-muted tabular-nums">
                          {summary!.achieved}/{summary!.total}
                        </span>
                      </div>
                    </div>

                    {/* Pct badge */}
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-xs font-medium ${
                        pct === 100
                          ? "bg-repressurizer-accent/20 text-repressurizer-accent"
                          : pct >= 75
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-repressurizer-bg text-repressurizer-text-muted"
                      }`}
                    >
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
