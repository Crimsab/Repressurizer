import { useMemo, useState } from "react";
import { useGameStore, type FilterState } from "../../stores/gameStore";
import { STATUS_META, type GameStatus } from "../../stores/statusStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { Funnel, SlidersHorizontal, X } from "@phosphor-icons/react";

const STATUS_FILTER_OPTIONS: GameStatus[] = ["playing", "beaten", "completed", "abandoned"];

export function FilterBar() {
  const filters = useGameStore((s) => s.filters);
  const setFilters = useGameStore((s) => s.setFilters);
  const resetFilters = useGameStore((s) => s.resetFilters);
  const hasActiveFilters = useGameStore((s) => s.hasActiveFilters());
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

      <button
        onClick={() => setAdvancedOpen(true)}
        className={`btn-press inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
          hasAdvancedOnlyFilters(filters)
            ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
            : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
        }`}
      >
        <SlidersHorizontal size={12} />
        Advanced
      </button>

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

      {advancedOpen && (
        <AdvancedFiltersDialog
          filters={filters}
          setFilters={setFilters}
          resetFilters={resetFilters}
          onClose={() => setAdvancedOpen(false)}
        />
      )}
    </div>
  );
}

function hasAdvancedOnlyFilters(filters: FilterState): boolean {
  return (
    filters.minReleaseYear !== null ||
    filters.maxReleaseYear !== null ||
    filters.platforms.length > 0 ||
    filters.minMetacritic !== null ||
    filters.maxMetacritic !== null ||
    filters.minAchievementPct !== null ||
    filters.maxAchievementPct !== null ||
    filters.onlyFamilyShared ||
    filters.onlyPossibleDuplicates ||
    filters.onlyMissingDetails ||
    filters.onlyDelisted ||
    filters.onlyCollectionOnly
  );
}

function AdvancedFiltersDialog({
  filters,
  setFilters,
  resetFilters,
  onClose,
}: {
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  onClose: () => void;
}) {
  const togglePlatform = (platform: FilterState["platforms"][number]) => {
    setFilters({
      platforms: filters.platforms.includes(platform)
        ? filters.platforms.filter((p) => p !== platform)
        : [...filters.platforms, platform],
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-repressurizer-border px-5 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-repressurizer-accent" />
            <h2 className="text-sm font-semibold tracking-tight text-white">Advanced Filters</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-5 overflow-auto p-5">
          <section className="space-y-2">
            <SectionTitle>Release</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Min year"
                value={filters.minReleaseYear}
                min={1970}
                max={2100}
                onChange={(value) => setFilters({ minReleaseYear: value })}
              />
              <NumberField
                label="Max year"
                value={filters.maxReleaseYear}
                min={1970}
                max={2100}
                onChange={(value) => setFilters({ maxReleaseYear: value })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Scores</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Min Metacritic"
                value={filters.minMetacritic}
                min={0}
                max={100}
                onChange={(value) => setFilters({ minMetacritic: value })}
              />
              <NumberField
                label="Max Metacritic"
                value={filters.maxMetacritic}
                min={0}
                max={100}
                onChange={(value) => setFilters({ maxMetacritic: value })}
              />
              <NumberField
                label="Min achievements"
                value={filters.minAchievementPct}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => setFilters({ minAchievementPct: value })}
              />
              <NumberField
                label="Max achievements"
                value={filters.maxAchievementPct}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => setFilters({ maxAchievementPct: value })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Platform</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {(["windows", "mac", "linux"] as const).map((platform) => (
                <ToggleChip
                  key={platform}
                  active={filters.platforms.includes(platform)}
                  onClick={() => togglePlatform(platform)}
                >
                  {platform === "mac" ? "Mac" : platform[0].toUpperCase() + platform.slice(1)}
                </ToggleChip>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Library State</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                active={filters.onlyFamilyShared}
                onClick={() => setFilters({ onlyFamilyShared: !filters.onlyFamilyShared })}
              >
                Family shared
              </ToggleChip>
              <ToggleChip
                active={filters.onlyPossibleDuplicates}
                onClick={() => setFilters({ onlyPossibleDuplicates: !filters.onlyPossibleDuplicates })}
              >
                Possible duplicates
              </ToggleChip>
              <ToggleChip
                active={filters.onlyCollectionOnly}
                onClick={() => setFilters({ onlyCollectionOnly: !filters.onlyCollectionOnly })}
              >
                Local collection only
              </ToggleChip>
              <ToggleChip
                active={filters.onlyMissingDetails}
                onClick={() => setFilters({ onlyMissingDetails: !filters.onlyMissingDetails })}
              >
                Missing metadata
              </ToggleChip>
              <ToggleChip
                active={filters.onlyDelisted}
                onClick={() => setFilters({ onlyDelisted: !filters.onlyDelisted })}
              >
                Likely delisted
              </ToggleChip>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-repressurizer-border px-5 py-3">
          <button
            onClick={resetFilters}
            className="btn-press rounded-lg px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger"
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            className="btn-press rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
      {children}
    </h3>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
      <span className="block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-transparent font-mono text-sm text-repressurizer-text tabular-nums focus:outline-none placeholder:text-repressurizer-text-faint"
        />
        {suffix && <span className="text-xs text-repressurizer-text-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`btn-press rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
          : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
      }`}
    >
      {children}
    </button>
  );
}
