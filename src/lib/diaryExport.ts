import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { OwnedGame } from "./types";
import type { DiaryEntry, DiaryJournalEntry, DiaryRevision, DiarySection } from "../stores/diaryStore";
import type { DiaryTemplate } from "./diaryTemplates";

export type DiaryExportFormat = "json" | "markdown";
export type DiaryExportLayout = "file" | "folder";

export interface DiaryExportContent {
  overview: boolean;
  pages: boolean;
  journal: boolean;
  ratings: boolean;
  notes: boolean;
  revisions: boolean;
}

export const DEFAULT_DIARY_EXPORT_CONTENT: DiaryExportContent = {
  overview: true,
  pages: true,
  journal: true,
  ratings: true,
  notes: true,
  revisions: true,
};

export interface DiaryExportData {
  games: OwnedGame[];
  entries: Record<number, DiaryEntry>;
  ratings: Record<number, number>;
  notes: Record<number, string>;
  journal: Record<number, DiaryJournalEntry[]>;
  pages: DiarySection[];
  revisions: DiaryRevision[];
  templates?: DiaryTemplate[];
}

function safeName(value: string, fallback = "game"): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").replace(/\.{2,}/g, "…").replace(/^[\s.]+|[\s.]+$/g, "").trim().slice(0, 100) || fallback;
}

function pagesForGame(pages: DiarySection[], appId: number): DiarySection[] {
  return pages.filter((page) => page.scope === "all" || page.appIds.includes(appId));
}

function gameDocument(data: DiaryExportData, game: OwnedGame, content: DiaryExportContent) {
  return {
    appId: game.appid,
    name: String(game.name ?? game.appid),
    playtimeMinutes: game.playtime_forever,
    lastPlayed: game.rtime_last_played,
    diary: data.entries[game.appid] ?? null,
    rating: content.ratings ? data.ratings[game.appid] ?? null : null,
    overview: content.overview ? data.notes[game.appid] ?? "" : "",
    journal: content.journal ? data.journal[game.appid] ?? [] : [],
    pages: content.pages ? pagesForGame(data.pages, game.appid) : [],
  };
}

export function serializeDiaryJson(data: DiaryExportData, content: DiaryExportContent = DEFAULT_DIARY_EXPORT_CONTENT): string {
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    games: data.games.map((game) => gameDocument(data, game, content)),
    revisions: content.revisions ? data.revisions : [],
    templates: data.templates ?? [],
  }, null, 2);
}

export function serializeDiaryMarkdown(data: DiaryExportData, content: DiaryExportContent = DEFAULT_DIARY_EXPORT_CONTENT): string {
  const lines = ["# Repressurizer Diary", ""];
  for (const game of data.games) {
    const document = gameDocument(data, game, content);
    lines.push(`## ${document.name}`, "", `- App ID: ${document.appId}`, `- Rating: ${document.rating ? `${document.rating}/10` : "—"}`, `- Playtime: ${(document.playtimeMinutes / 60).toFixed(1)}h`, "");
    if (content.overview && document.overview) lines.push("### Overview", "", document.overview, "");
    if (content.pages) for (const page of document.pages) lines.push(`### ${page.title}`, "", page.markdown, "");
    if (content.journal && document.journal.length > 0) {
      lines.push("### Journal", "");
      for (const entry of document.journal) lines.push(`#### ${new Date(entry.createdAt).toISOString()}`, "", entry.body, "");
    }
    lines.push("---", "");
  }
  return lines.join("\n");
}

/** Builds the relative-path -> content map written by the folder layout. */
export function buildDiaryBundle(data: DiaryExportData, content: DiaryExportContent = DEFAULT_DIARY_EXPORT_CONTENT): Record<string, string> {
  const files: Record<string, string> = {};
  files["index.json"] = serializeDiaryJson(data, content);
  files["diary.md"] = serializeDiaryMarkdown(data, content);
  if ((data.templates?.length ?? 0) > 0) {
    for (const template of data.templates ?? []) files[`Templates/${safeName(template.name, "Template")}.md`] = template.markdown;
  }
  for (const game of data.games) {
    const document = gameDocument(data, game, content);
    const dir = `${safeName(document.name)} (${game.appid})`;
    files[`${dir}/metadata.json`] = JSON.stringify({ ...document, overview: undefined, journal: undefined, pages: undefined }, null, 2);
    if (content.overview) files[`${dir}/Overview.md`] = document.overview || "";
    if (content.pages) for (const page of document.pages) files[`${dir}/${safeName(page.title, "Page")}.md`] = page.markdown;
    if (content.journal && document.journal.length > 0) {
      files[`${dir}/Journal.md`] = document.journal.map((entry) => `## ${new Date(entry.createdAt).toISOString()} · ${(entry.playedMinutes / 60).toFixed(1)}h\n\n${entry.body}`).join("\n\n---\n\n");
    }
  }
  return files;
}

export async function exportDiaryFile(data: DiaryExportData, format: DiaryExportFormat, content: DiaryExportContent = DEFAULT_DIARY_EXPORT_CONTENT): Promise<string | null> {
  const extension = format === "json" ? "json" : "md";
  const path = await save({ defaultPath: `repressurizer-diary.${extension}`, filters: [{ name: format === "json" ? "JSON" : "Markdown", extensions: [extension] }] });
  if (!path) return null;
  const target = Array.isArray(path) ? path[0] : path;
  await invoke("write_export_file", { path: target, contents: format === "json" ? serializeDiaryJson(data, content) : serializeDiaryMarkdown(data, content) });
  return target;
}

export async function exportDiaryFolder(data: DiaryExportData, content: DiaryExportContent = DEFAULT_DIARY_EXPORT_CONTENT): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title: "Export Diary archive" });
  if (!selected || Array.isArray(selected)) return null;
  const base = Array.isArray(selected) ? selected[0] : selected;
  const root = await join(base, `Repressurizer Diary ${new Date().toISOString().slice(0, 10)}`);
  await invoke("write_export_bundle", { root, files: buildDiaryBundle(data, content) });
  return root;
}
