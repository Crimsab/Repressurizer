import {
  ArrowLeft,
  ArrowRight,
  CopySimple,
  FloppyDisk,
  Warning,
} from "@phosphor-icons/react";
import type { CustomAutoCatConfigV1 } from "../../lib/customAutoCategorize";
import type {
  DevPubConfig,
  FlagsConfig,
  GenreConfig,
  HoursConfig,
  LanguageConfig,
  NameConfig,
  PlatformConfig,
  SteamRatingConfig,
  TagsConfig,
  YearConfig,
} from "../../lib/tauri";
import type { SteamCollection } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { CustomRuleBuilder } from "./CustomRuleBuilder";
import type {
  AutoCatMetadata,
  CategorizerType,
} from "./autoCategorizeModel";
import {
  DevPubConfigForm,
  FlagsConfigForm,
  GenreConfigForm,
  HoursConfigForm,
  LanguageConfigForm,
  NameConfigForm,
  PlatformConfigForm,
  TagsConfigForm,
  YearConfigForm,
} from "./AutoCategorizeBasicForms";
import { SteamRatingConfigForm } from "./SteamRatingConfigForm";

export function ConfigureStep({
  type, hoursConfig, setHoursConfig, genreConfig, setGenreConfig,
  tagsConfig, setTagsConfig, yearConfig, setYearConfig,
  devPubConfig, setDevPubConfig, flagsConfig, setFlagsConfig,
  languageConfig, setLanguageConfig,
  platformConfig, setPlatformConfig, nameConfig, setNameConfig,
  ratingConfig, setRatingConfig,
  hltbConfig, setHltbConfig, customConfig, setCustomConfig, collections, metadata, presetName, setPresetName, onSavePreset,
  loadedPresetId, error, onBack, onNext, onCachedOnly, cachedOnlyAvailable, cachedOnlyMissingCount,
}: {
  type: CategorizerType;
  hoursConfig: HoursConfig; setHoursConfig: (c: HoursConfig) => void;
  genreConfig: GenreConfig; setGenreConfig: (c: GenreConfig) => void;
  tagsConfig: TagsConfig; setTagsConfig: (c: TagsConfig) => void;
  yearConfig: YearConfig; setYearConfig: (c: YearConfig) => void;
  devPubConfig: DevPubConfig; setDevPubConfig: (c: DevPubConfig) => void;
  flagsConfig: FlagsConfig; setFlagsConfig: (c: FlagsConfig) => void;
  languageConfig: LanguageConfig; setLanguageConfig: (c: LanguageConfig) => void;
  platformConfig: PlatformConfig; setPlatformConfig: (c: PlatformConfig) => void;
  nameConfig: NameConfig; setNameConfig: (c: NameConfig) => void;
  ratingConfig: SteamRatingConfig; setRatingConfig: (c: SteamRatingConfig) => void;
  hltbConfig: HoursConfig; setHltbConfig: (c: HoursConfig) => void;
  customConfig: CustomAutoCatConfigV1; setCustomConfig: (c: CustomAutoCatConfigV1) => void;
  collections: SteamCollection[];
  metadata: AutoCatMetadata;
  presetName: string;
  setPresetName: (name: string) => void;
  onSavePreset: () => void;
  loadedPresetId: string | null;
  error: string;
  onBack: () => void;
  onNext: () => void;
  onCachedOnly: () => void;
  cachedOnlyAvailable: boolean;
  cachedOnlyMissingCount: number;
}) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.preset.saved")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={t("auto.presetName")}
            className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onSavePreset}
            className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-2 text-sm font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
          >
            <FloppyDisk size={14} weight="duotone" />
            {loadedPresetId ? t("auto.update") : t("auto.save")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-repressurizer-danger/20 bg-repressurizer-danger/8 p-3 text-sm text-repressurizer-danger">
          <Warning size={16} weight="fill" />
          {error}
        </div>
      )}

      {type === "hours" && <HoursConfigForm config={hoursConfig} onChange={setHoursConfig} />}
      {type === "genre" && <GenreConfigForm config={genreConfig} onChange={setGenreConfig} suggestions={metadata.genreValues} />}
      {type === "tags" && <TagsConfigForm config={tagsConfig} onChange={setTagsConfig} suggestions={metadata.tagValues} metadata={metadata} />}
      {type === "year" && <YearConfigForm config={yearConfig} onChange={setYearConfig} />}
      {type === "hltb" && <HoursConfigForm config={hltbConfig} onChange={setHltbConfig} label={t("auto.hltbBuckets")} showHltbMode showHltbUnknown />}
      {type === "devpub" && <DevPubConfigForm config={devPubConfig} onChange={setDevPubConfig} suggestions={metadata.studioValues} metadata={metadata} />}
      {type === "flags" && <FlagsConfigForm config={flagsConfig} onChange={setFlagsConfig} suggestions={metadata.flagValues} metadata={metadata} />}
      {type === "language" && <LanguageConfigForm config={languageConfig} onChange={setLanguageConfig} suggestions={metadata.languageValues} metadata={metadata} />}
      {type === "platform" && <PlatformConfigForm config={platformConfig} onChange={setPlatformConfig} />}
      {type === "name" && <NameConfigForm config={nameConfig} onChange={setNameConfig} />}
      {type === "rating" && <SteamRatingConfigForm config={ratingConfig} onChange={setRatingConfig} />}
      {type === "custom" && <CustomRuleBuilder config={customConfig} onChange={setCustomConfig} collections={collections} />}
      {type === "score" && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4 text-sm text-repressurizer-text-muted">
          <p className="font-medium text-repressurizer-text mb-2">{t("auto.metacriticBuckets")}</p>
          <div className="space-y-1.5 text-xs">
            {[
              { name: "Must-Play", range: "90-100" },
              { name: "Great", range: "75-89" },
              { name: "Good", range: "60-74" },
              { name: "Mixed", range: "40-59" },
              { name: "Poor", range: "0-39" },
            ].map((r) => (
              <div key={r.name} className="flex justify-between">
                <span className="text-repressurizer-text">{r.name}</span>
                <span className="font-mono text-repressurizer-accent">{r.range}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-repressurizer-text-faint">{t("auto.metacriticSkipped")}</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover">
          <ArrowLeft size={14} />
          {t("auto.back")}
        </button>
        <div className="flex items-center gap-2">
          {cachedOnlyAvailable && (
            <button
              onClick={onCachedOnly}
              className="btn-press inline-flex items-center gap-1.5 rounded-xl border border-repressurizer-border bg-repressurizer-surface px-4 py-2 text-sm font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
              title={t("auto.cachedOnlyTooltip", { count: cachedOnlyMissingCount })}
            >
              <CopySimple size={14} />
              {t("auto.runCachedOnly")}
            </button>
          )}
          <button onClick={onNext} className="btn-press inline-flex items-center gap-1.5 rounded-xl bg-repressurizer-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover">
            {t("auto.run")}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-forms ----
