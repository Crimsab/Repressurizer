import type {
  HoursConfig,
  LanguageConfig,
  FlagsConfig,
  PlatformConfig,
  NameConfig,
} from "./tauri";
import type { AutoCategorizeApplyType } from "./autoCategorizeApply";

export type PreviewSortMode = "count" | "name" | "natural";

export interface PreviewSortContext {
  type: AutoCategorizeApplyType;
  config: unknown;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortAutoCategorizePreviewEntries(
  assignments: Record<string, number[]>,
  sortMode: PreviewSortMode,
  context: PreviewSortContext | null = null
): Array<[string, number[]]> {
  const entries = Object.entries(assignments);

  return entries.sort((a, b) => {
    if (sortMode === "count") {
      return b[1].length - a[1].length || compareNames(a[0], b[0]);
    }

    if (sortMode === "natural") {
      return compareNatural(a, b, context);
    }

    return compareNames(a[0], b[0]);
  });
}

function compareNatural(
  a: [string, number[]],
  b: [string, number[]],
  context: PreviewSortContext | null
): number {
  if (!context) return compareNames(a[0], b[0]);

  const aRank = naturalRank(a[0], context);
  const bRank = naturalRank(b[0], context);

  if (aRank.rank !== bRank.rank) return aRank.rank - bRank.rank;
  return compareNames(aRank.label, bRank.label) || compareNames(a[0], b[0]);
}

function naturalRank(name: string, context: PreviewSortContext): { rank: number; label: string } {
  if (context.type === "hours" || context.type === "hltb") {
    const config = context.config as Partial<HoursConfig>;
    const expected = (config.rules ?? []).map((rule, index) => [
      prefixedName(config.prefix, rule.name),
      index,
    ] as const);
    const exact = expected.find(([expectedName]) => expectedName === name);
    if (exact) return { rank: exact[1], label: name };
    return { rank: Number.MAX_SAFE_INTEGER, label: name };
  }

  if (context.type === "score") {
    const scoreOrder = ["Must-Play", "Great", "Good", "Mixed", "Poor"];
    const index = scoreOrder.indexOf(name);
    return { rank: index >= 0 ? index : Number.MAX_SAFE_INTEGER, label: name };
  }

  if (context.type === "platform") {
    const config = context.config as Partial<PlatformConfig>;
    const platformOrder = ["Windows", "macOS", "Linux"].map((label) =>
      prefixedName(config.prefix, label)
    );
    const index = platformOrder.indexOf(name);
    return { rank: index >= 0 ? index : Number.MAX_SAFE_INTEGER, label: name };
  }

  if (context.type === "year") {
    const core = stripPrefix(name, (context.config as { prefix?: string }).prefix);
    const match = core.match(/\d{4}/);
    return {
      rank: match ? Number(match[0]) : Number.MAX_SAFE_INTEGER,
      label: core,
    };
  }

  if (context.type === "name") {
    const config = context.config as Partial<NameConfig>;
    const core = stripPrefix(name, config.prefix).trim().toUpperCase();
    if (core === "#") return { rank: 0, label: core };
    if (/^[A-Z]$/.test(core)) return { rank: core.charCodeAt(0) - 64, label: core };
    if (core === "OTHER") return { rank: 27, label: core };
    return { rank: 28, label: core };
  }

  if (context.type === "flags") {
    const config = context.config as Partial<FlagsConfig>;
    return { rank: 0, label: stripPrefix(name, config.prefix) };
  }

  if (context.type === "language") {
    const config = context.config as Partial<LanguageConfig>;
    return { rank: 0, label: stripPrefix(name, config.prefix) };
  }

  return { rank: 0, label: name };
}

function prefixedName(prefix: string | undefined, name: string): string {
  return `${prefix ?? ""}${name}`.trim();
}

function stripPrefix(name: string, prefix: string | undefined): string {
  if (prefix && name.startsWith(prefix)) return name.slice(prefix.length);
  return name;
}

function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}
