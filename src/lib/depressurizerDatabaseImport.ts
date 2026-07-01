import type { HltbData } from "./tauri";
import type { DepressurizerDatabaseImport, GameDetails, SteamReviewSummary } from "./types";

export interface DepressurizerDatabaseMergeInput {
  imported: DepressurizerDatabaseImport;
  currentDetails: Record<number, GameDetails>;
  currentHltb: Record<number, HltbData>;
  currentSteamReviews: Record<number, SteamReviewSummary>;
  options?: Partial<DepressurizerDatabaseMergeOptions>;
}

export interface DepressurizerDatabaseMergeOptions {
  includeDetails: boolean;
  includeTags: boolean;
  includeHltb: boolean;
  includeSteamReviews: boolean;
  overwriteDetails: boolean;
  overwriteTags: boolean;
  overwriteHltb: boolean;
  overwriteSteamReviews: boolean;
}

export interface DepressurizerDatabaseMergeResult {
  details: GameDetails[];
  hltb: Record<number, HltbData>;
  steamReviews: SteamReviewSummary[];
  stats: {
    detailsAdded: number;
    detailsMerged: number;
    hltbAdded: number;
    steamReviewsAdded: number;
    namesImported: number;
  };
}

export const DEFAULT_DEPRESSURIZER_DATABASE_MERGE_OPTIONS: DepressurizerDatabaseMergeOptions = {
  includeDetails: true,
  includeTags: true,
  includeHltb: true,
  includeSteamReviews: true,
  overwriteDetails: false,
  overwriteTags: false,
  overwriteHltb: false,
  overwriteSteamReviews: false,
};

export function prepareDepressurizerDatabaseMerge({
  imported,
  currentDetails,
  currentHltb,
  currentSteamReviews,
  options: rawOptions,
}: DepressurizerDatabaseMergeInput): DepressurizerDatabaseMergeResult {
  const options = { ...DEFAULT_DEPRESSURIZER_DATABASE_MERGE_OPTIONS, ...rawOptions };
  const details: GameDetails[] = [];
  let detailsAdded = 0;
  let detailsMerged = 0;

  if (options.includeDetails || options.includeTags) {
    for (const incoming of imported.details) {
      const existing = currentDetails[incoming.app_id];
      const merged = mergeImportedDetails(existing, incoming, options);
      if (!merged) continue;
      if (!existing) {
        details.push(merged);
        detailsAdded += 1;
      } else if (!sameDetails(existing, merged)) {
        details.push(merged);
        detailsMerged += 1;
      }
    }
  }

  const hltb: Record<number, HltbData> = {};
  if (options.includeHltb) {
    for (const [appId, value] of Object.entries(imported.hltb)) {
      const id = Number(appId);
      if (!Number.isFinite(id)) continue;
      const merged = mergeImportedHltb(currentHltb[id], value, options);
      if (!merged) continue;
      if (!hasHltbData(value)) continue;
      hltb[id] = merged;
    }
  }

  const steamReviews = options.includeSteamReviews
    ? imported.steamReviews.filter((rating) => {
        const existing = currentSteamReviews[rating.app_id];
        return options.overwriteSteamReviews || !existing || existing.total_reviews <= 0;
      })
    : [];

  return {
    details,
    hltb,
    steamReviews,
    stats: {
      detailsAdded,
      detailsMerged,
      hltbAdded: Object.keys(hltb).length,
      steamReviewsAdded: steamReviews.length,
      namesImported: Object.keys(imported.names).length,
    },
  };
}

function mergeImportedDetails(
  existing: GameDetails | undefined,
  incoming: GameDetails,
  options: DepressurizerDatabaseMergeOptions
): GameDetails | null {
  if (!existing) {
    const normalized = normalizeIncomingDetails(incoming);
    if (!options.includeDetails) {
      normalized.genres = [];
      normalized.categories = [];
      normalized.release_date = null;
      normalized.metacritic_score = null;
      normalized.developers = [];
      normalized.publishers = [];
      normalized.supported_languages = [];
      normalized.platforms = { windows: false, mac: false, linux: false };
    }
    if (!options.includeTags) normalized.tags = [];
    return hasImportableDetails(normalized) ? normalized : null;
  }

  const platforms =
    options.includeDetails && (options.overwriteDetails || !hasAnyPlatform(existing.platforms))
      ? incoming.platforms
      : existing.platforms;

  return {
    ...existing,
    name:
      options.includeDetails && (options.overwriteDetails || !usableName(existing.name, existing.app_id))
        ? incoming.name
        : existing.name,
    genres: options.includeDetails ? mergeArray(existing.genres, incoming.genres, options.overwriteDetails) : existing.genres,
    tags: options.includeTags
      ? options.overwriteTags
        ? cleanArray(incoming.tags)
        : unionArray(existing.tags ?? [], incoming.tags ?? [])
      : existing.tags,
    categories: options.includeDetails ? mergeArray(existing.categories, incoming.categories, options.overwriteDetails) : existing.categories,
    release_date: options.includeDetails && options.overwriteDetails ? incoming.release_date : existing.release_date ?? (options.includeDetails ? incoming.release_date : null),
    metacritic_score: options.includeDetails && options.overwriteDetails ? incoming.metacritic_score : existing.metacritic_score ?? (options.includeDetails ? incoming.metacritic_score : null),
    developers: options.includeDetails ? mergeArray(existing.developers, incoming.developers, options.overwriteDetails) : existing.developers,
    publishers: options.includeDetails ? mergeArray(existing.publishers, incoming.publishers, options.overwriteDetails) : existing.publishers,
    supported_languages: options.includeDetails
      ? mergeArray(existing.supported_languages, incoming.supported_languages, options.overwriteDetails)
      : existing.supported_languages,
    platforms,
    header_image: existing.header_image ?? incoming.header_image,
    capsule_image: existing.capsule_image ?? incoming.capsule_image,
    price_initial: existing.price_initial ?? incoming.price_initial,
    price_final: existing.price_final ?? incoming.price_final,
    price_currency: existing.price_currency ?? incoming.price_currency,
    price_country_code: existing.price_country_code ?? incoming.price_country_code,
    price_cache: existing.price_cache ?? incoming.price_cache,
    is_free: existing.is_free || incoming.is_free,
  };
}

function normalizeIncomingDetails(details: GameDetails): GameDetails {
  return {
    ...details,
    genres: details.genres ?? [],
    tags: details.tags ?? [],
    categories: details.categories ?? [],
    developers: details.developers ?? [],
    publishers: details.publishers ?? [],
    supported_languages: details.supported_languages ?? [],
    platforms: {
      windows: !!details.platforms?.windows,
      mac: !!details.platforms?.mac,
      linux: !!details.platforms?.linux,
    },
  };
}

function mergeArray(existing: string[] | undefined, incoming: string[] | undefined, overwrite: boolean): string[] {
  return overwrite ? cleanArray(incoming) : fillArray(existing, incoming);
}

function fillArray(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  const cleanExisting = cleanArray(existing);
  if (cleanExisting.length > 0) return cleanExisting;
  return cleanArray(incoming);
}

function unionArray(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of [...cleanArray(existing), ...cleanArray(incoming)]) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

function cleanArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function hasAnyPlatform(platforms: GameDetails["platforms"] | undefined): boolean {
  return !!platforms && (platforms.windows || platforms.mac || platforms.linux);
}

function hasImportableDetails(details: GameDetails): boolean {
  return (
    cleanArray(details.genres).length > 0 ||
    cleanArray(details.tags).length > 0 ||
    cleanArray(details.categories).length > 0 ||
    cleanArray(details.developers).length > 0 ||
    cleanArray(details.publishers).length > 0 ||
    cleanArray(details.supported_languages).length > 0 ||
    !!details.release_date ||
    details.metacritic_score != null ||
    hasAnyPlatform(details.platforms)
  );
}

function hasHltbData(value: HltbData | undefined): boolean {
  return !!value && (value.main_story != null || value.main_extra != null || value.completionist != null);
}

function mergeImportedHltb(
  existing: HltbData | undefined,
  incoming: HltbData,
  options: DepressurizerDatabaseMergeOptions
): HltbData | null {
  if (!hasHltbData(incoming)) return null;
  if (!existing || options.overwriteHltb) return incoming;

  const merged: HltbData = {
    ...existing,
    main_story: existing.main_story ?? incoming.main_story ?? null,
    main_extra: existing.main_extra ?? incoming.main_extra ?? null,
    completionist: existing.completionist ?? incoming.completionist ?? null,
    game_id: existing.game_id ?? incoming.game_id ?? null,
    game_name: existing.game_name ?? incoming.game_name ?? null,
    confidence: existing.confidence ?? incoming.confidence ?? null,
  };

  return sameHltb(existing, merged) ? null : merged;
}

function sameHltb(a: HltbData, b: HltbData): boolean {
  return (
    a.main_story === b.main_story &&
    a.main_extra === b.main_extra &&
    a.completionist === b.completionist &&
    a.game_id === b.game_id &&
    a.game_name === b.game_name &&
    a.confidence === b.confidence
  );
}

function usableName(name: string | undefined, appId: number): boolean {
  const trimmed = String(name ?? "").trim();
  return !!trimmed && trimmed !== `App ${appId}` && trimmed !== `Unknown (#${appId})`;
}

function sameDetails(a: GameDetails, b: GameDetails): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
