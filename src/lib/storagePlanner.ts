import type { StorageInstall, StorageLibrary } from "./types";
import type { GameStatus } from "../stores/statusStore";

export type StorageProtection = "never" | "keep" | "30-days";
export interface StoragePlannerGame {
  appid: number; name: string; playtimeMinutes: number; lastPlayed: number; status: GameStatus; achievementPercent: number | null; remainingHours: number | null; deckCompatible: boolean | null; install: StorageInstall; protection: StorageProtection | null; protectedUntil: number | null; hasUnsyncedSaves: boolean | null;
}
export interface StorageSuggestion extends StoragePlannerGame { score: number; reasons: string[]; limitations: string[]; }

export function storageUsed(installs: readonly StorageInstall[]): number { return installs.reduce((sum, item) => sum + item.totalBytes, 0); }
export function targetBytes(input: { mode: "bytes" | "free-percent"; bytes: number; freePercent: number; library: StorageLibrary | null }): number {
  if (input.mode === "bytes") return Math.max(0, input.bytes);
  if (!input.library?.totalBytes) return 0;
  return Math.max(0, input.library.totalBytes * Math.max(0, Math.min(100, input.freePercent)) / 100 - input.library.freeBytes);
}

export function rankStorageCandidates(games: readonly StoragePlannerGame[], now = Date.now()): StorageSuggestion[] {
  return games.flatMap((game) => {
    if (game.protection === "never" || game.protection === "keep" || (game.protectedUntil ?? 0) > now || game.hasUnsyncedSaves === true) return [];
    const reasons: string[] = []; const limitations: string[] = []; let score = 0;
    const sizeGb = game.install.totalBytes / 1_073_741_824;
    if (game.status === "completed" || game.status === "beaten") { score += 35; reasons.push("Completed or beaten"); }
    if (game.playtimeMinutes === 0) { score += 16; reasons.push("Never launched"); }
    const days = game.lastPlayed ? (now / 1000 - game.lastPlayed) / 86_400 : null;
    if (days !== null && days > 365) { score += Math.min(30, days / 90); reasons.push(`Not played for ${Math.floor(days)} days`); }
    if (sizeGb >= 20 && game.playtimeMinutes < 120) { score += Math.min(35, sizeGb / 2); reasons.push("Large and lightly used"); }
    if (game.deckCompatible === false) { score += 10; reasons.push("Not compatible with selected device"); }
    if (!reasons.length) reasons.push("Large installed footprint");
    if (game.hasUnsyncedSaves === null) limitations.push("Steam Cloud sync cannot be verified from local files");
    if (game.install.workshopBytes > 0) limitations.push("Includes Workshop content");
    if (game.install.shaderCacheBytes > 0 || game.install.compatdataBytes > 0) limitations.push("Includes Steam Deck cache or Proton data");
    return [{ ...game, score: score + Math.min(40, sizeGb), reasons, limitations }];
  }).sort((left, right) => right.score - left.score || right.install.totalBytes - left.install.totalBytes || left.appid - right.appid);
}

export function simulateReclaim(selected: ReadonlySet<number>, suggestions: readonly StorageSuggestion[]): number {
  return suggestions.reduce((sum, game) => sum + (selected.has(game.appid) ? game.install.totalBytes : 0), 0);
}
