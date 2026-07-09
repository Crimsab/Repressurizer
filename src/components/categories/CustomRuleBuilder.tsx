import { useMemo, type ReactNode } from "react";
import { Trash, CopySimple, Funnel, Warning, Plus } from "@phosphor-icons/react";
import {
  customConditionId,
  type CategoryRef,
  type CustomAutoCatConfigV1,
  type CustomCategoryCondition,
  type CustomConditionBase,
  type CustomHltbCondition,
  type CustomMetadataTextCondition,
  type CustomNumericMetadataCondition,
  type CustomPlatformCondition,
  type CustomPlaytimeCondition,
  type CustomRuleConditionV1,
  type CustomSpecialCondition,
  type CustomTitleCondition,
} from "../../lib/customAutoCategorize";
import { hltbModeLabel, HLTB_TIME_MODES } from "../../lib/hltb";
import type { HltbTimeMode, SteamCollection } from "../../lib/types";
import { SelectMenu } from "../ui/SelectMenu";
import { useT } from "../../lib/i18n";

interface CustomRuleBuilderProps {
  config: CustomAutoCatConfigV1;
  onChange: (config: CustomAutoCatConfigV1) => void;
  collections: SteamCollection[];
}

type AddConditionKind =
  | "category"
  | "special"
  | "title"
  | "playtime"
  | "hltb"
  | "metadataText"
  | "platform"
  | "metadataNumber";
type AddConditionMenuValue = AddConditionKind | "__add";

const ADD_CONDITION_OPTIONS: Array<{ value: AddConditionKind; label: string; description: string }> = [
  { value: "category", label: "Category membership", description: "In, require, or exclude user categories" },
  { value: "special", label: "Special list", description: "Hidden, favorite, or uncategorized" },
  { value: "title", label: "Title", description: "Starts with, contains, or regex" },
  { value: "playtime", label: "Steam playtime", description: "Hours played range" },
  { value: "hltb", label: "HLTB duration", description: "HowLongToBeat range" },
  { value: "metadataText", label: "Store metadata", description: "Genre, tag, flag, language, studio" },
  { value: "platform", label: "Platform support", description: "Windows, macOS, Linux" },
  { value: "metadataNumber", label: "Numeric metadata", description: "Year, Metacritic, Steam reviews" },
];
const ADD_CONDITION_MENU_OPTIONS: Array<{ value: AddConditionMenuValue; label: string; description?: string; disabled?: boolean }> = [
  { value: "__add", label: "Add condition", disabled: true },
  ...ADD_CONDITION_OPTIONS,
];

export function CustomRuleBuilder({ config, onChange, collections }: CustomRuleBuilderProps) {
  const t = useT();
  const categoryOptions = useMemo(
    () => collections.filter((collection) => !collection.is_dynamic && !isSpecialCollection(collection)),
    [collections]
  );
  const staleRefs = useMemo(() => {
    const keys = new Set(collections.map((collection) => collection.key));
    return config.logic.conditions
      .filter((condition): condition is CustomCategoryCondition => condition.kind === "category")
      .flatMap((condition) => condition.categories)
      .filter((category) => !keys.has(category.key));
  }, [collections, config.logic.conditions]);

  const update = (patch: Partial<CustomAutoCatConfigV1>) => onChange({ ...config, ...patch });
  const updateOutputName = (categoryName: string) => update({ output: { categoryName } });
  const updateConditions = (conditions: CustomRuleConditionV1[]) =>
    update({ logic: { ...config.logic, conditions } });
  const updateCondition = (id: string, next: CustomRuleConditionV1) =>
    updateConditions(config.logic.conditions.map((condition) => (condition.id === id ? next : condition)));
  const removeCondition = (id: string) =>
    updateConditions(config.logic.conditions.filter((condition) => condition.id !== id));
  const duplicateCondition = (condition: CustomRuleConditionV1) =>
    updateConditions([...config.logic.conditions, { ...condition, id: customConditionId() }]);
  const addCondition = (kind: AddConditionKind) =>
    updateConditions([...config.logic.conditions, defaultCondition(kind)]);

  const applyTemplate = (template: "short" | "category" | "uncategorized" | "title") => {
    if (template === "short") {
      onChange({
        ...config,
        output: { categoryName: config.output.categoryName || "Short games" },
        logic: {
          op: "all",
          conditions: [defaultHltbCondition({ maxHoursExclusive: 15 })],
        },
      });
    } else if (template === "category") {
      onChange({
        ...config,
        output: { categoryName: config.output.categoryName || "In category but not Backlog" },
        logic: {
          op: "all",
          conditions: [
            defaultCategoryCondition("inAny"),
            defaultCategoryCondition("notIn"),
          ],
        },
      });
    } else if (template === "uncategorized") {
      onChange({
        ...config,
        output: { categoryName: config.output.categoryName || "Uncategorized short games" },
        logic: {
          op: "all",
          conditions: [
            defaultSpecialCondition("uncategorized", "require"),
            defaultHltbCondition({ maxHoursExclusive: 15 }),
          ],
        },
      });
    } else {
      onChange({
        ...config,
        output: { categoryName: config.output.categoryName || "Title starts with A" },
        logic: {
          op: "all",
          conditions: [defaultTitleCondition("startsWith", "A")],
        },
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              Result category
            </label>
            <input
              value={config.output.categoryName}
              onChange={(event) => updateOutputName(event.target.value)}
              placeholder={t("auto.custom.resultPlaceholder")}
              className="h-9 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              Quick starts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["short", "Short HLTB"],
                ["category", "In / not in"],
                ["uncategorized", "Uncategorized short"],
                ["title", "Title starts"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyTemplate(value)}
                  className="btn-press rounded-md border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-repressurizer-text-faint">
          Apply replaces only this category; games skipped because cache is missing are preserved.
        </p>
      </div>

      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-repressurizer-text">{t("auto.custom.conditions")}</p>
            <p className="text-xs text-repressurizer-text-faint">{t("auto.custom.conditionsDesc")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Plus size={14} weight="bold" className="text-repressurizer-accent" />
            <SelectMenu<AddConditionMenuValue>
              value="__add"
              options={ADD_CONDITION_MENU_OPTIONS}
              onChange={(kind) => {
                if (kind !== "__add") addCondition(kind);
              }}
              ariaLabel="Add custom condition"
              size="sm"
              align="right"
              buttonClassName="min-w-40 border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent"
            />
          </div>
        </div>

        {staleRefs.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Warning size={14} weight="duotone" className="mt-0.5 shrink-0" />
            <span>Remove missing categories before running: {staleRefs.map((ref) => ref.nameSnapshot || ref.key).join(", ")}</span>
          </div>
        )}

        {config.logic.conditions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-repressurizer-border bg-repressurizer-surface px-3 py-4 text-sm text-repressurizer-text-faint">
            <Funnel size={16} weight="duotone" />
            Add a condition or pick a template.
          </div>
        ) : (
          <div className="space-y-2">
            {config.logic.conditions.map((condition) => (
              <ConditionRow
                key={condition.id}
                condition={condition}
                categories={categoryOptions}
                onChange={(next) => updateCondition(condition.id, next)}
                onDuplicate={() => duplicateCondition(condition)}
                onRemove={() => removeCondition(condition.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  categories,
  onChange,
  onDuplicate,
  onRemove,
}: {
  condition: CustomRuleConditionV1;
  categories: SteamCollection[];
  onChange: (condition: CustomRuleConditionV1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-repressurizer-accent/10 px-2 py-0.5 text-[11px] font-semibold text-repressurizer-accent">
          {conditionLabel(condition.kind)}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-repressurizer-text-faint">
          <input
            type="checkbox"
            checked={condition.enabled !== false}
            onChange={(event) => onChange({ ...condition, enabled: event.target.checked } as CustomRuleConditionV1)}
            className="h-3.5 w-3.5 accent-repressurizer-accent"
          />
          Enabled
        </label>
        <button type="button" onClick={onDuplicate} className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-repressurizer-text" title={t("auto.custom.duplicate")} aria-label={t("auto.custom.duplicate")}>
          <CopySimple size={13} />
        </button>
        <button type="button" onClick={onRemove} className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-danger/70 hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger" title={t("auto.custom.delete")} aria-label={t("auto.custom.delete")}>
          <Trash size={13} />
        </button>
      </div>

      {condition.kind === "category" && (
        <CategoryConditionEditor condition={condition} categories={categories} onChange={onChange} />
      )}
      {condition.kind === "special" && (
        <SpecialConditionEditor condition={condition} onChange={onChange} />
      )}
      {condition.kind === "title" && (
        <TitleConditionEditor condition={condition} onChange={onChange} />
      )}
      {condition.kind === "playtime" && (
        <RangeConditionEditor label={t("auto.custom.steamPlaytime")} condition={condition} onChange={onChange} />
      )}
      {condition.kind === "hltb" && (
        <HltbConditionEditor condition={condition} onChange={onChange} />
      )}
      {condition.kind === "metadataText" && (
        <MetadataTextConditionEditor condition={condition} onChange={onChange} />
      )}
      {condition.kind === "platform" && (
        <PlatformConditionEditor condition={condition} onChange={onChange} />
      )}
      {condition.kind === "metadataNumber" && (
        <MetadataNumberConditionEditor condition={condition} onChange={onChange} />
      )}
    </div>
  );
}

function CategoryConditionEditor({
  condition,
  categories,
  onChange,
}: {
  condition: CustomCategoryCondition;
  categories: SteamCollection[];
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  const t = useT();
  const selected = new Set(condition.categories.map((category) => category.key));
  const toggle = (category: SteamCollection) => {
    const ref: CategoryRef = { key: category.key, nameSnapshot: category.name };
    const categories = selected.has(category.key)
      ? condition.categories.filter((item) => item.key !== category.key)
      : [...condition.categories, ref];
    onChange({ ...condition, categories });
  };
  return (
    <div className="grid items-start gap-2 lg:grid-cols-[180px_minmax(0,1fr)]">
      <SelectMenu<CustomCategoryCondition["mode"]>
        label={t("auto.custom.match")}
        value={condition.mode}
        options={[
          { value: "inAny", label: "in any of" },
          { value: "inAll", label: "in all of" },
          { value: "notIn", label: "not in" },
        ]}
        onChange={(mode) => onChange({ ...condition, mode })}
        size="sm"
      />
      <div>
        <FieldLabel>{t("auto.custom.categories")}</FieldLabel>
        <div className="flex min-h-8 max-h-24 flex-wrap content-start gap-1.5 overflow-auto rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2 py-1.5">
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              onClick={() => toggle(category)}
              className={`btn-press rounded-md border px-2 py-0.5 text-xs transition-colors ${
                selected.has(category.key)
                  ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                  : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border hover:text-repressurizer-text"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpecialConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomSpecialCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectMenu<CustomSpecialCondition["field"]>
        value={condition.field}
        options={[
          { value: "hidden", label: "Hidden" },
          { value: "favorite", label: "Favorite" },
          { value: "uncategorized", label: "Uncategorized" },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <SelectMenu<CustomSpecialCondition["state"]>
        value={condition.state}
        options={[
          { value: "require", label: "require" },
          { value: "exclude", label: "exclude" },
        ]}
        onChange={(state) => onChange({ ...condition, state })}
        size="sm"
      />
    </div>
  );
}

function TitleConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomTitleCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
      <SelectMenu<CustomTitleCondition["op"]>
        value={condition.op}
        options={[
          { value: "startsWith", label: "starts with" },
          { value: "contains", label: "contains" },
          { value: "regex", label: "matches regex" },
        ]}
        onChange={(op) => onChange({ ...condition, op })}
        size="sm"
      />
      <input
        value={condition.value}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
        placeholder={condition.op === "regex" ? "^A|Final" : "A"}
        className="h-8 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
      />
    </div>
  );
}

function RangeConditionEditor<T extends CustomPlaytimeCondition>({
  label,
  condition,
  onChange,
}: {
  label: string;
  condition: T;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <NumberInput label={`${label} min h`} value={condition.minHours} onChange={(minHours) => onChange({ ...condition, minHours })} />
      <NumberInput label={`${label} max h (<)`} value={condition.maxHoursExclusive} onChange={(maxHoursExclusive) => onChange({ ...condition, maxHoursExclusive })} />
    </div>
  );
}

function HltbConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomHltbCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  const t = useT();
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
      <SelectMenu<HltbTimeMode>
        label={t("auto.custom.time")}
        value={condition.mode}
        options={HLTB_TIME_MODES.map((mode) => ({ value: mode, label: hltbModeLabel(mode) }))}
        onChange={(mode) => onChange({ ...condition, mode })}
        size="sm"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberInput label="min h" value={condition.minHours} onChange={(minHours) => onChange({ ...condition, minHours })} />
        <NumberInput label="max h (<)" value={condition.maxHoursExclusive} onChange={(maxHoursExclusive) => onChange({ ...condition, maxHoursExclusive })} />
      </div>
    </div>
  );
}

function MetadataTextConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomMetadataTextCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-2 lg:grid-cols-[150px_120px_120px_minmax(0,1fr)]">
      <SelectMenu<CustomMetadataTextCondition["field"]>
        value={condition.field}
        options={[
          { value: "genre", label: "Genre" },
          { value: "tag", label: "Tag" },
          { value: "flag", label: "Store flag" },
          { value: "language", label: "Language" },
          { value: "developer", label: "Developer" },
          { value: "publisher", label: "Publisher" },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <SelectMenu<CustomMetadataTextCondition["mode"]>
        value={condition.mode}
        options={[
          { value: "any", label: "any" },
          { value: "all", label: "all" },
          { value: "none", label: "none" },
        ]}
        onChange={(mode) => onChange({ ...condition, mode })}
        size="sm"
      />
      <SelectMenu<CustomMetadataTextCondition["match"]>
        value={condition.match}
        options={[
          { value: "exact", label: "exact" },
          { value: "contains", label: "contains" },
        ]}
        onChange={(match) => onChange({ ...condition, match })}
        size="sm"
      />
      <input
        value={condition.values.join(", ")}
        onChange={(event) => onChange({ ...condition, values: splitValues(event.target.value) })}
        placeholder={t("auto.custom.metadataPlaceholder")}
        className="h-8 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
      />
    </div>
  );
}

function PlatformConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomPlatformCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  const selected = new Set(condition.values);
  const toggle = (value: "windows" | "mac" | "linux") => {
    const values = selected.has(value)
      ? condition.values.filter((item) => item !== value)
      : [...condition.values, value];
    onChange({ ...condition, values });
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <SelectMenu<CustomPlatformCondition["mode"]>
        value={condition.mode}
        options={[
          { value: "any", label: "any" },
          { value: "all", label: "all" },
          { value: "none", label: "none" },
        ]}
        onChange={(mode) => onChange({ ...condition, mode })}
        size="sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {([
          ["windows", "Windows"],
          ["mac", "macOS"],
          ["linux", "Linux"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={`btn-press rounded-md border px-2 py-1 text-xs ${
              selected.has(value)
                ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle text-repressurizer-text-muted hover:border-repressurizer-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetadataNumberConditionEditor({
  condition,
  onChange,
}: {
  condition: CustomNumericMetadataCondition;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
      <SelectMenu<CustomNumericMetadataCondition["field"]>
        value={condition.field}
        options={[
          { value: "releaseYear", label: "Release year" },
          { value: "metacritic", label: "Metacritic" },
          { value: "steamReviewScore", label: "Steam review %" },
          { value: "steamReviewCount", label: "Steam review count" },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberInput label="min" value={condition.min} onChange={(min) => onChange({ ...condition, min })} />
        <NumberInput label="max" value={condition.max} onChange={(max) => onChange({ ...condition, max })} />
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
        className="h-8 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 text-xs text-repressurizer-text focus:border-repressurizer-accent focus:outline-none"
      />
    </label>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
      {children}
    </span>
  );
}

function defaultCondition(kind: AddConditionKind): CustomRuleConditionV1 {
  if (kind === "category") return defaultCategoryCondition("inAny");
  if (kind === "special") return defaultSpecialCondition("uncategorized", "require");
  if (kind === "title") return defaultTitleCondition("contains", "");
  if (kind === "playtime") return { ...baseCondition(), kind: "playtime", minHours: undefined, maxHoursExclusive: 10 };
  if (kind === "hltb") return defaultHltbCondition({ maxHoursExclusive: 15 });
  if (kind === "metadataText") {
    return { ...baseCondition(), kind: "metadataText", field: "genre", mode: "any", values: [], match: "contains" };
  }
  if (kind === "platform") return { ...baseCondition(), kind: "platform", mode: "any", values: ["windows"] };
  return { ...baseCondition(), kind: "metadataNumber", field: "metacritic", min: 80 };
}

function defaultCategoryCondition(mode: CustomCategoryCondition["mode"]): CustomCategoryCondition {
  return { ...baseCondition(), kind: "category", mode, categories: [] };
}

function defaultSpecialCondition(field: CustomSpecialCondition["field"], state: CustomSpecialCondition["state"]): CustomSpecialCondition {
  return { ...baseCondition(), kind: "special", field, state };
}

function defaultTitleCondition(op: CustomTitleCondition["op"], value: string): CustomTitleCondition {
  return { ...baseCondition(), kind: "title", op, value };
}

function defaultHltbCondition(patch: Partial<CustomHltbCondition> = {}): CustomHltbCondition {
  return { ...baseCondition(), kind: "hltb", mode: "main_story", minHours: undefined, maxHoursExclusive: undefined, ...patch };
}

function baseCondition(): CustomConditionBase {
  return { id: customConditionId(), enabled: true, missingData: "skipPreserve" };
}

function conditionLabel(kind: CustomRuleConditionV1["kind"]): string {
  if (kind === "metadataText") return "Store metadata";
  if (kind === "metadataNumber") return "Numeric metadata";
  if (kind === "hltb") return "HLTB";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function splitValues(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function isSpecialCollection(collection: SteamCollection): boolean {
  const key = collection.key.toLowerCase();
  const id = collection.id.toLowerCase();
  return (
    key === "user-collections.hidden" ||
    key === "user-collections.favorite" ||
    key === "hidden" ||
    key === "favorite" ||
    key === "favorites" ||
    id === "hidden" ||
    id === "favorite" ||
    id === "favorites"
  );
}
