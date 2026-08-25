import { canonicalJson, entityChecksum } from "./entityJournal";

export const REPRESSURIZER_PROFILE_SCHEMA = 1 as const;
export type ProfileSectionKey = "diary" | "kanban" | "autocat" | "planner" | "preferences" | "settings" | "collections" | "history";

export interface RepressurizerProfileManifest {
  schemaVersion: typeof REPRESSURIZER_PROFILE_SCHEMA;
  profileId: string;
  name: string;
  exportedAt: number;
  deviceId: string;
  steamAccountId: string | null;
  includedSections: ProfileSectionKey[];
  checksum: string;
}

export interface RepressurizerProfileDocument {
  manifest: RepressurizerProfileManifest;
  sections: Partial<Record<ProfileSectionKey, unknown>>;
}

export interface ProfileSectionDiff {
  section: ProfileSectionKey;
  status: "added" | "removed" | "changed" | "unchanged";
  localChecksum: string | null;
  incomingChecksum: string | null;
  localItems: number;
  incomingItems: number;
}

const SECTION_KEYS: ProfileSectionKey[] = ["diary", "kanban", "autocat", "planner", "preferences", "settings", "collections", "history"];

function payloadChecksum(input: Omit<RepressurizerProfileManifest, "checksum">, sections: RepressurizerProfileDocument["sections"]): string {
  return entityChecksum({ manifest: input, sections });
}

function itemCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value as object).length;
  return value == null ? 0 : 1;
}

export function createRepressurizerProfile(input: {
  profileId: string;
  name: string;
  deviceId: string;
  steamAccountId: string | null;
  sections: RepressurizerProfileDocument["sections"];
  exportedAt?: number;
}): RepressurizerProfileDocument {
  const sections = Object.fromEntries(SECTION_KEYS.filter((key) => input.sections[key] !== undefined).map((key) => [key, structuredClone(input.sections[key])])) as RepressurizerProfileDocument["sections"];
  const manifestWithoutChecksum = {
    schemaVersion: REPRESSURIZER_PROFILE_SCHEMA,
    profileId: input.profileId,
    name: input.name.trim().slice(0, 80) || "Repressurizer Profile",
    exportedAt: input.exportedAt ?? Date.now(),
    deviceId: input.deviceId,
    steamAccountId: input.steamAccountId,
    includedSections: SECTION_KEYS.filter((key) => sections[key] !== undefined),
  };
  return { manifest: { ...manifestWithoutChecksum, checksum: payloadChecksum(manifestWithoutChecksum, sections) }, sections };
}

export function verifyRepressurizerProfile(document: RepressurizerProfileDocument): boolean {
  const { checksum, ...manifest } = document.manifest;
  return checksum === payloadChecksum(manifest, document.sections);
}

export function parseRepressurizerProfile(value: unknown): { document: RepressurizerProfileDocument | null; error: "invalid" | "newer-schema" | "checksum" | null } {
  if (!value || typeof value !== "object") return { document: null, error: "invalid" };
  const raw = value as { manifest?: Partial<RepressurizerProfileManifest>; sections?: unknown };
  const schema = Number(raw.manifest?.schemaVersion ?? 0);
  if (schema > REPRESSURIZER_PROFILE_SCHEMA) return { document: null, error: "newer-schema" };
  if (schema !== REPRESSURIZER_PROFILE_SCHEMA || !raw.sections || typeof raw.sections !== "object" || !raw.manifest) return { document: null, error: "invalid" };
  const includedSections = Array.isArray(raw.manifest.includedSections) ? raw.manifest.includedSections.filter((key): key is ProfileSectionKey => SECTION_KEYS.includes(key as ProfileSectionKey)) : [];
  const document = { manifest: { ...raw.manifest, schemaVersion: REPRESSURIZER_PROFILE_SCHEMA, includedSections } as RepressurizerProfileManifest, sections: raw.sections as RepressurizerProfileDocument["sections"] };
  if (!verifyRepressurizerProfile(document)) return { document: null, error: "checksum" };
  return { document, error: null };
}

export function selectProfileSections(document: RepressurizerProfileDocument, selected: ReadonlySet<ProfileSectionKey>, exportedAt = Date.now()): RepressurizerProfileDocument {
  return createRepressurizerProfile({ profileId: document.manifest.profileId, name: document.manifest.name, deviceId: document.manifest.deviceId, steamAccountId: document.manifest.steamAccountId, exportedAt, sections: Object.fromEntries([...selected].flatMap((key) => document.sections[key] === undefined ? [] : [[key, document.sections[key]]])) });
}

export function diffProfileSections(local: Partial<Record<ProfileSectionKey, unknown>>, incoming: Partial<Record<ProfileSectionKey, unknown>>): ProfileSectionDiff[] {
  return SECTION_KEYS.map((section) => {
    const left = local[section]; const right = incoming[section];
    const localChecksum = left === undefined ? null : entityChecksum(left);
    const incomingChecksum = right === undefined ? null : entityChecksum(right);
    const status = left === undefined && right !== undefined ? "added" : left !== undefined && right === undefined ? "removed" : localChecksum === incomingChecksum ? "unchanged" : "changed";
    return { section, status, localChecksum, incomingChecksum, localItems: itemCount(left), incomingItems: itemCount(right) };
  });
}

export function sanitizeProfileSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["showDynamicCategories", "pinFavorites", "accentColor", "recentAccentColors", "sidebarWidth", "theme", "language", "categoryChipStyle", "showSmartLists", "showEmptyLists", "showNowPlaying", "showDiary", "diaryFinishedPrompts", "diaryRatingEmojis", "showFilterBar", "hideCollectionOnlyGames", "showDetailHltb", "showDetailMetacritic", "showDetailPrice", "detailsCacheMaxAgeDays", "hltbTimeMode", "currency", "categoryColors", "desktopNotifications", "updateChannel", "includeSteamFamilyNonGames"]);
  return Object.fromEntries(Object.entries(settings).filter(([key]) => allowed.has(key)).map(([key, value]) => [key, structuredClone(value)]));
}

export function profileDocumentsEqual(left: RepressurizerProfileDocument, right: RepressurizerProfileDocument): boolean {
  return canonicalJson(left.sections) === canonicalJson(right.sections);
}
