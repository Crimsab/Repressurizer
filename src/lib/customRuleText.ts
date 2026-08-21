import type {
  CustomAutoCatConfigV1,
  CustomCategoryCondition,
  CustomDiaryCondition,
  CustomHltbCondition,
  CustomMetadataTextCondition,
  CustomNumericMetadataCondition,
  CustomPlatformCondition,
  CustomPlaytimeCondition,
  CustomRuleConditionV1,
  CustomSpecialCondition,
  CustomTitleCondition,
} from "./customAutoCategorize";
import { customRuleConnectors } from "./customAutoCategorize";
import { hltbModeLabel } from "./hltb";
import type { TranslationKey } from "./i18n";
import type { HltbTimeMode } from "./types";

export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Localized label for each AutoCat data source used by non-custom Diary rules. */
export const RULE_SOURCE_LABEL_KEYS: Record<string, TranslationKey> = {
  hours: "auto.byPlaytime",
  genre: "auto.byGenre",
  tags: "auto.byTags",
  year: "auto.byYear",
  score: "auto.byScore",
  rating: "auto.byRating",
  hltb: "auto.byHltb",
  devpub: "auto.byDevPub",
  flags: "auto.byFlags",
  language: "auto.byLanguage",
  platform: "auto.byPlatform",
  name: "auto.byName",
  custom: "auto.byCustom",
};

export function ruleSourceLabel(type: string, t: Translate): string {
  const key = RULE_SOURCE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

const METADATA_TEXT_FIELD_LABELS: Record<CustomMetadataTextCondition["field"], TranslationKey> = {
  genre: "auto.rule.field.genre",
  tag: "auto.rule.field.tag",
  flag: "auto.rule.field.flag",
  language: "auto.rule.field.language",
  developer: "auto.rule.field.developer",
  publisher: "auto.rule.field.publisher",
};

const METADATA_NUMBER_FIELD_LABELS: Record<CustomNumericMetadataCondition["field"], TranslationKey> = {
  releaseYear: "auto.rule.field.releaseYear",
  metacritic: "auto.rule.field.metacritic",
  steamReviewScore: "auto.rule.field.steamReviewScore",
  steamReviewCount: "auto.rule.field.steamReviewCount",
};

const SPECIAL_FIELD_LABELS: Record<CustomSpecialCondition["field"], TranslationKey> = {
  hidden: "auto.rule.field.hidden",
  favorite: "auto.rule.field.favorite",
  uncategorized: "auto.rule.field.uncategorized",
};

const PLATFORM_LABELS: Record<"windows" | "mac" | "linux", string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
};

/**
 * Human range such as “2020–2024”, “≥ 80” or “< 15h”. An exclusive upper
 * bound renders as “< max”; an inclusive one as “≤ max”.
 */
export function formatRuleRange(
  min: number | null | undefined,
  max: number | null | undefined,
  options: { maxExclusive?: boolean; unit?: string } = {}
): string {
  const unit = options.unit ?? "";
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (hasMin && hasMax) return `${min}–${max}${unit}`;
  if (hasMin) return `≥ ${min}${unit}`;
  if (hasMax) return `${options.maxExclusive ? "<" : "≤"} ${max}${unit}`;
  return "";
}

function describeTitle(condition: CustomTitleCondition, t: Translate): string {
  const value = condition.value.trim() || "…";
  if (condition.op === "startsWith") return t("auto.rule.title.startsWith", { value });
  if (condition.op === "regex") return t("auto.rule.title.regex", { value });
  return t("auto.rule.title.contains", { value });
}

function describeCategory(condition: CustomCategoryCondition, t: Translate): string {
  const names = condition.categories.map((category) => category.nameSnapshot || category.key);
  const list = names.length > 0 ? names.join(", ") : "…";
  if (condition.mode === "inAll") return t("auto.rule.category.inAll", { list });
  if (condition.mode === "notIn") return t("auto.rule.category.notIn", { list });
  return t("auto.rule.category.inAny", { list });
}

function describeSpecial(condition: CustomSpecialCondition, t: Translate): string {
  const field = t(SPECIAL_FIELD_LABELS[condition.field]);
  return condition.state === "exclude" ? t("auto.rule.special.exclude", { field }) : t("auto.rule.special.require", { field });
}

function describeHoursRange(
  prefix: TranslationKey,
  open: TranslationKey,
  min: number | undefined,
  maxExclusive: number | undefined,
  params: Record<string, string | number> = {},
  t: Translate
): string {
  const range = formatRuleRange(min ?? null, maxExclusive ?? null, { maxExclusive: true, unit: "h" });
  if (!range) return t(open, params);
  return t(prefix, { ...params, range });
}

function describePlaytime(condition: CustomPlaytimeCondition, t: Translate): string {
  return describeHoursRange("auto.rule.playtime", "auto.rule.playtime.open", condition.minHours, condition.maxHoursExclusive, {}, t);
}

function describeHltb(condition: CustomHltbCondition, t: Translate): string {
  return describeHoursRange(
    "auto.rule.hltb",
    "auto.rule.hltb.open",
    condition.minHours,
    condition.maxHoursExclusive,
    { mode: hltbModeLabel(condition.mode as HltbTimeMode) },
    t
  );
}

function describeMetadataText(condition: CustomMetadataTextCondition, t: Translate): string {
  const field = t(METADATA_TEXT_FIELD_LABELS[condition.field]);
  const values = condition.values.length > 0 ? condition.values.join(", ") : "…";
  if (condition.mode === "all") return t("auto.rule.metadataText.all", { field, values });
  if (condition.mode === "none") return t("auto.rule.metadataText.none", { field, values });
  return t("auto.rule.metadataText.any", { field, values });
}

function describePlatform(condition: CustomPlatformCondition, t: Translate): string {
  const values = condition.values.map((platform) => PLATFORM_LABELS[platform]).join(", ");
  if (condition.mode === "all") return t("auto.rule.platform.all", { values: values || "…" });
  if (condition.mode === "none") return t("auto.rule.platform.none", { values: values || "…" });
  return t("auto.rule.platform.any", { values: values || "…" });
}

function describeMetadataNumber(condition: CustomNumericMetadataCondition, t: Translate): string {
  const field = t(METADATA_NUMBER_FIELD_LABELS[condition.field]);
  const range = formatRuleRange(condition.min ?? null, condition.max ?? null);
  if (!range) return t("auto.rule.number.open", { field });
  return t("auto.rule.number", { field, range });
}

function describeDiary(condition: CustomDiaryCondition, t: Translate): string {
  if (condition.field === "status") {
    const statusLabels: Record<NonNullable<CustomDiaryCondition["status"]>, TranslationKey> = {
      backlog: "diary.status.backlog",
      playing: "diary.status.playing",
      finished: "diary.status.finished",
      abandoned: "diary.status.abandoned",
      archived: "diary.status.archived",
    };
    return t("auto.rule.diary.status", { status: t(statusLabels[condition.status ?? "finished"]) });
  }
  if (condition.field === "rating") {
    const range = formatRuleRange(condition.minRating ?? null, condition.maxRating ?? null);
    if (!range) return t("auto.rule.diary.rating.open");
    return t("auto.rule.diary.rating", { range });
  }
  if (condition.field === "hasJournal") {
    return t(condition.state === "exclude" ? "auto.rule.diary.journal.exclude" : "auto.rule.diary.journal.require");
  }
  return t(condition.state === "exclude" ? "auto.rule.diary.pages.exclude" : "auto.rule.diary.pages.require");
}

/** Localized plain-text description of one rule condition. */
export function describeConditionText(condition: CustomRuleConditionV1, t: Translate): string {
  switch (condition.kind) {
    case "title":
      return describeTitle(condition, t);
    case "category":
      return describeCategory(condition, t);
    case "special":
      return describeSpecial(condition, t);
    case "playtime":
      return describePlaytime(condition, t);
    case "hltb":
      return describeHltb(condition, t);
    case "metadataText":
      return describeMetadataText(condition, t);
    case "platform":
      return describePlatform(condition, t);
    case "metadataNumber":
      return describeMetadataNumber(condition, t);
    case "diary":
      return describeDiary(condition, t);
    default:
      return "";
  }
}

/** Connector (“AND”/“OR”) used between enabled conditions. */
export function ruleConnectorLabel(config: CustomAutoCatConfigV1, t: Translate): string {
  return config.logic.op === "any" ? t("auto.rule.or") : t("auto.rule.and");
}

/**
 * All enabled conditions joined with their explicit connector, ready to render
 * inside an IF summary. Returns the empty-state copy when nothing is enabled.
 */
export function describeRuleExpression(config: CustomAutoCatConfigV1, t: Translate): string {
  const enabledConditions = config.logic.conditions.filter((condition) => condition.enabled !== false);
  const parts = enabledConditions.map((condition) => describeConditionText(condition, t)).filter(Boolean);
  if (parts.length === 0) return t("auto.rule.empty");
  const connectors = customRuleConnectors(config, true);
  return parts.reduce((expression, part, index) => {
    if (index === 0) return part;
    const connector = connectors[index - 1] === "or" ? t("auto.rule.or") : t("auto.rule.and");
    return `${expression}  ${connector}  ${part}`;
  }, "");
}
