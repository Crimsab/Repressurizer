import type { GameDetails, OwnedGame, SteamCollection } from "./types";
import type { HltbData } from "./tauri";

export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = "repressurizer.library-snapshot.v1" as const;

export interface LibrarySnapshotOptions {
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  details?: Record<number, GameDetails>;
  hltbData?: Record<number, HltbData>;
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
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function isoFromSteamTimestamp(ts: number): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
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

function toDetailsExport(details?: GameDetails | null): LibrarySnapshotGame["details"] {
  if (!details) return null;
  return {
    releaseDate: details.release_date ?? null,
    genres: [...(details.genres ?? [])].sort((a, b) => a.localeCompare(b)),
    categories: [...(details.categories ?? [])].sort((a, b) => a.localeCompare(b)),
    metacriticScore: details.metacritic_score ?? null,
    developers: [...(details.developers ?? [])].sort((a, b) => a.localeCompare(b)),
    publishers: [...(details.publishers ?? [])].sort((a, b) => a.localeCompare(b)),
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
      .sort(([a], [b]) => a.localeCompare(b));
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
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

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

  const games = Object.values(options.games)
    .sort((a, b) => a.appid - b.appid)
    .map((game) => {
      const hltb = toHltbExport(options.hltbData?.[game.appid]);
      return {
        appId: game.appid,
        name: String(game.name ?? ""),
        playtimeForeverMinutes: game.playtime_forever,
        playtimeForeverHours: roundHours(game.playtime_forever),
        rtimeLastPlayed: game.rtime_last_played,
        lastPlayedAt: isoFromSteamTimestamp(game.rtime_last_played),
        isCollectionOnly: Boolean(game.is_collection_only),
        collections: (collectionRefsByAppId.get(game.appid) ?? []).sort(
          (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)
        ),
        details: toDetailsExport(options.details?.[game.appid]),
        hltb,
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
