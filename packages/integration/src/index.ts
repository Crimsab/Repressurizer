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
    achievementCount?: number;
    wishlistCount?: number;
    familySharedCount?: number;
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
  achievements?: LibrarySnapshotAchievements | null;
  wishlist?: LibrarySnapshotWishlist | null;
  ownership?: LibrarySnapshotOwnership | null;
  flags?: LibrarySnapshotGameFlags;
}

export interface LibrarySnapshotAchievements {
  source: "steam_web_api";
  total: number;
  achieved: number;
  percent: number | null;
  complete: boolean;
  hasDetails: boolean;
}

export interface LibrarySnapshotWishlist {
  source: "steam_wishlist";
  priority: number;
  dateAdded: number;
  dateAddedAt: string | null;
  fetchedAt: string | null;
}

export interface LibrarySnapshotOwnership {
  source: "steam_family";
  authUsed: string | null;
  ownerSteamIdTail: string | null;
  ownerSteamIdTails: string[];
  ownerCount: number;
  ownedByCurrentUser: boolean;
  familyShared: boolean;
  excluded: boolean;
  excludeReason: number;
  nonGame: boolean;
  appType: number;
  fetchedAt: string | null;
}

export interface LibrarySnapshotGameFlags {
  collectionOnly: boolean;
  hasDetails: boolean;
  missingDetails: boolean;
  hasHltb: boolean;
  hasAchievements: boolean;
  wishlist: boolean;
  familyShared: boolean;
  ownedByCurrentUser: boolean;
  nonGame: boolean;
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

export interface LibrarySnapshotSummaryStats {
  games: number;
  collections: number;
  hltb: number;
  achievements: number;
  wishlist: number;
  familyShared: number;
  collectionOnly: number;
  missingDetails: number;
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

function validateAchievements(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value == null) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object or null");
    return;
  }
  if (value.source !== "steam_web_api") issue(issues, `${path}.source`, "must be steam_web_api");
  if (!isNonNegativeInteger(value.total)) issue(issues, `${path}.total`, "must be a non-negative integer");
  if (!isNonNegativeInteger(value.achieved)) issue(issues, `${path}.achieved`, "must be a non-negative integer");
  if (isNonNegativeInteger(value.total) && isNonNegativeInteger(value.achieved) && value.achieved > value.total) {
    issue(issues, `${path}.achieved`, "must be less than or equal to total");
  }
  if (!isNullableNumber(value.percent)) {
    issue(issues, `${path}.percent`, "must be a number or null");
  } else if (typeof value.percent === "number" && value.percent > 100) {
    issue(issues, `${path}.percent`, "must be less than or equal to 100");
  }
  if (typeof value.complete !== "boolean") issue(issues, `${path}.complete`, "must be a boolean");
  if (typeof value.hasDetails !== "boolean") issue(issues, `${path}.hasDetails`, "must be a boolean");
}

function validateWishlist(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value == null) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object or null");
    return;
  }
  if (value.source !== "steam_wishlist") issue(issues, `${path}.source`, "must be steam_wishlist");
  if (!isNonNegativeInteger(value.priority)) issue(issues, `${path}.priority`, "must be a non-negative integer");
  if (!isNonNegativeInteger(value.dateAdded)) issue(issues, `${path}.dateAdded`, "must be a non-negative integer");
  if (!isNullableString(value.dateAddedAt)) {
    issue(issues, `${path}.dateAddedAt`, "must be an ISO string or null");
  } else if (value.dateAddedAt && !validIsoDate(value.dateAddedAt)) {
    issue(issues, `${path}.dateAddedAt`, "must be a valid date-time");
  }
  if (!isNullableString(value.fetchedAt)) {
    issue(issues, `${path}.fetchedAt`, "must be an ISO string or null");
  } else if (value.fetchedAt && !validIsoDate(value.fetchedAt)) {
    issue(issues, `${path}.fetchedAt`, "must be a valid date-time");
  }
}

function validateOwnership(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value == null) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object or null");
    return;
  }
  if (value.source !== "steam_family") issue(issues, `${path}.source`, "must be steam_family");
  if (!isNullableString(value.authUsed)) issue(issues, `${path}.authUsed`, "must be a string or null");
  if (!isNullableString(value.ownerSteamIdTail)) issue(issues, `${path}.ownerSteamIdTail`, "must be a string or null");
  if (typeof value.ownerSteamIdTail === "string" && value.ownerSteamIdTail.length > 4) {
    issue(issues, `${path}.ownerSteamIdTail`, "must be at most four characters");
  }
  validateStringArray(issues, value.ownerSteamIdTails, `${path}.ownerSteamIdTails`);
  if (Array.isArray(value.ownerSteamIdTails)) {
    value.ownerSteamIdTails.forEach((tail, index) => {
      if (typeof tail === "string" && tail.length > 4) issue(issues, `${path}.ownerSteamIdTails[${index}]`, "must be at most four characters");
    });
  }
  if (!isNonNegativeInteger(value.ownerCount)) issue(issues, `${path}.ownerCount`, "must be a non-negative integer");
  for (const field of ["ownedByCurrentUser", "familyShared", "excluded", "nonGame"] as const) {
    if (typeof value[field] !== "boolean") issue(issues, `${path}.${field}`, "must be a boolean");
  }
  if (!isNonNegativeInteger(value.excludeReason)) issue(issues, `${path}.excludeReason`, "must be a non-negative integer");
  if (!isNonNegativeInteger(value.appType)) issue(issues, `${path}.appType`, "must be a non-negative integer");
  if (!isNullableString(value.fetchedAt)) {
    issue(issues, `${path}.fetchedAt`, "must be an ISO string or null");
  } else if (value.fetchedAt && !validIsoDate(value.fetchedAt)) {
    issue(issues, `${path}.fetchedAt`, "must be a valid date-time");
  }
}

function validateFlags(issues: SnapshotValidationIssue[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issue(issues, path, "must be an object");
    return;
  }
  for (const field of [
    "collectionOnly",
    "hasDetails",
    "missingDetails",
    "hasHltb",
    "hasAchievements",
    "wishlist",
    "familyShared",
    "ownedByCurrentUser",
    "nonGame",
  ] as const) {
    if (typeof value[field] !== "boolean") issue(issues, `${path}.${field}`, "must be a boolean");
  }
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
  validateAchievements(issues, value.achievements, `${path}.achievements`);
  validateWishlist(issues, value.wishlist, `${path}.wishlist`);
  validateOwnership(issues, value.ownership, `${path}.ownership`);
  validateFlags(issues, value.flags, `${path}.flags`);
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
    for (const field of ["achievementCount", "wishlistCount", "familySharedCount"] as const) {
      if (value.summary[field] !== undefined && !isNonNegativeInteger(value.summary[field])) {
        issue(issues, `$.summary.${field}`, "must be a non-negative integer");
      }
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
    const achievementCount = value.games.filter((game) => isRecord(game) && isRecord(game.achievements)).length;
    const wishlistCount = value.games.filter((game) => isRecord(game) && isRecord(game.wishlist)).length;
    const familySharedCount = value.games.filter((game) =>
      isRecord(game) && isRecord(game.ownership) && game.ownership.familyShared === true
    ).length;
    if (value.summary.gameCount !== value.games.length) issue(issues, "$.summary.gameCount", "must match games length");
    if (value.summary.collectionCount !== value.collections.length) {
      issue(issues, "$.summary.collectionCount", "must match collections length");
    }
    if (value.summary.hltbCount !== hltbCount) issue(issues, "$.summary.hltbCount", "must match games with HLTB data");
    if (value.summary.achievementCount !== undefined && value.summary.achievementCount !== achievementCount) {
      issue(issues, "$.summary.achievementCount", "must match games with achievements data");
    }
    if (value.summary.wishlistCount !== undefined && value.summary.wishlistCount !== wishlistCount) {
      issue(issues, "$.summary.wishlistCount", "must match games with wishlist data");
    }
    if (value.summary.familySharedCount !== undefined && value.summary.familySharedCount !== familySharedCount) {
      issue(issues, "$.summary.familySharedCount", "must match family-shared games");
    }
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

export function getSnapshotAchievements(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotAchievements | null {
  return getSnapshotGame(snapshot, appId)?.achievements ?? null;
}

export function getSnapshotWishlist(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotWishlist | null {
  return getSnapshotGame(snapshot, appId)?.wishlist ?? null;
}

export function getSnapshotOwnership(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotOwnership | null {
  return getSnapshotGame(snapshot, appId)?.ownership ?? null;
}

export function getSnapshotFlags(snapshot: LibrarySnapshot, appId: number): LibrarySnapshotGameFlags | null {
  return getSnapshotGame(snapshot, appId)?.flags ?? null;
}

export function listSnapshotCollections(snapshot: LibrarySnapshot): LibrarySnapshotCollection[] {
  return [...snapshot.collections].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function groupSnapshotGamesByCollection(snapshot: LibrarySnapshot): Map<string, LibrarySnapshotGame[]> {
  const grouped = new Map<string, LibrarySnapshotGame[]>();
  for (const collection of snapshot.collections) grouped.set(collection.key, []);
  for (const game of snapshot.games) {
    for (const collection of game.collections) {
      const games = grouped.get(collection.key) ?? [];
      games.push(game);
      grouped.set(collection.key, games);
    }
  }
  for (const games of grouped.values()) games.sort((a, b) => a.name.localeCompare(b.name) || a.appId - b.appId);
  return grouped;
}

export function summarizeSnapshot(snapshot: LibrarySnapshot): LibrarySnapshotSummaryStats {
  const hltb = snapshot.games.filter((game) => game.hltb).length;
  const achievements = snapshot.games.filter((game) => game.achievements).length;
  const wishlist = snapshot.games.filter((game) => game.wishlist).length;
  const familyShared = snapshot.games.filter((game) => game.ownership?.familyShared).length;
  const collectionOnly = snapshot.games.filter((game) => game.flags?.collectionOnly ?? game.isCollectionOnly).length;
  const missingDetails = snapshot.games.filter((game) => game.flags?.missingDetails ?? !game.details).length;
  return {
    games: snapshot.games.length,
    collections: snapshot.collections.length,
    hltb,
    achievements,
    wishlist,
    familyShared,
    collectionOnly,
    missingDetails,
  };
}

export function filterSnapshotGames(
  snapshot: LibrarySnapshot,
  predicate: (game: LibrarySnapshotGame) => boolean
): LibrarySnapshotGame[] {
  return snapshot.games.filter(predicate).sort((a, b) => a.name.localeCompare(b.name) || a.appId - b.appId);
}

export function stableSnapshotStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSnapshotStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
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
