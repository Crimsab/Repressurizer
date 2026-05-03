import { useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import { STATUS_META, type GameStatus } from "../../stores/statusStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { Funnel, X } from "@phosphor-icons/react";

const STATUS_FILTER_OPTIONS: GameStatus[] = ["playing", "beaten", "completed", "abandoned"];

export function FilterBar() {
  const filters = useGameStore((s) => s.filters);
  const setFilters = useGameStore((s) => s.setFilters);
  const resetFilters = useGameStore((s) => s.resetFilters);
  const hasActiveFilters = useGameStore((s) => {
    const f = s.filters;
    return f.minHours !== null || f.maxHours !== null || f.statuses.length > 0 || f.onlyUnplayed || f.tagFilter.length > 0 || f.minHltbHours !== null || f.maxHltbHours !== null;
  });
  const hltbData = useHltbStore((s) => s.data);
  const hltbCachedCount = Object.keys(hltbData).length;
  const rawTags = useTagsStore((s) => s.tags);
  const allTags = useMemo(() => {
    const all = new Set<string>();
    for (const tagList of Object.values(rawTags)) {
      for (const t of tagList) all.add(t);
    }
    return [...all].sort();
  }, [rawTags]);

  const toggleStatus = (status: GameStatus) => {
    const current = filters.statuses;
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setFilters({ statuses: next });
  };

  const toggleTag = (tag: string) => {
    const current = filters.tagFilter;
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    setFilters({ tagFilter: next });
  };

  return (
    <div className="flex items-center gap-2 border-b border-repressurizer-border-subtle bg-repressurizer-bg/50 px-4 py-1.5 flex-wrap">
      <div className="flex items-center gap-1 shrink-0 text-repressurizer-text-faint">
        <Funnel size={13} weight={hasActiveFilters ? "fill" : "regular"} className={hasActiveFilters ? "text-repressurizer-accent" : ""} />
        <span className="text-[11px] uppercase tracking-wider font-medium">Filters</span>
      </div>

      {/* Playtime range */}
      <div className="flex items-center gap-1.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1">
        <span className="text-[11px] text-repressurizer-text-faint">Hours:</span>
        <input
          type="number"
          min={0}
          placeholder="min"
          value={filters.minHours ?? ""}
          onChange={(e) => setFilters({ minHours: e.target.value ? parseFloat(e.target.value) : null })}
          className="w-12 bg-transparent text-[11px] text-repressurizer-text focus:outline-none placeholder:text-repressurizer-text-faint font-mono tabular-nums"
        />
        <span className="text-[11px] text-repressurizer-text-faint">–</span>
        <input
          type="number"
          min={0}
          placeholder="max"
          value={filters.maxHours ?? ""}
          onChange={(e) => setFilters({ maxHours: e.target.value ? parseFloat(e.target.value) : null })}
          className="w-12 bg-transparent text-[11px] text-repressurizer-text focus:outline-none placeholder:text-repressurizer-text-faint font-mono tabular-nums"
        />
      </div>

      {/* Unplayed toggle */}
      <button
        onClick={() => setFilters({ onlyUnplayed: !filters.onlyUnplayed })}
        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
          filters.onlyUnplayed
            ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
            : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
        }`}
      >
        Unplayed only
      </button>

      {/* Status filter */}
      <div className="flex gap-1">
        {STATUS_FILTER_OPTIONS.map((s) => {
          const meta = STATUS_META[s];
          const active = filters.statuses.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? `border-current ${meta.color} ${meta.bg}`
                  : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-repressurizer-text-faint shrink-0">Tags:</span>
          {allTags.map((tag) => {
            const active = filters.tagFilter.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                    : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* HLTB duration filter — only shown when there's HLTB data */}
      {hltbCachedCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1">
          <span className="text-[11px] text-repressurizer-text-faint">HLTB:</span>
          <input
            type="number"
            min={0}
            placeholder="min"
            value={filters.minHltbHours ?? ""}
            onChange={(e) => setFilters({ minHltbHours: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-12 bg-transparent text-[11px] text-repressurizer-text focus:outline-none placeholder:text-repressurizer-text-faint font-mono tabular-nums"
          />
          <span className="text-[11px] text-repressurizer-text-faint">–</span>
          <input
            type="number"
            min={0}
            placeholder="max"
            value={filters.maxHltbHours ?? ""}
            onChange={(e) => setFilters({ maxHltbHours: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-12 bg-transparent text-[11px] text-repressurizer-text focus:outline-none placeholder:text-repressurizer-text-faint font-mono tabular-nums"
          />
          <span className="text-[10px] text-repressurizer-text-faint">h</span>
        </div>
      )}

      {/* Clear */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger"
        >
          <X size={11} weight="bold" />
          Clear
        </button>
      )}
    </div>
  );
}
