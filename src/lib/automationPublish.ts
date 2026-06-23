import { buildLibrarySnapshot, type LibrarySnapshot } from "./automationExport";
import { postJsonExport, type HttpPublishResult } from "./tauri";
import type { AchievementSummary, AppSettings, GameDetails, OwnedGame, SteamCollection } from "./types";
import type { FamilyLibraryApp, HltbData, WishlistItem } from "./tauri";

export interface AutomationPublishContext {
  settings: AppSettings;
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  details: Record<number, GameDetails>;
  hltbData: Record<number, HltbData>;
  achievements?: Record<number, AchievementSummary>;
  wishlistItems?: WishlistItem[];
  wishlistLastFetched?: number | null;
  familyApps?: Record<number, FamilyLibraryApp>;
  familyAuthUsed?: string | null;
  familyOwnerSteamId?: string | null;
  familyLastFetched?: number | null;
  appVersion: string;
}

export interface AutomationPublishResult {
  snapshot: LibrarySnapshot;
  http: HttpPublishResult;
}

export function automationPublishStatusPatch(
  settings: Pick<AppSettings, "automationPublishLogs">,
  status: AppSettings["automationPublishLastStatus"],
  message: string,
  httpStatus = 0,
  now = new Date()
): Pick<
  AppSettings,
  | "automationPublishLastAttemptedAt"
  | "automationPublishLastStatus"
  | "automationPublishLastMessage"
  | "automationPublishLastHttpStatus"
  | "automationPublishLogs"
> {
  const timestamp = now.toISOString();
  const logStatus = status || "skipped";
  const entry = {
    id: `${timestamp}-${logStatus}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    status: logStatus,
    message,
    httpStatus,
  };

  return {
    automationPublishLastAttemptedAt: timestamp,
    automationPublishLastStatus: status,
    automationPublishLastMessage: message,
    automationPublishLastHttpStatus: httpStatus,
    automationPublishLogs: [entry, ...(settings.automationPublishLogs ?? [])].slice(0, 100),
  };
}

export function automationPublishDue(settings: AppSettings, now = Date.now()): boolean {
  const last = Date.parse(settings.automationPublishLastPublishedAt || "");
  if (!Number.isFinite(last)) return true;
  const intervalHours = Math.max(1, Number(settings.automationPublishIntervalHours || 24));
  return now - last >= intervalHours * 60 * 60 * 1000;
}

export function buildAutomationSnapshotFromContext(context: AutomationPublishContext): LibrarySnapshot {
  return buildLibrarySnapshot({
    games: context.games,
    collections: context.collections,
    details: context.details,
    hltbData: context.hltbData,
    achievements: context.achievements,
    wishlistItems: context.wishlistItems,
    wishlistLastFetched: context.wishlistLastFetched,
    familyApps: context.familyApps,
    familyAuthUsed: context.familyAuthUsed,
    familyOwnerSteamId: context.familyOwnerSteamId,
    familyLastFetched: context.familyLastFetched,
    appVersion: context.appVersion,
    steamId64: context.settings.steamId64,
    steamPersonaName: context.settings.steamPersonaName,
  });
}

export async function publishAutomationSnapshot(
  context: AutomationPublishContext
): Promise<AutomationPublishResult> {
  const url = context.settings.automationPublishUrl.trim();
  if (!url) throw new Error("Automation export URL is empty");

  const snapshot = buildAutomationSnapshotFromContext(context);
  const http = await postJsonExport(
    url,
    JSON.stringify(snapshot),
    context.settings.automationPublishBearerToken
  );

  return { snapshot, http };
}
