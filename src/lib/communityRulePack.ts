import { entityChecksum } from "./entityJournal";
import { evaluateCustomAutoCat, normalizeCustomAutoCatConfig, type CustomAutoCatConfigV1, type EvaluateCustomAutoCatInput } from "./customAutoCategorize";

export const COMMUNITY_PACK_SCHEMA = 1 as const;
export interface CommunityPackRule { id: string; name: string; config: CustomAutoCatConfigV1; }
export interface CommunityRulePack { schemaVersion: typeof COMMUNITY_PACK_SCHEMA; id: string; name: string; description: string; author: string; version: string; compatibleApp: string; dataSources: string[]; collections: string[]; rules: CommunityPackRule[]; changelog: string[]; checksum: string; }

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FORBIDDEN_KEYS = /^(script|code|eval|function|executable|command|url)$/i;
function hasForbidden(value: unknown): boolean { if (Array.isArray(value)) return value.some(hasForbidden); if (!value || typeof value !== "object") return false; return Object.entries(value as Record<string, unknown>).some(([key, child]) => FORBIDDEN_KEYS.test(key) || hasForbidden(child)); }
export function safeCommunityRegex(value: string): boolean { return value.length <= 120 && !/\\[1-9]|\(\?<?[=!]|\([^)]*[+*][^)]*\)[+*{]/.test(value); }
function validateRule(rule: unknown): CommunityPackRule | null {
  if (!rule || typeof rule !== "object" || hasForbidden(rule)) return null; const raw = rule as Partial<CommunityPackRule>;
  if (!raw.id || !raw.name || !raw.config || raw.config.schema !== "repressurizer.customAutoCat" || raw.config.version !== 1) return null;
  const config = normalizeCustomAutoCatConfig(raw.config); if (!config.output.categoryName.trim() || !config.logic.conditions.length) return null;
  if (config.logic.conditions.some((condition) => condition.kind === "title" && condition.op === "regex" && !safeCommunityRegex(condition.value))) return null;
  return { id: String(raw.id).slice(0, 80), name: String(raw.name).slice(0, 120), config };
}
function checksumPayload(pack: Omit<CommunityRulePack, "checksum">) { return entityChecksum(pack); }
export function createCommunityRulePack(input: Omit<CommunityRulePack, "schemaVersion" | "checksum">): CommunityRulePack { const { schemaVersion: _schema, checksum: _checksum, ...clean } = input as CommunityRulePack; const payload = { schemaVersion: COMMUNITY_PACK_SCHEMA, ...structuredClone(clean) }; return { ...payload, checksum: checksumPayload(payload) }; }
export function parseCommunityRulePack(value: unknown): { pack: CommunityRulePack | null; error: string | null } {
  if (!value || typeof value !== "object" || hasForbidden(value)) return { pack: null, error: "Executable or unsupported content" }; const raw = value as CommunityRulePack;
  if (raw.schemaVersion !== COMMUNITY_PACK_SCHEMA || !raw.id || !raw.name || !raw.author || !SEMVER.test(raw.version) || !Array.isArray(raw.rules) || raw.rules.length > 100 || !Array.isArray(raw.dataSources) || !Array.isArray(raw.collections) || !Array.isArray(raw.changelog)) return { pack: null, error: "Invalid pack schema" };
  const rules = raw.rules.map(validateRule); if (rules.some((rule) => !rule)) return { pack: null, error: "Invalid or unsafe rule" };
  const { checksum, ...payload } = raw; if (checksum !== checksumPayload(payload)) return { pack: null, error: "Checksum mismatch" };
  return { pack: createCommunityRulePack({ id: raw.id, name: raw.name, description: raw.description, author: raw.author, version: raw.version, compatibleApp: raw.compatibleApp, dataSources: raw.dataSources, collections: raw.collections, rules: rules as CommunityPackRule[], changelog: raw.changelog }), error: null };
}
export function previewCommunityRulePack(pack: CommunityRulePack, input: Omit<EvaluateCustomAutoCatInput, "config">) { return pack.rules.map((rule) => { const result = evaluateCustomAutoCat({ ...input, config: rule.config }); return { ruleId: rule.id, name: rule.name, collection: rule.config.output.categoryName, matched: Object.values(result.assignments).reduce((sum, ids) => sum + ids.length, 0), result }; }); }

const condition = (id: string, field: "genre" | "tag", values: string[]) => ({ id, kind: "metadataText" as const, field, mode: "any" as const, values, match: "contains" as const, missingData: "skipPreserve" as const });
export const BUILTIN_COMMUNITY_PACKS: CommunityRulePack[] = [
  createCommunityRulePack({ id: "travel-basics", name: "Steam Deck Travel", description: "Short, offline-friendly and portable library views.", author: "Repressurizer Community", version: "1.0.0", compatibleApp: ">=0.8.0", dataSources: ["Steam metadata", "HLTB"], collections: ["Travel · Short", "Travel · Roguelikes"], rules: [
    { id: "short", name: "Short games", config: { schema: "repressurizer.customAutoCat", version: 1, output: { categoryName: "Travel · Short" }, logic: { op: "all", conditions: [{ id: "hltb", kind: "hltb", mode: "main_story", maxHoursExclusive: 10, missingData: "skipPreserve" }] } } },
    { id: "rogue", name: "Travel roguelikes", config: { schema: "repressurizer.customAutoCat", version: 1, output: { categoryName: "Travel · Roguelikes" }, logic: { op: "any", conditions: [condition("genre", "genre", ["Roguelike"]), condition("tag", "tag", ["Roguelite"])] } } },
  ], changelog: ["Initial curated release"] }),
  createCommunityRulePack({ id: "backlog-cleanup", name: "Backlog Cleanup", description: "Find hidden gems, unfinished games and achievement cleanup candidates.", author: "Repressurizer Community", version: "1.0.0", compatibleApp: ">=0.8.0", dataSources: ["Steam metadata", "Diary"], collections: ["Cleanup · Never played"], rules: [{ id: "never-played", name: "Never played", config: { schema: "repressurizer.customAutoCat", version: 1, output: { categoryName: "Cleanup · Never played" }, logic: { op: "all", conditions: [{ id: "playtime", kind: "playtime", maxHoursExclusive: 0.01 }] } } }], changelog: ["Initial curated release"] }),
];
