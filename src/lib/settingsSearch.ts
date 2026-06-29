import { normalizeSearchText } from "./search";

export interface SettingsSearchSection<TTab extends string = string> {
  id: string;
  tab: TTab;
  label: string;
  keywords: string[];
}

export interface RankedSettingsSearchSection<TTab extends string = string> extends SettingsSearchSection<TTab> {
  score: number;
}

export function normalizeSettingsSearchText(value: string): string {
  return normalizeSearchText(value.replace(/['’]/g, ""));
}

export function rankSettingsSearchSections<TTab extends string>(
  query: string,
  sections: SettingsSearchSection<TTab>[]
): RankedSettingsSearchSection<TTab>[] {
  const normalizedQuery = normalizeSettingsSearchText(query);
  if (!normalizedQuery) {
    return sections.map((section, index) => ({
      ...section,
      score: sections.length - index,
    }));
  }

  return sections
    .map((section, index) => ({
      ...section,
      score: scoreSettingsSearchSection(normalizedQuery, section, index),
    }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score);
}

function scoreSettingsSearchSection<TTab extends string>(
  normalizedQuery: string,
  section: SettingsSearchSection<TTab>,
  index: number
): number {
  const queryTokens = searchTokens(normalizedQuery);
  if (queryTokens.length === 0) return 0;

  const label = normalizeSettingsSearchText(section.label);
  const keywords = normalizeSettingsSearchText(section.keywords.join(" "));
  const combined = `${label} ${keywords}`.trim();
  const labelTokens = searchTokens(label);
  const keywordTokens = searchTokens(keywords);
  const allTokens = [...labelTokens, ...keywordTokens];

  let score = 0;
  if (label === normalizedQuery) score += 10_000;
  else if (label.includes(normalizedQuery)) score += 3_000;

  if (keywords.includes(normalizedQuery)) score += 1_500;
  if (combined.includes(normalizedQuery)) score += 800;

  for (const token of queryTokens) {
    const labelScore = bestTokenScore(token, labelTokens) * 3;
    const keywordScore = bestTokenScore(token, keywordTokens);
    const tokenScore = Math.max(labelScore, keywordScore, bestTokenScore(token, allTokens));

    if (tokenScore <= 0) return 0;
    score += tokenScore;
  }

  return score - index / 100;
}

function searchTokens(value: string): string[] {
  return normalizeSettingsSearchText(value).split(" ").filter(Boolean);
}

function bestTokenScore(query: string, candidates: string[]): number {
  let best = 0;
  for (const candidate of candidates) {
    best = Math.max(best, tokenMatchScore(query, candidate));
  }
  return best;
}

function tokenMatchScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (candidate === query) return 300;
  if (candidate.startsWith(query)) return 220;
  if (candidate.includes(query)) return 160;

  if (query.length >= 3 && candidate.length >= 3) {
    const distance = boundedDamerauLevenshtein(query, candidate, query.length <= 4 ? 1 : 2);
    if (distance >= 0) return distance === 1 ? 120 : 80;
  }

  return 0;
}

function boundedDamerauLevenshtein(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return -1;

  const rowCount = a.length + 1;
  const columnCount = b.length + 1;
  const dp = Array.from({ length: rowCount }, () => Array<number>(columnCount).fill(0));

  for (let i = 0; i < rowCount; i += 1) dp[i][0] = i;
  for (let j = 0; j < columnCount; j += 1) dp[0][j] = j;

  for (let i = 1; i < rowCount; i += 1) {
    let rowMin = Number.POSITIVE_INFINITY;

    for (let j = 1; j < columnCount; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) return -1;
  }

  const distance = dp[a.length][b.length];
  return distance <= maxDistance ? distance : -1;
}
