import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  FolderOpen,
  MagnifyingGlass,
  Wrench,
  X,
} from "@phosphor-icons/react";
import type { SamBackupInfo, SamBridgeProbe } from "../../lib/types";
import { useT, type TranslationKey } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";
import { SelectMenu } from "../ui/SelectMenu";

export function SamBridgePanel({
  probe,
  writesEnabled,
  runningAction,
  message,
  error,
  lockedCount,
  unlockedCount,
  onUnlockAll,
  onLockAll,
  onOpenBackups,
  onRestoreBackup,
}: {
  probe: SamBridgeProbe | null;
  writesEnabled: boolean;
  runningAction: string;
  message: string;
  error: string;
  lockedCount: number;
  unlockedCount: number;
  onUnlockAll: () => void;
  onLockAll: () => void;
  onOpenBackups: () => void;
  onRestoreBackup: () => void;
}) {
  const t = useT();
  const readiness = samReadinessLabel(t, probe);
  const canWrite = writesEnabled && !!probe?.available && !!probe?.writesSteam;
  const busy = !!runningAction;
  const lockBlocked = !canWrite || busy || unlockedCount === 0;
  const unlockBlocked = !canWrite || busy || lockedCount === 0;

  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Wrench size={17} weight="duotone" className="mt-0.5 shrink-0 text-repressurizer-accent" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("detail.sam.title")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {writesEnabled ? t("detail.sam.writeDesc") : t("detail.sam.desc")}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${probe?.available ? "border-repressurizer-success/30 bg-repressurizer-success/10 text-repressurizer-success" : "border-repressurizer-border bg-repressurizer-surface text-repressurizer-text-muted"}`}>
          {readiness}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-repressurizer-border-subtle pt-3">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-repressurizer-text-faint">
          {!writesEnabled
            ? t("detail.sam.enableWrites")
            : probe?.available
              ? t("detail.sam.backupNote")
              : t("detail.sam.bridgeRequired")}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenBackups}
            className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-text-faint hover:text-repressurizer-text"
          >
            {t("detail.sam.openBackups")}
          </button>
          <button
            type="button"
            onClick={onRestoreBackup}
            disabled={!canWrite}
            className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-40"
          >
            {runningAction === "restore_backup" ? t("detail.sam.working") : t("detail.sam.restoreBackup")}
          </button>
          <button
            type="button"
            onClick={onUnlockAll}
            disabled={unlockBlocked}
            className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-40"
          >
            {runningAction === "unlock_all" ? t("detail.sam.working") : t("detail.sam.unlockAll", { count: lockedCount })}
          </button>
          <button
            type="button"
            onClick={onLockAll}
            disabled={lockBlocked}
            className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-danger hover:text-repressurizer-danger disabled:opacity-40"
          >
            {runningAction === "lock_all" ? t("detail.sam.working") : t("detail.sam.lockAll", { count: unlockedCount })}
          </button>
        </div>
      </div>
      {message && (
        <p className="mt-2 rounded-lg border border-repressurizer-success/20 bg-repressurizer-success/10 px-3 py-2 text-xs text-repressurizer-success">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-repressurizer-danger/20 bg-repressurizer-danger/10 px-3 py-2 text-xs text-repressurizer-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function SamBackupViewerDialog({
  gameName,
  appId,
  backups,
  loading,
  error,
  restoring,
  onClose,
  onRefresh,
  onRestore,
  onOpenFolder,
}: {
  gameName: string;
  appId: number;
  backups: SamBackupInfo[];
  loading: boolean;
  error: string;
  restoring: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRestore: (backup: SamBackupInfo) => void;
  onOpenFolder: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [dayFilter, setDayFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [sortMode, setSortMode] = useState("newest");

  const backupDays = useMemo(() => {
    const byDay = new Map<string, string>();
    for (const backup of backups) {
      const key = samBackupDayKey(backup.capturedAt);
      if (!key || byDay.has(key)) continue;
      byDay.set(key, formatSamBackupDay(backup.capturedAt));
    }
    return [...byDay.entries()].map(([value, label]) => ({ value, label }));
  }, [backups]);

  const filteredBackups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return backups
      .filter((backup) => {
        if (dayFilter !== "all" && samBackupDayKey(backup.capturedAt) !== dayFilter) return false;
        if (phaseFilter !== "all" && backup.phase !== phaseFilter) return false;
        if (actionFilter !== "all" && samBackupActionFamily(backup.action) !== actionFilter) return false;
        if (!normalizedQuery) return true;
        return [
          backup.filename,
          backup.action,
          backup.phase,
          formatSamBackupDate(backup.capturedAt),
          formatSamBackupDay(backup.capturedAt),
          gameName,
          String(appId),
          String(backup.achievementCount),
          String(backup.unlockedCount),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortMode === "oldest") return samBackupTime(a.capturedAt) - samBackupTime(b.capturedAt);
        if (sortMode === "unlocked") return b.unlockedCount - a.unlockedCount || samBackupTime(b.capturedAt) - samBackupTime(a.capturedAt);
        if (sortMode === "filename") return a.filename.localeCompare(b.filename);
        return samBackupTime(b.capturedAt) - samBackupTime(a.capturedAt);
      });
  }, [actionFilter, appId, backups, dayFilter, gameName, phaseFilter, query, sortMode]);

  return (
    <DialogOverlay
      label={t("detail.sam.backupsFor", { name: gameName })}
      onClose={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_18px_56px_rgba(0,0,0,0.55)]" style={{ maxHeight: "min(760px, 86vh)" }} data-sam-backup-viewer>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-repressurizer-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-repressurizer-text">
              {t("detail.sam.backupsFor", { name: gameName })}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-muted">
              {t("detail.sam.backupsDesc")}
            </p>
            <p className="mt-1 font-mono text-[11px] text-repressurizer-text-faint" data-sam-backup-count>
              {t("detail.sam.backupsMeta", {
                appId,
                shown: filteredBackups.length,
                total: backups.length,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-repressurizer-border-subtle px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <MagnifyingGlass
                size={14}
                weight="bold"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint"
              />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("detail.sam.searchBackups")}
                className="h-9 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg pl-9 pr-3 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint transition-colors focus:border-repressurizer-accent focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || restoring}
              className="btn-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-40"
            >
              <ArrowsClockwise size={13} className={loading ? "animate-spin" : ""} />
              {t("settings.refresh")}
            </button>
            <button
              type="button"
              onClick={onOpenFolder}
              disabled={loading || restoring}
              className="btn-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-40"
            >
              <FolderOpen size={13} weight="bold" />
              {t("detail.sam.openBackupFolder")}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <SamBackupSelect
              label={t("detail.sam.filterDay")}
              value={dayFilter}
              onChange={setDayFilter}
              options={[
                { value: "all", label: t("detail.sam.filterDayAll") },
                ...backupDays,
              ]}
            />
            <SamBackupSelect
              label={t("detail.sam.filterPhase")}
              value={phaseFilter}
              onChange={setPhaseFilter}
              options={[
                { value: "all", label: t("detail.sam.filterPhaseAll") },
                { value: "before", label: t("detail.sam.backupPhaseBefore") },
                { value: "after", label: t("detail.sam.backupPhaseAfter") },
              ]}
            />
            <SamBackupSelect
              label={t("detail.sam.filterAction")}
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                { value: "all", label: t("detail.sam.filterActionAll") },
                { value: "unlock", label: t("detail.sam.actionUnlock") },
                { value: "lock", label: t("detail.sam.actionLock") },
                { value: "restore", label: t("detail.sam.actionRestore") },
              ]}
            />
            <SamBackupSelect
              label={t("detail.sam.sortBackups")}
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: "newest", label: t("detail.sam.sortNewest") },
                { value: "oldest", label: t("detail.sam.sortOldest") },
                { value: "unlocked", label: t("detail.sam.sortUnlocked") },
                { value: "filename", label: t("detail.sam.sortFilename") },
              ]}
            />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4" data-sam-backup-list>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="skeleton h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-lg border border-repressurizer-danger/20 bg-repressurizer-danger/10 px-3 py-2 text-sm text-repressurizer-danger">
              {error}
            </p>
          ) : backups.length === 0 ? (
            <p className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-8 text-center text-sm text-repressurizer-text-muted">
              {t("detail.sam.noBackups")}
            </p>
          ) : filteredBackups.length === 0 ? (
            <p className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-8 text-center text-sm text-repressurizer-text-muted">
              {t("detail.sam.noBackupMatches")}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredBackups.map((backup) => (
                <div
                  key={backup.path}
                  data-sam-backup-row
                  className="flex items-center justify-between gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-repressurizer-text">
                        {formatSamBackupDate(backup.capturedAt)}
                      </span>
                      <span className="rounded-md border border-repressurizer-border bg-repressurizer-surface px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-text-muted">
                        {samBackupPhaseLabel(t, backup.phase)}
                      </span>
                      <span className="rounded-md bg-repressurizer-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-repressurizer-accent">
                        {backup.action.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-repressurizer-text-faint">
                      {backup.filename}
                    </p>
                    <p className="mt-0.5 text-[11px] text-repressurizer-text-muted">
                      {t("detail.sam.backupStats", {
                        count: backup.achievementCount,
                        unlocked: backup.unlockedCount,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(backup)}
                    disabled={restoring}
                    className="btn-press shrink-0 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-accent hover:text-repressurizer-accent disabled:opacity-40"
                  >
                    {restoring ? t("detail.sam.working") : t("detail.sam.restoreBackup")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DialogOverlay>
  );
}

function SamBackupSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <SelectMenu
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      className="block min-w-0"
      buttonClassName="bg-repressurizer-bg text-xs"
    />
  );
}

function samBackupTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function samBackupDayKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatSamBackupDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSamBackupDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function samBackupPhaseLabel(t: ReturnType<typeof useT>, phase: string): string {
  if (phase === "before") return t("detail.sam.backupPhaseBefore");
  if (phase === "after") return t("detail.sam.backupPhaseAfter");
  return phase || t("common.unknown");
}

function samBackupActionFamily(action: string): string {
  if (action.startsWith("unlock")) return "unlock";
  if (action.startsWith("lock")) return "lock";
  if (action.startsWith("restore")) return "restore";
  return action || "other";
}

function samReadinessLabel(t: ReturnType<typeof useT>, probe: SamBridgeProbe | null): string {
  if (!probe) return t("steamTools.sam.checking");
  return t(`steamTools.sam.readiness.${probe.readiness}` as TranslationKey);
}

