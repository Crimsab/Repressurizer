import { buildLibrarySnapshot, type LibrarySnapshot } from "./automationExport";
import { postJsonExport, type HttpPublishResult } from "./tauri";
import type { AppSettings, GameDetails, OwnedGame, SteamCollection } from "./types";
import type { HltbData } from "./tauri";

export interface AutomationPublishContext {
  settings: AppSettings;
  games: Record<number, OwnedGame>;
  collections: SteamCollection[];
  details: Record<number, GameDetails>;
  hltbData: Record<number, HltbData>;
  appVersion: string;
}

export interface AutomationPublishResult {
  snapshot: LibrarySnapshot;
  http: HttpPublishResult;
}

export function automationPublishStatusPatch(
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
> {
  return {
    automationPublishLastAttemptedAt: now.toISOString(),
    automationPublishLastStatus: status,
    automationPublishLastMessage: message,
    automationPublishLastHttpStatus: httpStatus,
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
