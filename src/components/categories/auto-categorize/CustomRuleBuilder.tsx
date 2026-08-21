import { Fragment, useMemo, type ReactNode } from "react";
import { Trash, CopySimple, Funnel, Warning, Plus } from "@phosphor-icons/react";
import {
  conditionIssue,
  customConditionId,
  customRuleConnectors,
  customRuleHasMixedConnectors,
  type CategoryRef,
  type CustomAutoCatConfigV1,
  type CustomCategoryCondition,
  type CustomConditionIssue,
  type CustomConditionBase,
  type CustomDiaryCondition,
  type CustomHltbCondition,
  type CustomMetadataTextCondition,
  type CustomNumericMetadataCondition,
  type CustomPlatformCondition,
  type CustomPlaytimeCondition,
  type CustomRuleConditionV1,
  type CustomRuleConnector,
  type CustomSpecialCondition,
  type CustomTitleCondition,
} from "../../../lib/customAutoCategorize";
import { hltbModeLabel, HLTB_TIME_MODES } from "../../../lib/hltb";
import type { HltbTimeMode, SteamCollection } from "../../../lib/types";
import { SelectMenu } from "../../ui/SelectMenu";
import { useT, type TranslationKey } from "../../../lib/i18n";

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
  | "metadataNumber"
  | "diary";
type AddConditionMenuValue = AddConditionKind | "__add";

const ADD_CONDITION_OPTIONS: Array<{ value: AddConditionKind; labelKey: TranslationKey; descKey: TranslationKey }> = [
  { value: "category", labelKey: "auto.custom.kind.category", descKey: "auto.custom.kind.categoryDesc" },
  { value: "special", labelKey: "auto.custom.kind.special", descKey: "auto.custom.kind.specialDesc" },
  { value: "title", labelKey: "auto.custom.kind.title", descKey: "auto.custom.kind.titleDesc" },
  { value: "playtime", labelKey: "auto.custom.kind.playtime", descKey: "auto.custom.kind.playtimeDesc" },
  { value: "hltb", labelKey: "auto.custom.kind.hltb", descKey: "auto.custom.kind.hltbDesc" },
  { value: "metadataText", labelKey: "auto.custom.kind.metadataText", descKey: "auto.custom.kind.metadataTextDesc" },
  { value: "platform", labelKey: "auto.custom.kind.platform", descKey: "auto.custom.kind.platformDesc" },
  { value: "metadataNumber", labelKey: "auto.custom.kind.metadataNumber", descKey: "auto.custom.kind.metadataNumberDesc" },
  { value: "diary", labelKey: "auto.custom.kind.diary", descKey: "auto.custom.kind.diaryDesc" },
];

const CONDITION_ISSUE_LABELS: Record<CustomConditionIssue, TranslationKey> = {
  titleEmpty: "auto.custom.error.titleEmpty",
  regexInvalid: "auto.custom.error.regexInvalid",
  categoriesEmpty: "auto.custom.error.categoriesEmpty",
  valuesEmpty: "auto.custom.error.valuesEmpty",
};

export function CustomRuleBuilder({ config, onChange, collections, diaryMode = false }: CustomRuleBuilderProps & { diaryMode?: boolean }) {
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
  const updateConditions = (conditions: CustomRuleConditionV1[]) => {
    const fallback: CustomRuleConnector = config.logic.op === "any" ? "or" : "and";
    const currentConnectors = customRuleConnectors(config);
    const connectors = Array.from(
      { length: Math.max(0, conditions.length - 1) },
      (_, index) => currentConnectors[index] ?? fallback,
    );
    update({ logic: { ...config.logic, conditions, connectors } });
  };
  const updateLogicOp = (op: "all" | "any") => {
    const connector: CustomRuleConnector = op === "any" ? "or" : "and";
    update({
      logic: {
        ...config.logic,
        op,
        connectors: Array.from({ length: Math.max(0, config.logic.conditions.length - 1) }, () => connector),
      },
    });
  };
  const updateConnector = (index: number, connector: CustomRuleConnector) => {
    const connectors = customRuleConnectors(config);
    connectors[index] = connector;
    update({ logic: { ...config.logic, connectors } });
  };
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

  const addConditionMenuOptions: Array<{ value: AddConditionMenuValue; label: string; description?: string; disabled?: boolean }> = [
    { value: "__add", label: t("auto.custom.addCondition"), disabled: true },
    ...ADD_CONDITION_OPTIONS.map(({ value, labelKey, descKey }) => ({
      value,
      label: t(labelKey),
      description: t(descKey),
    })),
  ];
  const connectors = customRuleConnectors(config);
  const mixedConnectors = customRuleHasMixedConnectors(config, true);
  const matchMode: "all" | "any" | "mixed" = mixedConnectors ? "mixed" : config.logic.op;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              {diaryMode ? t("auto.diary.ruleLabel") : t("auto.custom.resultCategory")}
            </label>
            <input
              value={config.output.categoryName}
              onChange={(event) => updateOutputName(event.target.value)}
              placeholder={diaryMode ? t("auto.diary.ruleLabelPlaceholder") : t("auto.custom.resultPlaceholder")}
              className="h-9 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
              {t("auto.custom.quickStarts")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["short", "auto.custom.template.short"],
                ["category", "auto.custom.template.category"],
                ["uncategorized", "auto.custom.template.uncategorized"],
                ["title", "auto.custom.template.title"],
              ] as const).map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyTemplate(value)}
                  className="btn-press rounded-md border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 text-xs text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent"
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-repressurizer-text-faint">
          {diaryMode ? t("auto.diary.ruleHelp") : t("auto.custom.help")}
        </p>
      </div>

      <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-repressurizer-text">{t("auto.custom.conditions")}</p>
            <p className="text-xs text-repressurizer-text-faint">
              {mixedConnectors
                ? t("auto.custom.logicMixed")
                : config.logic.op === "any"
                  ? t("auto.custom.logicAny")
                  : t("auto.custom.logicAll")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-repressurizer-text-faint">
              <span>{t("auto.custom.match")}</span>
              <SelectMenu<"all" | "any" | "mixed">
                value={matchMode}
                options={[
                  { value: "all", label: t("auto.custom.matchAll") },
                  { value: "any", label: t("auto.custom.matchAny") },
                  { value: "mixed", label: t("auto.custom.matchMixed"), disabled: true },
                ]}
                onChange={(next) => {
                  if (next !== "mixed") updateLogicOp(next);
                }}
                ariaLabel={t("auto.custom.match")}
                testId="autocat-custom-logic"
                size="sm"
                className="min-w-[132px]"
                buttonClassName="normal-case tracking-normal font-normal"
              />
            </label>
            <Plus size={14} weight="bold" className="text-repressurizer-accent" />
            <SelectMenu<AddConditionMenuValue>
              value="__add"
              options={addConditionMenuOptions}
              onChange={(kind) => {
                if (kind !== "__add") addCondition(kind);
              }}
              ariaLabel={t("auto.custom.addCondition")}
              size="sm"
              align="right"
              buttonClassName="min-w-40 border-repressurizer-accent/40 bg-repressurizer-accent/10 text-repressurizer-accent"
            />
          </div>
        </div>

        {staleRefs.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Warning size={14} weight="duotone" className="mt-0.5 shrink-0" />
            <span>{t("auto.custom.staleCategories", { list: staleRefs.map((ref) => ref.nameSnapshot || ref.key).join(", ") })}</span>
          </div>
        )}

        {config.logic.conditions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-repressurizer-border bg-repressurizer-surface px-3 py-4 text-sm text-repressurizer-text-faint">
            <Funnel size={16} weight="duotone" />
            {t("auto.custom.emptyState")}
          </div>
        ) : (
          <div className="space-y-2">
            {config.logic.conditions.map((condition, index) => (
              <Fragment key={condition.id}>
                {index > 0 && (
                  <ConnectorChip
                    index={index - 1}
                    value={connectors[index - 1] ?? (config.logic.op === "any" ? "or" : "and")}
                    onChange={(next) => updateConnector(index - 1, next)}
                  />
                )}
                <ConditionRow
                  condition={condition}
                  categories={categoryOptions}
                  onChange={(next) => updateCondition(condition.id, next)}
                  onDuplicate={() => duplicateCondition(condition)}
                  onRemove={() => removeCondition(condition.id)}
                />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorChip({ index, value, onChange }: { index: number; value: CustomRuleConnector; onChange: (value: CustomRuleConnector) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-1" role="separator" aria-label={value === "or" ? t("auto.rule.or") : t("auto.rule.and")}>
      <span className="h-px flex-1 bg-repressurizer-border-subtle" />
      <SelectMenu<CustomRuleConnector>
        value={value}
        options={[
          { value: "and", label: t("auto.rule.and") },
          { value: "or", label: t("auto.rule.or") },
        ]}
        onChange={onChange}
        ariaLabel={`${t("auto.custom.match")} ${index + 1}`}
        testId={`autocat-connector-${index}`}
        size="sm"
        className="min-w-[74px]"
        buttonClassName="justify-center border-repressurizer-border-subtle bg-repressurizer-bg px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
      />
      <span className="h-px flex-1 bg-repressurizer-border-subtle" />
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
  const enabled = condition.enabled !== false;
  const issue = enabled ? conditionIssue(condition) : null;
  return (
    <div
      className={`rounded-lg border bg-repressurizer-surface px-3 py-2.5 ${
        issue ? "border-repressurizer-danger/40" : "border-repressurizer-border-subtle"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-repressurizer-accent/10 text-repressurizer-accent" : "bg-repressurizer-surface-hover text-repressurizer-text-faint"}`}>
          {t(conditionKindLabelKey(condition.kind))}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-repressurizer-text-faint">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onChange({ ...condition, enabled: event.target.checked } as CustomRuleConditionV1)}
            className="h-3.5 w-3.5 accent-repressurizer-accent"
          />
          {t("auto.custom.enabled")}
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
        <RangeConditionEditor condition={condition} onChange={onChange} />
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
      {condition.kind === "diary" && (
        <DiaryConditionEditor condition={condition} onChange={onChange} />
      )}

      {issue && (
        <p role="alert" data-testid={`autocat-condition-issue-${condition.id}`} className="mt-2 flex items-start gap-1.5 text-xs text-repressurizer-danger">
          <Warning size={13} weight="fill" className="mt-0.5 shrink-0" />
          {t(CONDITION_ISSUE_LABELS[issue])}
        </p>
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
          { value: "inAny", label: t("auto.custom.catMode.inAny") },
          { value: "inAll", label: t("auto.custom.catMode.inAll") },
          { value: "notIn", label: t("auto.custom.catMode.notIn") },
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
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectMenu<CustomSpecialCondition["field"]>
        value={condition.field}
        options={[
          { value: "hidden", label: t("auto.rule.field.hidden") },
          { value: "favorite", label: t("auto.rule.field.favorite") },
          { value: "uncategorized", label: t("auto.rule.field.uncategorized") },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <SelectMenu<CustomSpecialCondition["state"]>
        value={condition.state}
        options={[
          { value: "require", label: t("auto.custom.require") },
          { value: "exclude", label: t("auto.custom.exclude") },
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
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
      <SelectMenu<CustomTitleCondition["op"]>
        value={condition.op}
        options={[
          { value: "startsWith", label: t("auto.custom.titleOp.startsWith") },
          { value: "contains", label: t("auto.custom.titleOp.contains") },
          { value: "regex", label: t("auto.custom.titleOp.regex") },
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
  condition,
  onChange,
}: {
  condition: T;
  onChange: (condition: CustomRuleConditionV1) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <NumberInput label={t("auto.custom.minHours")} value={condition.minHours} onChange={(minHours) => onChange({ ...condition, minHours })} />
      <NumberInput label={t("auto.custom.maxHoursExclusive")} value={condition.maxHoursExclusive} onChange={(maxHoursExclusive) => onChange({ ...condition, maxHoursExclusive })} />
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
        <NumberInput label={t("auto.custom.minHours")} value={condition.minHours} onChange={(minHours) => onChange({ ...condition, minHours })} />
        <NumberInput label={t("auto.custom.maxHoursExclusive")} value={condition.maxHoursExclusive} onChange={(maxHoursExclusive) => onChange({ ...condition, maxHoursExclusive })} />
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
          { value: "genre", label: t("auto.rule.field.genre") },
          { value: "tag", label: t("auto.rule.field.tag") },
          { value: "flag", label: t("auto.rule.field.flag") },
          { value: "language", label: t("auto.rule.field.language") },
          { value: "developer", label: t("auto.rule.field.developer") },
          { value: "publisher", label: t("auto.rule.field.publisher") },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <SelectMenu<CustomMetadataTextCondition["mode"]>
        value={condition.mode}
        options={[
          { value: "any", label: t("auto.custom.mode.any") },
          { value: "all", label: t("auto.custom.mode.all") },
          { value: "none", label: t("auto.custom.mode.none") },
        ]}
        onChange={(mode) => onChange({ ...condition, mode })}
        size="sm"
      />
      <SelectMenu<CustomMetadataTextCondition["match"]>
        value={condition.match}
        options={[
          { value: "exact", label: t("auto.custom.textMatch.exact") },
          { value: "contains", label: t("auto.custom.textMatch.contains") },
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
  const t = useT();
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
          { value: "any", label: t("auto.custom.mode.any") },
          { value: "all", label: t("auto.custom.mode.all") },
          { value: "none", label: t("auto.custom.mode.none") },
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
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
      <SelectMenu<CustomNumericMetadataCondition["field"]>
        value={condition.field}
        options={[
          { value: "releaseYear", label: t("auto.rule.field.releaseYear") },
          { value: "metacritic", label: t("auto.rule.field.metacritic") },
          { value: "steamReviewScore", label: t("auto.rule.field.steamReviewScore") },
          { value: "steamReviewCount", label: t("auto.rule.field.steamReviewCount") },
        ]}
        onChange={(field) => onChange({ ...condition, field })}
        size="sm"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberInput label={t("auto.custom.min")} value={condition.min} onChange={(min) => onChange({ ...condition, min })} />
        <NumberInput label={t("auto.custom.max")} value={condition.max} onChange={(max) => onChange({ ...condition, max })} />
      </div>
    </div>
  );
}

function DiaryConditionEditor({ condition, onChange }: { condition: CustomDiaryCondition; onChange: (condition: CustomRuleConditionV1) => void }) {
  const t = useT();
  const fields = [
    { value: "status" as const, label: t("auto.custom.diaryField.status") },
    { value: "rating" as const, label: t("auto.custom.diaryField.rating") },
    { value: "hasJournal" as const, label: t("auto.rule.diary.journal.require") },
    { value: "hasPages" as const, label: t("auto.rule.diary.pages.require") },
  ];
  return <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
    <SelectMenu<CustomDiaryCondition["field"]> value={condition.field} options={fields} onChange={(field) => onChange({ ...condition, field })} size="sm" />
    {condition.field === "status" ? <SelectMenu<NonNullable<CustomDiaryCondition["status"]>> value={condition.status ?? "finished"} options={[{ value: "backlog", label: t("diary.status.backlog") }, { value: "playing", label: t("diary.status.playing") }, { value: "finished", label: t("diary.status.finished") }, { value: "abandoned", label: t("diary.status.abandoned") }, { value: "archived", label: t("diary.status.archived") }]} onChange={(status) => onChange({ ...condition, status })} size="sm" /> : condition.field === "rating" ? <div className="grid grid-cols-2 gap-2"><NumberInput label={t("auto.custom.ratingMin")} value={condition.minRating} onChange={(minRating) => onChange({ ...condition, minRating })} /><NumberInput label={t("auto.custom.ratingMax")} value={condition.maxRating} onChange={(maxRating) => onChange({ ...condition, maxRating })} /></div> : <SelectMenu<NonNullable<CustomDiaryCondition["state"]>> value={condition.state ?? "require"} options={[{ value: "require", label: t("auto.custom.require") }, { value: "exclude", label: t("auto.custom.exclude") }]} onChange={(state) => onChange({ ...condition, state })} size="sm" />}
  </div>;
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
  if (kind === "diary") return { ...baseCondition(), kind: "diary", field: "status", status: "finished", state: "require" };
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

function conditionKindLabelKey(kind: CustomRuleConditionV1["kind"]): TranslationKey {
  const option = ADD_CONDITION_OPTIONS.find((item) => item.value === kind);
  return option ? option.labelKey : "auto.custom.kind.title";
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
