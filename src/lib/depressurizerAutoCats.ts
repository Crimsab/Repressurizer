import {
  DEFAULT_DEVPUB_CONFIG,
  DEFAULT_FLAGS_CONFIG,
  DEFAULT_GENRE_CONFIG,
  DEFAULT_HOURS_CONFIG,
  DEFAULT_LANGUAGE_CONFIG,
  DEFAULT_NAME_CONFIG,
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_STEAM_RATING_CONFIG,
  DEFAULT_TAGS_CONFIG,
  DEFAULT_YEAR_CONFIG,
  type AutoCategorizePreset,
  type AutoCategorizePresetConfig,
  type CategorizerType,
} from "../stores/autoCategorizeStore";
import type {
  DevPubConfig,
  FlagsConfig,
  GenreConfig,
  HoursConfig,
  LanguageConfig,
  NameConfig,
  PlatformConfig,
  SteamRatingConfig,
  TagsConfig,
  YearGrouping,
} from "./tauri";
import type {
  DepressurizerImportedAutoCat,
  DepressurizerProfileImport,
} from "./types";

const DEFAULT_HLTB_IMPORT_CONFIG: HoursConfig = {
  prefix: "",
  rules: [
    { name: "Very Short (< 5h)", min_hours: 0, max_hours: 5 },
    { name: "Short (5-15h)", min_hours: 5, max_hours: 15 },
    { name: "Medium (15-30h)", min_hours: 15, max_hours: 30 },
    { name: "Long (30-60h)", min_hours: 30, max_hours: 60 },
    { name: "Very Long (60h+)", min_hours: 60, max_hours: 0 },
  ],
};

export function depressurizerAutoCatsToPresets(
  imported: DepressurizerProfileImport
): AutoCategorizePreset[] {
  const now = Date.now();
  return imported.autoCats
    .map((autoCat, index) => {
      const type = depressurizerAutoCatType(autoCat.normalizedType);
      if (!type || !autoCat.supported) return null;
      const config = depressurizerAutoCatConfig(autoCat, type);
      if (!config) return null;
      const name = autoCat.name.trim() || `Depressurizer ${type}`;
      return {
        id: `dep-${now}-${index}-${hashName(`${name}:${type}`)}`,
        name,
        type,
        config,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter((preset): preset is AutoCategorizePreset => preset !== null);
}

function depressurizerAutoCatType(normalizedType: string): CategorizerType | null {
  if (
    normalizedType === "hours" ||
    normalizedType === "genre" ||
    normalizedType === "tags" ||
    normalizedType === "year" ||
    normalizedType === "score" ||
    normalizedType === "rating" ||
    normalizedType === "hltb" ||
    normalizedType === "devpub" ||
    normalizedType === "flags" ||
    normalizedType === "language" ||
    normalizedType === "platform" ||
    normalizedType === "name"
  ) {
    return normalizedType;
  }
  return null;
}

function depressurizerAutoCatConfig(
  autoCat: DepressurizerImportedAutoCat,
  type: CategorizerType
): AutoCategorizePresetConfig | null {
  const prefix = autoCat.prefix ?? rawTextField(autoCat.rawConfig, ["prefix"]) ?? "";

  if (type === "hours") {
    return cloneHoursConfig(DEFAULT_HOURS_CONFIG, prefix);
  }
  if (type === "genre") {
    const config: GenreConfig = {
      ...DEFAULT_GENRE_CONFIG,
      prefix,
      max_categories: rawNumberField(autoCat.rawConfig, [
        "maxCategories",
        "maxGenres",
        "MaxCategories",
      ]) ?? DEFAULT_GENRE_CONFIG.max_categories,
      ignored_genres: rawStringListField(autoCat.rawConfig, [
        "ignoredGenres",
        "ignored",
        "ignore",
      ]).filter(Boolean),
    };
    if (config.ignored_genres.length === 0) {
      config.ignored_genres = [...DEFAULT_GENRE_CONFIG.ignored_genres];
    }
    return config;
  }
  if (type === "tags") {
    const config: TagsConfig = {
      ...DEFAULT_TAGS_CONFIG,
      prefix,
      max_tags: rawNumberField(autoCat.rawConfig, [
        "maxTags",
        "maxCategories",
      ]) ?? DEFAULT_TAGS_CONFIG.max_tags,
      included_tags: rawStringListField(autoCat.rawConfig, [
        "includedTags",
        "includeTags",
        "tags",
        "tag",
      ]).filter(Boolean),
    };
    return config;
  }
  if (type === "year") {
    return {
      ...DEFAULT_YEAR_CONFIG,
      prefix,
      grouping: normalizeYearGrouping(rawTextField(autoCat.rawConfig, [
        "grouping",
        "yearGrouping",
        "groupingMode",
      ])) ?? DEFAULT_YEAR_CONFIG.grouping,
      include_unknown: rawBoolField(autoCat.rawConfig, [
        "includeUnknown",
        "includeUnknownYear",
      ]) ?? DEFAULT_YEAR_CONFIG.include_unknown,
      unknown_text: rawTextField(autoCat.rawConfig, ["unknownText"]) ?? DEFAULT_YEAR_CONFIG.unknown_text,
    };
  }
  if (type === "score") {
    return {};
  }
  if (type === "rating") {
    const config: SteamRatingConfig = {
      ...DEFAULT_STEAM_RATING_CONFIG,
      prefix,
      use_wilson_score: rawBoolField(autoCat.rawConfig, [
        "useWilsonScore",
        "UseWilsonScore",
      ]) ?? DEFAULT_STEAM_RATING_CONFIG.use_wilson_score,
    };
    return config;
  }
  if (type === "hltb") {
    return cloneHoursConfig(DEFAULT_HLTB_IMPORT_CONFIG, prefix);
  }
  if (type === "devpub") {
    const config: DevPubConfig = {
      ...DEFAULT_DEVPUB_CONFIG,
      prefix,
      include_developers: rawBoolField(autoCat.rawConfig, [
        "includeDevelopers",
        "developers",
      ]) ?? DEFAULT_DEVPUB_CONFIG.include_developers,
      include_publishers: rawBoolField(autoCat.rawConfig, [
        "includePublishers",
        "publishers",
      ]) ?? DEFAULT_DEVPUB_CONFIG.include_publishers,
      selected: rawStringListField(autoCat.rawConfig, [
        "selected",
        "included",
        "names",
      ]).filter(Boolean),
      min_games: rawNumberField(autoCat.rawConfig, [
        "minGames",
        "minimumGames",
      ]) ?? DEFAULT_DEVPUB_CONFIG.min_games,
    };
    return config;
  }
  if (type === "flags") {
    const config: FlagsConfig = {
      ...DEFAULT_FLAGS_CONFIG,
      prefix,
      max_flags: rawNumberField(autoCat.rawConfig, [
        "maxFlags",
        "maxCategories",
      ]) ?? DEFAULT_FLAGS_CONFIG.max_flags,
      included_flags: rawStringListField(autoCat.rawConfig, [
        "includedFlags",
        "flags",
        "flag",
      ]).filter(Boolean),
    };
    return config;
  }
  if (type === "language") {
    const config: LanguageConfig = {
      ...DEFAULT_LANGUAGE_CONFIG,
      prefix,
      max_languages: rawNumberField(autoCat.rawConfig, [
        "maxLanguages",
        "maxCategories",
      ]) ?? DEFAULT_LANGUAGE_CONFIG.max_languages,
      included_languages: rawStringListField(autoCat.rawConfig, [
        "includedLanguages",
        "languages",
        "language",
        "interface",
        "subtitles",
        "fullAudio",
      ]).filter(Boolean),
    };
    return config;
  }
  if (type === "platform") {
    const config: PlatformConfig = {
      ...DEFAULT_PLATFORM_CONFIG,
      prefix,
      include_windows: rawBoolField(autoCat.rawConfig, [
        "includeWindows",
        "windows",
        "Windows",
      ]) ?? DEFAULT_PLATFORM_CONFIG.include_windows,
      include_mac: rawBoolField(autoCat.rawConfig, [
        "includeMac",
        "mac",
        "Mac",
      ]) ?? DEFAULT_PLATFORM_CONFIG.include_mac,
      include_linux: rawBoolField(autoCat.rawConfig, [
        "includeLinux",
        "linux",
        "Linux",
        "steamOS",
      ]) ?? DEFAULT_PLATFORM_CONFIG.include_linux,
    };
    return config;
  }
  if (type === "name") {
    const config: NameConfig = {
      ...DEFAULT_NAME_CONFIG,
      prefix,
      skip_leading_the: rawBoolField(autoCat.rawConfig, [
        "skipLeadingThe",
        "ignoreThe",
      ]) ?? DEFAULT_NAME_CONFIG.skip_leading_the,
      group_numbers: rawBoolField(autoCat.rawConfig, [
        "groupNumbers",
        "numbers",
      ]) ?? DEFAULT_NAME_CONFIG.group_numbers,
      group_other: rawBoolField(autoCat.rawConfig, [
        "groupOther",
        "other",
      ]) ?? DEFAULT_NAME_CONFIG.group_other,
    };
    return config;
  }

  return null;
}

function cloneHoursConfig(config: HoursConfig, prefix: string): HoursConfig {
  return {
    ...config,
    prefix,
    rules: config.rules.map((rule) => ({ ...rule })),
  };
}

function normalizeYearGrouping(value: string | undefined): YearGrouping | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[^a-z]/gi, "").toLowerCase();
  if (normalized.includes("half")) return "HalfDecade";
  if (normalized.includes("decade")) return "Decade";
  if (normalized.includes("none") || normalized.includes("year")) return "None";
  return undefined;
}

function rawTextField(raw: unknown, names: string[]): string | undefined {
  return rawText(rawField(raw, names));
}

function rawNumberField(raw: unknown, names: string[]): number | undefined {
  const text = rawTextField(raw, names);
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rawBoolField(raw: unknown, names: string[]): boolean | undefined {
  const text = rawTextField(raw, names);
  if (!text) return undefined;
  if (["true", "1", "yes", "on"].includes(text.trim().toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(text.trim().toLowerCase())) return false;
  return undefined;
}

function rawStringListField(raw: unknown, names: string[]): string[] {
  return dedupeStrings(rawStringList(rawField(raw, names)));
}

function rawField(raw: unknown, names: string[]): unknown {
  const record = rawRecord(raw);
  if (!record) return undefined;
  const wanted = new Set(names.map(normalizeRawKey));
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("_")) continue;
    if (wanted.has(normalizeRawKey(key))) return value;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("_")) continue;
    const nested = rawField(value, names);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function rawRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function rawText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = rawText(item);
      if (text) return text;
    }
    return undefined;
  }
  const record = rawRecord(value);
  if (!record) return undefined;
  if (typeof record._text === "string") return record._text.trim() || undefined;
  const child = Object.entries(record).find(([key]) => !key.startsWith("_"));
  return child ? rawText(child[1]) : undefined;
}

function rawStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(rawStringList);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = rawText(value);
    return text ? [text] : [];
  }
  const record = rawRecord(value);
  if (!record) return [];
  const childEntries = Object.entries(record).filter(([key]) => !key.startsWith("_"));
  if (childEntries.length === 0) {
    const text = rawText(value);
    return text ? [text] : [];
  }
  return childEntries
    .flatMap(([, entry]) => rawStringList(entry))
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalizeRawKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function hashName(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
