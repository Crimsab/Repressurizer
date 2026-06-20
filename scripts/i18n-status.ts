import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const translationsDir = join(root, "src/lib/translations");
const localizationDocPath = join(root, "docs/localization.md");
const canonicalLocale = "en";
const startMarker = "<!-- localization-status:start -->";
const endMarker = "<!-- localization-status:end -->";
const maxDetailItems = 30;
const showDetails = process.argv.includes("--details");
const shouldWrite = process.argv.includes("--write");

type Catalog = Record<string, string>;

type PlaceholderIssue = {
  key: string;
  expected: string[];
  actual: string[];
};

type LocaleStatus = {
  locale: string;
  presentKeys: number;
  translatedKeys: number;
  keyCoverage: number;
  translatedCoverage: number;
  missingKeys: string[];
  extraKeys: string[];
  englishFallbackKeys: string[];
  placeholderIssues: PlaceholderIssue[];
};

function readCatalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(translationsDir, `${locale}.json`), "utf8")) as Catalog;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

function isProbablyTranslatable(value: string): boolean {
  const trimmed = value.trim();
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^https?:\/\//.test(trimmed)) return false;
  if (/^[a-z]+:[^\s]+$/i.test(trimmed)) return false;

  const technicalIdentityValues = new Set([
    "Steam",
    "Repressurizer",
    "HowLongToBeat",
    "HLTB",
    "Windows",
    "macOS",
    "Linux",
    "App ID",
    "ID",
  ]);
  if (technicalIdentityValues.has(trimmed)) return false;

  return true;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function summarizeKeys(keys: string[]): string {
  if (!keys.length) return "None";
  const visible = keys.slice(0, maxDetailItems).map((key) => `\`${key}\``);
  const suffix = keys.length > maxDetailItems ? `, plus ${keys.length - maxDetailItems} more` : "";
  return `${visible.join(", ")}${suffix}`;
}

function summarizePlaceholderIssues(issues: PlaceholderIssue[]): string {
  if (!issues.length) return "None";
  const visible = issues.slice(0, maxDetailItems).map((issue) => {
    const expected = issue.expected.join(",") || "none";
    const actual = issue.actual.join(",") || "none";
    return `\`${issue.key}\` (${expected} -> ${actual})`;
  });
  const suffix = issues.length > maxDetailItems ? `, plus ${issues.length - maxDetailItems} more` : "";
  return `${visible.join(", ")}${suffix}`;
}

function computeStatus(): LocaleStatus[] {
  if (!existsSync(join(translationsDir, `${canonicalLocale}.json`))) {
    throw new Error(`Missing canonical catalog: ${canonicalLocale}.json`);
  }

  const locales = readdirSync(translationsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort((a, b) => (a === canonicalLocale ? -1 : b === canonicalLocale ? 1 : a.localeCompare(b)));

  const canonical = readCatalog(canonicalLocale);
  const canonicalKeys = Object.keys(canonical).sort();

  return locales.map((locale) => {
    const catalog = readCatalog(locale);
    const keys = Object.keys(catalog).sort();
    const missingKeys = canonicalKeys.filter((key) => !(key in catalog));
    const extraKeys = keys.filter((key) => !(key in canonical));
    const presentCanonicalKeys = canonicalKeys.filter((key) => key in catalog);
    const englishFallbackKeys =
      locale === canonicalLocale
        ? []
        : presentCanonicalKeys.filter(
            (key) => catalog[key] === canonical[key] && isProbablyTranslatable(canonical[key]),
          );

    const placeholderIssues = presentCanonicalKeys.flatMap((key) => {
      const expected = placeholders(canonical[key]);
      const actual = placeholders(catalog[key]);
      return expected.join(",") === actual.join(",") ? [] : [{ key, expected, actual }];
    });

    const presentKeys = presentCanonicalKeys.length;
    const translatedKeys = locale === canonicalLocale ? presentKeys : presentKeys - englishFallbackKeys.length;

    return {
      locale,
      presentKeys,
      translatedKeys,
      keyCoverage: presentKeys / canonicalKeys.length,
      translatedCoverage: translatedKeys / canonicalKeys.length,
      missingKeys,
      extraKeys,
      englishFallbackKeys,
      placeholderIssues,
    };
  });
}

function statusTable(statuses: LocaleStatus[]): string {
  const totalKeys = statuses.find((status) => status.locale === canonicalLocale)?.presentKeys ?? 0;
  const lines = [
    `Canonical locale: \`${canonicalLocale}\`. Total canonical keys: ${totalKeys}.`,
    "",
    "| Locale | Key coverage | Translated coverage | English fallback | Missing | Extra | Placeholder issues |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const status of statuses) {
    lines.push(
      `| \`${status.locale}\` | ${formatPercent(status.keyCoverage)} | ${formatPercent(status.translatedCoverage)} | ${status.englishFallbackKeys.length} | ${status.missingKeys.length} | ${status.extraKeys.length} | ${status.placeholderIssues.length} |`,
    );
  }

  return lines.join("\n");
}

function detailsMarkdown(statuses: LocaleStatus[]): string {
  const statusesWithDetails = statuses.filter(
    (status) =>
      status.missingKeys.length ||
      status.extraKeys.length ||
      status.englishFallbackKeys.length ||
      status.placeholderIssues.length,
  );

  if (!statusesWithDetails.length) return "";

  const lines = ["", "<details>", "<summary>Locale details</summary>", ""];

  for (const status of statusesWithDetails) {
    lines.push(`### ${status.locale}`, "");
    lines.push(`- Missing keys: ${summarizeKeys(status.missingKeys)}`);
    lines.push(`- Extra keys: ${summarizeKeys(status.extraKeys)}`);
    lines.push(`- English fallback values: ${summarizeKeys(status.englishFallbackKeys)}`);
    lines.push(`- Placeholder issues: ${summarizePlaceholderIssues(status.placeholderIssues)}`);
    lines.push("");
  }

  lines.push("</details>");
  return lines.join("\n");
}

function generatedBlock(statuses: LocaleStatus[]): string {
  return [startMarker, statusTable(statuses), endMarker].join("\n");
}

function writeLocalizationDoc(statuses: LocaleStatus[]): void {
  const generated = generatedBlock(statuses);
  const doc = readFileSync(localizationDocPath, "utf8");

  if (doc.includes(startMarker) && doc.includes(endMarker)) {
    const next = doc.replace(new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`), generated);
    writeFileSync(localizationDocPath, next.endsWith("\n") ? next : `${next}\n`);
    return;
  }

  const section = [
    "## Localization Status",
    "",
    "Run `bun run i18n:status` to print the current table, or `bun run i18n:status:write` to refresh this generated block.",
    "",
    generated,
    "",
  ].join("\n");

  const insertionPoint = "\n## Current Locales";
  const next = doc.includes(insertionPoint)
    ? doc.replace(insertionPoint, `\n${section}${insertionPoint}`)
    : `${doc.trimEnd()}\n\n${section}`;
  writeFileSync(localizationDocPath, next.endsWith("\n") ? next : `${next}\n`);
}

const statuses = computeStatus();
console.log(statusTable(statuses));
if (showDetails) {
  console.log(detailsMarkdown(statuses));
} else {
  const localesWithDetails = statuses.filter(
    (status) =>
      status.missingKeys.length ||
      status.extraKeys.length ||
      status.englishFallbackKeys.length ||
      status.placeholderIssues.length,
  ).length;
  if (localesWithDetails) {
    console.log(`\nRun \`bun run i18n:status --details\` to list affected keys.`);
  }
}

if (shouldWrite) {
  writeLocalizationDoc(statuses);
  console.log("\nUpdated docs/localization.md");
}
