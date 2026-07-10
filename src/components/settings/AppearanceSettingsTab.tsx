import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle,
  CloudMoon,
  Database,
  Eye,
  Funnel,
  Monitor,
  Moon,
  Palette,
  Star,
  Stack,
  Sun,
  Tag,
  Timer,
  X,
} from "@phosphor-icons/react";
import {
  ACCENT_PRESETS,
  applyAccentColor,
  applyTheme,
  useSettingsStore,
} from "../../stores/settingsStore";
import { useCategoryStore } from "../../stores/categoryStore";
import {
  CATEGORY_CHIP_PRESETS,
  categoryChipPresetSettings,
} from "../../lib/categoryChipStyles";
import { getCategoryColor } from "../../lib/categoryColors";
import {
  getLocaleDisplayName,
  getLocaleFlag,
  normalizeLocale,
  SUPPORTED_LOCALES,
  useT,
} from "../../lib/i18n";
import type { AppTheme, CategoryChipStyleSettings } from "../../lib/types";
import { CategoryChip } from "../ui/CategoryChip";
import { ToggleRow } from "./SettingsControls";

const CATEGORY_CHIP_FALLBACK_PREVIEW_SAMPLES = [
  { name: "Example", color: "#38BDF8" },
  { name: "Planning", color: "#EF4444" },
  { name: "Short tag", color: "#10B981" },
  { name: "Long category label", color: "#A78BFA" },
] as const;

export function AppearanceTab({ isSectionVisible }: { isSectionVisible: (id: string) => boolean }) {
  const {
    accentColor,
    recentAccentColors,
    showSmartLists,
    showEmptyLists,
    showNowPlaying,
    showFilterBar,
    hideCollectionOnlyGames,
    showDetailHltb,
    showDetailMetacritic,
    showDetailPrice,
    sidebarWidth,
    theme,
    language,
    categoryChipStyle,
    categoryColors,
    setSettings,
  } = useSettingsStore();
  const collections = useCategoryStore((state) => state.collections);
  const t = useT();
  const [customHex, setCustomHex] = useState(accentColor);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewAccent, setPreviewAccent] = useState(accentColor);
  const pickerRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<number | null>(null);
  const activeAccent = /^#[0-9a-fA-F]{6}$/.test(previewAccent) ? previewAccent : "#10b981";

  useEffect(() => {
    setPreviewAccent(accentColor);
    setCustomHex(accentColor);
  }, [accentColor]);

  useEffect(() => {
    return () => {
      if (previewFrameRef.current != null) cancelAnimationFrame(previewFrameRef.current);
    };
  }, []);

  const commitAccent = (hex: string, saveRecent = false) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const normalized = hex.toLowerCase();
    const nextSettings: Partial<ReturnType<typeof useSettingsStore.getState>> = { accentColor: normalized };
    if (saveRecent) {
      nextSettings.recentAccentColors = [normalized, ...(recentAccentColors ?? []).filter((c) => c !== normalized)].slice(0, 8);
    }
    setSettings(nextSettings);
    setCustomHex(normalized);
    setPreviewAccent(normalized);
    applyAccentColor(normalized);
  };

  const handlePickPreset = (hex: string) => {
    commitAccent(hex, false);
  };

  const handleCustomHex = (hex: string) => {
    setCustomHex(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const normalized = hex.toLowerCase();
      setPreviewAccent(normalized);
      applyAccentColor(normalized);
      if (previewFrameRef.current != null) cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = requestAnimationFrame(() => {
        applyAccentColor(normalized);
        previewFrameRef.current = null;
      });
    }
  };

  const closePicker = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(customHex)) {
      commitAccent(customHex, true);
    }
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const handleDown = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      closePicker();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen, customHex]);

  const handleResetColor = () => {
    setSettings({ accentColor: "" });
    applyAccentColor("");
    setCustomHex("");
    setPreviewAccent("");
  };

  const selectedChipPreset =
    CATEGORY_CHIP_PRESETS.find((preset) => preset.id === categoryChipStyle.preset) ?? CATEGORY_CHIP_PRESETS[0];
  const categoryChipPreviewSamples = useMemo(() => {
    const userSamples = collections
      .filter((collection) => !collection.is_dynamic)
      .slice(0, 4)
      .map((collection) => ({
        name: collection.name,
        color: getCategoryColor(collection, categoryColors) ?? "#38BDF8",
      }));
    return userSamples.length > 0 ? userSamples : CATEGORY_CHIP_FALLBACK_PREVIEW_SAMPLES;
  }, [categoryColors, collections]);
  const updateCategoryChipStyle = (patch: Partial<CategoryChipStyleSettings>) => {
    setSettings({ categoryChipStyle: { ...categoryChipStyle, ...patch } });
  };

  return (
    <div className="space-y-6">
      {/* Accent color */}
      {isSectionVisible("accent") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.accentColor")}</h3>
        <p className="text-xs text-repressurizer-text-faint -mt-1">{t("appearance.accentColor.desc")}</p>

        <div className="relative rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-press relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              title={accentColor || t("appearance.defaultAccent")}
              aria-label={accentColor || t("appearance.defaultAccent")}
              style={{
                background: activeAccent,
              }}
            >
              <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            </button>
            <div className="mr-1 min-w-[120px]">
              <p className="text-sm font-medium text-repressurizer-text">{accentColor ? accentColor : t("appearance.defaultAccent")}</p>
              <p className="text-[10px] text-repressurizer-text-faint">{t("appearance.accentCompact.desc")}</p>
            </div>
            {ACCENT_PRESETS.map((p) => (
              <AccentSwatch
                key={p.id}
                color={p.accent}
                label={p.label}
                active={accentColor === p.accent}
                onClick={() => handlePickPreset(p.accent)}
              />
            ))}
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className={`btn-press relative h-8 w-8 shrink-0 rounded-full transition-transform hover:scale-105 ${pickerOpen ? "ring-2 ring-white ring-offset-2 ring-offset-repressurizer-bg" : ""}`}
              title={t("appearance.pickAccentColor")}
              aria-label={t("appearance.pickAccentColor")}
              style={{
                background: "conic-gradient(from 90deg, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
              }}
            >
              <span className="absolute inset-[3px] rounded-full bg-repressurizer-bg/70" />
            </button>
            {accentColor && (
              <button
                onClick={handleResetColor}
                title={t("appearance.resetColor")}
                className="btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-repressurizer-border text-repressurizer-text-faint transition-colors hover:border-repressurizer-text-muted hover:text-repressurizer-text"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </div>
          {recentAccentColors?.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-repressurizer-border-subtle pt-3">
              <span className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">
                {t("appearance.recentColors")}
              </span>
              {recentAccentColors.map((color) => (
                <AccentSwatch
                  key={color}
                  color={color}
                  label={color}
                  active={accentColor === color}
                  onClick={() => commitAccent(color, false)}
                  small
                />
              ))}
            </div>
          )}
          {pickerOpen && (
            <div ref={pickerRef} className="absolute right-3 top-14 z-20 w-72 rounded-xl border border-repressurizer-border bg-repressurizer-surface p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              <div className="mb-3 flex items-center gap-3">
                <label className="relative block h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-repressurizer-border">
                  <span className="block h-full w-full" style={{ backgroundColor: activeAccent }} />
                  <input
                    type="color"
                    value={activeAccent}
                    onChange={(e) => handleCustomHex(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t("appearance.pickAccentColor")}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-repressurizer-text">{t("appearance.customAccent")}</p>
                  <p className="mt-0.5 text-xs text-repressurizer-text-faint">{t("appearance.customAccent.desc")}</p>
                </div>
              </div>
              <label className="mb-1.5 block text-xs text-repressurizer-text-muted">{t("appearance.hexValue")}</label>
              <input
                type="text"
                value={customHex}
                onChange={(e) => handleCustomHex(e.target.value)}
                placeholder="#10b981"
                maxLength={7}
                className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 font-mono text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
              />
              <button
                onClick={closePicker}
                className="mt-3 w-full rounded-lg bg-repressurizer-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
              >
                {t("common.done")}
              </button>
              {accentColor && (
                <button
                  onClick={handleResetColor}
                  className="mt-3 w-full rounded-lg border border-repressurizer-border px-3 py-2 text-xs text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
                >
                  {t("appearance.resetColor")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Category chip style */}
      {isSectionVisible("categoryChips") && (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.categoryChips")}</h3>
            <p className="mt-1 text-xs text-repressurizer-text-faint">{t("appearance.categoryChips.desc")}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted">
            <Tag size={12} weight="duotone" />
            {selectedChipPreset.label}
          </span>
        </div>

        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-repressurizer-text">{t("appearance.categoryChips.preview")}</p>
              <p className="mt-0.5 text-[10px] text-repressurizer-text-faint">{selectedChipPreset.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ categoryChipStyle: categoryChipPresetSettings(categoryChipStyle.preset) })}
              className="btn-press shrink-0 rounded-lg border border-repressurizer-border px-2 py-1 text-[10px] font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-text-muted hover:text-repressurizer-text"
            >
              {t("appearance.categoryChips.resetPreset")}
            </button>
          </div>
          <div className="mt-3 flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2.5 py-2">
            {categoryChipPreviewSamples.map((sample, index) => (
              <CategoryChip
                key={`${sample.name}-${index}`}
                name={sample.name}
                color={sample.color}
                settings={categoryChipStyle}
                forceShowRemove
                removeLabel={t("statusbar.removeFrom", { name: sample.name })}
                onRemove={(event) => event.preventDefault()}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{t("appearance.categoryChips.presets")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORY_CHIP_PRESETS.map((preset) => {
              const active = preset.id === categoryChipStyle.preset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSettings({ categoryChipStyle: categoryChipPresetSettings(preset.id) })}
                  className={`btn-press rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-repressurizer-accent bg-repressurizer-accent/10"
                      : "border-repressurizer-border-subtle bg-repressurizer-bg hover:border-repressurizer-border"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <CategoryChip
                      name={preset.label}
                      color="#38BDF8"
                      settings={preset.settings}
                    />
                  </div>
                  <p className={`text-xs font-medium ${active ? "text-repressurizer-accent" : "text-repressurizer-text"}`}>
                    {preset.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-repressurizer-text-faint">{preset.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{t("appearance.categoryChips.custom")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChipSettingSlider
              label={t("appearance.categoryChips.fillOpacity")}
              value={categoryChipStyle.fillOpacity}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateCategoryChipStyle({ fillOpacity: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.borderOpacity")}
              value={categoryChipStyle.borderOpacity}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateCategoryChipStyle({ borderOpacity: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.borderWidth")}
              value={categoryChipStyle.borderWidth}
              min={0}
              max={3}
              suffix="px"
              onChange={(value) => updateCategoryChipStyle({ borderWidth: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.cornerRadius")}
              value={categoryChipStyle.radius >= 900 ? 30 : categoryChipStyle.radius}
              min={0}
              max={30}
              suffix="px"
              onChange={(value) => updateCategoryChipStyle({ radius: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.height")}
              value={categoryChipStyle.height}
              min={16}
              max={28}
              suffix="px"
              onChange={(value) => updateCategoryChipStyle({ height: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.fontSize")}
              value={categoryChipStyle.fontSize}
              min={9}
              max={13}
              suffix="px"
              onChange={(value) => updateCategoryChipStyle({ fontSize: value })}
            />
            <ChipSettingSlider
              label={t("appearance.categoryChips.maxWidth")}
              value={categoryChipStyle.maxWidth}
              min={56}
              max={180}
              suffix="px"
              onChange={(value) => updateCategoryChipStyle({ maxWidth: value })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleRow
              icon={<Palette size={15} weight="duotone" />}
              label={t("appearance.categoryChips.coloredText")}
              description={t("appearance.categoryChips.coloredText.desc")}
              checked={categoryChipStyle.coloredText}
              onChange={(value) => updateCategoryChipStyle({ coloredText: value })}
            />
            <ToggleRow
              icon={<X size={15} weight="duotone" />}
              label={t("appearance.categoryChips.removeButton")}
              description={t("appearance.categoryChips.removeButton.desc")}
              checked={categoryChipStyle.showRemoveButton}
              onChange={(value) => updateCategoryChipStyle({ showRemoveButton: value })}
            />
          </div>
        </div>
      </div>
      )}

      {/* UI visibility */}
      {isSectionVisible("visibility") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.visibility")}</h3>
        <ToggleRow
          icon={<Stack size={15} weight="duotone" />}
          label={t("appearance.smartLists")}
          description={t("appearance.smartLists.desc")}
          checked={showSmartLists}
          onChange={(v) => setSettings({ showSmartLists: v })}
        />
        <ToggleRow
          icon={<Eye size={15} weight="duotone" />}
          label={t("appearance.emptyLists")}
          description={t("appearance.emptyLists.desc")}
          checked={showEmptyLists}
          onChange={(v) => setSettings({ showEmptyLists: v })}
        />
        <ToggleRow
          icon={<Monitor size={15} weight="duotone" />}
          label={t("appearance.nowPlaying")}
          description={t("appearance.nowPlaying.desc")}
          checked={showNowPlaying}
          onChange={(v) => setSettings({ showNowPlaying: v })}
        />
        <ToggleRow
          icon={<Funnel size={15} weight="duotone" />}
          label={t("appearance.filterBar")}
          description={t("appearance.filterBar.desc")}
          checked={showFilterBar}
          onChange={(v) => setSettings({ showFilterBar: v })}
        />
        <ToggleRow
          icon={<Database size={15} weight="duotone" />}
          label={t("appearance.hideCollectionOnly")}
          description={t("appearance.hideCollectionOnly.desc")}
          checked={hideCollectionOnlyGames}
          onChange={(v) => setSettings({ hideCollectionOnlyGames: v })}
        />
        <ToggleRow
          icon={<Timer size={15} weight="duotone" />}
          label={t("appearance.detailHltb")}
          description={t("appearance.detailHltb.desc")}
          checked={showDetailHltb}
          onChange={(v) => setSettings({ showDetailHltb: v })}
        />
        <ToggleRow
          icon={<Star size={15} weight="duotone" />}
          label={t("appearance.detailMetacritic")}
          description={t("appearance.detailMetacritic.desc")}
          checked={showDetailMetacritic}
          onChange={(v) => setSettings({ showDetailMetacritic: v })}
        />
        <ToggleRow
          icon={<Database size={15} weight="duotone" />}
          label={t("appearance.detailPrice")}
          description={t("appearance.detailPrice.desc")}
          checked={showDetailPrice}
          onChange={(v) => setSettings({ showDetailPrice: v })}
        />
      </div>
      )}

      {/* Theme */}
      {isSectionVisible("theme") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.theme")}</h3>
        <div className="flex gap-2">
          {([
            { value: "dark", label: t("appearance.theme.dark"), icon: <Moon size={16} weight="duotone" /> },
            { value: "dim", label: t("appearance.theme.dim"), icon: <CloudMoon size={16} weight="duotone" /> },
            { value: "light", label: t("appearance.theme.light"), icon: <Sun size={16} weight="duotone" /> },
          ] as { value: AppTheme; label: string; icon: ReactNode }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setSettings({ theme: opt.value });
                applyTheme(opt.value);
              }}
              className={`btn-press flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                (theme ?? "dark") === opt.value
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Language */}
      {isSectionVisible("language") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.language")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => setSettings({ language: locale })}
              className={`btn-press flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-all ${
                normalizeLocale(language) === locale
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">{getLocaleFlag(locale)}</span>
              <span className="truncate">{getLocaleDisplayName(locale, normalizeLocale(language))}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Sidebar width */}
      {isSectionVisible("sidebar") && (
      <div className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("appearance.sidebarWidth")}</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={160}
            max={400}
            step={8}
            value={sidebarWidth}
            onChange={(e) => setSettings({ sidebarWidth: Number(e.target.value) })}
            className="flex-1 accent-[var(--color-repressurizer-accent)]"
          />
          <span className="w-14 text-right font-mono text-sm tabular-nums text-repressurizer-text-muted">
            {sidebarWidth}px
          </span>
        </div>
        <p className="text-xs text-repressurizer-text-faint">{t("appearance.sidebarWidth.desc")}</p>
      </div>
      )}

    </div>
  );
}

function AccentSwatch({
  color,
  label,
  active,
  onClick,
  small = false,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`btn-press relative shrink-0 rounded-full transition-transform hover:scale-105 ${
        small ? "h-6 w-6" : "h-8 w-8"
      } ${active ? "ring-2 ring-white ring-offset-2 ring-offset-repressurizer-bg" : ""}`}
      style={{ backgroundColor: color }}
    >
      {active && (
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <CheckCircle size={small ? 10 : 13} weight="fill" />
        </span>
      )}
    </button>
  );
}

function ChipSettingSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs text-repressurizer-text-muted">
        <span className="truncate">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-repressurizer-text-faint">
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-repressurizer-accent)]"
      />
    </label>
  );
}
