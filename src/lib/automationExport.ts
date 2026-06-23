import type { AchievementSummary, GameDetails, OwnedGame, SteamCollection } from "./types";
import type { FamilyLibraryApp, HltbData, WishlistItem } from "./tauri";

export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = "repressurizer.library-snapshot.v1" as const;

export interface LibrarySnapshotOptions {
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  details?: Record<number, GameDetails>;
  hltbData?: Record<number, HltbData>;
  achievements?: Record<number, AchievementSummary>;
  wishlistItems?: WishlistItem[];
  wishlistLastFetched?: number | null;
  familyApps?: Record<number, FamilyLibraryApp>;
  familyAuthUsed?: string | null;
  familyOwnerSteamId?: string | null;
  familyLastFetched?: number | null;
  appVersion?: string;
  steamId64?: string;
  steamPersonaName?: string;
  generatedAt?: string;
}

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
    achievementCount: number;
    wishlistCount: number;
    familySharedCount: number;
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

export interface LibrarySnapshotGame {
  appId: number;
  name: string;
  playtimeForeverMinutes: number;
  playtimeForeverHours: number;
  rtimeLastPlayed: number;
  lastPlayedAt: string | null;
  isCollectionOnly: boolean;
  collections: Array<{
    key: string;
    name: string;
    isDynamic: boolean;
  }>;
  details: {
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
  } | null;
  hltb: {
    source: "howlongtobeat";
    mainStory: number | null;
    mainExtra: number | null;
    completionist: number | null;
    hltbGameId: number | null;
    matchedName: string | null;
    confidence: number | null;
  } | null;
  achievements: {
    source: "steam_web_api";
    total: number;
    achieved: number;
    percent: number | null;
    complete: boolean;
    hasDetails: boolean;
  } | null;
  wishlist: {
    source: "steam_wishlist";
    priority: number;
    dateAdded: number;
    dateAddedAt: string | null;
    fetchedAt: string | null;
  } | null;
  ownership: {
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
  } | null;
  flags: {
    collectionOnly: boolean;
    hasDetails: boolean;
    missingDetails: boolean;
    hasHltb: boolean;
    hasAchievements: boolean;
    wishlist: boolean;
    familyShared: boolean;
    ownedByCurrentUser: boolean;
    nonGame: boolean;
  };
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function isoFromSteamTimestamp(ts: number): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

function compareStableStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isoFromMillis(ts?: number | null): string | null {
  if (!ts) return null;
  return new Date(ts).toISOString();
}

function steamTail(steamId64?: string): string | null {
  const trimmed = String(steamId64 ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(-4).padStart(Math.min(4, trimmed.length), "*");
}

function toHltbExport(hltb?: HltbData | null): LibrarySnapshotGame["hltb"] {
  if (!hltb) return null;
  if (hltb.main_story == null && hltb.main_extra == null && hltb.completionist == null) return null;
  return {
    source: "howlongtobeat",
    mainStory: hltb.main_story ?? null,
    mainExtra: hltb.main_extra ?? null,
    completionist: hltb.completionist ?? null,
    hltbGameId: hltb.game_id ?? null,
    matchedName: hltb.game_name ?? null,
    confidence: hltb.confidence ?? null,
  };
}

function toAchievementsExport(summary?: AchievementSummary | null): LibrarySnapshotGame["achievements"] {
  if (!summary) return null;
  const total = Math.max(0, Number(summary.total || 0));
  const achieved = Math.min(Math.max(0, Number(summary.achieved || 0)), total);
  return {
    source: "steam_web_api",
    total,
    achieved,
    percent: total > 0 ? Math.round((achieved / total) * 1000) / 10 : null,
    complete: total > 0 && achieved >= total,
    hasDetails: Array.isArray(summary.achievements) && summary.achievements.length > 0,
  };
}

function toWishlistExport(
  item?: WishlistItem | null,
  fetchedAt?: string | null
): LibrarySnapshotGame["wishlist"] {
  if (!item) return null;
  return {
    source: "steam_wishlist",
    priority: item.priority,
    dateAdded: item.date_added,
    dateAddedAt: isoFromSteamTimestamp(item.date_added),
    fetchedAt: fetchedAt ?? null,
  };
}

function toOwnershipExport(
  app?: FamilyLibraryApp | null,
  authUsed?: string | null,
  ownerSteamId?: string | null,
  fetchedAt?: string | null
): LibrarySnapshotGame["ownership"] {
  if (!app) return null;
  const ownerSteamIdTails = [...new Set((app.owner_steamids ?? []).map(steamTail).filter(Boolean) as string[])].sort(
    compareStableStrings
  );
  return {
    source: "steam_family",
    authUsed: authUsed?.trim() || null,
    ownerSteamIdTail: steamTail(ownerSteamId ?? undefined),
    ownerSteamIdTails,
    ownerCount: app.owner_steamids?.length ?? 0,
    ownedByCurrentUser: Boolean(app.is_owned_by_current_user),
    familyShared: Boolean(app.is_family_shared) && app.exclude_reason === 0,
    excluded: app.exclude_reason !== 0,
    excludeReason: app.exclude_reason,
    nonGame: Boolean(app.is_non_game),
    appType: app.app_type,
    fetchedAt: fetchedAt ?? null,
  };
}

function toFlagsExport(
  isCollectionOnly: boolean,
  details: LibrarySnapshotGame["details"],
  hltb: LibrarySnapshotGame["hltb"],
  achievements: LibrarySnapshotGame["achievements"],
  wishlist: LibrarySnapshotGame["wishlist"],
  ownership: LibrarySnapshotGame["ownership"]
): LibrarySnapshotGame["flags"] {
  const familyShared = Boolean(ownership?.familyShared);
  return {
    collectionOnly: isCollectionOnly,
    hasDetails: Boolean(details),
    missingDetails: !details,
    hasHltb: Boolean(hltb),
    hasAchievements: Boolean(achievements),
    wishlist: Boolean(wishlist),
    familyShared,
    ownedByCurrentUser: ownership?.ownedByCurrentUser ?? !familyShared,
    nonGame: ownership?.nonGame ?? false,
  };
}

function toDetailsExport(details?: GameDetails | null): LibrarySnapshotGame["details"] {
  if (!details) return null;
  return {
    releaseDate: details.release_date ?? null,
    genres: [...(details.genres ?? [])].sort(compareStableStrings),
    categories: [...(details.categories ?? [])].sort(compareStableStrings),
    metacriticScore: details.metacritic_score ?? null,
    developers: [...(details.developers ?? [])].sort(compareStableStrings),
    publishers: [...(details.publishers ?? [])].sort(compareStableStrings),
    platforms: {
      windows: Boolean(details.platforms?.windows),
      mac: Boolean(details.platforms?.mac),
      linux: Boolean(details.platforms?.linux),
    },
    isFree: Boolean(details.is_free),
    priceFinal: details.price_final ?? null,
    priceCurrency: details.price_currency ?? null,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildLibrarySnapshot(options: LibrarySnapshotOptions): LibrarySnapshot {
  const collections = options.collections
    .filter((collection) => !collection.is_deleted)
    .map((collection) => ({
      key: collection.key,
      name: collection.name,
      isDynamic: Boolean(collection.is_dynamic),
      gameCount: collection.added.length,
      appIds: [...collection.added].sort((a, b) => a - b),
    }))
    .sort((a, b) => compareStableStrings(a.name, b.name) || compareStableStrings(a.key, b.key));

  const collectionRefsByAppId = new Map<number, LibrarySnapshotGame["collections"]>();
  for (const collection of collections) {
    for (const appId of collection.appIds) {
      const refs = collectionRefsByAppId.get(appId) ?? [];
      refs.push({
        key: collection.key,
        name: collection.name,
        isDynamic: collection.isDynamic,
      });
      collectionRefsByAppId.set(appId, refs);
    }
  }

  const wishlistFetchedAt = isoFromMillis(options.wishlistLastFetched);
  const wishlistByAppId = new Map((options.wishlistItems ?? []).map((item) => [item.appid, item]));
  const familyFetchedAt = isoFromMillis(options.familyLastFetched);
  const familyByAppId = new Map(Object.values(options.familyApps ?? {}).map((app) => [app.appid, app]));

  const games = Object.values(options.games)
    .sort((a, b) => a.appid - b.appid)
    .map((game) => {
      const details = toDetailsExport(options.details?.[game.appid]);
      const hltb = toHltbExport(options.hltbData?.[game.appid]);
      const achievements = toAchievementsExport(options.achievements?.[game.appid]);
      const wishlist = toWishlistExport(wishlistByAppId.get(game.appid), wishlistFetchedAt);
      const ownership = toOwnershipExport(
        familyByAppId.get(game.appid),
        options.familyAuthUsed,
        options.familyOwnerSteamId,
        familyFetchedAt
      );
      return {
        appId: game.appid,
        name: String(game.name ?? ""),
        playtimeForeverMinutes: game.playtime_forever,
        playtimeForeverHours: roundHours(game.playtime_forever),
        rtimeLastPlayed: game.rtime_last_played,
        lastPlayedAt: isoFromSteamTimestamp(game.rtime_last_played),
        isCollectionOnly: Boolean(game.is_collection_only),
        collections: (collectionRefsByAppId.get(game.appid) ?? []).sort(
          (a, b) => compareStableStrings(a.name, b.name) || compareStableStrings(a.key, b.key)
        ),
        details,
        hltb,
        achievements,
        wishlist,
        ownership,
        flags: toFlagsExport(Boolean(game.is_collection_only), details, hltb, achievements, wishlist, ownership),
      };
    });

  const payload = {
    schemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION,
    source: {
      app: "Repressurizer" as const,
      version: options.appVersion ?? "unknown",
    },
    steam: {
      steamId64Tail: steamTail(options.steamId64),
      personaName: options.steamPersonaName?.trim() || null,
    },
    summary: {
      gameCount: games.length,
      collectionCount: collections.length,
      hltbCount: games.filter((game) => game.hltb).length,
      achievementCount: games.filter((game) => game.achievements).length,
      wishlistCount: games.filter((game) => game.wishlist).length,
      familySharedCount: games.filter((game) => game.ownership?.familyShared).length,
    },
    collections,
    games,
  };

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ...payload,
    checksum: `fnv1a32:${fnv1a32(stableStringify(payload))}`,
  };
}

export function generateLibrarySnapshotJson(options: LibrarySnapshotOptions): string {
  return JSON.stringify(buildLibrarySnapshot(options), null, 2);
}
