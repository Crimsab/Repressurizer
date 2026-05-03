import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  generateExport,
  getDefaultFilename,
  getFileFilter,
  type DefaultFilenameOptions,
  type ExportOptions,
} from "./export";

export type ExportToDiskInput = Omit<ExportOptions, never> & {
  /** Overrides automatic default path from getDefaultFilename */
  defaultPath?: string;
  filenameOpts?: DefaultFilenameOptions;
};

/**
 * Opens save dialog, writes export content. Returns path if saved, null if cancelled.
 */
export async function exportToDisk(input: ExportToDiskInput): Promise<string | null> {
  const {
    defaultPath: defaultPathOverride,
    filenameOpts,
    ...exportOpts
  } = input;

  const content = generateExport(exportOpts);
  const defaultPath =
    defaultPathOverride ??
    getDefaultFilename(exportOpts.scope, exportOpts.format, filenameOpts);

  const path = await save({
    defaultPath,
    filters: [getFileFilter(exportOpts.format)],
  });

  if (!path) return null;

  await writeTextFile(path, content);
  return path;
}
