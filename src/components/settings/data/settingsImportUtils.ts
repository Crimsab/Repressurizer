import {
  useAutoCategorizeStore,
  type AutoCategorizePreset,
} from "../../../stores/autoCategorizeStore";
import {
  useAdvancedFilterStore,
  type AdvancedSpecialState,
  type SavedAdvancedFilter,
} from "../../../stores/advancedFilterStore";
import { useAppNameOverrideStore } from "../../../stores/appNameOverrideStore";
import { useBackgroundFetchStore } from "../../../stores/backgroundFetchStore";
import { useGameStore } from "../../../stores/gameStore";
import { useSteamAppIndexStore } from "../../../stores/steamAppIndexStore";
import { isPlaceholderGameName } from "../../../lib/libraryMerge";
import type {
  DepressurizerDatabaseImport,
  DepressurizerImportedFilter,
  DepressurizerProfileImport,
  OwnedGame,
  SteamCollection,
} from "../../../lib/types";
import type {
  LegacySharedConfigGame,
  LocalLicenseApp,
  SteamShortcut,
} from "../../../lib/tauri";

const DEPRESSURIZER_DATABASE_IMPORT_COLLECTION_KEY = "user-collections.dep-db-imports";

export function mergeImportedCollections(
  current: SteamCollection[],
  imported: SteamCollection[]
): SteamCollection[] {
  const next = structuredClone(current);
  const byKey = new Map(next.map((collection, index) => [collection.key, index]));
  const byName = new Map(
    next
      .map((collection, index) => [collection.name.trim().toLowerCase(), index] as const)
      .filter(([, index]) => !next[index].is_dynamic)
  );

  for (const incoming of imported) {
    const normalizedName = incoming.name.trim().toLowerCase();
    const targetIndex =
      byKey.get(incoming.key) ??
      (isSpecialCollectionKey(incoming.key) ? undefined : byName.get(normalizedName));

    if (targetIndex == null) {
      byKey.set(incoming.key, next.length);
      byName.set(normalizedName, next.length);
      next.push(structuredClone(incoming));
      continue;
    }

    const target = next[targetIndex];
    const added = new Set([...(target.added ?? []), ...(incoming.added ?? [])]);
    const removed = new Set([...(target.removed ?? [])]);
    for (const appId of incoming.removed ?? []) {
      if (!added.has(appId)) removed.add(appId);
    }
    next[targetIndex] = {
      ...target,
      added: [...added],
      removed: [...removed],
      is_deleted: false,
    };
  }

  return next;
}

function isSpecialCollectionKey(key: string): boolean {
  return key === "user-collections.hidden" || key === "user-collections.favorite";
}

export async function hydrateSteamAppIndexForNames(apiKey: string | null | undefined) {
  const store = useSteamAppIndexStore.getState();
  await store.hydrate().catch(() => {});
  const key = apiKey?.trim();
  if (!key) return;
  await store.ensureFresh(key).catch(() => {});
}

function resolveImportedSteamGameName(appId: number, preferredName?: string | null): string {
  const preferred = preferredName?.trim();
  if (preferred && !isPlaceholderGameName(appId, preferred)) return preferred;

  const cachedDetailName = useGameStore.getState().details[appId]?.name?.trim();
  if (cachedDetailName) return cachedDetailName;

  const cachedImportedName = useAppNameOverrideStore.getState().resolveName(appId);
  if (cachedImportedName) return cachedImportedName;

  return useSteamAppIndexStore.getState().resolveName(appId) ?? preferred ?? `App ${appId}`;
}

export function fetchDetailsForPlaceholderNames(games: OwnedGame[]) {
  const details = useGameStore.getState().details;
  const ids = games
    .filter((game) => isPlaceholderGameName(game.appid, game.name) && !details[game.appid])
    .map((game) => game.appid);
  if (ids.length > 0) useBackgroundFetchStore.getState().startDetailsFetch(ids);
}

export function depressurizerGamesToOwnedGames(imported: DepressurizerProfileImport): OwnedGame[] {
  return imported.games
    .filter((game) => !game.nonSteam && game.appid > 0)
    .map((game) => ({
      appid: game.appid,
      name: resolveImportedSteamGameName(game.appid, game.name),
      playtime_forever: Math.max(0, Math.round((game.hoursPlayed ?? 0) * 60)),
      img_icon_url: null,
      rtime_last_played: game.lastPlayed ?? 0,
      is_collection_only: true,
    }));
}

export function mergeAutoCategorizePresets(importedPresets: AutoCategorizePreset[]): number {
  if (importedPresets.length === 0) return 0;
  const autoCatStore = useAutoCategorizeStore.getState();
  const existingKeys = new Set(
    autoCatStore.presets.map((preset) => autoCategorizePresetKey(preset))
  );
  const next = [...autoCatStore.presets];
  let saved = 0;

  for (const preset of importedPresets) {
    const key = autoCategorizePresetKey(preset);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    next.push(preset);
    saved++;
  }

  if (saved > 0) autoCatStore.set({ presets: next });
  return saved;
}

function autoCategorizePresetKey(preset: AutoCategorizePreset): string {
  return `${preset.type}:${preset.name.trim().toLowerCase()}:${JSON.stringify(preset.config)}`;
}

export function depressurizerFiltersToSavedAdvancedFilters(
  filters: DepressurizerImportedFilter[],
  collections: SteamCollection[]
): SavedAdvancedFilter[] {
  const now = Date.now();
  const categoryKeysByName = categoryKeyMap(collections);

  return filters
    .map((filter, index) => {
      const saved: SavedAdvancedFilter = {
        id: `dep-filter-${now}-${index}-${hashName(filter.name)}`,
        name: filter.name.trim() || "Depressurizer filter",
        allowCategoryKeys: depressurizerCategoryNamesToKeys(filter.allow, categoryKeysByName),
        requireCategoryKeys: depressurizerCategoryNamesToKeys(filter.require, categoryKeysByName),
        excludeCategoryKeys: depressurizerCategoryNamesToKeys(filter.exclude, categoryKeysByName),
        hidden: depressurizerSpecialState(filter.hidden),
        uncategorized: depressurizerSpecialState(filter.uncategorized),
        createdAt: now,
        updatedAt: now,
      };

      const hasCompatibleCriteria =
        saved.allowCategoryKeys.length > 0 ||
        saved.requireCategoryKeys.length > 0 ||
        saved.excludeCategoryKeys.length > 0 ||
        saved.hidden !== "any" ||
        saved.uncategorized !== "any";

      return hasCompatibleCriteria ? saved : null;
    })
    .filter((filter): filter is SavedAdvancedFilter => filter !== null);
}

export function mergeSavedAdvancedFilters(importedFilters: SavedAdvancedFilter[]): number {
  if (importedFilters.length === 0) return 0;
  const advancedFilterStore = useAdvancedFilterStore.getState();
  const existingKeys = new Set(
    advancedFilterStore.filters.map((filter) => savedAdvancedFilterKey(filter))
  );
  const next = [...advancedFilterStore.filters];
  let saved = 0;

  for (const filter of importedFilters) {
    const key = savedAdvancedFilterKey(filter);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    next.push(filter);
    saved++;
  }

  if (saved > 0) advancedFilterStore.setFilters(next);
  return saved;
}

function savedAdvancedFilterKey(filter: SavedAdvancedFilter): string {
  return [
    filter.name.trim().toLowerCase(),
    [...filter.allowCategoryKeys].sort().join(","),
    [...filter.requireCategoryKeys].sort().join(","),
    [...filter.excludeCategoryKeys].sort().join(","),
    filter.hidden,
    filter.uncategorized,
  ].join(":");
}

function categoryKeyMap(collections: SteamCollection[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const collection of collections) {
    if (collection.is_dynamic || isSpecialCollectionKey(collection.key)) continue;
    map.set(normalizeCategoryName(collection.name), collection.key);
  }
  return map;
}

function depressurizerCategoryNamesToKeys(
  names: string[],
  categoryKeysByName: Map<string, string>
): string[] {
  const keys = new Set<string>();
  for (const name of names) {
    const key = categoryKeysByName.get(normalizeCategoryName(name));
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function depressurizerSpecialState(value: number): AdvancedSpecialState {
  if (value === 1) return "require";
  if (value === 2) return "exclude";
  return "any";
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function parseAppIdList(input: string): number[] {
  return uniqueNumbers(
    input
      .split(/[^0-9]+/)
      .map((part) => Number(part))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
}

export function uniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    const id = Math.trunc(value);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function depressurizerDatabaseImportedIds(imported: DepressurizerDatabaseImport): Set<number> {
  return new Set(
    uniqueNumbers([
      ...Object.keys(imported.names).map(Number),
      ...imported.details.map((detail) => detail.app_id),
      ...Object.keys(imported.hltb).map(Number),
      ...imported.steamReviews.map((rating) => rating.app_id),
    ])
  );
}

export function depressurizerDatabaseToOwnedGames(imported: DepressurizerDatabaseImport, appIds: number[]): OwnedGame[] {
  const detailsById = new Map(imported.details.map((detail) => [detail.app_id, detail]));
  return uniqueNumbers(appIds).map((appid) => ({
    appid,
    name: imported.names[appid] ?? detailsById.get(appid)?.name?.trim() ?? `App ${appid}`,
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
    is_collection_only: true,
  }));
}

export function depressurizerDatabaseImportCollection(appIds: number[]): SteamCollection {
  const id = "dep-db-imports";
  return {
    id,
    key: DEPRESSURIZER_DATABASE_IMPORT_COLLECTION_KEY,
    name: "Depressurizer Database Imports",
    added: uniqueNumbers(appIds),
    removed: [],
    timestamp: Math.floor(Date.now() / 1000),
    is_deleted: false,
    is_dynamic: false,
  };
}

export function shortcutsToOwnedGames(shortcuts: SteamShortcut[]): OwnedGame[] {
  return shortcuts
    .filter((shortcut) => shortcut.appid > 0)
    .map((shortcut) => ({
      appid: shortcut.appid,
      name: shortcut.appname?.trim() || `Shortcut ${shortcut.appid}`,
      playtime_forever: 0,
      img_icon_url: null,
      rtime_last_played: shortcut.lastPlayTime ?? 0,
      is_collection_only: true,
    }));
}

export function shortcutsToCollections(shortcuts: SteamShortcut[]): SteamCollection[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const hidden = new Set<number>();
  const tagMap = new Map<string, Set<number>>();

  for (const shortcut of shortcuts) {
    if (shortcut.appid <= 0) continue;
    if (shortcut.hidden) hidden.add(shortcut.appid);
    for (const tag of shortcut.tags) {
      const name = tag.trim();
      if (!name) continue;
      const ids = tagMap.get(name) ?? new Set<number>();
      ids.add(shortcut.appid);
      tagMap.set(name, ids);
    }
  }

  const collections: SteamCollection[] = [
    {
      id: "hidden",
      key: "user-collections.hidden",
      name: "Hidden",
      added: [...hidden],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    },
  ];

  for (const [name, ids] of [...tagMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `uc-shortcut-${hashName(name)}-${slugName(name)}`;
    collections.push({
      id,
      key: `user-collections.${id}`,
      name,
      added: [...ids],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    });
  }

  return collections;
}

export function legacySharedConfigToOwnedGames(games: LegacySharedConfigGame[]): OwnedGame[] {
  return games.map((game) => ({
    appid: game.appid,
    name: resolveImportedSteamGameName(game.appid),
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: game.lastPlayed ?? 0,
    is_collection_only: true,
  }));
}

export function localLicenseAppsToOwnedGames(apps: LocalLicenseApp[]): OwnedGame[] {
  return apps.map((app) => ({
    appid: app.appid,
    name: resolveImportedSteamGameName(app.appid),
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
    is_collection_only: true,
  }));
}

export function legacySharedConfigToCollections(games: LegacySharedConfigGame[]): SteamCollection[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const hidden = new Set<number>();
  const tagMap = new Map<string, Set<number>>();

  for (const game of games) {
    if (game.hidden) hidden.add(game.appid);
    for (const tag of game.tags) {
      const name = tag.trim();
      if (!name) continue;
      const ids = tagMap.get(name) ?? new Set<number>();
      ids.add(game.appid);
      tagMap.set(name, ids);
    }
  }

  const collections: SteamCollection[] = [
    {
      id: "hidden",
      key: "user-collections.hidden",
      name: "Hidden",
      added: [...hidden],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    },
  ];

  for (const [name, ids] of [...tagMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `uc-legacy-${hashName(name)}-${slugName(name)}`;
    collections.push({
      id,
      key: `user-collections.${id}`,
      name,
      added: [...ids],
      removed: [],
      timestamp,
      is_deleted: false,
      is_dynamic: false,
    });
  }

  return collections;
}

function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "tag";
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
