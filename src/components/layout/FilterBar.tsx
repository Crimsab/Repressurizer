import { useMemo, useState } from "react";
import { useGameStore, type FilterState } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import {
  useAdvancedFilterStore,
  type AdvancedCategoryState,
  type AdvancedSpecialState,
  type SavedAdvancedFilter,
} from "../../stores/advancedFilterStore";
import { STATUS_META, type GameStatus } from "../../stores/statusStore";
import { useTagsStore } from "../../stores/tagsStore";
import { useHltbStore } from "../../stores/hltbStore";
import { Funnel, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";

const STATUS_FILTER_OPTIONS: GameStatus[] = ["playing", "beaten", "completed", "abandoned"];

export function FilterBar() {
  const t = useT();
  const filters = useGameStore((s) => s.filters);
  const setFilters = useGameStore((s) => s.setFilters);
  const resetFilters = useGameStore((s) => s.resetFilters);
  const hasActiveFilters = useGameStore((s) => s.hasActiveFilters());
  const activeSavedFilterId = useAdvancedFilterStore((s) => s.activeFilterId);
  const setActiveSavedFilterId = useAdvancedFilterStore((s) => s.setActiveFilterId);
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

  const hasSavedAdvancedFilter = !!activeSavedFilterId;
  const clearAllFilters = () => {
    resetFilters();
    setActiveSavedFilterId(null);
  };

  return (
    <div className="flex items-center gap-2 border-b border-repressurizer-border-subtle bg-repressurizer-bg/50 px-4 py-1.5 flex-wrap">
      <div className="flex items-center gap-1 shrink-0 text-repressurizer-text-faint">
        <Funnel size={13} weight={hasActiveFilters || hasSavedAdvancedFilter ? "fill" : "regular"} className={hasActiveFilters || hasSavedAdvancedFilter ? "text-repressurizer-accent" : ""} />
        <span className="text-[11px] uppercase tracking-wider font-medium">{t("filter.title")}</span>
      </div>

      {/* Playtime range */}
      <div className="flex items-center gap-1.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1">
        <span className="text-[11px] text-repressurizer-text-faint">{t("filter.hours")}</span>
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
        {t("filter.unplayedOnly")}
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
              {t(`status.${s}` as TranslationKey)}
            </button>
          );
        })}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-repressurizer-text-faint shrink-0">{t("filter.tags")}</span>
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
          <span className="text-[11px] text-repressurizer-text-faint">{t("filter.hltb")}</span>
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
          hasAdvancedOnlyFilters(filters) || hasSavedAdvancedFilter
            ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
            : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
        }`}
      >
        <SlidersHorizontal size={12} />
        {t("filter.advanced")}
      </button>

      {/* Clear */}
      {(hasActiveFilters || hasSavedAdvancedFilter) && (
        <button
          onClick={clearAllFilters}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger"
        >
          <X size={11} weight="bold" />
          {t("filter.clear")}
        </button>
      )}

      {advancedOpen && (
        <AdvancedFiltersDialog
          filters={filters}
          setFilters={setFilters}
          resetFilters={clearAllFilters}
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
  const t = useT();
  const collections = useCategoryStore((s) =>
    s.collections.filter((collection) => !collection.is_dynamic && !isSpecialCollection(collection))
  );
  const savedFilters = useAdvancedFilterStore((s) => s.filters);
  const activeFilterId = useAdvancedFilterStore((s) => s.activeFilterId);
  const setSavedFilters = useAdvancedFilterStore((s) => s.setFilters);
  const setActiveFilterId = useAdvancedFilterStore((s) => s.setActiveFilterId);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [categoryStates, setCategoryStates] = useState<Record<string, AdvancedCategoryState>>({});
  const [hiddenState, setHiddenState] = useState<AdvancedSpecialState>("any");
  const [uncategorizedState, setUncategorizedState] = useState<AdvancedSpecialState>("any");

  const togglePlatform = (platform: FilterState["platforms"][number]) => {
    setFilters({
      platforms: filters.platforms.includes(platform)
        ? filters.platforms.filter((p) => p !== platform)
        : [...filters.platforms, platform],
    });
  };
  const activeSavedFilter = savedFilters.find((filter) => filter.id === activeFilterId) ?? null;

  const startNewDraft = () => {
    setDraftId(null);
    setDraftName("");
    setCategoryStates({});
    setHiddenState("any");
    setUncategorizedState("any");
  };

  const loadDraft = (filter: SavedAdvancedFilter) => {
    const states: Record<string, AdvancedCategoryState> = {};
    for (const key of filter.allowCategoryKeys) states[key] = "allow";
    for (const key of filter.requireCategoryKeys) states[key] = "require";
    for (const key of filter.excludeCategoryKeys) states[key] = "exclude";
    setDraftId(filter.id);
    setDraftName(filter.name);
    setCategoryStates(states);
    setHiddenState(filter.hidden);
    setUncategorizedState(filter.uncategorized);
  };

  const setCategoryState = (key: string, state: AdvancedCategoryState) => {
    setCategoryStates((current) => {
      const next = { ...current };
      if (state === "any") delete next[key];
      else next[key] = state;
      return next;
    });
  };

  const saveDraft = () => {
    const now = Date.now();
    const name = draftName.trim() || "Advanced filter";
    const entries = Object.entries(categoryStates);
    const filter: SavedAdvancedFilter = {
      id: draftId ?? `advanced-filter-${now}`,
      name,
      allowCategoryKeys: entries.filter(([, state]) => state === "allow").map(([key]) => key),
      requireCategoryKeys: entries.filter(([, state]) => state === "require").map(([key]) => key),
      excludeCategoryKeys: entries.filter(([, state]) => state === "exclude").map(([key]) => key),
      hidden: hiddenState,
      uncategorized: uncategorizedState,
      createdAt: savedFilters.find((item) => item.id === draftId)?.createdAt ?? now,
      updatedAt: now,
    };
    const exists = savedFilters.some((item) => item.id === filter.id);
    setSavedFilters(exists ? savedFilters.map((item) => (item.id === filter.id ? filter : item)) : [...savedFilters, filter]);
    setActiveFilterId(filter.id);
    setDraftId(filter.id);
    setDraftName(name);
  };

  const deleteSavedFilter = (id: string) => {
    setSavedFilters(savedFilters.filter((filter) => filter.id !== id));
    if (draftId === id) startNewDraft();
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
            <h2 className="text-sm font-semibold tracking-tight text-white">{t("filter.advanced.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-5 overflow-auto p-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Saved category filter</SectionTitle>
              {activeSavedFilter && (
                <span className="rounded-md bg-repressurizer-accent/10 px-2 py-0.5 text-[10px] font-medium text-repressurizer-accent">
                  Active: {activeSavedFilter.name}
                </span>
              )}
            </div>

            {savedFilters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedFilters.map((filter) => (
                  <div key={filter.id} className="flex items-center gap-1 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setActiveFilterId(activeFilterId === filter.id ? null : filter.id)}
                      className={`text-xs font-medium ${
                        activeFilterId === filter.id ? "text-repressurizer-accent" : "text-repressurizer-text-muted hover:text-repressurizer-text"
                      }`}
                    >
                      {filter.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadDraft(filter)}
                      className="rounded-md px-1 text-[10px] text-repressurizer-text-faint hover:text-repressurizer-text"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedFilter(filter.id)}
                      className="rounded-md px-1 text-[10px] text-repressurizer-danger/70 hover:text-repressurizer-danger"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
              <div className="mb-3 flex gap-2">
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Filter name"
                  className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveDraft}
                  className="btn-press rounded-lg bg-repressurizer-accent/15 px-3 py-2 text-xs font-medium text-repressurizer-accent hover:bg-repressurizer-accent/25"
                >
                  {draftId ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={startNewDraft}
                  className="btn-press rounded-lg border border-repressurizer-border px-3 py-2 text-xs font-medium text-repressurizer-text-muted hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
                >
                  New
                </button>
              </div>

              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <StateSelect label="Hidden" value={hiddenState} onChange={setHiddenState} />
                <StateSelect label="Uncategorized" value={uncategorizedState} onChange={setUncategorizedState} />
              </div>

              {collections.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-lg border border-repressurizer-border-subtle">
                  {collections.map((collection) => (
                    <div key={collection.key} className="flex items-center gap-3 border-b border-repressurizer-border-subtle px-3 py-2 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-xs text-repressurizer-text">{collection.name}</span>
                      <select
                        value={categoryStates[collection.key] ?? "any"}
                        onChange={(event) => setCategoryState(collection.key, event.target.value as AdvancedCategoryState)}
                        className="h-8 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-2 text-xs text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
                      >
                        <option value="any">Any</option>
                        <option value="allow">Allow</option>
                        <option value="require">Require</option>
                        <option value="exclude">Exclude</option>
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-repressurizer-border-subtle px-3 py-2 text-xs text-repressurizer-text-faint">
                  No user categories available.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>{t("filter.release")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label={t("filter.minYear")}
                value={filters.minReleaseYear}
                min={1970}
                max={2100}
                onChange={(value) => setFilters({ minReleaseYear: value })}
              />
              <NumberField
                label={t("filter.maxYear")}
                value={filters.maxReleaseYear}
                min={1970}
                max={2100}
                onChange={(value) => setFilters({ maxReleaseYear: value })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>{t("filter.scores")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label={t("filter.minMetacritic")}
                value={filters.minMetacritic}
                min={0}
                max={100}
                onChange={(value) => setFilters({ minMetacritic: value })}
              />
              <NumberField
                label={t("filter.maxMetacritic")}
                value={filters.maxMetacritic}
                min={0}
                max={100}
                onChange={(value) => setFilters({ maxMetacritic: value })}
              />
              <NumberField
                label={t("filter.minAchievements")}
                value={filters.minAchievementPct}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => setFilters({ minAchievementPct: value })}
              />
              <NumberField
                label={t("filter.maxAchievements")}
                value={filters.maxAchievementPct}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => setFilters({ maxAchievementPct: value })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>{t("filter.platform")}</SectionTitle>
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
            <SectionTitle>{t("filter.libraryState")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                active={filters.onlyFamilyShared}
                onClick={() => setFilters({ onlyFamilyShared: !filters.onlyFamilyShared })}
              >
                {t("filter.familyShared")}
              </ToggleChip>
              <ToggleChip
                active={filters.onlyPossibleDuplicates}
                onClick={() => setFilters({ onlyPossibleDuplicates: !filters.onlyPossibleDuplicates })}
              >
                {t("filter.possibleDuplicates")}
              </ToggleChip>
              <ToggleChip
                active={filters.onlyCollectionOnly}
                onClick={() => setFilters({ onlyCollectionOnly: !filters.onlyCollectionOnly })}
              >
                {t("filter.localCollectionOnly")}
              </ToggleChip>
              <ToggleChip
                active={filters.onlyMissingDetails}
                onClick={() => setFilters({ onlyMissingDetails: !filters.onlyMissingDetails })}
              >
                {t("filter.missingMetadata")}
              </ToggleChip>
              <ToggleChip
                active={filters.onlyDelisted}
                onClick={() => setFilters({ onlyDelisted: !filters.onlyDelisted })}
              >
                {t("filter.likelyDelisted")}
              </ToggleChip>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-repressurizer-border px-5 py-3">
          <button
            onClick={resetFilters}
            className="btn-press rounded-lg px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger"
          >
            {t("filter.advanced.clearAll")}
          </button>
          <button
            onClick={onClose}
            className="btn-press rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
          >
            {t("filter.advanced.done")}
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

function StateSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AdvancedSpecialState;
  onChange: (value: AdvancedSpecialState) => void;
}) {
  return (
    <label className="block rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
      <span className="block text-[10px] uppercase tracking-wider text-repressurizer-text-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AdvancedSpecialState)}
        className="mt-1 h-8 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 text-xs text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
      >
        <option value="any">Any</option>
        <option value="require">Require</option>
        <option value="exclude">Exclude</option>
      </select>
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

function isSpecialCollection(collection: { key: string; id: string }): boolean {
  return (
    collection.key === "user-collections.hidden" ||
    collection.key === "user-collections.favorite" ||
    collection.id === "hidden" ||
    collection.id === "favorite"
  );
}
