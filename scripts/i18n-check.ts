import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const translationsDir = join(root, "src/lib/translations");
const sourceDir = join(root, "src");
const canonicalLocale = "en";

type Catalog = Record<string, string>;

function readCatalog(locale: string): Catalog {
  const path = join(translationsDir, `${locale}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as Catalog;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

function hardcodedUiStrings(): string[] {
  const stringPatterns = [
    />[A-Z][^<>{}]+</g,
    /\b(?:label|placeholder|title|aria-label)="[A-Z][^"]+"/g,
    /setMessage\((?:`[^`]*[A-Za-z][^`]*`|"[^"]*[A-Za-z][^"]*")/g,
  ];

  const allowed = [
    /className=/,
    /weight="/,
    /type="/,
    /value="/,
    /key="/,
    /import /,
    /from "/,
  ];

  const findings: string[] = [];
  for (const file of walk(sourceDir)) {
    const text = readFileSync(file, "utf8");
    const rel = file.startsWith(root) ? file.slice(root.length).replace(/^\//, "") : file;
    for (const pattern of stringPatterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split("\n").length;
        const value = match[0].replace(/\s+/g, " ").trim();
        if (allowed.some((rule) => rule.test(value))) continue;
        findings.push(`${rel}:${line}: ${value}`);
      }
    }
  }
  return findings;
}

if (!existsSync(join(translationsDir, `${canonicalLocale}.json`))) {
  console.error(`Missing canonical catalog: ${canonicalLocale}.json`);
  process.exit(1);
}

const locales = readdirSync(translationsDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""))
  .sort((a, b) => (a === canonicalLocale ? -1 : b === canonicalLocale ? 1 : a.localeCompare(b)));

const canonical = readCatalog(canonicalLocale);
const canonicalKeys = Object.keys(canonical).sort();
let hasErrors = false;

for (const locale of locales) {
  const catalog = readCatalog(locale);
  const keys = Object.keys(catalog).sort();
  const missing = canonicalKeys.filter((key) => !(key in catalog));
  const extra = keys.filter((key) => !(key in canonical));

  if (missing.length || extra.length) {
    hasErrors = true;
    console.error(`\n${locale}: key mismatch`);
    if (missing.length) console.error(`  Missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`  Extra: ${extra.join(", ")}`);
  }

  for (const key of canonicalKeys) {
    if (!(key in catalog)) continue;
    const sourcePlaceholders = placeholders(canonical[key]).join(",");
    const targetPlaceholders = placeholders(catalog[key]).join(",");
    if (sourcePlaceholders !== targetPlaceholders) {
      hasErrors = true;
      console.error(`\n${locale}: placeholder mismatch for "${key}"`);
      console.error(`  en: ${sourcePlaceholders || "(none)"}`);
      console.error(`  ${locale}: ${targetPlaceholders || "(none)"}`);
    }
  }
}

const hardcoded = hardcodedUiStrings();
console.log(`i18n catalogs: ${locales.length} locale(s), ${canonicalKeys.length} canonical key(s)`);
if (hardcoded.length) {
  console.warn(`i18n hardcoded UI text candidates: ${hardcoded.length}`);
  for (const finding of hardcoded.slice(0, 80)) console.warn(`  ${finding}`);
  if (hardcoded.length > 80) console.warn(`  ...and ${hardcoded.length - 80} more`);
}

if (hasErrors) process.exit(1);
