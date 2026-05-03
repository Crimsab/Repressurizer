import type { OwnedGame } from "./types";

const EDITION_SUFFIXES = [
  "the definitive edition",
  "definitive edition",
  "enhanced edition",
  "complete edition",
  "ultimate edition",
  "standard edition",
  "game of the year edition",
  "goty edition",
  "remastered",
  "remaster",
  "hd remaster",
  "anniversary edition",
  "2013 edition",
];

export function normalizeGameTitleForIdentity(name: string): string {
  let value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[:–—_-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  for (const suffix of EDITION_SUFFIXES) {
    value = value.replace(new RegExp(`\\b${suffix}\\b$`, "i"), "").trim();
  }

  return value.replace(/\s+/g, " ");
}

export function possibleDuplicateAppIds(games: OwnedGame[]): Set<number> {
  const groups = new Map<string, OwnedGame[]>();
  for (const game of games) {
    const key = normalizeGameTitleForIdentity(game.name);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(game);
    groups.set(key, group);
  }

  const ids = new Set<number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const game of group) ids.add(game.appid);
  }
  return ids;
}
