import { useMemo } from "react";
import { useT } from "../../../lib/i18n";
import type { AutomationPublishPayloadSettings } from "../../../lib/types";
import { useCategoryStore } from "../../../stores/categoryStore";
import { useSettingsStore } from "../../../stores/settingsStore";

export function AutomationPayloadSettings() {
  const t = useT();
  const payload = useSettingsStore((state) => state.automationPublishPayload);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const collections = useCategoryStore((state) => state.collections);
  const categoryOptions = useMemo(
    () =>
      collections
        .filter((collection) => !collection.is_deleted)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [collections]
  );
  const categoryOptionKeys = useMemo(
    () => new Set(categoryOptions.map((collection) => collection.key)),
    [categoryOptions]
  );
  const selectedCategoryKeys = useMemo(
    () => new Set(payload.categoryKeys),
    [payload.categoryKeys]
  );

  const updatePayload = (patch: Partial<AutomationPublishPayloadSettings>) => {
    setSettings({
      automationPublishPayload: {
        ...payload,
        ...patch,
      },
    });
  };

  const setPayloadHours = (
    field: "minSteamHours" | "maxSteamHours",
    value: string
  ) => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    updatePayload({
      [field]: parsed == null || !Number.isFinite(parsed) ? null : Math.max(0, parsed),
    });
  };

  const categorySelected = (key: string) =>
    payload.categoryMode === "all" || selectedCategoryKeys.has(key);

  const toggleCategory = (key: string) => {
    const allKeys = categoryOptions.map((collection) => collection.key);
    const current =
      payload.categoryMode === "all"
        ? allKeys
        : payload.categoryKeys.filter((item) => categoryOptionKeys.has(item));
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    updatePayload({ categoryMode: "custom", categoryKeys: next });
  };

  const selectedCategoryCount =
    payload.categoryMode === "all"
      ? categoryOptions.length
      : payload.categoryKeys.filter((key) => categoryOptionKeys.has(key)).length;

  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-repressurizer-text">
            {t("settings.automationPayload.title")}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
            {t("settings.automationPayload.desc")}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-repressurizer-accent/10 px-2 py-0.5 text-[10px] font-medium text-repressurizer-accent">
          {t("settings.automationPayload.format")}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ["includeDetails", "settings.automationPayload.details"],
          ["includeHltb", "settings.automationPayload.hltb"],
          ["includeAchievements", "settings.automationPayload.achievements"],
          ["includeWishlist", "settings.automationPayload.wishlist"],
          ["includeOwnership", "settings.automationPayload.ownership"],
          ["includeCollectionOnlyGames", "settings.automationPayload.collectionOnly"],
        ] as const).map(([field, labelKey]) => (
          <button
            key={field}
            type="button"
            onClick={() => updatePayload({ [field]: !payload[field] })}
            className={`btn-press flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              payload[field]
                ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
            }`}
          >
            <span className="truncate">{t(labelKey as Parameters<typeof t>[0])}</span>
            <span className="font-mono text-[10px]">{payload[field] ? "on" : "off"}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
          <p className="mb-1.5 text-[11px] text-repressurizer-text-faint">
            {t("settings.automationPayload.steamHours")}
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <input
              type="number"
              min={0}
              placeholder={t("export.filter.min")}
              value={payload.minSteamHours ?? ""}
              onChange={(event) => setPayloadHours("minSteamHours", event.target.value)}
              className="min-w-0 bg-transparent font-mono text-xs tabular-nums text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
            />
            <span className="text-[11px] text-repressurizer-text-faint">-</span>
            <input
              type="number"
              min={0}
              placeholder={t("export.filter.max")}
              value={payload.maxSteamHours ?? ""}
              onChange={(event) => setPayloadHours("maxSteamHours", event.target.value)}
              className="min-w-0 bg-transparent font-mono text-xs tabular-nums text-repressurizer-text outline-none placeholder:text-repressurizer-text-faint"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updatePayload({ requireDetails: !payload.requireDetails })}
            className={`btn-press rounded-lg border px-3 py-2 text-xs transition-colors ${
              payload.requireDetails
                ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
            }`}
          >
            {t("settings.automationPayload.requireDetails")}
          </button>
          <button
            type="button"
            onClick={() => updatePayload({ requireHltb: !payload.requireHltb })}
            className={`btn-press rounded-lg border px-3 py-2 text-xs transition-colors ${
              payload.requireHltb
                ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
            }`}
          >
            {t("settings.automationPayload.requireHltb")}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
            {t("settings.automationPayload.categories")}
          </p>
          <span className="text-[11px] text-repressurizer-text-faint">
            {payload.categoryMode === "all"
              ? t("settings.automationPayload.allCategories")
              : t("export.categorySelected", {
                  selected: selectedCategoryCount,
                  total: categoryOptions.length,
                })}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updatePayload({ categoryMode: "all", categoryKeys: [] })}
            className={`btn-press rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              payload.categoryMode === "all"
                ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
            }`}
          >
            {t("export.categorySelectAll")}
          </button>
          <button
            type="button"
            onClick={() => updatePayload({ categoryMode: "custom", categoryKeys: [] })}
            className={`btn-press rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              payload.categoryMode === "custom" && payload.categoryKeys.length === 0
                ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
            }`}
          >
            {t("export.categorySelectNone")}
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-repressurizer-text-muted">
            <input
              type="checkbox"
              checked={payload.skipEmptyCollections}
              onChange={(event) => updatePayload({ skipEmptyCollections: event.target.checked })}
              className="h-3.5 w-3.5 rounded accent-repressurizer-accent"
            />
            {t("settings.automationPayload.skipEmpty")}
          </label>
        </div>
        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
          {categoryOptions.map((collection) => {
            const selected = categorySelected(collection.key);
            return (
              <button
                key={collection.key}
                type="button"
                onClick={() => toggleCategory(collection.key)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                  selected
                    ? "border-repressurizer-accent/50 bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-transparent text-repressurizer-text-muted hover:border-repressurizer-border-subtle hover:text-repressurizer-text"
                }`}
              >
                <span className="truncate">{collection.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">
                  {collection.added.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
