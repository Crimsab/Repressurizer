import { getHltbHours, isHltbTimeMode } from "./hltb";
import { bestAvailableReleaseDate, storeReleaseDateNeedsRefresh } from "./releaseDates";
import { extractReleaseYear, normalizeSearchText } from "./search";
import { isSteamRatingFresh, scoreForRating, steamRatingIdsNeedingFetch } from "./steamRatings";
import type { CategorizeResult, HltbData } from "./tauri";
import type { GameDetails, HltbTimeMode, OwnedGame, SteamCollection, SteamReviewSummary } from "./types";
import { detailsCacheNeedsRefresh, isDetailsCacheCurrent } from "../stores/gameStore";

export type CustomMissingDataBehavior = "skipPreserve" | "exclude";

export interface CategoryRef {
  key: string;
  nameSnapshot: string;
}

export interface CustomConditionBase {
  id: string;
  enabled?: boolean;
  missingData?: CustomMissingDataBehavior;
}

export interface CustomCategoryCondition extends CustomConditionBase {
  kind: "category";
  mode: "inAny" | "inAll" | "notIn";
  categories: CategoryRef[];
}

export interface CustomSpecialCondition extends CustomConditionBase {
  kind: "special";
  field: "hidden" | "favorite" | "uncategorized";
  state: "require" | "exclude";
}

export interface CustomTitleCondition extends CustomConditionBase {
  kind: "title";
  op: "startsWith" | "contains" | "regex";
  value: string;
  caseSensitive?: boolean;
  regexFlags?: string;
}

export interface CustomPlaytimeCondition extends CustomConditionBase {
  kind: "playtime";
  minHours?: number;
  maxHoursExclusive?: number;
}

export interface CustomHltbCondition extends CustomConditionBase {
  kind: "hltb";
  mode: HltbTimeMode;
  minHours?: number;
  maxHoursExclusive?: number;
}

export interface CustomMetadataTextCondition extends CustomConditionBase {
  kind: "metadataText";
  field: "genre" | "tag" | "flag" | "language" | "developer" | "publisher";
  mode: "any" | "all" | "none";
  values: string[];
  match: "exact" | "contains";
}

export interface CustomPlatformCondition extends CustomConditionBase {
  kind: "platform";
  mode: "any" | "all" | "none";
  values: Array<"windows" | "mac" | "linux">;
}

export interface CustomNumericMetadataCondition extends CustomConditionBase {
  kind: "metadataNumber";
  field: "releaseYear" | "metacritic" | "steamReviewScore" | "steamReviewCount";
  min?: number;
  max?: number;
  steamReviewScoreMode?: "positivePercent" | "wilson";
}

export type CustomRuleConditionV1 =
  | CustomCategoryCondition
  | CustomSpecialCondition
  | CustomTitleCondition
  | CustomPlaytimeCondition
  | CustomHltbCondition
  | CustomMetadataTextCondition
  | CustomPlatformCondition
  | CustomNumericMetadataCondition;

export interface CustomAutoCatConfigV1 {
  schema: "repressurizer.customAutoCat";
  version: 1;
  output: {
    categoryName: string;
  };
  logic: {
    op: "all";
    conditions: CustomRuleConditionV1[];
  };
  defaults?: {
    missingData?: CustomMissingDataBehavior;
    caseSensitiveText?: boolean;
  };
}

export interface CustomRuleDiagnostics {
  evaluated: number;
  matched: number;
  skippedMissingHltb: number;
  skippedMissingDetails: number;
  skippedMissingRatings: number;
  skippedInvalid: number;
  staleCategoryRefs: CategoryRef[];
  invalidMessages: string[];
}

interface EvaluateCustomAutoCatInput {
  config: CustomAutoCatConfigV1;
  games: Record<number, OwnedGame>;
  details: Record<number, GameDetails>;
  collections: SteamCollection[];
  hltbData: Record<number, HltbData>;
  ratings: Record<number, SteamReviewSummary>;
  hltbTimeMode: HltbTimeMode;
  detailsCacheMaxAgeDays?: number;
}

type MissingReason = "hltb" | "details" | "ratings" | "invalid";
type ConditionOutcome = "match" | "noMatch" | { missing: MissingReason; behavior: CustomMissingDataBehavior };

export const DEFAULT_CUSTOM_AUTOCAT_CONFIG: CustomAutoCatConfigV1 = {
  schema: "repressurizer.customAutoCat",
  version: 1,
  output: { categoryName: "" },
  logic: { op: "all", conditions: [] },
  defaults: { missingData: "skipPreserve", caseSensitiveText: false },
};

export function customConditionId(): string {
  return `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCustomAutoCatConfig(raw: unknown): CustomAutoCatConfigV1 {
  if (!raw || typeof raw !== "object") return cloneDefaultCustomConfig();
  const source = raw as Partial<CustomAutoCatConfigV1>;
  const conditions = Array.isArray(source.logic?.conditions)
    ? source.logic.conditions.map(normalizeCondition).filter((item): item is CustomRuleConditionV1 => !!item)
    : [];

  return {
    schema: "repressurizer.customAutoCat",
    version: 1,
    output: {
      categoryName: String(source.output?.categoryName ?? "").slice(0, 120),
    },
    logic: {
      op: "all",
      conditions,
    },
    defaults: {
      missingData: normalizeMissingData(source.defaults?.missingData),
      caseSensitiveText: Boolean(source.defaults?.caseSensitiveText),
    },
  };
}

export function cloneDefaultCustomConfig(): CustomAutoCatConfigV1 {
  return structuredClone(DEFAULT_CUSTOM_AUTOCAT_CONFIG);
}

export function customNeedsDetails(config: CustomAutoCatConfigV1): boolean {
  return enabledConditions(config).some((condition) =>
    condition.kind === "metadataText" ||
    condition.kind === "platform" ||
    (condition.kind === "metadataNumber" &&
      (condition.field === "releaseYear" || condition.field === "metacritic"))
  );
}

export function customNeedsRatings(config: CustomAutoCatConfigV1): boolean {
  return enabledConditions(config).some(
    (condition) =>
      condition.kind === "metadataNumber" &&
      (condition.field === "steamReviewScore" || condition.field === "steamReviewCount")
  );
}

export function customNeedsHltb(config: CustomAutoCatConfigV1): boolean {
  return enabledConditions(config).some((condition) => condition.kind === "hltb");
}

export function customDetailIdsNeedingFetch(
  config: CustomAutoCatConfigV1,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>,
  detailsMaxAgeDays?: number
): number[] {
  if (!customNeedsDetails(config)) return [];
  return Object.keys(games)
    .map(Number)
    .filter((id) => detailsCacheNeedsRefresh(details[id], detailsMaxAgeDays));
}

export function customReleaseDateIdsNeedingFetch(
  config: CustomAutoCatConfigV1,
  games: Record<number, OwnedGame>,
  details: Record<number, GameDetails>
): number[] {
  if (!enabledConditions(config).some((condition) => condition.kind === "metadataNumber" && condition.field === "releaseYear")) {
    return [];
  }
  return Object.keys(games)
    .map(Number)
    .filter((id) => isDetailsCacheCurrent(details[id]) && storeReleaseDateNeedsRefresh(details[id]));
}

export function customRatingIdsNeedingFetch(
  config: CustomAutoCatConfigV1,
  games: Record<number, OwnedGame>,
  ratings: Record<number, SteamReviewSummary>
): number[] {
  return customNeedsRatings(config) ? steamRatingIdsNeedingFetch(games, ratings) : [];
}

export function evaluateCustomAutoCat(input: EvaluateCustomAutoCatInput): CategorizeResult {
  const config = normalizeCustomAutoCatConfig(input.config);
  const categoryName = config.output.categoryName.trim();
  const diagnostics: CustomRuleDiagnostics = {
    evaluated: 0,
    matched: 0,
    skippedMissingHltb: 0,
    skippedMissingDetails: 0,
    skippedMissingRatings: 0,
    skippedInvalid: 0,
    staleCategoryRefs: staleCategoryRefs(config, input.collections),
    invalidMessages: [],
  };

  if (!categoryName) {
    diagnostics.invalidMessages.push("Custom rule needs a result category name.");
    return withDiagnostics(emptyResult(Object.keys(input.games).length), diagnostics);
  }

  const conditions = enabledConditions(config);
  if (conditions.length === 0) {
    diagnostics.invalidMessages.push("Custom rule needs at least one enabled condition.");
    return withDiagnostics(emptyResult(Object.keys(input.games).length), diagnostics);
  }

  const invalid = validateConditions(conditions, input.collections);
  diagnostics.invalidMessages.push(...invalid);
  if (invalid.length > 0) {
    diagnostics.skippedInvalid = Object.keys(input.games).length;
    return withDiagnostics(emptyResult(Object.keys(input.games).length), diagnostics);
  }

  const index = buildCategoryIndex(input.collections, categoryName, Object.keys(input.games).map(Number));
  const assignments: Record<string, number[]> = { [categoryName]: [] };
  const processedAppIds: number[] = [];

  for (const game of Object.values(input.games)) {
    let matched = true;
    let preserveSkipped = false;

    for (const condition of conditions) {
      const outcome = evaluateCondition(condition, game, input, config, index);
      if (outcome === "match") continue;
      if (outcome === "noMatch") {
        matched = false;
        break;
      }

      countMissing(diagnostics, outcome.missing);
      matched = false;
      preserveSkipped = outcome.behavior === "skipPreserve";
      break;
    }

    if (!preserveSkipped) {
      processedAppIds.push(game.appid);
      diagnostics.evaluated += 1;
    }
    if (matched) {
      assignments[categoryName].push(game.appid);
      diagnostics.matched += 1;
    }
  }

  return withDiagnostics({
    assignments,
    games_processed: diagnostics.evaluated,
    games_categorized: assignments[categoryName].length,
    processed_app_ids: processedAppIds,
  }, diagnostics);
}

function enabledConditions(config: CustomAutoCatConfigV1): CustomRuleConditionV1[] {
  return (config.logic.conditions ?? []).filter((condition) => condition.enabled !== false);
}

function normalizeCondition(raw: unknown): CustomRuleConditionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<CustomRuleConditionV1>;
  const base = {
    id: String(source.id || customConditionId()),
    enabled: source.enabled !== false,
    missingData: normalizeMissingData(source.missingData),
  };

  if (source.kind === "category") {
    return {
      ...base,
      kind: "category",
      mode: source.mode === "inAll" || source.mode === "notIn" ? source.mode : "inAny",
      categories: normalizeCategoryRefs(source.categories),
    };
  }
  if (source.kind === "special") {
    return {
      ...base,
      kind: "special",
      field: source.field === "favorite" || source.field === "uncategorized" ? source.field : "hidden",
      state: source.state === "exclude" ? "exclude" : "require",
    };
  }
  if (source.kind === "title") {
    return {
      ...base,
      kind: "title",
      op: source.op === "regex" || source.op === "startsWith" ? source.op : "contains",
      value: String(source.value ?? "").slice(0, 300),
      caseSensitive: Boolean(source.caseSensitive),
      regexFlags: normalizeRegexFlags(source.regexFlags),
    };
  }
  if (source.kind === "playtime") {
    return {
      ...base,
      kind: "playtime",
      minHours: optionalNumber(source.minHours),
      maxHoursExclusive: optionalNumber(source.maxHoursExclusive),
    };
  }
  if (source.kind === "hltb") {
    return {
      ...base,
      kind: "hltb",
      mode: isHltbTimeMode(source.mode) ? source.mode : "main_story",
      minHours: optionalNumber(source.minHours),
      maxHoursExclusive: optionalNumber(source.maxHoursExclusive),
    };
  }
  if (source.kind === "metadataText") {
    return {
      ...base,
      kind: "metadataText",
      field: normalizeMetadataTextField(source.field),
      mode: source.mode === "all" || source.mode === "none" ? source.mode : "any",
      values: normalizeStringList(source.values),
      match: source.match === "contains" ? "contains" : "exact",
    };
  }
  if (source.kind === "platform") {
    return {
      ...base,
      kind: "platform",
      mode: source.mode === "all" || source.mode === "none" ? source.mode : "any",
      values: normalizePlatforms(source.values),
    };
  }
  if (source.kind === "metadataNumber") {
    return {
      ...base,
      kind: "metadataNumber",
      field: normalizeMetadataNumberField(source.field),
      min: optionalNumber(source.min),
      max: optionalNumber(source.max),
      steamReviewScoreMode: source.steamReviewScoreMode === "wilson" ? "wilson" : "positivePercent",
    };
  }

  return null;
}

function evaluateCondition(
  condition: CustomRuleConditionV1,
  game: OwnedGame,
  input: EvaluateCustomAutoCatInput,
  config: CustomAutoCatConfigV1,
  index: CategoryIndex
): ConditionOutcome {
  if (condition.kind === "category") return evaluateCategoryCondition(condition, game.appid, index);
  if (condition.kind === "special") return evaluateSpecialCondition(condition, game.appid, index);
  if (condition.kind === "title") return evaluateTitleCondition(condition, game, input.details[game.appid], config);
  if (condition.kind === "playtime") return matchesRange(game.playtime_forever / 60, condition.minHours, condition.maxHoursExclusive) ? "match" : "noMatch";
  if (condition.kind === "hltb") {
    const hours = getHltbHours(input.hltbData[game.appid], condition.mode || input.hltbTimeMode);
    if (hours == null) return missing(condition, config, "hltb");
    return matchesRange(hours, condition.minHours, condition.maxHoursExclusive) ? "match" : "noMatch";
  }
  if (condition.kind === "metadataText" || condition.kind === "platform") {
    const detail = input.details[game.appid];
    if (detailsCacheNeedsRefresh(detail, input.detailsCacheMaxAgeDays)) return missing(condition, config, "details");
    if (condition.kind === "platform") return evaluatePlatformCondition(condition, detail);
    return evaluateMetadataTextCondition(condition, detail);
  }
  if (condition.kind === "metadataNumber") {
    if (condition.field === "steamReviewScore" || condition.field === "steamReviewCount") {
      const rating = input.ratings[game.appid];
      if (!isSteamRatingFresh(rating)) return missing(condition, config, "ratings");
      return evaluateRatingCondition(condition, rating, config);
    }
    const detail = input.details[game.appid];
    if (detailsCacheNeedsRefresh(detail, input.detailsCacheMaxAgeDays)) return missing(condition, config, "details");
    return evaluateDetailsNumberCondition(condition, detail, config);
  }
  return { missing: "invalid", behavior: "exclude" };
}

function evaluateCategoryCondition(condition: CustomCategoryCondition, appId: number, index: CategoryIndex): ConditionOutcome {
  const keys = condition.categories.map((category) => category.key);
  const memberships = index.categoryKeysByAppId.get(appId) ?? new Set<string>();
  if (condition.mode === "inAll") return keys.every((key) => memberships.has(key)) ? "match" : "noMatch";
  if (condition.mode === "notIn") return keys.every((key) => !memberships.has(key)) ? "match" : "noMatch";
  return keys.some((key) => memberships.has(key)) ? "match" : "noMatch";
}

function evaluateSpecialCondition(condition: CustomSpecialCondition, appId: number, index: CategoryIndex): ConditionOutcome {
  const set =
    condition.field === "hidden" ? index.hiddenAppIds :
    condition.field === "favorite" ? index.favoriteAppIds :
    index.uncategorizedAppIds;
  const has = set.has(appId);
  return condition.state === "require" ? (has ? "match" : "noMatch") : (!has ? "match" : "noMatch");
}

function evaluateTitleCondition(
  condition: CustomTitleCondition,
  game: OwnedGame,
  detail: GameDetails | undefined,
  config: CustomAutoCatConfigV1
): ConditionOutcome {
  const rawNeedle = condition.value.trim();
  if (!rawNeedle) return { missing: "invalid", behavior: "exclude" };
  const haystack = `${game.name} ${detail?.name ?? ""}`.trim();

  if (condition.op === "regex") {
    try {
      const regex = new RegExp(rawNeedle, normalizeRegexFlags(condition.regexFlags));
      regex.lastIndex = 0;
      return regex.test(haystack) ? "match" : "noMatch";
    } catch {
      return { missing: "invalid", behavior: "exclude" };
    }
  }

  const caseSensitive = condition.caseSensitive ?? config.defaults?.caseSensitiveText ?? false;
  const text = caseSensitive ? haystack : normalizeSearchText(haystack);
  const needle = caseSensitive ? rawNeedle : normalizeSearchText(rawNeedle);
  if (condition.op === "startsWith") {
    const candidates = [game.name, detail?.name ?? ""].filter(Boolean);
    return candidates.some((name) => {
      const normalized = caseSensitive ? name : normalizeSearchText(name);
      return normalized.startsWith(needle);
    }) ? "match" : "noMatch";
  }
  return text.includes(needle) ? "match" : "noMatch";
}

function evaluateMetadataTextCondition(condition: CustomMetadataTextCondition, detail: GameDetails): ConditionOutcome {
  const source = metadataTextValues(condition.field, detail);
  return evaluateTextSet(source, condition.values, condition.mode, condition.match);
}

function evaluatePlatformCondition(condition: CustomPlatformCondition, detail: GameDetails): ConditionOutcome {
  const supported = new Set(
    condition.values.filter((platform) => detail.platforms?.[platform])
  );
  if (condition.mode === "all") return condition.values.every((platform) => supported.has(platform)) ? "match" : "noMatch";
  if (condition.mode === "none") return condition.values.every((platform) => !supported.has(platform)) ? "match" : "noMatch";
  return condition.values.some((platform) => supported.has(platform)) ? "match" : "noMatch";
}

function evaluateDetailsNumberCondition(
  condition: CustomNumericMetadataCondition,
  detail: GameDetails,
  config: CustomAutoCatConfigV1
): ConditionOutcome {
  const value =
    condition.field === "releaseYear"
      ? extractReleaseYear(bestAvailableReleaseDate(detail))
      : detail.metacritic_score;
  if (value == null) return missing(condition, config, "details");
  return matchesInclusiveRange(value, condition.min, condition.max) ? "match" : "noMatch";
}

function evaluateRatingCondition(
  condition: CustomNumericMetadataCondition,
  rating: SteamReviewSummary,
  config: CustomAutoCatConfigV1
): ConditionOutcome {
  const value =
    condition.field === "steamReviewScore"
      ? scoreForRating(rating, condition.steamReviewScoreMode === "wilson")
      : rating.total_reviews;
  if (value == null) return missing(condition, config, "ratings");
  return matchesInclusiveRange(value, condition.min, condition.max) ? "match" : "noMatch";
}

function evaluateTextSet(
  sourceValues: string[],
  requiredValues: string[],
  mode: "any" | "all" | "none",
  match: "exact" | "contains"
): ConditionOutcome {
  const values = requiredValues.map(normalizeSearchText).filter(Boolean);
  const source = sourceValues.map(normalizeSearchText).filter(Boolean);
  const has = (value: string) => match === "exact"
    ? source.includes(value)
    : source.some((item) => item.includes(value));
  if (mode === "all") return values.every(has) ? "match" : "noMatch";
  if (mode === "none") return values.every((value) => !has(value)) ? "match" : "noMatch";
  return values.some(has) ? "match" : "noMatch";
}

function metadataTextValues(field: CustomMetadataTextCondition["field"], detail: GameDetails): string[] {
  if (field === "genre") return detail.genres ?? [];
  if (field === "tag") return detail.tags ?? [];
  if (field === "flag") return detail.categories ?? [];
  if (field === "language") return detail.supported_languages ?? [];
  if (field === "developer") return detail.developers ?? [];
  return detail.publishers ?? [];
}

interface CategoryIndex {
  categoryKeysByAppId: Map<number, Set<string>>;
  hiddenAppIds: Set<number>;
  favoriteAppIds: Set<number>;
  uncategorizedAppIds: Set<number>;
}

function buildCategoryIndex(collections: SteamCollection[], outputName: string, allGameIds: number[]): CategoryIndex {
  const categoryKeysByAppId = new Map<number, Set<string>>();
  const normalCategoryKeysByAppId = new Map<number, Set<string>>();
  const hiddenAppIds = new Set<number>();
  const favoriteAppIds = new Set<number>();
  const outputNorm = normalizeSearchText(outputName);

  for (const collection of collections) {
    if (collection.is_dynamic) continue;
    const special = specialCollectionKind(collection);
    const isOutput = normalizeSearchText(collection.name) === outputNorm;
    for (const appId of collection.added ?? []) {
      if (special === "hidden") hiddenAppIds.add(appId);
      else if (special === "favorite") favoriteAppIds.add(appId);
      else {
        addMembership(categoryKeysByAppId, appId, collection.key);
        if (!isOutput) addMembership(normalCategoryKeysByAppId, appId, collection.key);
      }
    }
  }

  return {
    categoryKeysByAppId,
    hiddenAppIds,
    favoriteAppIds,
    uncategorizedAppIds: new Set(allGameIds.filter((id) => !normalCategoryKeysByAppId.has(id))),
  };
}

function addMembership(map: Map<number, Set<string>>, appId: number, key: string) {
  const set = map.get(appId) ?? new Set<string>();
  set.add(key);
  map.set(appId, set);
}

function specialCollectionKind(collection: SteamCollection): "hidden" | "favorite" | null {
  const key = collection.key.toLowerCase();
  const id = collection.id.toLowerCase();
  if (key === "user-collections.hidden" || key === "hidden" || id === "hidden") return "hidden";
  if (
    key === "user-collections.favorite" ||
    key === "favorite" ||
    key === "favorites" ||
    id === "favorite" ||
    id === "favorites" ||
    key.endsWith(".favorite")
  ) return "favorite";
  return null;
}

function validateConditions(conditions: CustomRuleConditionV1[], collections: SteamCollection[]): string[] {
  const messages: string[] = [];
  const collectionKeys = new Set(collections.map((collection) => collection.key));
  for (const condition of conditions) {
    if (condition.kind === "category") {
      if (condition.categories.length === 0) messages.push("Category condition needs at least one category.");
      const stale = condition.categories.filter((category) => !collectionKeys.has(category.key));
      if (stale.length > 0) messages.push(`Remove or repair missing categories: ${stale.map((item) => item.nameSnapshot || item.key).join(", ")}.`);
    }
    if (condition.kind === "title" && !condition.value.trim()) messages.push("Title condition needs text.");
    if (condition.kind === "title" && condition.op === "regex") {
      try {
        new RegExp(condition.value, normalizeRegexFlags(condition.regexFlags));
      } catch {
        messages.push("Title regex is invalid.");
      }
    }
    if (condition.kind === "metadataText" && condition.values.length === 0) messages.push("Metadata text condition needs at least one value.");
    if (condition.kind === "platform" && condition.values.length === 0) messages.push("Platform condition needs at least one platform.");
  }
  return [...new Set(messages)];
}

function staleCategoryRefs(config: CustomAutoCatConfigV1, collections: SteamCollection[]): CategoryRef[] {
  const keys = new Set(collections.map((collection) => collection.key));
  return enabledConditions(config)
    .filter((condition): condition is CustomCategoryCondition => condition.kind === "category")
    .flatMap((condition) => condition.categories)
    .filter((category) => !keys.has(category.key));
}

function countMissing(diagnostics: CustomRuleDiagnostics, reason: MissingReason) {
  if (reason === "hltb") diagnostics.skippedMissingHltb += 1;
  else if (reason === "details") diagnostics.skippedMissingDetails += 1;
  else if (reason === "ratings") diagnostics.skippedMissingRatings += 1;
  else diagnostics.skippedInvalid += 1;
}

function missing(
  condition: CustomConditionBase,
  config: CustomAutoCatConfigV1,
  reason: MissingReason
): ConditionOutcome {
  return {
    missing: reason,
    behavior: condition.missingData ?? config.defaults?.missingData ?? "skipPreserve",
  };
}

function matchesRange(value: number, min: number | undefined, maxExclusive: number | undefined): boolean {
  if (min != null && value < min) return false;
  if (maxExclusive != null && value >= maxExclusive) return false;
  return true;
}

function matchesInclusiveRange(value: number, min: number | undefined, max: number | undefined): boolean {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function emptyResult(_total: number): CategorizeResult {
  return {
    assignments: {},
    games_processed: 0,
    games_categorized: 0,
    processed_app_ids: [],
  };
}

function withDiagnostics(result: CategorizeResult, diagnostics: CustomRuleDiagnostics): CategorizeResult {
  return {
    ...result,
    custom_diagnostics: diagnostics,
  };
}

function normalizeMissingData(value: unknown): CustomMissingDataBehavior {
  return value === "exclude" ? "exclude" : "skipPreserve";
}

function normalizeCategoryRefs(value: unknown): CategoryRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<CategoryRef>;
      const key = String(source.key ?? "").trim();
      if (!key) return null;
      return {
        key,
        nameSnapshot: String(source.nameSnapshot ?? key).trim() || key,
      };
    })
    .filter((item): item is CategoryRef => !!item);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizePlatforms(value: unknown): Array<"windows" | "mac" | "linux"> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is "windows" | "mac" | "linux" => item === "windows" || item === "mac" || item === "linux");
}

function normalizeMetadataTextField(value: unknown): CustomMetadataTextCondition["field"] {
  if (value === "tag" || value === "flag" || value === "language" || value === "developer" || value === "publisher") return value;
  return "genre";
}

function normalizeMetadataNumberField(value: unknown): CustomNumericMetadataCondition["field"] {
  if (value === "metacritic" || value === "steamReviewScore" || value === "steamReviewCount") return value;
  return "releaseYear";
}

function normalizeRegexFlags(value: unknown): string {
  const flags = String(value ?? "i")
    .split("")
    .filter((flag, index, all) => /^[dgimsuvy]$/.test(flag) && all.indexOf(flag) === index)
    .join("");
  return flags || "i";
}

function optionalNumber(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
