import { create } from "zustand";
import type { ExportScope } from "../lib/export";

/** Opens Export dialog from Header or Sidebar with optional scope/category override. */
interface ExportUiState {
  /** Bumps when openExportDialog is called so Header can react. */
  openVersion: number;
  initialScope: ExportScope | null;
  /** When set, "Current category" export uses this key (e.g. right-click) instead of active sidebar. */
  overrideCategoryKey: string | null;

  openExportDialog: (opts?: {
    initialScope?: ExportScope;
    overrideCategoryKey?: string | null;
  }) => void;
  resetIntent: () => void;
}

export const useExportUiStore = create<ExportUiState>((set) => ({
  openVersion: 0,
  initialScope: null,
  overrideCategoryKey: null,

  openExportDialog: (opts) =>
    set((s) => ({
      openVersion: s.openVersion + 1,
      initialScope: opts?.initialScope ?? null,
      overrideCategoryKey: opts?.overrideCategoryKey ?? null,
    })),

  resetIntent: () =>
    set({
      initialScope: null,
      overrideCategoryKey: null,
    }),
}));
