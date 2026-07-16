import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

const siteRoot = resolve(process.argv[2] ?? "site");
const htmlFiles = [...new Bun.Glob("**/*.html").scanSync({ cwd: siteRoot, onlyFiles: true })].sort();
const failures: string[] = [];
const htmlCache = new Map<string, string>();
const imageTagPattern = new RegExp(`<${"img"}\\b[^>]*>`, "gi");

const readHtml = (path: string) => {
  const absolute = resolve(siteRoot, path);
  if (!htmlCache.has(absolute)) htmlCache.set(absolute, readFileSync(absolute, "utf8"));
  return htmlCache.get(absolute)!;
};

const record = (page: string, message: string) => failures.push(`${page}: ${message}`);

const localTarget = (page: string, rawUrl: string) => {
  if (/^(?:[a-z]+:)?\/\//i.test(rawUrl) || /^(?:data|mailto|tel|javascript):/i.test(rawUrl)) return null;

  const [withoutHash, hash = ""] = rawUrl.split("#", 2);
  const cleanPath = decodeURIComponent(withoutHash.split("?", 1)[0]);
  let absolute: string;

  if (!cleanPath) {
    absolute = resolve(siteRoot, page);
  } else {
    const siteRelative = cleanPath.replace(/^\/Repressurizer\//, "").replace(/^\//, "");
    absolute = cleanPath.startsWith("/")
      ? resolve(siteRoot, siteRelative)
      : resolve(dirname(resolve(siteRoot, page)), siteRelative);
  }

  if (!absolute.startsWith(`${siteRoot}${sep}`) && absolute !== siteRoot) return { absolute, hash, outside: true };

  if (cleanPath.endsWith("/")) absolute = resolve(absolute, "index.html");
  else if (!extname(absolute) && !existsSync(absolute)) absolute = resolve(absolute, "index.html");

  return { absolute, hash, outside: false };
};

for (const page of htmlFiles) {
  const html = readHtml(page);

  const rawIcons = html.match(/:material-[a-z0-9-]+:/gi) ?? [];
  if (rawIcons.length) record(page, `unrendered Material icon shortcode(s): ${[...new Set(rawIcons)].join(", ")}`);

  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) record(page, `duplicate id(s): ${duplicateIds.join(", ")}`);

  for (const image of html.matchAll(imageTagPattern)) {
    if (!/\salt=(?:["'][^"']*["']|[^\s>]+)/i.test(image[0])) record(page, `image without alt text: ${image[0].slice(0, 120)}`);
  }

  if (page !== "404.html") {
    const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? "";
    const headings = main.match(/<h1\b/gi)?.length ?? 0;
    if (headings !== 1) record(page, `expected exactly one main h1, found ${headings}`);
  }

  for (const attribute of html.matchAll(/\s(?:href|src)=["']([^"']+)["']/gi)) {
    const rawUrl = attribute[1];
    const target = localTarget(page, rawUrl);
    if (!target) continue;
    if (target.outside) {
      record(page, `local reference escapes site root: ${rawUrl}`);
      continue;
    }
    if (!existsSync(target.absolute)) {
      record(page, `missing local target: ${rawUrl}`);
      continue;
    }

    if (target.hash && target.absolute.endsWith(".html")) {
      const targetHtml = readFileSync(target.absolute, "utf8");
      const decodedHash = decodeURIComponent(target.hash);
      const escaped = decodedHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\sid=["']${escaped}["']`).test(targetHtml)) {
        record(page, `missing anchor target: ${rawUrl}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Documentation audit failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Documentation audit passed for ${htmlFiles.length} HTML files.`);
