export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = "repressurizer.library-snapshot.v1" as const;
export const LIBRARY_SNAPSHOT_CHECKSUM_ALGORITHM = "fnv1a32" as const;

export interface LibrarySnapshot {
  schemaVersion: typeof LIBRARY_SNAPSHOT_SCHEMA_VERSION;
  generatedAt: string;
  source: {
    app: "Repressurizer";
    version: string;
  };
  steam: {
    steamId64Tail: string | null;
    personaName: string | null;
  };
  summary: {
    gameCount: number;
    collectionCount: number;
    hltbCount: number;
  };
  collections: LibrarySnapshotCollection[];
  games: LibrarySnapshotGame[];
  checksum: string;
}

export interface LibrarySnapshotCollection {
  key: string;
  name: string;
  isDynamic: boolean;
  gameCount: number;
  appIds: number[];
}

export interface LibrarySnapshotCollectionRef {
  key: string;
  name: string;
  isDynamic: boolean;
}

export interface LibrarySnapshotGameDetails {
  releaseDate: string | null;
  genres: string[];
  categories: string[];
  metacriticScore: number | null;
  developers: string[];
  publishers: string[];
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  isFree: boolean;
  priceFinal: number | null;
  priceCurrency: string | null;
}

export interface LibrarySnapshotHltb {
  source: "howlongtobeat";
  mainStory: number | null;
  mainExtra: number | null;
  completionist: number | null;
  hltbGameId: number | null;
  matchedName: string | null;
  confidence: number | null;
}

export interface LibrarySnapshotGame {
  appId: number;
  name: string;
  playtimeForeverMinutes: number;
  playtimeForeverHours: number;
  rtimeLastPlayed: number;
  lastPlayedAt: string | null;
  isCollectionOnly: boolean;
  collections: LibrarySnapshotCollectionRef[];
  details: LibrarySnapshotGameDetails | null;
  hltb: LibrarySnapshotHltb | null;
}

export interface SnapshotValidationIssue {
  path: string;
  message: string;
}

export type SnapshotValidationResult =
  | { ok: true; snapshot: LibrarySnapshot; issues: [] }
  | { ok: false; snapshot?: undefined; issues: SnapshotValidationIssue[] };

export interface SnapshotValidationOptions {
  verifyChecksum?: boolean;
}

export interface LibrarySnapshotDiff {
  added: LibrarySnapshotGame[];
  removed: LibrarySnapshotGame[];
  changed: Array<{
    before: LibrarySnapshotGame;
    after: LibrarySnapshotGame;
  }>;
  unchanged: LibrarySnapshotGame[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function validIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function issue(issues: SnapshotValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateStringArray(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "must be an array");
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") issue(issues, `${path}[${index}]`, "must be a string");
  });
}

function validateCollectionRef(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issue(issues, path, "must be an object");
    return;
  }
  if (typeof value.key !== "string" || !value.key) issue(issues, `${path}.key`, "must be a non-empty string");
  if (typeof value.name !== "string") issue(issues, `${path}.name`, "must be a string");
  if (typeof value.isDynamic !== "boolean") issue(issues, `${path}.isDynamic`, "must be a boolean");
}

function validateCollection(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issue(issues, path, "must be an object");
    return;
  }
  if (typeof value.key !== "string" || !value.key) issue(issues, `${path}.key`, "must be a non-empty string");
  if (typeof value.name !== "string") issue(issues, `${path}.name`, "must be a string");
  if (typeof value.isDynamic !== "boolean") issue(issues, `${path}.isDynamic`, "must be a boolean");
  if (!isNonNegativeInteger(value.gameCount)) issue(issues, `${path}.gameCount`, "must be a non-negative integer");

  if (!Array.isArray(value.appIds)) {
    issue(issues, `${path}.appIds`, "must be an array");
  } else {
    value.appIds.forEach((appId, index) => {
      if (!isNonNegativeInteger(appId)) issue(issues, `${path}.appIds[${index}]`, "must be a non-negative integer");
    });
    if (isNonNegativeInteger(value.gameCount) && value.gameCount !== value.appIds.length) {
      issue(issues, `${path}.gameCount`, "must match appIds length");
    }
  }
}

function validateDetails(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value === null) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object or null");
    return;
  }
  if (!isNullableString(value.releaseDate)) issue(issues, `${path}.releaseDate`, "must be a string or null");
  validateStringArray(issues, value.genres, `${path}.genres`);
  validateStringArray(issues, value.categories, `${path}.categories`);
  if (!isNullableNumber(value.metacriticScore)) issue(issues, `${path}.metacriticScore`, "must be a number or null");
  validateStringArray(issues, value.developers, `${path}.developers`);
  validateStringArray(issues, value.publishers, `${path}.publishers`);

  if (!isRecord(value.platforms)) {
    issue(issues, `${path}.platforms`, "must be an object");
  } else {
    for (const field of ["windows", "mac", "linux"] as const) {
      if (typeof value.platforms[field] !== "boolean") issue(issues, `${path}.platforms.${field}`, "must be a boolean");
    }
  }

  if (typeof value.isFree !== "boolean") issue(issues, `${path}.isFree`, "must be a boolean");
  if (!isNullableNumber(value.priceFinal)) issue(issues, `${path}.priceFinal`, "must be a number or null");
  if (!isNullableString(value.priceCurrency)) issue(issues, `${path}.priceCurrency`, "must be a string or null");
}

function validateHltb(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value === null) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object or null");
    return;
  }
  if (value.source !== "howlongtobeat") issue(issues, `${path}.source`, "must be howlongtobeat");
  if (!isNullableNumber(value.mainStory)) issue(issues, `${path}.mainStory`, "must be a number or null");
  if (!isNullableNumber(value.mainExtra)) issue(issues, `${path}.mainExtra`, "must be a number or null");
  if (!isNullableNumber(value.completionist)) issue(issues, `${path}.completionist`, "must be a number or null");
  if (!isNullableInteger(value.hltbGameId)) issue(issues, `${path}.hltbGameId`, "must be an integer or null");
  if (!isNullableString(value.matchedName)) issue(issues, `${path}.matchedName`, "must be a string or null");
  if (!isNullableNumber(value.confidence)) issue(issues, `${path}.confidence`, "must be a number or null");
}

function validateGame(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    issue(issues, path, "must be an object");
    return;
  }
  if (!isNonNegativeInteger(value.appId)) issue(issues, `${path}.appId`, "must be a non-negative integer");
  if (typeof value.name !== "string") issue(issues, `${path}.name`, "must be a string");
  if (!isNonNegativeInteger(value.playtimeForeverMinutes)) {
    issue(issues, `${path}.playtimeForeverMinutes`, "must be a non-negative integer");
  }
  if (!isNonNegativeNumber(value.playtimeForeverHours)) {
    issue(issues, `${path}.playtimeForeverHours`, "must be a non-negative number");
  }
  if (!isNonNegativeInteger(value.rtimeLastPlayed)) issue(issues, `${path}.rtimeLastPlayed`, "must be a non-negative integer");
  if (!isNullableString(value.lastPlayedAt)) {
    issue(issues, `${path}.lastPlayedAt`, "must be an ISO string or null");
  } else if (value.lastPlayedAt && !validIsoDate(value.lastPlayedAt)) {
    issue(issues, `${path}.lastPlayedAt`, "must be a valid date-time");
  }
  if (typeof value.isCollectionOnly !== "boolean") issue(issues, `${path}.isCollectionOnly`, "must be a boolean");

  if (!Array.isArray(value.collections)) {
    issue(issues, `${path}.collections`, "must be an array");
  } else {
    value.collections.forEach((collection, index) => validateCollectionRef(issues, collection, `${path}.collections[${index}]`));
  }

  validateDetails(issues, value.details, `${path}.details`);
  validateHltb(issues, value.hltb, `${path}.hltb`);
}

export function validateLibrarySnapshot(
  value: unknown,
  options: SnapshotValidationOptions = {}
): SnapshotValidationResult {
  const issues: SnapshotValidationIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "must be an object" }] };
  }

  if (value.schemaVersion !== LIBRARY_SNAPSHOT_SCHEMA_VERSION) {
    issue(issues, "$.schemaVersion", `must be ${LIBRARY_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (typeof value.generatedAt !== "string" || !validIsoDate(value.generatedAt)) {
    issue(issues, "$.generatedAt", "must be a valid date-time string");
  }

  if (!isRecord(value.source)) {
    issue(issues, "$.source", "must be an object");
  } else {
    if (value.source.app !== "Repressurizer") issue(issues, "$.source.app", "must be Repressurizer");
    if (typeof value.source.version !== "string" || !value.source.version) {
      issue(issues, "$.source.version", "must be a non-empty string");
    }
  }

  if (!isRecord(value.steam)) {
    issue(issues, "$.steam", "must be an object");
  } else {
    if (!isNullableString(value.steam.steamId64Tail)) issue(issues, "$.steam.steamId64Tail", "must be a string or null");
    if (typeof value.steam.steamId64Tail === "string" && value.steam.steamId64Tail.length > 4) {
      issue(issues, "$.steam.steamId64Tail", "must be at most four characters");
    }
    if (!isNullableString(value.steam.personaName)) issue(issues, "$.steam.personaName", "must be a string or null");
  }

  if (!isRecord(value.summary)) {
    issue(issues, "$.summary", "must be an object");
  } else {
    for (const field of ["gameCount", "collectionCount", "hltbCount"] as const) {
      if (!isNonNegativeInteger(value.summary[field])) issue(issues, `$.summary.${field}`, "must be a non-negative integer");
    }
  }

  if (!Array.isArray(value.collections)) {
    issue(issues, "$.collections", "must be an array");
  } else {
    value.collections.forEach((collection, index) => validateCollection(issues, collection, `$.collections[${index}]`));
  }

  if (!Array.isArray(value.games)) {
    issue(issues, "$.games", "must be an array");
  } else {
    value.games.forEach((game, index) => validateGame(issues, game, `$.games[${index}]`));
    const seen = new Set<number>();
    value.games.forEach((game, index) => {
      if (isRecord(game) && isNonNegativeInteger(game.appId)) {
        if (seen.has(game.appId)) issue(issues, `$.games[${index}].appId`, "must be unique");
        seen.add(game.appId);
      }
    });
  }

  if (typeof value.checksum !== "string" || !/^fnv1a32:[0-9a-f]{8}$/.test(value.checksum)) {
    issue(issues, "$.checksum", "must match fnv1a32 checksum format");
  }

  if (isRecord(value.summary) && Array.isArray(value.collections) && Array.isArray(value.games)) {
    const hltbCount = value.games.filter((game) => isRecord(game) && isRecord(game.hltb)).length;
    if (value.summary.gameCount !== value.games.length) issue(issues, "$.summary.gameCount", "must match games length");
    if (value.summary.collectionCount !== value.collections.length) {
      issue(issues, "$.summary.collectionCount", "must match collections length");
    }
    if (value.summary.hltbCount !== hltbCount) issue(issues, "$.summary.hltbCount", "must match games with HLTB data");
  }

  if (issues.length === 0 && options.verifyChecksum && !verifyLibrarySnapshotChecksum(value as unknown as LibrarySnapshot)) {
    issue(issues, "$.checksum", "does not match snapshot content");
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, snapshot: value as unknown as LibrarySnapshot, issues: [] };
}

export function isLibrarySnapshot(value: unknown): value is LibrarySnapshot {
  return validateLibrarySnapshot(value).ok;
}

export function assertLibrarySnapshot(
  value: unknown,
  options?: SnapshotValidationOptions
): asserts value is LibrarySnapshot {
  const result = validateLibrarySnapshot(value, options);
  if (!result.ok) {
    const message = result.issues.map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`Invalid Repressurizer library snapshot: ${message}`);
  }
}

export function indexSnapshotByAppId(snapshot: LibrarySnapshot): Map<number, LibrarySnapshotGame> {
  return new Map(snapshot.games.map((game) => [game.appId, game]));
}

export function getSnapshotGame(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotGame | undefined {
  return indexSnapshotByAppId(snapshot).get(appId);
}

export function getSnapshotHltb(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotHltb | null {
  return getSnapshotGame(snapshot, appId)?.hltb ?? null;
}

export function listSnapshotCollections(snapshot: LibrarySnapshot): LibrarySnapshotCollection[] {
  return [...snapshot.collections].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function stableSnapshotStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSnapshotStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSnapshotStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function snapshotChecksumPayload(snapshot: LibrarySnapshot): Omit<LibrarySnapshot, "generatedAt" | "checksum"> {
  return {
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
    steam: snapshot.steam,
    summary: snapshot.summary,
    collections: snapshot.collections,
    games: snapshot.games,
  };
}

export function computeLibrarySnapshotChecksum(snapshot: LibrarySnapshot): string {
  return `${LIBRARY_SNAPSHOT_CHECKSUM_ALGORITHM}:${fnv1a32(stableSnapshotStringify(snapshotChecksumPayload(snapshot)))}`;
}

export function verifyLibrarySnapshotChecksum(snapshot: LibrarySnapshot): boolean {
  return snapshot.checksum === computeLibrarySnapshotChecksum(snapshot);
}

export function diffLibrarySnapshots(previous: LibrarySnapshot, next: LibrarySnapshot): LibrarySnapshotDiff {
  const previousByAppId = indexSnapshotByAppId(previous);
  const nextByAppId = indexSnapshotByAppId(next);
  const added: LibrarySnapshotGame[] = [];
  const removed: LibrarySnapshotGame[] = [];
  const changed: LibrarySnapshotDiff["changed"] = [];
  const unchanged: LibrarySnapshotGame[] = [];

  for (const game of next.games) {
    const before = previousByAppId.get(game.appId);
    if (!before) {
      added.push(game);
      continue;
    }
    if (stableSnapshotStringify(before) === stableSnapshotStringify(game)) {
      unchanged.push(game);
    } else {
      changed.push({ before, after: game });
    }
  }

  for (const game of previous.games) {
    if (!nextByAppId.has(game.appId)) removed.push(game);
  }

  return {
    added: added.sort((a, b) => a.name.localeCompare(b.name) || a.appId - b.appId),
    removed: removed.sort((a, b) => a.name.localeCompare(b.name) || a.appId - b.appId),
    changed: changed.sort((a, b) => a.after.name.localeCompare(b.after.name) || a.after.appId - b.after.appId),
    unchanged: unchanged.sort((a, b) => a.name.localeCompare(b.name) || a.appId - b.appId),
  };
}
