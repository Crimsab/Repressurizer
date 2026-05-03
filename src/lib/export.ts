import type { OwnedGame, SteamCollection } from "./types";
import { computeStats } from "./stats";

export type ExportScope = "all" | "category" | "categories" | "categories_pick" | "stats";
export type ExportFormat = "json" | "csv" | "txt" | "md";

export interface ExportOptions {
  scope: ExportScope;
  format: ExportFormat;
  titlesOnly?: boolean;
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  activeCategory?: string;
  /** For scope `categories_pick`: collection keys to include (structured + flat union). */
  categoryKeys?: string[];
  /**
   * For `categories_pick` only: `structured` = one section per category (default).
   * `flat_unique` = single deduplicated list; CSV adds a Categories column.
   */
  pickLayout?: "structured" | "flat_unique";
}

function isCategoriesStructured(opts: ExportOptions): boolean {
  if (opts.scope === "categories") return true;
  if (opts.scope === "categories_pick") return opts.pickLayout !== "flat_unique";
  return false;
}

function categoryNamesForApp(appid: number, cols: SteamCollection[]): string {
  return cols.filter((c) => c.added.includes(appid)).map((c) => c.name).join("; ");
}

function pickCollections(opts: ExportOptions): SteamCollection[] {
  if (opts.scope === "categories_pick" && opts.categoryKeys?.length) {
    const keys = new Set(opts.categoryKeys);
    return opts.collections.filter((c) => keys.has(c.key));
  }
  if (opts.scope === "categories") {
    return opts.collections.filter((c) => c.id !== "hidden");
  }
  return [];
}

function getGamesForScope(opts: ExportOptions): OwnedGame[] {
  const all = Object.values(opts.games);
  if (opts.scope === "all") return all;
  if (opts.scope === "category" && opts.activeCategory) {
    const col = opts.collections.find((c) => c.key === opts.activeCategory);
    if (!col) return [];
    const ids = new Set(col.added);
    return all.filter((g) => ids.has(g.appid));
  }
  if (opts.scope === "categories_pick" && opts.categoryKeys?.length) {
    const keys = new Set(opts.categoryKeys);
    const idSet = new Set<number>();
    for (const c of opts.collections) {
      if (!keys.has(c.key)) continue;
      for (const id of c.added) idSet.add(id);
    }
    return all.filter((g) => idSet.has(g.appid));
  }
  return all;
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function gameRow(g: OwnedGame) {
  return {
    appid: g.appid,
    name: String(g.name ?? ""),
    playtime_hours: formatHours(g.playtime_forever),
    last_played: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10) : "Never",
  };
}

// --- Titles only ---
function toTitlesOnly(opts: ExportOptions): string {
  const games = getGamesForScope(opts).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""))
  );
  if (opts.format === "json") return JSON.stringify(games.map((g) => String(g.name ?? "")), null, 2);
  if (opts.format === "csv") return ["Name", ...games.map((g) => escapeCSV(String(g.name ?? "")))].join("\n");
  if (opts.format === "md") return games.map((g) => `- ${String(g.name ?? "")}`).join("\n");
  return games.map((g) => String(g.name ?? "")).join("\n");
}

// --- JSON ---
function toJSON(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    return JSON.stringify(computeStats(opts.games, opts.collections), null, 2);
  }
  if (opts.scope === "categories_pick" && opts.pickLayout === "flat_unique") {
    return JSON.stringify(getGamesForScope(opts).map(gameRow), null, 2);
  }
  if (isCategoriesStructured(opts)) {
    const cols = pickCollections(opts);
    const data = cols.map((c) => ({
      name: c.name,
      key: c.key,
      is_dynamic: c.is_dynamic,
      game_count: c.added.length,
      games: c.added.map((id) => {
        const g = opts.games[id];
        return g ? gameRow(g) : { appid: id, name: `Unknown (#${id})`, playtime_hours: "0", last_played: "Never" };
      }),
    }));
    return JSON.stringify(data, null, 2);
  }
  const games = getGamesForScope(opts).map(gameRow);
  return JSON.stringify(games, null, 2);
}

// --- CSV ---
function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function toCSV(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "Metric,Value",
      `Total Games,${stats.totalGames}`,
      `Total Playtime (hours),${stats.totalPlaytimeHours}`,
      `Unplayed Games,${stats.unplayedCount}`,
      `Unplayed %,${stats.unplayedPercent}%`,
      `Average Hours/Game,${stats.averageHoursPerGame}`,
      "",
      "Top Played,Hours",
      ...stats.topPlayed.map((g) => `${escapeCSV(g.name)},${g.hours}`),
      "",
      "Playtime Bucket,Count",
      ...stats.playtimeBuckets.map((b) => `${escapeCSV(b.label)},${b.count}`),
    ];
    return lines.join("\n");
  }

  if (opts.scope === "categories_pick" && opts.pickLayout === "flat_unique") {
    const cols = pickCollections(opts);
    const list = getGamesForScope(opts).sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""))
    );
    const h = "App ID,Name,Playtime (hours),Last Played,Categories";
    const rows = list.map((g) => {
      const r = gameRow(g);
      const cats = categoryNamesForApp(g.appid, cols);
      return `${r.appid},${escapeCSV(r.name)},${r.playtime_hours},${r.last_played},${escapeCSV(cats)}`;
    });
    return [h, ...rows].join("\n");
  }

  const games = getGamesForScope(opts);
  const header = "App ID,Name,Playtime (hours),Last Played";
  const rows = games.map((g) => {
    const r = gameRow(g);
    return `${r.appid},${escapeCSV(r.name)},${r.playtime_hours},${r.last_played}`;
  });

  if (isCategoriesStructured(opts)) {
    const sections: string[] = [];
    for (const col of pickCollections(opts)) {
      const ids = new Set(col.added);
      const catGames = Object.values(opts.games).filter((g) => ids.has(g.appid));
      sections.push(`\n# ${col.name} (${catGames.length} games)`);
      sections.push(header);
      catGames.forEach((g) => {
        const r = gameRow(g);
        sections.push(`${r.appid},${escapeCSV(r.name)},${r.playtime_hours},${r.last_played}`);
      });
    }
    return sections.join("\n");
  }

  return [header, ...rows].join("\n");
}

// --- TXT ---
function toTXT(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "STEAM LIBRARY STATISTICS",
      "========================",
      "",
      `Total Games:          ${stats.totalGames}`,
      `Total Playtime:       ${stats.totalPlaytimeHours}h`,
      `Unplayed Games:       ${stats.unplayedCount} (${stats.unplayedPercent}%)`,
      `Average Hours/Game:   ${stats.averageHoursPerGame}h`,
      "",
      "TOP 10 MOST PLAYED",
      "-------------------",
      ...stats.topPlayed.map((g, i) => `  ${String(i + 1).padStart(2)}. ${g.name.padEnd(40)} ${String(g.hours).padStart(8)}h`),
      "",
      "PLAYTIME DISTRIBUTION",
      "---------------------",
      ...stats.playtimeBuckets.map((b) => `  ${b.label.padEnd(20)} ${String(b.count).padStart(5)} games`),
    ];
    return lines.join("\n");
  }

  const games = getGamesForScope(opts);

  if (opts.scope === "categories_pick" && opts.pickLayout === "flat_unique") {
    const list = getGamesForScope(opts).sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""))
    );
    const title = "SELECTED CATEGORIES (UNIQUE GAMES)";
    const lines = [title, "=".repeat(title.length), `${list.length} unique games`, ""];
    list.forEach((g) => {
      lines.push(`  ${String(g.name ?? "").padEnd(45)} ${formatHours(g.playtime_forever).padStart(8)}h`);
    });
    return lines.join("\n");
  }

  if (isCategoriesStructured(opts)) {
    const title =
      opts.scope === "categories_pick" ? "STEAM LIBRARY - SELECTED CATEGORIES" : "STEAM LIBRARY - ALL CATEGORIES";
    const underline = "=".repeat(title.length);
    const sections: string[] = [title, underline];
    for (const col of pickCollections(opts)) {
      const ids = new Set(col.added);
      const catGames = Object.values(opts.games).filter((g) => ids.has(g.appid));
      sections.push("", `${col.name} (${catGames.length} games)`, "-".repeat(col.name.length + 10));
      catGames.forEach((g) => {
        sections.push(`  ${String(g.name ?? "").padEnd(45)} ${formatHours(g.playtime_forever).padStart(8)}h`);
      });
    }
    return sections.join("\n");
  }

  const header = opts.scope === "category" ? `CATEGORY EXPORT` : "STEAM LIBRARY";
  const lines = [header, "=".repeat(header.length), `${games.length} games`, ""];
  games.forEach((g) => {
    lines.push(`  ${String(g.name ?? "").padEnd(45)} ${formatHours(g.playtime_forever).padStart(8)}h`);
  });
  return lines.join("\n");
}

// --- Markdown ---
function toMarkdown(opts: ExportOptions): string {
  if (opts.scope === "stats") {
    const stats = computeStats(opts.games, opts.collections);
    const lines = [
      "# Steam Library Statistics",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Total Games | ${stats.totalGames} |`,
      `| Total Playtime | ${stats.totalPlaytimeHours}h |`,
      `| Unplayed Games | ${stats.unplayedCount} (${stats.unplayedPercent}%) |`,
      `| Average Hours/Game | ${stats.averageHoursPerGame}h |`,
      "",
      "## Top 10 Most Played",
      "",
      "| # | Game | Hours |",
      "|---|------|-------|",
      ...stats.topPlayed.map((g, i) => `| ${i + 1} | ${g.name} | ${g.hours}h |`),
      "",
      "## Playtime Distribution",
      "",
      "| Bucket | Games |",
      "|--------|-------|",
      ...stats.playtimeBuckets.map((b) => `| ${b.label} | ${b.count} |`),
    ];
    return lines.join("\n");
  }

  const games = getGamesForScope(opts);

  if (opts.scope === "categories_pick" && opts.pickLayout === "flat_unique") {
    const cols = pickCollections(opts);
    const list = getGamesForScope(opts).sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""))
    );
    const lines = [
      "# Selected categories (deduplicated)",
      "",
      `**${list.length} games**`,
      "",
      "| Game | Hours | Last Played | Categories |",
      "|------|-------|-------------|------------|",
    ];
    list.forEach((g) => {
      const r = gameRow(g);
      const cats = categoryNamesForApp(g.appid, cols);
      lines.push(`| ${r.name} | ${r.playtime_hours}h | ${r.last_played} | ${cats} |`);
    });
    return lines.join("\n");
  }

  if (isCategoriesStructured(opts)) {
    const h1 =
      opts.scope === "categories_pick" ? "# Steam Library - Selected Categories" : "# Steam Library - All Categories";
    const sections = [h1, ""];
    for (const col of pickCollections(opts)) {
      const ids = new Set(col.added);
      const catGames = Object.values(opts.games).filter((g) => ids.has(g.appid));
      sections.push(`## ${col.name} (${catGames.length} games)`, "", "| Game | Hours | Last Played |", "|------|-------|-------------|");
      catGames.forEach((g) => {
        const r = gameRow(g);
        sections.push(`| ${r.name} | ${r.playtime_hours}h | ${r.last_played} |`);
      });
      sections.push("");
    }
    return sections.join("\n");
  }

  const title = opts.scope === "category" ? "Category Export" : "Steam Library";
  const lines = [`# ${title}`, "", `**${games.length} games**`, "", "| Game | Hours | Last Played |", "|------|-------|-------------|"];
  games.forEach((g) => {
    const r = gameRow(g);
    lines.push(`| ${r.name} | ${r.playtime_hours}h | ${r.last_played} |`);
  });
  return lines.join("\n");
}

// --- Main ---
const FORMATTERS: Record<ExportFormat, (opts: ExportOptions) => string> = {
  json: toJSON,
  csv: toCSV,
  txt: toTXT,
  md: toMarkdown,
};

export function generateExport(opts: ExportOptions): string {
  if (opts.titlesOnly && opts.scope !== "stats") return toTitlesOnly(opts);
  return FORMATTERS[opts.format](opts);
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  json: "json",
  csv: "csv",
  txt: "txt",
  md: "md",
};

/** Safe basename segment for default save dialog (ASCII, no path chars). */
export function sanitizeExportBasename(name: string): string {
  const s = String(name ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "category";
}

export interface DefaultFilenameOptions {
  /** Single category display name (scope `category`). */
  categoryName?: string;
  /** Number of categories for `categories_pick` default name. */
  pickCount?: number;
}

export function getDefaultFilename(
  scope: ExportScope,
  format: ExportFormat,
  opts?: DefaultFilenameOptions
): string {
  const ext = FORMAT_EXTENSIONS[format];
  if (scope === "stats") return `repressurizer-stats.${ext}`;
  if (scope === "categories") return `repressurizer-categories.${ext}`;
  if (scope === "categories_pick") {
    const n = opts?.pickCount ?? 0;
    return `repressurizer-categories-${n}-selected.${ext}`;
  }
  if (scope === "category" && opts?.categoryName) {
    return `repressurizer-category-${sanitizeExportBasename(opts.categoryName)}.${ext}`;
  }
  return `repressurizer-games.${ext}`;
}

const FORMAT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  json: { name: "JSON", extensions: ["json"] },
  csv: { name: "CSV", extensions: ["csv"] },
  txt: { name: "Text", extensions: ["txt"] },
  md: { name: "Markdown", extensions: ["md"] },
};

export function getFileFilter(format: ExportFormat) {
  return FORMAT_FILTERS[format];
}
