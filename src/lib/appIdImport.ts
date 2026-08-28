export const MAX_STEAM_APP_ID = 0xffff_ffff;

export interface AppIdImportParseResult {
  appIds: number[];
  duplicateCount: number;
  invalidEntries: string[];
}

export function parseAppIdImportText(text: string): AppIdImportParseResult {
  const seen = new Set<number>();
  const appIds: number[] = [];
  const invalidEntries: string[] = [];
  let duplicateCount = 0;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+(?:#|\/\/).*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    for (const token of line.split(/[\s,;]+/).filter(Boolean)) {
      if (!/^\d+$/.test(token)) {
        invalidEntries.push(token);
        continue;
      }
      const appId = Number(token);
      if (!Number.isSafeInteger(appId) || appId < 1 || appId > MAX_STEAM_APP_ID) {
        invalidEntries.push(token);
        continue;
      }
      if (seen.has(appId)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(appId);
      appIds.push(appId);
    }
  }

  return { appIds, duplicateCount, invalidEntries };
}

