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

