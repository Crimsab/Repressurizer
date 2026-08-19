import { useCallback, useEffect, useState } from "react";
import { Archive, CaretDown, ClockCounterClockwise, Database, Spinner, Trash } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import {
  createDiaryBackup,
  deleteDiaryBackup,
  listDiaryBackups,
  restoreDiaryBackup,
  type DiaryBackupInfo,
} from "../../lib/tauri";

const DIARY_LOCAL_STORAGE_KEYS = [
  "repressurizer-diary",
  "repressurizer-diary-templates",
  "repressurizer-diary-status-events",
  "repressurizer-diary-board",
  "repressurizer-game-reviews",
  "repressurizer-game-notes",
  "repressurizer-game-status",
];

export function DiaryBackupDialog({ language, t, onClose }: { language: string; t: ReturnType<typeof useT>; onClose: () => void }) {
  const [backups, setBackups] = useState<DiaryBackupInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<DiaryBackupInfo | null>(null);
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

  const restore = async (backup: DiaryBackupInfo) => {
    setBusy(true);
    setError("");
    try {
      await restoreDiaryBackup(backup.name);
      for (const key of DIARY_LOCAL_STORAGE_KEYS) {
        try { localStorage.removeItem(key); } catch {}
      }
      window.location.reload();
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
      setPendingRestore(null);
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
    <div role="dialog" aria-modal="true" aria-label={t("diary.backup")} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[min(560px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border-subtle px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{t("diary.backup")}</h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-repressurizer-text-muted">{t("diary.backup.desc")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="focus-ring rounded-lg px-2 py-1 text-lg leading-none text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white">×</button>
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
          {pendingRestore ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4">
              <p className="text-xs leading-relaxed text-amber-200">{t("diary.backup.restoreConfirm", { name: pendingRestore.name })}</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setPendingRestore(null)} className="focus-ring rounded-md border border-repressurizer-border px-3 py-1.5 text-xs text-repressurizer-text-muted hover:bg-repressurizer-surface-hover">{t("diary.pages.cancel")}</button>
                <button type="button" onClick={() => void restore(pendingRestore)} disabled={busy} data-testid="diary-backup-restore-confirm" className="focus-ring rounded-md bg-amber-400 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-50">{t("diary.backup.restore")}</button>
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
                    className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2 text-left transition-colors hover:bg-repressurizer-surface-hover/50"
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
                <div key={backup.name} data-testid="diary-backup-item" className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg/60 px-3 py-3">
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
                      <button type="button" onClick={() => setPendingRestore(backup)} disabled={busy} title={t("diary.backup.restore")} aria-label={`${t("diary.backup.restore")}: ${backup.name}`} className="focus-ring rounded-md p-2 text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/10"><ClockCounterClockwise size={15} /></button>
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
