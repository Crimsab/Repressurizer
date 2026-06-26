import { create } from "zustand";
import type {
  HoursConfig,
  GenreConfig,
  TagsConfig,
  YearConfig,
  DevPubConfig,
  FlagsConfig,
  PlatformConfig,
  NameConfig,
  CategorizeResult,
} from "../lib/tauri";

export type CategorizerType =
  | "hours"
  | "genre"
  | "tags"
  | "year"
  | "score"
  | "hltb"
  | "devpub"
  | "flags"
  | "platform"
  | "name";
export type PersistStep = "choose" | "configure" | "preview" | "done";

export type AutoCategorizePresetConfig =
  | HoursConfig
  | GenreConfig
  | TagsConfig
  | YearConfig
  | DevPubConfig
  | FlagsConfig
  | PlatformConfig
  | NameConfig
  | Record<string, never>;

export interface AutoCategorizePreset {
  id: string;
  name: string;
  type: CategorizerType;
  config: AutoCategorizePresetConfig;
  createdAt: number;
  updatedAt: number;
}

interface AutoCategorizeState {
  lastType: CategorizerType;
  lastStep: PersistStep;
  hoursConfig: HoursConfig;
  genreConfig: GenreConfig;
  tagsConfig: TagsConfig;
  yearConfig: YearConfig;
  devPubConfig: DevPubConfig;
  flagsConfig: FlagsConfig;
  platformConfig: PlatformConfig;
  nameConfig: NameConfig;
  presets: AutoCategorizePreset[];
  lastResult: CategorizeResult | null;
  set: (patch: Partial<Omit<AutoCategorizeState, "set">>) => void;
}

export const DEFAULT_HOURS_CONFIG: HoursConfig = {
  prefix: "",
  rules: [
    { name: "Unplayed", min_hours: 0, max_hours: 0.01 },
    { name: "< 1h", min_hours: 0.01, max_hours: 1 },
    { name: "1-10h", min_hours: 1, max_hours: 10 },
    { name: "10-50h", min_hours: 10, max_hours: 50 },
    { name: "50-100h", min_hours: 50, max_hours: 100 },
    { name: "100h+", min_hours: 100, max_hours: 0 },
  ],
};

export const DEFAULT_GENRE_CONFIG: GenreConfig = {
  prefix: "",
  max_categories: undefined,
  ignored_genres: ["Free to Play"],
};

export const DEFAULT_TAGS_CONFIG: TagsConfig = {
  prefix: "",
  max_tags: 3,
  included_tags: [],
};

export const DEFAULT_YEAR_CONFIG: YearConfig = {
  prefix: "",
  grouping: "None",
  include_unknown: false,
  unknown_text: "Unknown Year",
};

export const DEFAULT_DEVPUB_CONFIG: DevPubConfig = {
  prefix: "(Studio) ",
  include_developers: true,
  include_publishers: true,
  selected: [],
  min_games: undefined,
};

export const DEFAULT_FLAGS_CONFIG: FlagsConfig = {
  prefix: "(Flag) ",
  max_flags: undefined,
  included_flags: [],
};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  prefix: "(Platform) ",
  include_windows: true,
  include_mac: true,
  include_linux: true,
};

export const DEFAULT_NAME_CONFIG: NameConfig = {
  prefix: "(Name) ",
  skip_leading_the: true,
  group_numbers: true,
  group_other: true,
};

const defaults: Omit<AutoCategorizeState, "set"> = {
  lastType: "hours",
  lastStep: "choose",
  hoursConfig: DEFAULT_HOURS_CONFIG,
  genreConfig: DEFAULT_GENRE_CONFIG,
  tagsConfig: DEFAULT_TAGS_CONFIG,
  yearConfig: DEFAULT_YEAR_CONFIG,
  devPubConfig: DEFAULT_DEVPUB_CONFIG,
  flagsConfig: DEFAULT_FLAGS_CONFIG,
  platformConfig: DEFAULT_PLATFORM_CONFIG,
  nameConfig: DEFAULT_NAME_CONFIG,
  presets: [],
  lastResult: null,
};

function load(): Omit<AutoCategorizeState, "set"> {
  try {
    const raw = localStorage.getItem("repressurizer-autocategorize");
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function save(state: Omit<AutoCategorizeState, "set">) {
  try {
    // Don't persist "fetch" step — reopen to configure
    const s = { ...state, lastStep: state.lastStep === "done" ? "done" : state.lastStep };
    localStorage.setItem("repressurizer-autocategorize", JSON.stringify(s));
  } catch {}
}

export const useAutoCategorizeStore = create<AutoCategorizeState>((set) => ({
  ...load(),
  set: (patch) =>
    set((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    }),
}));
