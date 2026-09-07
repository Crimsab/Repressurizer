/**
 * User-supplied metadata used by the Steam Deck pack planner.
 *
 * Steam's store response does not reliably describe offline support,
 * first-launch connectivity, external launchers, or the installed size. Keep
 * those values separate from provider data so an override is explicit and can
 * be removed without pretending that Steam supplied it.
 */

export interface TravelMetadataRecord {
  offline: boolean | null;
  firstLaunchOnline: boolean | null;
  externalLauncher: boolean | null;
  sizeBytes: number | null;
}

export type TravelMetadataPatch = Partial<TravelMetadataRecord>;

export const TRAVEL_METADATA_VERSION = 1 as const;

export const EMPTY_TRAVEL_METADATA: TravelMetadataRecord = {
  offline: null,
  firstLaunchOnline: null,
  externalLauncher: null,
  sizeBytes: null,
};

interface PersistedTravelMetadata {
  version: typeof TRAVEL_METADATA_VERSION;
  records: Record<string, TravelMetadataRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTravelAppId(value: unknown): number | null {
  const appId = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(appId) || appId <= 0 || !Number.isInteger(appId)) return null;
  return appId;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeSizeBytes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(size) || size <= 0) return null;
  return Math.max(1, Math.trunc(size));
}

/** Normalize a complete record, filling missing values with the explicit unknown state. */
export function normalizeTravelMetadataRecord(value: unknown): TravelMetadataRecord | null {
  if (!isRecord(value)) return null;
  return {
    offline: normalizeBoolean(value.offline),
    firstLaunchOnline: normalizeBoolean(value.firstLaunchOnline),
    externalLauncher: normalizeBoolean(value.externalLauncher),
    sizeBytes: normalizeSizeBytes(value.sizeBytes),
  };
}

/** Normalize only fields supplied by an editor patch. Undefined means "leave unchanged". */
export function normalizeTravelMetadataPatch(value: unknown): TravelMetadataPatch {
  if (!isRecord(value)) return {};
  const patch: TravelMetadataPatch = {};
  if (Object.prototype.hasOwnProperty.call(value, "offline")) {
    patch.offline = normalizeBoolean(value.offline);
  }
  if (Object.prototype.hasOwnProperty.call(value, "firstLaunchOnline")) {
    patch.firstLaunchOnline = normalizeBoolean(value.firstLaunchOnline);
  }
  if (Object.prototype.hasOwnProperty.call(value, "externalLauncher")) {
    patch.externalLauncher = normalizeBoolean(value.externalLauncher);
  }
  if (Object.prototype.hasOwnProperty.call(value, "sizeBytes")) {
    patch.sizeBytes = normalizeSizeBytes(value.sizeBytes);
  }
  return patch;
}

export function mergeTravelMetadata(
  current: TravelMetadataRecord | null | undefined,
  patch: unknown,
): TravelMetadataRecord {
  const base = current ?? EMPTY_TRAVEL_METADATA;
  return {
    offline: base.offline,
    firstLaunchOnline: base.firstLaunchOnline,
    externalLauncher: base.externalLauncher,
    sizeBytes: base.sizeBytes,
    ...normalizeTravelMetadataPatch(patch),
  };
}

/**
 * Parse the versioned format strictly. A malformed file must fail hydration so
 * the caller cannot mistake corruption for an empty set and overwrite it.
 */
export function parseTravelMetadata(raw: string | null): Record<number, TravelMetadataRecord> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid travel metadata JSON");
  }

  if (!isRecord(parsed) || parsed.version !== TRAVEL_METADATA_VERSION || !isRecord(parsed.records)) {
    throw new Error("Unsupported travel metadata format");
  }

  const records: Record<number, TravelMetadataRecord> = {};
  for (const [key, value] of Object.entries(parsed.records)) {
    const appId = normalizeTravelAppId(key);
    if (appId === null || !isRecord(value)) throw new Error("Invalid travel metadata record");

    const fields: (keyof TravelMetadataRecord)[] = [
      "offline",
      "firstLaunchOnline",
      "externalLauncher",
      "sizeBytes",
    ];
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
      const fieldValue = value[field];
      if (field === "sizeBytes") {
        if (fieldValue !== null && (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue <= 0)) {
          throw new Error("Invalid travel metadata size");
        }
      } else if (fieldValue !== null && typeof fieldValue !== "boolean") {
        throw new Error("Invalid travel metadata flag");
      }
    }

    const record = normalizeTravelMetadataRecord(value);
    if (record === null) throw new Error("Invalid travel metadata record");
    records[appId] = record;
  }
  return records;
}

export function serializeTravelMetadata(
  records: Record<number, TravelMetadataRecord>,
): string {
  const persisted: PersistedTravelMetadata = {
    version: TRAVEL_METADATA_VERSION,
    records,
  };
  return JSON.stringify(persisted);
}
