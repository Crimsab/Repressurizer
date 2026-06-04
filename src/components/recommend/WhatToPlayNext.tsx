import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useStatusStore } from "../../stores/statusStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { X, Shuffle, Timer, GameController, Funnel, CaretDown, Check } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { useT } from "../../lib/i18n";

interface WhatToPlayNextProps {
  onClose: () => void;
}

type LengthFilter = "any" | "short" | "medium" | "long";
type RecommendMode = "smart" | "surprise" | "quick" | "quality" | "backlog";
type PlayFilter = "any" | "unplayed" | "started";

export function WhatToPlayNext({ onClose }: WhatToPlayNextProps) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const hltbData = useHltbStore((s) => s.data);
  const statuses = useStatusStore((s) => s.statuses);
  const collections = useCategoryStore((s) => s.collections);

  const [seed, setSeed] = useState(0);
  const [mode, setMode] = useState<RecommendMode>("smart");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("any");
  const [playFilter, setPlayFilter] = useState<PlayFilter>("any");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [avoidRecent, setAvoidRecent] = useState(true);
  const [recentIds, setRecentIds] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("repressurizer-recent-recommendations") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  const rememberRecommendations = (ids: number[]) => {
    const next = [...ids, ...recentIds].slice(0, 60);
    const unique = [...new Set(next)];
    localStorage.setItem("repressurizer-recent-recommendations", JSON.stringify(unique));
    setRecentIds(new Set(unique));
  };

  // Build genre preference from most-played games
  const { recommendations, genreOptions } = useMemo(() => {
    const hidden = new Set(collections.find((c) => c.id === "hidden")?.added ?? []);
    const list = Object.values(games).filter((g) => !hidden.has(g.appid));

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

    const genreOptions = [...genrePlaytime.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // Score unplayed or barely-played games
    const candidates = list.filter((g) => {
      if (playFilter === "unplayed" && g.playtime_forever > 0) return false;
      if (playFilter === "started" && (g.playtime_forever === 0 || g.playtime_forever > 240)) return false;
      if (playFilter === "any" && g.playtime_forever > 60) return false; // less than 1h played
      const status = statuses[g.appid];
      if (status === "beaten" || status === "completed" || status === "abandoned") return false;
      if (avoidRecent && recentIds.has(g.appid)) return false;
      return true;
    });

    const scored = candidates.map((g) => {
      const d = details[g.appid];
      const hltb = hltbData[g.appid];
      let score = 0;

      // Metacritic bonus (0-30 points)
      if (d?.metacritic_score) {
        score += d.metacritic_score * (mode === "quality" ? 0.45 : 0.3);
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

      // HLTB bonus: shorter games get a slight boost (0-20 points)
      const mainTime = hltb?.main_story ?? hltb?.main_extra;
      if (mainTime != null) {
        const quickBoost = mode === "quick" ? 1.35 : 1;
        if (mainTime <= 10) score += 15 * quickBoost;
        else if (mainTime <= 25) score += 10 * quickBoost;
        else if (mainTime <= 50) score += 5 * quickBoost;
      }

      // Recency penalty: if last played recently, slight boost
      if (g.rtime_last_played > 0 && g.playtime_forever > 0) {
        const daysSincePlay = (Date.now() / 1000 - g.rtime_last_played) / 86400;
        if (daysSincePlay < 30) score += 5;
      }

      if (mode === "backlog") {
        score += Math.min(20, Math.max(0, 20 - g.playtime_forever / 3));
      }

      // Random factor for variety. Surprise mode deliberately moves more.
      score += ((g.appid * 13 + seed * 97) % 100) * (mode === "surprise" ? 0.22 : 0.07);

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
    const pool = mode === "surprise" ? filtered.slice(0, 45) : filtered.slice(0, 30);
    const picked = weightedPick(pool, seed, mode === "surprise" ? 20 : 12);
    const recommendations = [...picked, ...filtered.filter((r) => !picked.includes(r))].slice(0, 20);
    return { recommendations, genreOptions };
  }, [games, details, hltbData, statuses, seed, lengthFilter, genreFilter, playFilter, avoidRecent, recentIds, collections, mode]);

  const handleShuffle = () => {
    rememberRecommendations(recommendations.slice(0, 8).map((r) => r.game.appid));
    setSeed((s) => s + 1);
  };

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
            <h2 className="text-base font-semibold text-white">{t("recommend.title")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShuffle}
              title={t("recommend.shuffleTitle")}
              className="flex items-center gap-1 rounded-lg border border-repressurizer-border px-2.5 py-1 text-[11px] text-repressurizer-text-muted transition-colors hover:text-white"
            >
              <Shuffle size={12} />
              {t("recommend.shuffle")}
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
        <div className="flex flex-wrap items-center gap-2 border-b border-repressurizer-border-subtle px-4 py-2">
          <Funnel size={12} className="text-repressurizer-text-faint" />
          <div className="flex flex-wrap gap-1.5">
            {([
              ["smart", t("recommend.mode.smart")],
              ["surprise", t("recommend.mode.surprise")],
              ["quick", t("recommend.mode.quick")],
              ["quality", t("recommend.mode.quality")],
              ["backlog", t("recommend.mode.backlog")],
            ] as [RecommendMode, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${
                  mode === key
                    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:text-repressurizer-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-repressurizer-border-subtle px-4 py-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {([
              ["any", t("recommend.anyLength")],
              ["short", t("recommend.short")],
              ["medium", t("recommend.medium")],
              ["long", t("recommend.long")],
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
          <FilterSelect
            value={playFilter}
            onChange={(value) => setPlayFilter(value as PlayFilter)}
            options={[
              { value: "any", label: t("recommend.play.any") },
              { value: "unplayed", label: t("recommend.play.unplayed") },
              { value: "started", label: t("recommend.play.started") },
            ]}
            className="w-[160px]"
          />
          <label className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-repressurizer-text-muted">
            <input
              type="checkbox"
              checked={avoidRecent}
              onChange={(e) => setAvoidRecent(e.target.checked)}
              className="h-3 w-3 accent-[var(--color-repressurizer-accent)]"
            />
            {t("recommend.avoidRecent")}
          </label>
          {genreOptions.length > 0 && (
            <FilterSelect
              value={genreFilter}
              onChange={setGenreFilter}
              options={[
                { value: "", label: t("recommend.allGenres") },
                ...genreOptions.map((g) => ({ value: g, label: g })),
              ]}
              align="right"
              className="w-[200px]"
            />
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {recommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <GameController size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">{t("recommend.empty")}</p>
              <p className="text-xs">{t("recommend.empty.desc")}</p>
            </div>
          ) : (
            <div className="divide-y divide-repressurizer-border-subtle">
              {recommendations.map(({ game, details: d, hltb }, idx) => (
                <div key={game.appid} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 shrink-0 text-center font-mono text-[11px] text-repressurizer-text-faint tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="h-9 w-16 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
                    <SteamImage
                      appId={game.appid}
                      alt=""
                      kind="header"
                      className="h-full w-full object-cover"
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
            {t("recommend.footer")}
          </p>
        </div>
      </div>
      </div>
  );
}

function weightedPick<T extends { score: number }>(items: T[], seed: number, count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  let state = Math.max(1, seed + 17);
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  while (pool.length > 0 && picked.length < count) {
    const maxScore = Math.max(...pool.map((item) => item.score), 1);
    const weights = pool.map((item) => Math.max(0.1, item.score / maxScore));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * total;
    let index = 0;
    for (; index < weights.length; index++) {
      roll -= weights[index];
      if (roll <= 0) break;
    }
    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }

  return picked;
}

interface FilterSelectOption {
  value: string;
  label: string;
}

function FilterSelect({
  value,
  options,
  onChange,
  className = "",
  align = "left",
}: {
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className={`flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-[11px] transition-colors ${
          open
            ? "border-repressurizer-accent bg-repressurizer-accent/10 text-white"
            : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text hover:text-white"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <CaretDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-50 max-h-64 min-w-full overflow-auto rounded-lg border border-repressurizer-border bg-repressurizer-bg py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || "__all"}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                  active
                    ? "bg-repressurizer-accent/15 text-repressurizer-accent"
                    : "text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-white"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active && <Check size={12} className="shrink-0" weight="bold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
