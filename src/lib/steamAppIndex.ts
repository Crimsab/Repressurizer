import type { SteamAppListItem } from "./tauri";

export interface SteamAppIndexEntry {
  appid: number;
  name: string;
}

export interface SteamAppIndexData {
  version: 1;
  fetchedAt: number;
  apps: Record<number, SteamAppIndexEntry>;
}

export const EMPTY_STEAM_APP_INDEX: SteamAppIndexData = {
  version: 1,
  fetchedAt: 0,
  apps: {},
};

export const STEAM_APP_INDEX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function parseSteamAppIndex(raw: string | null): SteamAppIndexData {
  if (!raw) return structuredClone(EMPTY_STEAM_APP_INDEX);
  try {
    const parsed = JSON.parse(raw) as Partial<SteamAppIndexData>;
    if (parsed.version !== 1 || !parsed.apps || typeof parsed.fetchedAt !== "number") {
      return structuredClone(EMPTY_STEAM_APP_INDEX);
    }
    return {
      version: 1,
      fetchedAt: parsed.fetchedAt,
      apps: parsed.apps,
    };
  } catch {
    return structuredClone(EMPTY_STEAM_APP_INDEX);
  }
}

export function buildSteamAppIndex(
  items: SteamAppListItem[],
  fetchedAt = Date.now(),
): SteamAppIndexData {
  const apps: Record<number, SteamAppIndexEntry> = {};
  for (const item of items) {
    const name = item.name.trim();
    if (!Number.isFinite(item.appid) || item.appid <= 0 || !name) continue;
    apps[item.appid] = { appid: item.appid, name };
  }
  return { version: 1, fetchedAt, apps };
}

export function isSteamAppIndexStale(
  data: SteamAppIndexData,
  now = Date.now(),
): boolean {
  return data.fetchedAt <= 0 || now - data.fetchedAt > STEAM_APP_INDEX_MAX_AGE_MS;
}
