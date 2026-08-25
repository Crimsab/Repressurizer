export type DeckPackCategory = "long" | "short" | "roguelike" | "multiplayer" | "relaxing" | "narrative" | "difficult" | "offline";
export type DeckStatus = "verified" | "playable" | "unsupported" | "unknown";
export interface DeckPackCandidate { appId: number; name: string; sizeBytes: number | null; installed: boolean; deckStatus: DeckStatus; fullController: boolean | null; externalLauncher: boolean | null; offline: boolean | null; firstLaunchOnline: boolean | null; durationHours: number | null; categories: DeckPackCategory[]; }
export interface DeckPackConfig { availableBytes: number; safetyPercent: number; gameCount: number; wantedCategories: DeckPackCategory[]; deckFilter: "verified" | "playable" | "any"; requireController: boolean; noLauncher: boolean; requireOffline: boolean; minHours: number | null; maxHours: number | null; installation: "any" | "installed" | "not-installed"; locked: number[]; excluded: number[]; seed: number; }
export interface DeckPackItem extends DeckPackCandidate { reasons: string[]; limitations: string[]; priority: number; }
export interface DeckPackResult { items: DeckPackItem[]; capacityBytes: number; usedBytes: number; remainingBytes: number; overflowBytes: number; missingLocked: number[]; limitations: string[]; }

function randomRank(seed: number, appId: number): number { let value = (seed ^ appId) >>> 0; value = Math.imul(value ^ value >>> 16, 0x45d9f3b); value = Math.imul(value ^ value >>> 16, 0x45d9f3b); return (value ^ value >>> 16) >>> 0; }
function passes(candidate: DeckPackCandidate, config: DeckPackConfig): boolean {
  if (candidate.sizeBytes === null || candidate.sizeBytes <= 0 || config.excluded.includes(candidate.appId)) return false;
  if (config.installation === "installed" && !candidate.installed || config.installation === "not-installed" && candidate.installed) return false;
  if (config.deckFilter === "verified" && candidate.deckStatus !== "verified") return false;
  if (config.deckFilter === "playable" && !["verified", "playable"].includes(candidate.deckStatus)) return false;
  if (config.requireController && candidate.fullController !== true || config.noLauncher && candidate.externalLauncher !== false || config.requireOffline && candidate.offline !== true) return false;
  if (config.minHours !== null && (candidate.durationHours === null || candidate.durationHours < config.minHours) || config.maxHours !== null && (candidate.durationHours === null || candidate.durationHours > config.maxHours)) return false;
  return true;
}
function explain(candidate: DeckPackCandidate, wanted: readonly DeckPackCategory[], selectedCategories: ReadonlySet<DeckPackCategory>) {
  const matches = candidate.categories.filter((item) => wanted.includes(item)); const novel = candidate.categories.filter((item) => !selectedCategories.has(item));
  const reasons = [...matches.map((item) => `Matches ${item}`), ...(novel.length ? [`Adds variety: ${novel.join(", ")}`] : []), candidate.installed ? "Already installed" : "Installation candidate"];
  const limitations = [candidate.deckStatus === "unknown" ? "Deck status unknown" : null, candidate.fullController === null ? "Controller support unknown" : null, candidate.externalLauncher === null ? "External launcher status unknown" : null, candidate.offline === null ? "Offline support unknown" : null, candidate.firstLaunchOnline === true ? "First launch requires internet" : null].filter((item): item is string => !!item);
  return { reasons, limitations };
}

export function buildDeckPack(candidates: readonly DeckPackCandidate[], config: DeckPackConfig): DeckPackResult {
  const capacityBytes = Math.floor(Math.max(0, config.availableBytes) * (1 - Math.max(0, Math.min(90, config.safetyPercent)) / 100)); const byId = new Map(candidates.map((item) => [item.appId, item])); const items: DeckPackItem[] = []; const categories = new Set<DeckPackCategory>(); const missingLocked: number[] = [];
  for (const appId of [...new Set(config.locked)]) { const candidate = byId.get(appId); if (!candidate || candidate.sizeBytes === null || config.excluded.includes(appId)) { missingLocked.push(appId); continue; } const info = explain(candidate, config.wantedCategories, categories); items.push({ ...candidate, ...info, reasons: ["Required game", ...info.reasons], priority: items.length + 1 }); candidate.categories.forEach((item) => categories.add(item)); }
  let used = items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0); const pool = candidates.filter((candidate) => !items.some((item) => item.appId === candidate.appId) && passes(candidate, config));
  while (items.length < Math.max(1, config.gameCount)) {
    const fitting = pool.filter((candidate) => !items.some((item) => item.appId === candidate.appId) && used + (candidate.sizeBytes ?? 0) <= capacityBytes); if (!fitting.length) break;
    fitting.sort((left, right) => { const score = (candidate: DeckPackCandidate) => candidate.categories.filter((item) => config.wantedCategories.includes(item)).length * 12 + candidate.categories.filter((item) => !categories.has(item)).length * 8 + (candidate.installed ? 2 : 0); const delta = score(right) - score(left); return delta || randomRank(config.seed, left.appId) - randomRank(config.seed, right.appId) || left.appId - right.appId; });
    const candidate = fitting[0]; const info = explain(candidate, config.wantedCategories, categories); items.push({ ...candidate, ...info, priority: items.length + 1 }); used += candidate.sizeBytes ?? 0; candidate.categories.forEach((item) => categories.add(item));
  }
  const limitations = [missingLocked.length ? `${missingLocked.length} required games have no usable size or are excluded` : null, items.length < config.gameCount ? "Not enough eligible games fit the available space" : null, items.some((item) => item.limitations.length) ? "Some compatibility metadata is incomplete" : null].filter((item): item is string => !!item);
  return { items, capacityBytes, usedBytes: used, remainingBytes: Math.max(0, capacityBytes - used), overflowBytes: Math.max(0, used - capacityBytes), missingLocked, limitations };
}
