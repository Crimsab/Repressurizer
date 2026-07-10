export interface DialogLayout {
  width: number;
  height: number;
  maximized: boolean;
}

export interface DialogViewport {
  width: number;
  height: number;
}

export interface DialogConstraints {
  minWidth: number;
  minHeight: number;
  viewportMargin: number;
}

export interface DialogLayoutStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
  removeItem?: (key: string) => unknown;
}

const DIALOG_LAYOUT_STORAGE_KEY = "repressurizer-dialog-layouts";

function readLayouts(storage: DialogLayoutStorage): Record<string, DialogLayout> {
  try {
    return JSON.parse(storage.getItem(DIALOG_LAYOUT_STORAGE_KEY) ?? "{}") as Record<string, DialogLayout>;
  } catch {
    return {};
  }
}

function isDialogLayout(value: unknown): value is DialogLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<DialogLayout>;
  return (
    typeof layout.width === "number" &&
    Number.isFinite(layout.width) &&
    layout.width > 0 &&
    typeof layout.height === "number" &&
    Number.isFinite(layout.height) &&
    layout.height > 0 &&
    typeof layout.maximized === "boolean"
  );
}

export function readDialogLayout(
  storage: DialogLayoutStorage,
  dialogId: string,
  fallback: DialogLayout
): DialogLayout {
  const stored = readLayouts(storage)[dialogId];
  return isDialogLayout(stored) ? stored : fallback;
}

export function writeDialogLayout(
  storage: DialogLayoutStorage,
  dialogId: string,
  layout: DialogLayout
): void {
  const layouts = readLayouts(storage);
  layouts[dialogId] = layout;
  try {
    storage.setItem(DIALOG_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Dialog geometry is a best-effort local preference.
  }
}

export function clearDialogLayout(storage: DialogLayoutStorage, dialogId: string): void {
  const layouts = readLayouts(storage);
  delete layouts[dialogId];
  try {
    storage.setItem(DIALOG_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Dialog geometry is a best-effort local preference.
  }
}

export function clampDialogLayout(
  layout: DialogLayout,
  viewport: DialogViewport,
  constraints: DialogConstraints
): DialogLayout {
  const maxWidth = Math.max(0, viewport.width - constraints.viewportMargin * 2);
  const maxHeight = Math.max(0, viewport.height - constraints.viewportMargin * 2);
  const minWidth = Math.min(constraints.minWidth, maxWidth);
  const minHeight = Math.min(constraints.minHeight, maxHeight);

  return {
    width: Math.round(Math.min(maxWidth, Math.max(minWidth, layout.width))),
    height: Math.round(Math.min(maxHeight, Math.max(minHeight, layout.height))),
    maximized: layout.maximized,
  };
}
