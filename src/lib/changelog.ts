import generatedChangelog from "./generatedChangelog.json";

export interface ChangelogItem {
  text: string;
  sha: string;
  url: string;
}

export interface ChangelogGroup {
  title: string;
  audience: "user" | "internal";
  items: ChangelogItem[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  releaseUrl: string;
  compareUrl: string;
  groups: ChangelogGroup[];
}

export const changelogEntries = generatedChangelog.entries as ChangelogEntry[];

export const LAST_SEEN_VERSION_STORAGE_KEY = "repressurizer-last-seen-version";

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseVersion(value: string): ParsedVersion | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart == null) return -1;
    if (bPart == null) return 1;
    if (aPart === bPart) continue;
    const aNumber = /^\d+$/.test(aPart) ? Number(aPart) : null;
    const bNumber = /^\d+$/.test(bPart) ? Number(bPart) : null;
    if (aNumber != null && bNumber != null) return aNumber < bNumber ? -1 : 1;
    if (aNumber != null) return -1;
    if (bNumber != null) return 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

export function changelogEntriesForUpgrade(
  previousVersion: string,
  currentVersion: string,
  entries: ChangelogEntry[] = changelogEntries
): ChangelogEntry[] {
  if (compareVersions(previousVersion, currentVersion) !== -1) return [];
  return entries.filter((entry) =>
    compareVersions(entry.version, previousVersion) === 1
      && compareVersions(entry.version, currentVersion) !== 1
  );
}

export function previousChangelogVersion(
  currentVersion: string,
  entries: ChangelogEntry[] = changelogEntries
): string | null {
  return entries.find((entry) => compareVersions(entry.version, currentVersion) === -1)?.version ?? null;
}
