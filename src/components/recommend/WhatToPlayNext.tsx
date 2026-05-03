import { useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useStatusStore } from "../../stores/statusStore";
import { getHeaderImageUrl } from "../../lib/tauri";
import { X, Shuffle, Timer, GameController, Funnel } from "@phosphor-icons/react";

interface WhatToPlayNextProps {
  onClose: () => void;
}

type LengthFilter = "any" | "short" | "medium" | "long";

export function WhatToPlayNext({ onClose }: WhatToPlayNextProps) {
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const hltbData = useHltbStore((s) => s.data);
  const statuses = useStatusStore((s) => s.statuses);

  const [seed, setSeed] = useState(0);
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("any");
  const [genreFilter, setGenreFilter] = useState<string>("");

  // Build genre preference from most-played games
  const { recommendations, topGenres } = useMemo(() => {
    const list = Object.values(games);

    // Genre weight: sum of playtime per genre
    const genrePlaytime = new Map<string, number>();
    for (const g of list) {
      const d = details[g.appid];
      if (!d) continue;
      for (const genre of d.genres) {
        genrePlaytime.set(genre, (genrePlaytime.get(genre) ?? 0) + g.playtime_forever);
      }
    }
    const maxGenreTime = Math.max(...genrePlaytime.values(), 1);

    const topGenres = [...genrePlaytime.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    // Score unplayed or barely-played games
    const candidates = list.filter((g) => {
      if (g.playtime_forever > 60) return false; // less than 1h played
      const status = statuses[g.appid];
      if (status === "beaten" || status === "completed" || status === "abandoned") return false;
      return true;
    });

    const scored = candidates.map((g) => {
      const d = details[g.appid];
      const hltb = hltbData[g.appid];
      let score = 0;

      // Metacritic bonus (0-30 points)
      if (d?.metacritic_score) {
        score += d.metacritic_score * 0.3;
      }

      // Genre affinity (0-25 points)
      if (d) {
        let genreScore = 0;
        for (const genre of d.genres) {
          const pt = genrePlaytime.get(genre) ?? 0;
          genreScore += (pt / maxGenreTime) * 5;
        }
        score += Math.min(genreScore, 25);
      }

      // HLTB bonus: shorter games get a slight boost (0-15 points)
      const mainTime = hltb?.main_story ?? hltb?.main_extra;
      if (mainTime != null) {
        if (mainTime <= 10) score += 15;
        else if (mainTime <= 25) score += 10;
        else if (mainTime <= 50) score += 5;
      }

      // Recency penalty: if last played recently, slight boost
      if (g.rtime_last_played > 0 && g.playtime_forever > 0) {
        const daysSincePlay = (Date.now() / 1000 - g.rtime_last_played) / 86400;
        if (daysSincePlay < 30) score += 5;
      }

      // Small random factor for variety
      score += ((g.appid * 13 + seed * 7) % 100) * 0.05;

      return { game: g, details: d, hltb, score, mainTime };
    });

    // Apply filters
    let filtered = scored;
    if (lengthFilter !== "any") {
      filtered = filtered.filter((r) => {
        const t = r.mainTime;
        if (t == null) return false;
        if (lengthFilter === "short") return t <= 10;
        if (lengthFilter === "medium") return t > 10 && t <= 30;
        if (lengthFilter === "long") return t > 30;
        return true;
      });
    }
    if (genreFilter) {
      filtered = filtered.filter((r) => r.details?.genres.includes(genreFilter));
    }

    filtered.sort((a, b) => b.score - a.score);
    return { recommendations: filtered.slice(0, 20), topGenres };
  }, [games, details, hltbData, statuses, seed, lengthFilter, genreFilter]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col animate-fade-in rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <GameController size={18} className="text-repressurizer-accent" weight="duotone" />
            <h2 className="text-base font-semibold text-white">What to Play Next</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeed((s) => s + 1)}
              title="Shuffle recommendations"
              className="flex items-center gap-1 rounded-lg border border-repressurizer-border px-2.5 py-1 text-[11px] text-repressurizer-text-muted transition-colors hover:text-white"
            >
              <Shuffle size={12} />
              Shuffle
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-repressurizer-border-subtle px-4 py-2">
          <Funnel size={12} className="text-repressurizer-text-faint" />
          <div className="flex gap-1.5">
            {([
              ["any", "Any Length"],
              ["short", "Short (<10h)"],
              ["medium", "Medium (10-30h)"],
              ["long", "Long (30h+)"],
            ] as [LengthFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setLengthFilter(key)}
                className={`rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${
                  lengthFilter === key
                    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:text-repressurizer-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {topGenres.length > 0 && (
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="ml-auto rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-0.5 text-[11px] text-repressurizer-text focus:outline-none"
            >
              <option value="">All Genres</option>
              {topGenres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {recommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <GameController size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">No recommendations found</p>
              <p className="text-xs">Try adjusting filters or fetch more game details</p>
            </div>
          ) : (
            <div className="divide-y divide-repressurizer-border-subtle">
              {recommendations.map(({ game, details: d, hltb }, idx) => (
                <div key={game.appid} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 shrink-0 text-center font-mono text-[11px] text-repressurizer-text-faint tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="h-9 w-16 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
                    <img
                      src={getHeaderImageUrl(game.appid)}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{String(game.name ?? "")}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {d?.genres && d.genres.length > 0 && (
                        <span className="truncate text-[10px] text-repressurizer-text-faint">{d.genres.slice(0, 2).join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {d?.metacritic_score != null && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          d.metacritic_score >= 75 ? "bg-emerald-600/20 text-emerald-400" :
                          d.metacritic_score >= 50 ? "bg-amber-600/20 text-amber-400" :
                          "bg-red-600/20 text-red-400"
                        }`}
                      >
                        {d.metacritic_score}
                      </span>
                    )}
                    {hltb?.main_story != null && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-repressurizer-text-faint font-mono tabular-nums">
                        <Timer size={10} />
                        {hltb.main_story}h
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-repressurizer-border-subtle px-4 py-2">
          <p className="text-[10px] text-repressurizer-text-faint text-center">
            Scored by Metacritic rating, genre preference, and game length. Fetch HLTB + game details for better results.
          </p>
        </div>
      </div>
    </div>
  );
}
