import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useExportUiStore } from "../../stores/exportUiStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { STATUS_META, useStatusStore, type GameStatus } from "../../stores/statusStore";
import {
  DEFAULT_EXPORT_FIELDS,
  getExportPreview,
  type ExportCollectionOnlyFilter,
  type ExportFieldKey,
  type ExportFilters,
  type ExportFormat,
  type ExportPlayedFilter,
  type ExportPresenceFilter,
  type ExportScope,
} from "../../lib/export";
import { exportToDisk } from "../../lib/exportAction";
import { useT, type TranslationKey } from "../../lib/i18n";
import { SelectMenu, type SelectMenuOption } from "../ui/SelectMenu";
import {
  X,
  FileText,
  Table,
  FileJs,
  FileMd,
  GameController,
  FolderOpen,
  Folders,
  ChartBar,
  Export,
  CheckCircle,
  Warning,
  SelectionAll,
  Funnel,
  SlidersHorizontal,
  Columns,
  MagnifyingGlass,
} from "@phosphor-icons/react";

interface ExportDialogProps {
  onClose: () => void;
}

const SCOPE_LABELS: Record<
  ExportScope,
  { label: TranslationKey; desc: TranslationKey }
> = {
  all: { label: "export.scope.all", desc: "export.scope.all.desc" },
  category: { label: "export.scope.category", desc: "export.scope.category.desc" },
  categories: { label: "export.scope.categories", desc: "export.scope.categories.desc" },
  categories_pick: { label: "export.scope.pick", desc: "export.scope.pick.desc" },
  stats: { label: "export.scope.stats", desc: "export.scope.stats.desc" },
  snapshot: { label: "export.scope.snapshot", desc: "export.scope.snapshot.desc" },
};

const BASE_SCOPES: {
  value: ExportScope;
  icon: typeof GameController;
}[] = [
  { value: "all", icon: GameController },
  { value: "category", icon: FolderOpen },
  { value: "categories", icon: Folders },
  { value: "stats", icon: ChartBar },
];

const PICK_SCOPE = {
  value: "categories_pick" as const,
  icon: SelectionAll,
};

const SNAPSHOT_SCOPE = {
  value: "snapshot" as const,
  icon: FileJs,
};

const FORMATS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: "txt", label: "TXT", icon: FileText },
  { value: "md", label: "Markdown", icon: FileMd },
  { value: "json", label: "JSON", icon: FileJs },
  { value: "csv", label: "CSV", icon: Table },
];

const FIELD_OPTIONS: { value: ExportFieldKey; label: TranslationKey }[] = [
  { value: "name", label: "export.field.name" },
  { value: "appid", label: "export.field.appid" },
  { value: "playtime", label: "export.field.playtime" },
  { value: "lastPlayed", label: "export.field.lastPlayed" },
  { value: "status", label: "export.field.status" },
  { value: "hltb", label: "export.field.hltb" },
  { value: "categories", label: "export.field.categories" },
  { value: "genres", label: "export.field.genres" },
  { value: "features", label: "export.field.features" },
  { value: "releaseDate", label: "export.field.releaseDate" },
  { value: "metacritic", label: "export.field.metacritic" },
  { value: "developers", label: "export.field.developers" },
  { value: "publishers", label: "export.field.publishers" },
  { value: "platforms", label: "export.field.platforms" },
  { value: "price", label: "export.field.price" },
  { value: "collectionOnly", label: "export.field.collectionOnly" },
];

const STATUS_FILTER_OPTIONS: GameStatus[] = ["playing", "beaten", "completed", "abandoned"];

const DEFAULT_FILTERS: ExportFilters = {
  minSteamHours: null,
  maxSteamHours: null,
  minHltbHours: null,
  maxHltbHours: null,
  statuses: [],
  hltbPresence: "all",
  detailsPresence: "all",
  collectionOnly: "include",
  played: "all",
};

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggleInList<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const hltbData = useHltbStore((s) => s.data);
  const statuses = useStatusStore((s) => s.statuses);
  const activeCategory = useCategoryStore((s) => s.activeCategory);
  const collections = useCategoryStore((s) => s.collections);
  const sidebarSelectedCategoryKeys = useCategoryStore((s) => s.selectedCategoryKeys);
  const overrideCategoryKey = useExportUiStore((s) => s.overrideCategoryKey);
  const resetIntent = useExportUiStore((s) => s.resetIntent);
  const settings = useSettingsStore();

  const t = useT();

  const [scope, setScope] = useState<ExportScope>(() => useExportUiStore.getState().initialScope ?? "all");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [titlesOnly, setTitlesOnly] = useState(false);
  const [pickLayout, setPickLayout] = useState<"structured" | "flat_unique">("structured");
  const [fields, setFields] = useState<ExportFieldKey[]>(DEFAULT_EXPORT_FIELDS);
  const [filters, setFilters] = useState<ExportFilters>(DEFAULT_FILTERS);
  const [skipEmptyCategories, setSkipEmptyCategories] = useState(true);
  const [selectedExportCategoryKeys, setSelectedExportCategoryKeys] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => () => resetIntent(), [resetIntent]);

  useEffect(() => {
    if (scope === "snapshot" && format !== "json") setFormat("json");
  }, [scope, format]);

  useEffect(() => {
    if (scope === "stats" || scope === "snapshot") setTitlesOnly(false);
  }, [scope]);

  const effectiveCategoryKey =
    scope === "category"
      ? overrideCategoryKey ??
        (activeCategory === "all" || activeCategory === "uncategorized" ? undefined : activeCategory ?? undefined)
      : undefined;

  const effectiveCatName = effectiveCategoryKey
    ? collections.find((c) => c.key === effectiveCategoryKey)?.name
    : undefined;

  const canCustomizeRows = scope !== "stats" && scope !== "snapshot";
  const isCategoryScope = scope === "category";
  const isPickScope = scope === "categories_pick";
  const isCategorySelectionScope = scope === "categories" || scope === "categories_pick";
  const isStructuredCategoryExport = scope === "categories" || (isPickScope && pickLayout === "structured");
  const categoryDisabled = isCategoryScope && !effectiveCategoryKey;
  const pickDisabled = isPickScope && sidebarSelectedCategoryKeys.length === 0;
  const categorySelectionDisabled = isCategorySelectionScope && selectedExportCategoryKeys.length === 0;

  const categoryOptions = useMemo(
    () =>
      collections
        .filter((collection) => !collection.is_deleted && collection.id !== "hidden")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [collections]
  );

  const visibleCategoryOptions = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions.filter((collection) => collection.name.toLowerCase().includes(query));
  }, [categoryOptions, categoryQuery]);

  useEffect(() => {
    if (scope === "categories") {
      setSelectedExportCategoryKeys(categoryOptions.map((collection) => collection.key));
      return;
    }
    if (scope === "categories_pick") {
      const availableKeys = new Set(categoryOptions.map((collection) => collection.key));
      setSelectedExportCategoryKeys(sidebarSelectedCategoryKeys.filter((key) => availableKeys.has(key)));
    }
  }, [categoryOptions, scope, sidebarSelectedCategoryKeys]);

  const exportOptions = useMemo(
    () => ({
      scope,
      format,
      titlesOnly,
      games,
      collections,
      details,
      hltbData,
      statuses,
      hltbTimeMode: settings.hltbTimeMode,
      appVersion: __APP_VERSION__,
      steamId64: settings.steamId64,
      steamPersonaName: settings.steamPersonaName,
      activeCategory: effectiveCategoryKey,
      categoryKeys: isCategorySelectionScope ? selectedExportCategoryKeys : undefined,
      pickLayout: scope === "categories_pick" ? pickLayout : undefined,
      fields,
      filters,
      skipEmptyCategories,
    }),
    [
      scope,
      format,
      titlesOnly,
      games,
      collections,
      details,
      hltbData,
      statuses,
      settings.hltbTimeMode,
      settings.steamId64,
      settings.steamPersonaName,
      effectiveCategoryKey,
      isCategorySelectionScope,
      selectedExportCategoryKeys,
      pickLayout,
      fields,
      filters,
      skipEmptyCategories,
    ]
  );

  const preview = useMemo(() => getExportPreview(exportOptions), [exportOptions]);

  const scopeRows = [
    ...BASE_SCOPES,
    SNAPSHOT_SCOPE,
    ...(sidebarSelectedCategoryKeys.length >= 1 ? [PICK_SCOPE] : []),
  ];

  const playedOptions: SelectMenuOption<ExportPlayedFilter>[] = [
    { value: "all", label: t("export.filter.all") },
    { value: "played", label: t("export.filter.playedOnly") },
    { value: "unplayed", label: t("export.filter.unplayedOnly") },
  ];

  const presenceOptions: SelectMenuOption<ExportPresenceFilter>[] = [
    { value: "all", label: t("export.filter.all") },
    { value: "with", label: t("export.filter.with") },
    { value: "without", label: t("export.filter.without") },
  ];

  const collectionOnlyOptions: SelectMenuOption<ExportCollectionOnlyFilter>[] = [
    { value: "include", label: t("export.filter.include") },
    { value: "exclude", label: t("export.filter.exclude") },
    { value: "only", label: t("export.filter.only") },
  ];

  const handleExport = async () => {
    try {
      const path = await exportToDisk({
        ...exportOptions,
        filenameOpts:
          scope === "category"
            ? { categoryName: effectiveCatName }
            : scope === "categories_pick"
              ? { pickCount: selectedExportCategoryKeys.length }
              : undefined,
      });

      if (!path) return;

      setStatus("success");
      setStatusMsg(t("export.successMsg"));
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setStatus("error");
      setStatusMsg(t("export.errorMsg", { error: String(e) }));
    }
  };

  const updateFilters = (patch: Partial<ExportFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const toggleField = (field: ExportFieldKey) => {
    if (field === "name") return;
    setFields((current) => toggleInList(current, field));
  };

  const toggleStatusFilter = (nextStatus: GameStatus) => {
    updateFilters({ statuses: toggleInList(filters.statuses ?? [], nextStatus) });
  };

  const toggleExportCategory = (key: string) => {
    setSelectedExportCategoryKeys((current) => toggleInList(current, key));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Export size={18} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold tracking-tight text-white">{t("export.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_1.12fr]">
          <div className="space-y-5 border-b border-repressurizer-border p-6 lg:border-b-0 lg:border-r">
            {status !== "idle" && (
              <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                status === "success"
                  ? "border-repressurizer-success/20 bg-repressurizer-success/8 text-repressurizer-success"
                  : "border-repressurizer-danger/20 bg-repressurizer-danger/8 text-repressurizer-danger"
              }`}>
                {status === "success" ? <CheckCircle size={16} weight="fill" /> : <Warning size={16} weight="fill" />}
                {statusMsg}
              </div>
            )}

            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("export.what")}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {scopeRows.map((s) => {
                  const Icon = s.icon;
                  const isActive = scope === s.value;
                  const { label, desc } = SCOPE_LABELS[s.value];
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setScope(s.value)}
                      className={`btn-press flex min-h-[86px] items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? "border-repressurizer-accent bg-repressurizer-accent/8"
                          : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
                      }`}
                    >
                      <Icon
                        size={16}
                        weight={isActive ? "fill" : "duotone"}
                        className={isActive ? "mt-0.5 text-repressurizer-accent" : "mt-0.5 text-repressurizer-text-faint"}
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${isActive ? "text-white" : "text-repressurizer-text"}`}>
                          {t(label)}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-repressurizer-text-faint">
                          {t(desc)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {isCategoryScope && (
                <p className="mt-2 text-xs text-repressurizer-text-muted">
                  {effectiveCatName
                    ? <>{t("export.from")}: <span className="font-medium text-repressurizer-accent">{effectiveCatName}</span></>
                    : t("export.pickCategory")}
                </p>
              )}
              {isPickScope && (
                <p className="mt-2 text-xs text-repressurizer-text-muted">
                  {sidebarSelectedCategoryKeys.length > 0
                    ? <>{t("export.pickCount", { count: sidebarSelectedCategoryKeys.length })}</>
                    : t("export.pickEmpty")}
                </p>
              )}
            </section>

            {isPickScope && sidebarSelectedCategoryKeys.length >= 1 && (
              <section className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                  {t("export.pickLayoutTitle")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPickLayout("structured")}
                    className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                      pickLayout === "structured"
                        ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                        : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
                    }`}
                  >
                    {t("export.layoutStructured")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickLayout("flat_unique")}
                    className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                      pickLayout === "flat_unique"
                        ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                        : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
                    }`}
                  >
                    {t("export.layoutFlat")}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-repressurizer-text-faint">{t("export.pickLayoutHint")}</p>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("export.format")}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {FORMATS.map((f) => {
                  const Icon = f.icon;
                  const isActive = format === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        if (scope !== "snapshot" || f.value === "json") setFormat(f.value);
                      }}
                      disabled={scope === "snapshot" && f.value !== "json"}
                      className={`btn-press flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-repressurizer-accent bg-repressurizer-accent/8 text-white"
                          : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text disabled:opacity-35 disabled:hover:border-repressurizer-border-subtle disabled:hover:text-repressurizer-text-muted"
                      }`}
                    >
                      <Icon size={14} weight={isActive ? "fill" : "regular"} />
                      <span className="truncate">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {canCustomizeRows && (
              <section className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={titlesOnly}
                    onChange={(e) => setTitlesOnly(e.target.checked)}
                    className="h-4 w-4 rounded accent-repressurizer-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-repressurizer-text">{t("export.titlesOnly")}</span>
                    <span className="block text-[11px] text-repressurizer-text-faint">{t("export.titlesOnlyDesc")}</span>
                  </span>
                </label>
              </section>
            )}
          </div>

          <div className="space-y-5 p-6">
            {canCustomizeRows && !titlesOnly && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Columns size={14} className="text-repressurizer-accent" />
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                    {t("export.fields")}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FIELD_OPTIONS.map((field) => {
                    const active = field.value === "name" || fields.includes(field.value);
                    const locked = field.value === "name";
                    return (
                      <button
                        key={field.value}
                        type="button"
                        onClick={() => toggleField(field.value)}
                        disabled={locked}
                        className={`flex min-h-9 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          active
                            ? "border-repressurizer-accent/60 bg-repressurizer-accent/10 text-repressurizer-accent"
                            : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                        } ${locked ? "cursor-default opacity-90" : ""}`}
                      >
                        <span className="truncate">{t(field.label)}</span>
                        {active && <CheckCircle size={12} weight="fill" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {canCustomizeRows && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Funnel size={14} className="text-repressurizer-accent" />
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                    {t("export.filters")}
                  </h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <RangeControl
                    label={t("export.filter.steamHours")}
                    min={filters.minSteamHours}
                    max={filters.maxSteamHours}
                    onMin={(value) => updateFilters({ minSteamHours: value })}
                    onMax={(value) => updateFilters({ maxSteamHours: value })}
                    minLabel={t("export.filter.min")}
                    maxLabel={t("export.filter.max")}
                  />
                  <RangeControl
                    label={t("export.filter.hltbHours")}
                    min={filters.minHltbHours}
                    max={filters.maxHltbHours}
                    onMin={(value) => updateFilters({ minHltbHours: value })}
                    onMax={(value) => updateFilters({ maxHltbHours: value })}
                    minLabel={t("export.filter.min")}
                    maxLabel={t("export.filter.max")}
                  />
                  <SelectMenu<ExportPlayedFilter>
                    value={filters.played ?? "all"}
                    options={playedOptions}
                    onChange={(played) => updateFilters({ played })}
                    label={t("export.filter.played")}
                    size="sm"
                    className="min-w-0"
                  />
                  <SelectMenu<ExportPresenceFilter>
                    value={filters.hltbPresence ?? "all"}
                    options={presenceOptions}
                    onChange={(hltbPresence) => updateFilters({ hltbPresence })}
                    label={t("export.filter.hltbPresence")}
                    size="sm"
                    className="min-w-0"
                  />
                  <SelectMenu<ExportPresenceFilter>
                    value={filters.detailsPresence ?? "all"}
                    options={presenceOptions}
                    onChange={(detailsPresence) => updateFilters({ detailsPresence })}
                    label={t("export.filter.detailsPresence")}
                    size="sm"
                    className="min-w-0"
                  />
                  <SelectMenu<ExportCollectionOnlyFilter>
                    value={filters.collectionOnly ?? "include"}
                    options={collectionOnlyOptions}
                    onChange={(collectionOnly) => updateFilters({ collectionOnly })}
                    label={t("export.filter.collectionOnly")}
                    size="sm"
                    className="min-w-0"
                  />
                </div>

                <div className="mt-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                    {t("export.filter.statuses")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTER_OPTIONS.map((s) => {
                      const meta = STATUS_META[s];
                      const active = (filters.statuses ?? []).includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStatusFilter(s)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? `border-current ${meta.color} ${meta.bg}`
                              : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
                          }`}
                        >
                          {t(`status.${s}` as TranslationKey)}
                        </button>
                      );
                    })}
                    {(filters.statuses ?? []).length === 0 && (
                      <span className="px-2.5 py-1 text-[11px] text-repressurizer-text-faint">
                        {t("export.filter.anyStatus")}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {canCustomizeRows && isCategorySelectionScope && (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-repressurizer-accent" />
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                      {t("export.skipCategories")}
                    </h3>
                  </div>
                  <span className="text-[11px] text-repressurizer-text-faint">
                    {t("export.categorySelected", {
                      selected: selectedExportCategoryKeys.length,
                      total: categoryOptions.length,
                    })}
                  </span>
                </div>
                <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
                  {isStructuredCategoryExport && (
                    <label className="mb-3 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={skipEmptyCategories}
                        onChange={(e) => setSkipEmptyCategories(e.target.checked)}
                        className="h-4 w-4 rounded accent-repressurizer-accent"
                      />
                      <span className="text-xs text-repressurizer-text">{t("export.skipEmptyCategories")}</span>
                    </label>
                  )}
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-repressurizer-border-subtle px-2 py-1.5">
                      <MagnifyingGlass size={13} className="text-repressurizer-text-faint" />
                      <input
                        value={categoryQuery}
                        onChange={(e) => setCategoryQuery(e.target.value)}
                        placeholder={t("export.categorySearch")}
                        className="min-w-0 flex-1 bg-transparent text-xs text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedExportCategoryKeys(categoryOptions.map((collection) => collection.key))}
                      className="rounded-lg border border-repressurizer-border-subtle px-2.5 py-1.5 text-[11px] text-repressurizer-text-muted transition-colors hover:border-repressurizer-border hover:text-repressurizer-text"
                    >
                      {t("export.categorySelectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExportCategoryKeys([])}
                      className="rounded-lg border border-repressurizer-border-subtle px-2.5 py-1.5 text-[11px] text-repressurizer-text-muted transition-colors hover:border-repressurizer-border hover:text-repressurizer-text"
                    >
                      {t("export.categorySelectNone")}
                    </button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {visibleCategoryOptions.map((collection) => {
                      const selected = selectedExportCategoryKeys.includes(collection.key);
                      return (
                        <button
                          key={collection.key}
                          type="button"
                          onClick={() => toggleExportCategory(collection.key)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                            selected
                              ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                              : "border-transparent text-repressurizer-text-muted hover:border-repressurizer-border-subtle hover:text-repressurizer-text"
                          }`}
                        >
                          <span className="truncate">{collection.name}</span>
                          <span className="shrink-0 font-mono tabular-nums text-[10px] text-repressurizer-text-faint">
                            {collection.added.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                  {t("export.preview")}
                </h3>
                <span className="rounded-full bg-repressurizer-accent/10 px-2 py-0.5 text-[11px] font-medium text-repressurizer-accent">
                  .{scope === "snapshot" ? "json" : format}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PreviewMetric label={t("export.preview.games")} value={preview.gameCount} />
                <PreviewMetric label={t("export.preview.categories")} value={preview.categoryCount} />
                <PreviewMetric label={t("export.preview.skippedGames")} value={preview.skippedGameCount} />
                <PreviewMetric label={t("export.preview.fields")} value={preview.fieldCount || "-"} />
              </div>
              {preview.skippedCategoryCount > 0 && (
                <p className="mt-2 text-[11px] text-repressurizer-text-faint">
                  {t("export.preview.skippedCategories", { count: preview.skippedCategoryCount })}
                </p>
              )}
              {scope === "snapshot" && (
                <p className="mt-2 text-xs text-repressurizer-text-muted">
                  {t("export.summarySnapshot", {
                    games: Object.keys(games).length,
                    collections: collections.filter((c) => !c.is_deleted).length,
                    hltb: Object.keys(hltbData).length,
                  })}
                </p>
              )}
            </section>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={categoryDisabled || pickDisabled || categorySelectionDisabled || status === "success" || (canCustomizeRows && preview.gameCount === 0)}
              className="btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-repressurizer-accent py-3 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Export size={16} weight="bold" />
              {t("export.button")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RangeControlProps {
  label: string;
  min: number | null | undefined;
  max: number | null | undefined;
  onMin: (value: number | null) => void;
  onMax: (value: number | null) => void;
  minLabel: string;
  maxLabel: string;
}

function RangeControl({ label, min, max, onMin, onMax, minLabel, maxLabel }: RangeControlProps) {
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
      <p className="mb-1.5 text-[11px] text-repressurizer-text-faint">{label}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <input
          type="number"
          min={0}
          placeholder={minLabel}
          value={min ?? ""}
          onChange={(e) => onMin(numberOrNull(e.target.value))}
          className="min-w-0 bg-transparent text-xs font-mono tabular-nums text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
        />
        <span className="text-[11px] text-repressurizer-text-faint">-</span>
        <input
          type="number"
          min={0}
          placeholder={maxLabel}
          value={max ?? ""}
          onChange={(e) => onMax(numberOrNull(e.target.value))}
          className="min-w-0 bg-transparent text-xs font-mono tabular-nums text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
        />
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums text-repressurizer-text">{value}</p>
    </div>
  );
}
