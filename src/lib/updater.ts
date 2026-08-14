export type UpdaterKind =
  | "windows-installer"
  | "windows-portable"
  | "linux-appimage"
  | "linux-system-package"
  | "unsupported";

export type ManualUpdateMessageKey =
  | "settings.updates.manual.portable"
  | "settings.updates.manual.package"
  | "settings.updates.manual.unsupported";

export function manualUpdateMessageKey(kind: UpdaterKind): ManualUpdateMessageKey {
  if (kind === "windows-portable") return "settings.updates.manual.portable";
  if (kind === "linux-system-package") return "settings.updates.manual.package";
  return "settings.updates.manual.unsupported";
}
