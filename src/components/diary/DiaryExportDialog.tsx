import { useMemo, useState } from "react";
import { Code, Export, FileText, FolderOpen, GameController, Notebook } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { exportDiaryFile, exportDiaryFolder, DEFAULT_DIARY_EXPORT_CONTENT, type DiaryExportContent, type DiaryExportData, type DiaryExportFormat, type DiaryExportLayout } from "../../lib/diaryExport";

export function DiaryExportDialog({ data, filteredAppIds, onClose, t }: { data: DiaryExportData; filteredAppIds: number[]; onClose: () => void; t: ReturnType<typeof useT> }) {
  const [layout, setLayout] = useState<DiaryExportLayout>("file");
  const [format, setFormat] = useState<DiaryExportFormat>("json");
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const [content, setContent] = useState<DiaryExportContent>({ ...DEFAULT_DIARY_EXPORT_CONTENT });
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const scopedData = useMemo<DiaryExportData>(() => {
    if (scope === "all") return data;
    const ids = new Set(filteredAppIds);
    return { ...data, games: data.games.filter((game) => ids.has(game.appid)) };
  }, [data, filteredAppIds, scope]);

  const runExport = async () => {
    setStatus("working");
    try {
      const result = layout === "folder" ? await exportDiaryFolder(scopedData, content) : await exportDiaryFile(scopedData, format, content);
      setStatus(result ? "success" : "idle");
    } catch (error) {
      console.error("Diary export failed:", error);
      setErrorMessage(String(error));
      setStatus("error");
    }
  };

  const cardClass = (active: boolean) =>
    `focus-ring flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${active ? "border-repressurizer-accent/60 bg-repressurizer-accent/10" : "border-repressurizer-border-subtle bg-repressurizer-bg/60 hover:border-repressurizer-border"}`;

  const contentToggles: Array<{ key: keyof DiaryExportContent; label: string }> = [
    { key: "overview", label: t("diary.export.c.overview") },
    { key: "pages", label: t("diary.export.c.pages") },
    { key: "journal", label: t("diary.export.c.journal") },
    { key: "ratings", label: t("diary.export.c.ratings") },
    { key: "notes", label: t("diary.export.c.notes") },
    { key: "revisions", label: t("diary.export.c.revisions") },
  ];

  return <div role="dialog" aria-modal="true" aria-label={t("diary.export")} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex max-h-[86dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
      <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border-subtle px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">{t("diary.export")}</h2>
          <p className="mt-1 text-xs text-repressurizer-text-muted">{t("diary.export.desc", { count: scopedData.games.length })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="focus-ring rounded-lg px-2 py-1 text-repressurizer-text-faint hover:bg-repressurizer-surface-hover hover:text-white">×</button>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.export.layout")}</p>
            <div className="space-y-2">
              <button type="button" onClick={() => setLayout("file")} className={cardClass(layout === "file")}>
                <FileText size={18} className={layout === "file" ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} />
                <span className="min-w-0"><span className="block text-sm font-medium text-repressurizer-text">{t("diary.export.layout.file")}</span><span className="mt-0.5 block text-[11px] text-repressurizer-text-faint">{t("diary.export.layout.file.desc")}</span></span>
              </button>
              <button type="button" onClick={() => setLayout("folder")} className={cardClass(layout === "folder")}>
                <FolderOpen size={18} className={layout === "folder" ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} />
                <span className="min-w-0"><span className="block text-sm font-medium text-repressurizer-text">{t("diary.export.layout.folder")}</span><span className="mt-0.5 block text-[11px] text-repressurizer-text-faint">{t("diary.export.layout.folder.desc")}</span></span>
              </button>
            </div>
          </div>
          {layout === "file" && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.export.format")}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFormat("json")} className={`focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${format === "json" ? "border-repressurizer-accent/60 bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border-subtle bg-repressurizer-bg/60 text-repressurizer-text-muted hover:text-repressurizer-text"}`}><Code size={14} />JSON</button>
                <button type="button" onClick={() => setFormat("markdown")} className={`focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${format === "markdown" ? "border-repressurizer-accent/60 bg-repressurizer-accent/10 text-repressurizer-accent" : "border-repressurizer-border-subtle bg-repressurizer-bg/60 text-repressurizer-text-muted hover:text-repressurizer-text"}`}><FileText size={14} />{t("diary.export.format.markdown")}</button>
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.export.scope")}</p>
            <div className="space-y-2">
              <button type="button" onClick={() => setScope("all")} className={cardClass(scope === "all")}>
                <GameController size={18} className={scope === "all" ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} />
                <span className="min-w-0"><span className="block text-sm font-medium text-repressurizer-text">{t("diary.export.scope.all")}</span><span className="mt-0.5 block text-[11px] text-repressurizer-text-faint">{t("diary.export.scope.all.desc", { count: data.games.length })}</span></span>
              </button>
              <button type="button" onClick={() => setScope("filtered")} disabled={filteredAppIds.length === data.games.length} className={`${cardClass(scope === "filtered")} disabled:opacity-40`}>
                <Notebook size={18} className={scope === "filtered" ? "text-repressurizer-accent" : "text-repressurizer-text-faint"} />
                <span className="min-w-0"><span className="block text-sm font-medium text-repressurizer-text">{t("diary.export.scope.filtered")}</span><span className="mt-0.5 block text-[11px] text-repressurizer-text-faint">{t("diary.export.scope.filtered.desc", { count: filteredAppIds.length })}</span></span>
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.export.content")}</p>
          <div className="space-y-1">
            {contentToggles.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-repressurizer-text transition-colors hover:bg-repressurizer-surface-hover">
                <span>{label}</span>
                <input type="checkbox" checked={content[key]} onChange={(event) => setContent((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 accent-repressurizer-accent" />
              </label>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/60 px-3 py-2.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
            {layout === "folder" ? t("diary.export.summary.folder", { games: scopedData.games.length }) : t("diary.export.summary.file", { games: scopedData.games.length, format: format === "json" ? "JSON" : "Markdown" })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-repressurizer-border-subtle px-5 py-3">
        <div className="text-xs">
          {status === "success" && <span className="text-repressurizer-success">{t("diary.export.success")}</span>}
          {status === "error" && <span className="text-repressurizer-danger">{t("diary.export.error")}{errorMessage ? ` — ${errorMessage}` : ""}</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="focus-ring rounded-lg px-3 py-2 text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover">{t("diary.pages.cancel")}</button>
          <button type="button" data-testid="diary-export-run" disabled={status === "working" || scopedData.games.length === 0} onClick={runExport} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-repressurizer-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            <Export size={15} />
            {status === "working" ? t("diary.export.working") : t("diary.export.action")}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
