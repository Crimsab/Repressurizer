import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  serializeAutoCategorizeDiff,
  type AutoCategorizeDiffDocument,
} from "./autoCategorizeDiff";

export async function exportAutoCategorizeDiffToDisk(
  document: AutoCategorizeDiffDocument,
): Promise<string | null> {
  const path = await save({
    defaultPath: "repressurizer-autocat-preview-diff.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;

  await writeTextFile(path, serializeAutoCategorizeDiff(document));
  return path;
}
