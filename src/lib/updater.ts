import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateChannel = "stable" | "beta";

export type UpdaterKind =
  | "windows-installer"
  | "windows-portable"
  | "linux-appimage"
  | "linux-system-package"
  | "macos-app"
  | "unsupported";

export type ManualUpdateMessageKey =
  | "settings.updates.manual.portable"
  | "settings.updates.manual.package"
  | "settings.updates.manual.unsupported";

export const DEFAULT_UPDATE_CHECK_INTERVAL_HOURS = 12;
export const MIN_UPDATE_CHECK_INTERVAL_HOURS = 1;

export function shouldCheckForAppUpdateAfterResume(
  lastCheckedAt: number,
  now: number,
  intervalHours = DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
): boolean {
  if (lastCheckedAt <= 0 || now < lastCheckedAt) return true;
  const effectiveHours = Math.max(
    MIN_UPDATE_CHECK_INTERVAL_HOURS,
    intervalHours || DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
  );
  return now - lastCheckedAt >= effectiveHours * 60 * 60 * 1000;
}

export function manualUpdateMessageKey(kind: UpdaterKind): ManualUpdateMessageKey {
  if (kind === "windows-portable") return "settings.updates.manual.portable";
  if (kind === "linux-system-package") return "settings.updates.manual.package";
  return "settings.updates.manual.unsupported";
}

export function channelUpdaterTarget(
  platformTarget: string,
  channel: UpdateChannel
): string {
  const normalizedTarget = platformTarget.trim();
  if (!/^(windows|linux)-x86_64$|^darwin-(aarch64|x86_64)$/.test(normalizedTarget)) {
    throw new Error("This build does not have a supported updater target");
  }
  return `${normalizedTarget}-${channel}`;
}

export function shouldAllowStableReturn(
  currentVersion: string,
  channel: UpdateChannel
): boolean {
  return channel === "stable" && /^\d+\.\d+\.\d+-beta\.\d+$/.test(currentVersion);
}

export async function checkForAppUpdate(
  platformTarget: string,
  channel: UpdateChannel,
  buildChannel: "stable" | "preview" = __APP_CHANNEL__
): Promise<Update | null> {
  if (buildChannel === "preview") return check();
  // A beta switched back to stable may install an older stable release; the Rust updater decides that.
  return check({ target: channelUpdaterTarget(platformTarget, channel) });
}
