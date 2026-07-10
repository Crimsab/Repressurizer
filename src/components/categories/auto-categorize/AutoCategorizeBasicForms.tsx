import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { hltbModeLabel, HLTB_TIME_MODES } from "../../../lib/hltb";
import { hltbModeForConfig } from "../../../lib/hltbCategorizer";
import type {
  DevPubConfig,
  FlagsConfig,
  GenreConfig,
  HoursConfig,
  LanguageConfig,
  NameConfig,
  PlatformConfig,
  TagsConfig,
  YearConfig,
  YearGrouping,
} from "../../../lib/tauri";
import type { HltbTimeMode } from "../../../lib/types";
import { useT } from "../../../lib/i18n";
import { SelectMenu } from "../../ui/SelectMenu";
import type { AutoCatMetadata } from "./autoCategorizeModel";
import {
  CheckboxRow,
  MetadataStatus,
  TagListInput,
} from "./AutoCategorizeFormControls";

export function PrefixInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
        {t("auto.categoryPrefix")} <span className="normal-case text-repressurizer-text-faint/60">{t("auto.optional")}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("auto.prefixPlaceholder")}
        className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
      />
    </div>
  );
}

export function HoursConfigForm({
  config,
  onChange,
  label,
  showHltbMode = false,
  showHltbUnknown = false,
}: {
  config: HoursConfig;
  onChange: (c: HoursConfig) => void;
  label?: string;
  showHltbMode?: boolean;
  showHltbUnknown?: boolean;
}) {
  const t = useT();
  const updateRule = (i: number, field: string, val: string) => {
    const rules = config.rules.map((r, idx) =>
      idx === i ? { ...r, [field]: field === "name" ? val : parseFloat(val) || 0 } : r
    );
    onChange({ ...config, rules });
  };
  const addRule = () => onChange({ ...config, rules: [...config.rules, { name: t("auto.newBucket"), min_hours: 0, max_hours: 0 }] });
  const removeRule = (i: number) => onChange({ ...config, rules: config.rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      {showHltbMode && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
            {t("auto.hltbTimeType")}
          </label>
          <SelectMenu<HltbTimeMode>
            ariaLabel={t("auto.hltbTimeType")}
            value={hltbModeForConfig(config)}
            onChange={(mode) => onChange({ ...config, hltb_time_mode: mode })}
            size="sm"
            className="w-full"
            options={HLTB_TIME_MODES.map((mode) => ({
              value: mode,
              label: hltbModeLabel(mode),
            }))}
          />
        </div>
      )}
      {showHltbUnknown && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/70 p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(config.include_unknown)}
              onChange={(e) => onChange({ ...config, include_unknown: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-repressurizer-border bg-repressurizer-bg text-repressurizer-accent focus:ring-repressurizer-accent"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-repressurizer-text">
                {t("auto.includeUnknownHltb")}
              </span>
              <input
                type="text"
                value={config.unknown_text ?? "HLTB: Unknown"}
                onChange={(e) => onChange({ ...config, unknown_text: e.target.value })}
                disabled={!config.include_unknown}
                placeholder={t("auto.unknownHltbName")}
                className="mt-2 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t("auto.unknownHltbName")}
              />
            </span>
          </label>
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{label ?? t("auto.timeBuckets")}</label>
          <button onClick={addRule} className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent/15 px-2 py-1 text-xs text-repressurizer-accent hover:bg-repressurizer-accent/25">
            <Plus size={11} weight="bold" /> {t("auto.add")}
          </button>
        </div>
        <div className="space-y-2">
          {config.rules.map((rule, i) => (
            <div key={i} className="flex gap-2">
              <input value={rule.name} onChange={(e) => updateRule(i, "name", e.target.value)} className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none" placeholder={t("auto.name")} />
              <input type="number" value={rule.min_hours} onChange={(e) => updateRule(i, "min_hours", e.target.value)} className="w-20 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder={t("auto.min")} />
              <input type="number" value={rule.max_hours} onChange={(e) => updateRule(i, "max_hours", e.target.value)} className="w-24 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono" placeholder={t("auto.maxOpenPlaceholder")} />
              <button onClick={() => removeRule(i)} className="btn-press flex items-center justify-center w-8 h-8 rounded-lg text-repressurizer-danger/60 hover:text-repressurizer-danger hover:bg-repressurizer-danger/10">
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-repressurizer-text-faint">{t("auto.maxOpenHint")}</p>
      </div>
    </div>
  );
}

export function GenreConfigForm({
  config,
  onChange,
  suggestions,
}: {
  config: GenreConfig;
  onChange: (c: GenreConfig) => void;
  suggestions: string[];
}) {
  const t = useT();
  const [newIgnored, setNewIgnored] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.maxCategories")}</label>
        <input
          type="number"
          min={1}
          value={config.max_categories ?? ""}
          onChange={(e) => onChange({ ...config, max_categories: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-32 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.ignoredGenres")}
        items={config.ignored_genres}
        newItem={newIgnored}
        setNewItem={setNewIgnored}
        onAddItem={(value) => onChange({ ...config, ignored_genres: [...config.ignored_genres, value] })}
        onRemove={(v) => onChange({ ...config, ignored_genres: config.ignored_genres.filter((g) => g !== v) })}
        suggestions={suggestions}
      />
    </div>
  );
}

export function TagsConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: TagsConfig;
  onChange: (c: TagsConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newTag, setNewTag] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.maxTags")}</label>
        <input
          type="number"
          min={1}
          value={config.max_tags ?? ""}
          onChange={(e) => onChange({ ...config, max_tags: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-32 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeTags")}
        items={config.included_tags}
        newItem={newTag}
        setNewItem={setNewTag}
        onAddItem={(value) => onChange({ ...config, included_tags: [...config.included_tags, value] })}
        onRemove={(v) => onChange({ ...config, included_tags: config.included_tags.filter((t) => t !== v) })}
        suggestions={suggestions}
      />
      <MetadataStatus label={t("detail.tags")} valueCount={suggestions.length} gameCount={metadata.gamesWithTags} totalDetails={metadata.totalDetails} />
    </div>
  );
}

export function YearConfigForm({ config, onChange }: { config: YearConfig; onChange: (c: YearConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("auto.grouping")}</label>
        <div className="flex gap-2">
          {(["None", "HalfDecade", "Decade"] as YearGrouping[]).map((g) => (
            <button
              key={g}
              onClick={() => onChange({ ...config, grouping: g })}
              className={`btn-press rounded-xl border px-4 py-2 text-sm transition-colors ${
                config.grouping === g
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:border-repressurizer-border"
              }`}
            >
              {g === "None" ? t("auto.group.year") : g === "HalfDecade" ? t("auto.group.halfDecade") : t("auto.group.decade")}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.include_unknown}
          onChange={(e) => onChange({ ...config, include_unknown: e.target.checked })}
          className="h-4 w-4 rounded border-repressurizer-border bg-repressurizer-bg accent-repressurizer-accent"
        />
        <span className="text-sm text-repressurizer-text">{t("auto.includeUnknownYear")}</span>
      </label>
    </div>
  );
}

export function DevPubConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: DevPubConfig;
  onChange: (c: DevPubConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newName, setNewName] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckboxRow
          label={t("auto.developers")}
          checked={config.include_developers}
          onChange={(checked) => onChange({ ...config, include_developers: checked })}
        />
        <CheckboxRow
          label={t("auto.publishers")}
          checked={config.include_publishers}
          onChange={(checked) => onChange({ ...config, include_publishers: checked })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.minimumGames")}
        </label>
        <input
          type="number"
          min={1}
          value={config.min_games ?? ""}
          onChange={(e) => onChange({ ...config, min_games: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.noMinimum")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeStudios")}
        items={config.selected}
        newItem={newName}
        setNewItem={setNewName}
        onAddItem={(value) => onChange({ ...config, selected: [...config.selected, value] })}
        onRemove={(value) => onChange({ ...config, selected: config.selected.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.studios")} valueCount={suggestions.length} gameCount={metadata.gamesWithStudios} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

export function FlagsConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: FlagsConfig;
  onChange: (c: FlagsConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newFlag, setNewFlag] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.maxFlags")}
        </label>
        <input
          type="number"
          min={1}
          value={config.max_flags ?? ""}
          onChange={(e) => onChange({ ...config, max_flags: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeFlags")}
        items={config.included_flags}
        newItem={newFlag}
        setNewItem={setNewFlag}
        onAddItem={(value) => onChange({ ...config, included_flags: [...config.included_flags, value] })}
        onRemove={(value) => onChange({ ...config, included_flags: config.included_flags.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.flags")} valueCount={suggestions.length} gameCount={metadata.gamesWithFlags} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

export function LanguageConfigForm({
  config,
  onChange,
  suggestions,
  metadata,
}: {
  config: LanguageConfig;
  onChange: (c: LanguageConfig) => void;
  suggestions: string[];
  metadata: AutoCatMetadata;
}) {
  const t = useT();
  const [newLanguage, setNewLanguage] = useState("");
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
          {t("auto.maxLanguages")}
        </label>
        <input
          type="number"
          min={1}
          value={config.max_languages ?? ""}
          onChange={(e) => onChange({ ...config, max_languages: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder={t("auto.unlimited")}
          className="w-36 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-sm text-repressurizer-text focus:border-repressurizer-accent focus:outline-none font-mono"
        />
      </div>
      <TagListInput
        label={t("auto.includeLanguages")}
        items={config.included_languages}
        newItem={newLanguage}
        setNewItem={setNewLanguage}
        onAddItem={(value) => onChange({ ...config, included_languages: [...config.included_languages, value] })}
        onRemove={(value) => onChange({ ...config, included_languages: config.included_languages.filter((item) => item !== value) })}
        suggestions={suggestions}
        status={<MetadataStatus label={t("auto.languages")} valueCount={suggestions.length} gameCount={metadata.gamesWithLanguages} totalDetails={metadata.totalDetails} />}
      />
    </div>
  );
}

export function PlatformConfigForm({ config, onChange }: { config: PlatformConfig; onChange: (c: PlatformConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <CheckboxRow
          label={t("auto.platform.windows")}
          checked={config.include_windows}
          onChange={(checked) => onChange({ ...config, include_windows: checked })}
        />
        <CheckboxRow
          label={t("auto.platform.mac")}
          checked={config.include_mac}
          onChange={(checked) => onChange({ ...config, include_mac: checked })}
        />
        <CheckboxRow
          label={t("auto.platform.linux")}
          checked={config.include_linux}
          onChange={(checked) => onChange({ ...config, include_linux: checked })}
        />
      </div>
    </div>
  );
}

export function NameConfigForm({ config, onChange }: { config: NameConfig; onChange: (c: NameConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <PrefixInput value={config.prefix ?? ""} onChange={(v) => onChange({ ...config, prefix: v })} />
      <div className="grid gap-2">
        <CheckboxRow
          label={t("auto.ignoreLeadingThe")}
          checked={config.skip_leading_the}
          onChange={(checked) => onChange({ ...config, skip_leading_the: checked })}
        />
        <CheckboxRow
          label={t("auto.groupNumbers")}
          checked={config.group_numbers}
          onChange={(checked) => onChange({ ...config, group_numbers: checked })}
        />
        <CheckboxRow
          label={t("auto.groupOther")}
          checked={config.group_other}
          onChange={(checked) => onChange({ ...config, group_other: checked })}
        />
      </div>
    </div>
  );
}
