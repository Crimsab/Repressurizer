import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { appLog } from "./appLog";

interface DesktopNotificationInput {
  title?: string;
  body: string;
  enabled?: boolean;
  requestPermissionOnDemand?: boolean;
}

let permissionRequested = false;

export async function notifyDesktop({
  title = "Repressurizer",
  body,
  enabled = true,
  requestPermissionOnDemand = true,
}: DesktopNotificationInput): Promise<boolean> {
  if (!enabled || !body.trim()) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;

  try {
    let granted = await isPermissionGranted();
    if (!granted && requestPermissionOnDemand && !permissionRequested) {
      permissionRequested = true;
      granted = (await requestPermission()) === "granted";
    }
    if (!granted) {
      await appLog.debug("Desktop notification skipped because permission is not granted");
      return false;
    }
    sendNotification({ title, body });
    return true;
  } catch (error) {
    await appLog.warn("Desktop notification failed", { error: String(error) });
    return false;
  }
}
