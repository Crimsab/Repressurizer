import { useCallback, useEffect, useState } from "react";
import { Archive, CaretDown, Check, ClockCounterClockwise, Database, Spinner, Trash } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import {
  createDiaryBackup,
  deleteDiaryBackup,
  loadAppData,
  listDiaryBackups,
  readDiaryBackupFile,
  restoreDiaryBackupFiles,
  type DiaryBackupInfo,
} from "../../lib/tauri";

const BACKUP_FILE_STORAGE_KEYS: Record<string, string> = {
  "diary.json": "repressurizer-diary",
  "diary-templates.json": "repressurizer-diary-templates",
  "diary-status-events.json": "repressurizer-diary-status-events",
  "diary-achievements.json": "repressurizer-diary-achievements",
  "diary-board.json": "repressurizer-diary-board",
  "reviews.json": "repressurizer-game-reviews",
  "notes.json": "repressurizer-game-notes",
  "statuses.json": "repressurizer-game-status",
};

interface RestoreFilePreview {
  key: string;
  status: "changed" | "unchanged" | "missing";
  selected: boolean;
}

interface RestorePreview {
  backup: DiaryBackupInfo;
  files: RestoreFilePreview[];
}

export function DiaryBackupDialog({ language, t, onClose }: { language: string; t: ReturnType<typeof useT>; onClose: () => void }) {
  const [backups, setBackups] = useState<DiaryBackupInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      setBackups(await listDiaryBackups());
      setError("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    setNotice("");
    try {
      await createDiaryBackup(description);
      setDescription("");
      setNotice(t("diary.backup.created"));
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const prepareRestore = async (backup: DiaryBackupInfo) => {
    setPreviewBusy(true);
    setError("");
    try {
      const files = await Promise.all(backup.files.map(async (key) => {
        const [backupData, currentData] = await Promise.all([
          readDiaryBackupFile(backup.name, key),
          loadAppData(key).catch(() => null),
        ]);
        const localData = currentData ?? (BACKUP_FILE_STORAGE_KEYS[key] ? localStorage.getItem(BACKUP_FILE_STORAGE_KEYS[key]) : null);
        const status: RestoreFilePreview["status"] = backupData == null
          ? "missing"
          : localData == null
            ? "missing"
            : backupData === localData ? "unchanged" : "changed";
        return { key, status, selected: status !== "unchanged" };
      }));
      setRestorePreview({ backup, files });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPreviewBusy(false);
    }
  };

  const restore = async (preview: RestorePreview) => {
    const selectedKeys = preview.files.filter((file) => file.selected && file.status !== "unchanged").map((file) => file.key);
    if (selectedKeys.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await restoreDiaryBackupFiles(preview.backup.name, selectedKeys);
      for (const key of selectedKeys) {
        const storageKey = BACKUP_FILE_STORAGE_KEYS[key];
        if (storageKey) {
          try { localStorage.removeItem(storageKey); } catch {}
        }
      }
      window.location.reload();
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
      setRestorePreview(null);
    }
  };

  const remove = async (backup: DiaryBackupInfo) => {
    setBusy(true);
    setNotice("");
    try {
      await deleteDiaryBackup(backup.name);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("diary.backup")} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="animate-fade-in flex max-h-[min(560px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-dialog">
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border-subtle px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">{t("diary.backup")}</h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-repressurizer-text-muted">{t("diary.backup.desc")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="focus-ring rounded-lg p-1.5 text-lg leading-none text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white">×</button>
        </div>
        <div className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-5 py-3">
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder={t("diary.backup.description")} aria-label={t("diary.backup.description")} className="min-w-0 flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text outline-none focus:border-repressurizer-accent/55" />
          <button type="button" onClick={create} disabled={busy} data-testid="diary-backup-create" className="focus-ring btn-press inline-flex shrink-0 items-center gap-2 rounded-lg bg-repressurizer-accent px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-50">
            <Database size={14} />
            {t("diary.backup.create")}
          </button>
        </div>
        {notice && <p data-testid="diary-backup-notice" className="px-5 pt-3 text-xs text-repressurizer-success">{notice}</p>}
        {error && <p className="px-5 pt-3 text-xs text-repressurizer-danger">{error}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {restorePreview ? (
            <div data-testid="diary-backup-restore-preview" className="animate-fade-in rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
              <p className="text-sm font-semibold text-amber-100">{t("diary.backup.restoreTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/80">{t("diary.backup.restoreDiff")} <span className="font-medium">{restorePreview.backup.description || restorePreview.backup.name}</span></p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-amber-100/80">
                <span>{restorePreview.files.filter((file) => file.status !== "unchanged").length} {t("diary.backup.restoreChanged")} · {restorePreview.files.filter((file) => file.status === "unchanged").length} {t("diary.backup.restoreUnchanged")}</span>
                {restorePreview.files.some((file) => file.status !== "unchanged") && <button type="button" onClick={() => setRestorePreview((current) => current ? { ...current, files: current.files.map((file) => ({ ...file, selected: file.status !== "unchanged" })) } : current)} className="focus-ring rounded-md border border-amber-300/30 px-2 py-1 hover:bg-amber-300/10">{t("diary.backup.restoreSelectAll")}</button>}
              </div>
              <div className="mt-3 space-y-1.5">
                {restorePreview.files.map((file) => {
                  const label = file.key.replace(/\.json$/, "").replaceAll("diary-", "").replaceAll("-", " ");
                  const statusLabel = file.status === "unchanged" ? t("diary.backup.restoreUnchanged") : file.status === "missing" ? t("diary.backup.restoreMissing") : t("diary.backup.restoreChanged");
                  return <label key={file.key} data-testid={`diary-backup-restore-file-${file.key}`} className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs transition-colors ${file.status === "unchanged" ? "border-amber-200/10 opacity-55" : "border-amber-200/20 bg-black/10 hover:border-amber-200/35"}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={file.selected} disabled={file.status === "unchanged" || busy} onChange={() => setRestorePreview((current) => current ? { ...current, files: current.files.map((candidate) => candidate.key === file.key ? { ...candidate, selected: !candidate.selected } : candidate) } : current)} className="accent-repressurizer-accent" />
                      <span className="truncate capitalize text-amber-50">{label}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-amber-100/65">{statusLabel}</span>
                  </label>;
                })}
              </div>
              {restorePreview.files.every((file) => file.status === "unchanged") && <p className="mt-3 text-xs text-amber-100/75">{t("diary.backup.restoreNoChanges")}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRestorePreview(null)} className="focus-ring rounded-md border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover">{t("diary.pages.cancel")}</button>
                <button type="button" onClick={() => void restore(restorePreview)} disabled={busy || restorePreview.files.every((file) => !file.selected || file.status === "unchanged")} data-testid="diary-backup-restore-confirm" className="focus-ring rounded-md bg-amber-400 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-50"><Check size={13} className="mr-1 inline" />{t("diary.backup.restoreSelected")}</button>
              </div>
            </div>
          ) : !loaded ? (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-repressurizer-text-faint"><Spinner size={14} className="animate-spin" />{t("diary.backup.create")}</p>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
              <Archive size={28} weight="duotone" className="mb-2 text-repressurizer-text-faint" />
              <p className="text-xs text-repressurizer-text-muted">{t("diary.backup.empty")}</p>
            </div>
          ) : (
            <ul data-testid="diary-backup-list" className="space-y-1.5">
              {Object.entries(
                backups.reduce<Record<string, typeof backups>>((groups, backup) => {
                  const dayKey = new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(backup.created_at_ms));
                  (groups[dayKey] ??= []).push(backup);
                  return groups;
                }, {}),
              ).map(([dayLabel, dayBackups]) => (
                <li key={dayLabel} className="mb-3 last:mb-0">
                  <button
                    type="button"
                    data-testid={`diary-backup-day-${dayLabel}`}
                    onClick={() => setCollapsedDays((current) => {
                      const next = new Set(current);
                      if (next.has(dayLabel)) next.delete(dayLabel);
                      else next.add(dayLabel);
                      return next;
                    })}
                    className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2 text-left shadow-pop-sm transition-colors hover:border-repressurizer-border hover:bg-repressurizer-surface-hover/50"
                  >
                    <span className="text-[11px] font-semibold text-repressurizer-text">{dayLabel}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] tabular-nums text-repressurizer-text-faint">{dayBackups.length}</span>
                      <CaretDown size={12} className={`text-repressurizer-text-faint transition-transform duration-150 ${collapsedDays.has(dayLabel) ? "-rotate-90" : ""}`} />
                    </span>
                  </button>
                  {!collapsedDays.has(dayLabel) && (
                  <div className="mt-2 space-y-2">
                  {dayBackups.map((backup) => {
                const isAuto = backup.description === "Auto-backup" || backup.description === "Weekly auto-backup" || backup.description === "Daily auto-backup";
                const has = (file: string) => backup.files.includes(file);
                return (
                <div key={backup.name} data-testid="diary-backup-item" className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/60 px-3 py-3 transition-colors hover:border-repressurizer-border">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${isAuto ? "border-sky-400/30 bg-sky-400/10 text-sky-300" : "border-repressurizer-accent/30 bg-repressurizer-accent/10 text-repressurizer-accent"}`}>
                          {isAuto ? "AUTO" : "MANUAL"}
                        </span>
                        <p className="truncate text-xs font-medium text-repressurizer-text">{backup.description || backup.name}</p>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-repressurizer-text-faint">
                        {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(backup.created_at_ms))}
                        {" · "}
                        {t("diary.backup.files", { count: backup.files.length })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => void prepareRestore(backup)} disabled={busy || previewBusy} title={t("diary.backup.restore")} aria-label={`${t("diary.backup.restore")}: ${backup.name}`} className="focus-ring rounded-md p-2 text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/10"><ClockCounterClockwise size={15} /></button>
                      <button type="button" onClick={() => { if (window.confirm(t("diary.backup.deleteConfirm", { name: backup.name }))) void remove(backup); }} disabled={busy} title={t("diary.templates.delete")} aria-label={`${t("diary.templates.delete")}: ${backup.name}`} className="focus-ring rounded-md p-2 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {has("diary.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">diary</span>}
                    {has("diary-templates.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">templates</span>}
                    {has("diary-status-events.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">events</span>}
                    {has("diary-achievements.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">achievements</span>}
                    {has("reviews.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">ratings</span>}
                    {has("notes.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">notes</span>}
                    {has("statuses.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">statuses</span>}
                    {has("diary-board.json") && <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-1.5 py-0.5 text-[8px] text-repressurizer-text-faint">board</span>}
                  </div>
                </div>
                );
              })}
                  </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
