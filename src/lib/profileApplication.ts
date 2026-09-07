import { canonicalJson } from "./entityJournal";
import { isRecord, validProfileAppId } from "./profileValidation";
import { parseRepressurizerProfile, type ProfileSectionKey, type RepressurizerProfileDocument } from "./repressurizerProfile";
import type { SteamCollection } from "./types";

function matchesKnownShape(value: unknown, template: unknown, depth = 0): boolean {
  if (depth > 48) return false;
  if (value === undefined || template === undefined || template === null) return true;
  if (Array.isArray(template)) return Array.isArray(value) &&
    (template.length === 0 || value.every((item) => matchesKnownShape(item, template[0], depth + 1)));
  if (isRecord(template)) return isRecord(value) && Object.entries(value).every(([key, item]) =>
    !Object.hasOwn(template, key) || matchesKnownShape(item, template[key], depth + 1));
  return typeof value === typeof template;
}

/** Build and validate every selected section before mutating the first store. */
export function prepareProfileApplication(
  document: RepressurizerProfileDocument,
  selected: ReadonlySet<ProfileSectionKey>,
  current: RepressurizerProfileDocument["sections"],
): RepressurizerProfileDocument["sections"] {
  const parsed = parseRepressurizerProfile(document);
  if (!parsed.document) throw new Error(`Invalid profile: ${parsed.error}`);
  const prepared: RepressurizerProfileDocument["sections"] = {};
  for (const section of selected) {
    const incoming = parsed.document.sections[section];
    if (incoming === undefined) continue;
    if (section === "collections") {
      prepared.collections = (incoming as Partial<SteamCollection>[]).map((collection) => ({
        id: collection.id || collection.key!.replace(/^user-collections\./, ""),
        key: collection.key!, name: collection.name!.trim(),
        added: [...new Set(collection.added!)], removed: [...new Set(collection.removed ?? [])],
        timestamp: collection.timestamp ?? 0, is_deleted: collection.is_deleted ?? false,
        is_dynamic: collection.is_dynamic ?? false,
      }));
    } else {
      const template = current[section];
      if (!isRecord(incoming) || !isRecord(template)) throw new Error(`Invalid ${section} profile section`);
      const safe = Object.fromEntries(Object.entries(incoming).filter(([key]) => Object.hasOwn(template, key)));
      if (!matchesKnownShape(safe, template)) throw new Error(`Invalid ${section} profile field type`);
      if (section === "diary") {
        if (safe.entries) {
          for (const entry of Object.values(safe.entries as object)) {
            if (!isRecord(entry) || !["backlog", "next", "deferred", "archived"].includes(String(entry.decision)) ||
                !["low", "normal", "high"].includes(String(entry.priority)) || typeof entry.updatedAt !== "number") {
              throw new Error("Invalid diary entry");
            }
          }
        }
        for (const page of (safe.pages ?? []) as unknown[]) {
          if (!isRecord(page) || typeof page.id !== "string" || typeof page.title !== "string" || typeof page.markdown !== "string" ||
              !["all", "selected"].includes(String(page.scope)) || !Array.isArray(page.appIds) || !page.appIds.every(validProfileAppId)) throw new Error("Invalid diary page");
        }
      }
      if (section === "planner") {
        for (const item of (safe.queue ?? []) as unknown[]) {
          if (!isRecord(item) || !validProfileAppId(item.appId) || typeof item.durationMinutes !== "number" ||
              !["pending", "skipped", "completed", "deferred"].includes(String(item.status))) throw new Error("Invalid planner queue item");
        }
      }
      prepared[section] = structuredClone(safe);
    }
    if (canonicalJson(prepared[section]) === canonicalJson(current[section])) delete prepared[section];
  }
  return prepared;
}
