/** Bounded validation for imported profile data before it reaches live stores. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export const validProfileAppId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function isBoundedProfileData(value: unknown): boolean {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 2_000_000 || depth > 48) return false;
    if (item == null) return true; // undefined optional fields are omitted by JSON.
    if (typeof item === "string") {
      characters += item.length;
      return item.length <= 2_000_000 && characters <= 32_000_000;
    }
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "boolean") return true;
    if (typeof item !== "object" || ancestors.has(item)) return false;
    if (!Array.isArray(item) && !isRecord(item)) return false;
    if (Array.isArray(item) && item.length > 200_000) return false;
    ancestors.add(item);
    const valid = Object.entries(Object.getOwnPropertyDescriptors(item)).every(([key, descriptor]) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype" || descriptor.get || descriptor.set) return false;
      return visit(descriptor.value, depth + 1);
    });
    ancestors.delete(item);
    return valid;
  };
  return visit(value, 0);
}

const idArray = (value: unknown): boolean => Array.isArray(value) && value.every(validProfileAppId);
const optional = (record: Record<string, unknown>, key: string, test: (value: unknown) => boolean) =>
  record[key] === undefined || test(record[key]);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
const idRecord = (value: unknown, test: (value: unknown) => boolean): boolean => isRecord(value) &&
  Object.entries(value).every(([id, item]) => /^\d+$/.test(id) && validProfileAppId(Number(id)) && test(item));

export function validateProfileSectionShape(key: string, value: unknown): boolean {
  if (key === "collections") {
    const keys = new Set<string>();
    return Array.isArray(value) && value.every((entry) => {
      if (!isRecord(entry) || typeof entry.key !== "string" || !entry.key || keys.has(entry.key) ||
          typeof entry.name !== "string" || !entry.name.trim() || !idArray(entry.added)) return false;
      keys.add(entry.key);
      return optional(entry, "id", (id) => typeof id === "string") && optional(entry, "removed", idArray) &&
        optional(entry, "timestamp", finite) && optional(entry, "is_dynamic", (item) => typeof item === "boolean") &&
        optional(entry, "is_deleted", (item) => typeof item === "boolean");
    });
  }
  if (!isRecord(value)) return false;
  if (key === "preferences") return optional(value, "statuses", (data) => idRecord(data, (status) => ["none", "playing", "beaten", "completed", "abandoned"].includes(String(status)))) &&
    optional(value, "notes", (data) => idRecord(data, (note) => typeof note === "string")) &&
    optional(value, "tags", (data) => idRecord(data, strings)) &&
    optional(value, "reviews", (data) => idRecord(data, (review) => isRecord(review) && finite(review.rating) && (review.rating as number) >= 1 && (review.rating as number) <= 10 && finite(review.updatedAt)));
  if (key === "diary") return optional(value, "queue", idArray) &&
    ["entries", "finishPrompts", "journal"].every((field) => optional(value, field, isRecord)) &&
    ["pages", "revisions", "templates", "statusEvents"].every((field) => optional(value, field, Array.isArray));
  if (key === "kanban") return optional(value, "board", isRecord) && optional(value, "boardPrefs", isRecord);
  if (key === "planner") return optional(value, "config", isRecord) &&
    ["queue", "presets", "recentQueues", "history"].every((field) => optional(value, field, Array.isArray)) &&
    optional(value, "permanentlySuppressed", idArray) &&
    optional(value, "pinnedAppId", (id) => id === null || validProfileAppId(id)) &&
    ["hiddenUntil", "frequency"].every((field) => optional(value, field, isRecord));
  if (key === "autocat") return optional(value, "presets", Array.isArray) &&
    Object.entries(value).every(([field, item]) => !field.endsWith("Config") || isRecord(item));
  if (key === "history") return Object.values(value).every(Array.isArray);
  return key === "settings";
}
