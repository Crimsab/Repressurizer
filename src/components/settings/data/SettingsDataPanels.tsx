import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretRight,
  ClockCounterClockwise,
  Plus,
  Star,
  TrashSimple,
} from "@phosphor-icons/react";
import { useGameStore } from "../../../stores/gameStore";
import { useT } from "../../../lib/i18n";
import type { ChangelogEntry } from "../../../lib/changelog";
import type { BackupInfo, OwnedGame } from "../../../lib/types";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ts: string): string {
  if (ts.length >= 15) return `${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  return ts;
}

function formatDate(ts: string): string {
  if (ts.length >= 8) return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  return ts;
}

function groupBackupsByDay(backups: BackupInfo[]): Map<string, BackupInfo[]> {
  const groups = new Map<string, BackupInfo[]>();
  for (const backup of backups) {
    const day = backup.timestamp.slice(0, 8);
    const group = groups.get(day) ?? [];
    group.push(backup);
    groups.set(day, group);
  }
  return groups;
}

export function BackupsTab({
  backups,
  loading,
  restoring,
  onRestore,
  onDelete,
  onManualBackup,
}: {
  backups: BackupInfo[];
  loading: boolean;
  restoring: boolean;
  onRestore: (backup: BackupInfo) => void;
  onDelete: (backup: BackupInfo) => void;
  onManualBackup: () => void;
}) {
  const games = useGameStore((state) => state.games);
  const t = useT();
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("repressurizer-backup-favorites");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set<string>();
    }
  });
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const grouped = useMemo(() => groupBackupsByDay(backups), [backups]);
  const days = useMemo(() => [...grouped.keys()], [grouped]);

  useEffect(() => {
    if (days.length > 1) setCollapsedDays(new Set(days.slice(1)));
  }, [days.length > 0 ? days[0] : ""]);

  const toggleFavorite = (filename: string) => {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      localStorage.setItem("repressurizer-backup-favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setCollapsedDays((previous) => {
      const next = new Set(previous);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(4)].map((_, index) => <div key={index} className="skeleton h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-repressurizer-text-faint">{t("backups.desc")}</p>
          <CreateBackupButton onClick={onManualBackup} />
        </div>
        <div className="py-8 text-center animate-fade-in">
          <ClockCounterClockwise size={36} weight="duotone" className="mx-auto mb-3 text-repressurizer-text-faint" />
          <p className="text-sm text-repressurizer-text-muted">{t("backups.noBackups")}</p>
        </div>
      </div>
    );
  }

  const favoriteBackups = backups.filter((backup) => favorites.has(backup.filename));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-repressurizer-text-faint">{t("backups.pinDesc")}</p>
        <CreateBackupButton onClick={onManualBackup} />
      </div>

      {favoriteBackups.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-amber-500">
            <Star size={12} weight="fill" />
            {t("backups.pinned")}
          </h3>
          <div className="space-y-1">
            {favoriteBackups.map((backup) => (
              <BackupRow
                key={backup.filename}
                backup={backup}
                games={games}
                isFavorite
                restoring={restoring}
                onRestore={onRestore}
                onDelete={onDelete}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </div>
      )}

      {days.map((day) => {
        const dayBackups = grouped.get(day) ?? [];
        const isCollapsed = collapsedDays.has(day);
        return (
          <div key={day}>
            <button
              onClick={() => toggleDay(day)}
              className="mb-2 flex w-full items-center gap-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
            >
              {isCollapsed ? <CaretRight size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
              {formatDate(day)}
              <span className="font-normal text-repressurizer-text-faint">({dayBackups.length})</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1">
                {dayBackups.map((backup) => (
                  <BackupRow
                    key={backup.filename}
                    backup={backup}
                    games={games}
                    isFavorite={favorites.has(backup.filename)}
                    restoring={restoring}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateBackupButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-repressurizer-accent/15 px-3 py-1.5 text-xs font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/25"
    >
      <Plus size={12} weight="bold" />
      {t("backups.create")}
    </button>
  );
}

function BackupRow({
  backup,
  games,
  isFavorite,
  restoring,
  onRestore,
  onDelete,
  onToggleFavorite,
}: {
  backup: BackupInfo;
  games: Record<number, OwnedGame>;
  isFavorite: boolean;
  restoring: boolean;
  onRestore: (backup: BackupInfo) => void;
  onDelete: (backup: BackupInfo) => void;
  onToggleFavorite: (filename: string) => void;
}) {
  const description = renderBackupDescription(backup.description, games);
  const t = useT();
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-3.5 py-2.5 transition-colors hover:border-repressurizer-border">
      <button
        onClick={() => onToggleFavorite(backup.filename)}
        className={`mt-0.5 shrink-0 transition-colors ${isFavorite ? "text-amber-500" : "text-repressurizer-border hover:text-amber-500/50"}`}
        title={isFavorite ? t("backups.unpin") : t("backups.pin")}
      >
        <Star size={14} weight={isFavorite ? "fill" : "regular"} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-repressurizer-text tabular-nums">{formatTime(backup.timestamp)}</span>
          <span className="font-mono text-xs text-repressurizer-text-faint tabular-nums">{formatSize(backup.size)}</span>
          {backup.is_pre_restore && (
            <span className="rounded-md bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
              {t("backups.preRestore")}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-repressurizer-text-faint leading-relaxed truncate" title={backup.description}>
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 mt-0.5">
        <button
          onClick={() => onRestore(backup)}
          disabled={restoring}
          className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-accent/10 px-2.5 py-1 text-xs text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/20 disabled:opacity-50"
        >
          <ArrowCounterClockwise size={11} />
          {t("backups.restore")}
        </button>
        <button
          onClick={() => onDelete(backup)}
          className="btn-press inline-flex items-center gap-1 rounded-lg bg-repressurizer-danger/8 px-2.5 py-1 text-xs text-repressurizer-danger transition-colors hover:bg-repressurizer-danger/15"
        >
          <TrashSimple size={11} />
          {t("backups.delete")}
        </button>
      </div>
    </div>
  );
}

export function ChangelogPanel({ entries }: { entries: ChangelogEntry[] }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
      <p className="font-medium text-repressurizer-text">{t("settings.changelog.title")}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">{t("settings.changelog.desc")}</p>
      <div className="mt-3 divide-y divide-repressurizer-border-subtle overflow-hidden rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40">
        {entries.slice(0, 8).map((entry, index) => {
          const userGroups = entry.groups.filter((group) => group.audience === "user" && group.items.length > 0);
          return (
            <details key={entry.version} open={index === 0} className="group/changelog [&[open]_.changelog-caret]:rotate-90">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-repressurizer-surface-hover/50 [&::-webkit-details-marker]:hidden">
                <CaretRight size={13} weight="bold" className="changelog-caret shrink-0 text-repressurizer-text-faint transition-transform" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-repressurizer-text">v{entry.version}</span>
                  <span className="block text-[11px] text-repressurizer-text-faint">{entry.date}</span>
                </span>
              </summary>
              <div className="space-y-3 border-t border-repressurizer-border-subtle px-3 pb-3 pt-2">
                {userGroups.map((group) => (
                  <div key={`${entry.version}-${group.title}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-repressurizer-text-faint">{group.title}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item.sha} className="flex gap-2 text-xs leading-relaxed text-repressurizer-text-muted">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-repressurizer-accent/70" />
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <ChangelogLink onClick={() => void open(entry.releaseUrl)} label={t("settings.changelog.openRelease")} />
                  <ChangelogLink onClick={() => void open(entry.compareUrl)} label={t("settings.changelog.compare")} />
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function ChangelogLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
    >
      {label}
    </button>
  );
}

export function renderBackupDescription(description: string, games: Record<number, OwnedGame>): string {
  if (!description || description === "Pre-restore snapshot") return description;
  if (!description.startsWith("{")) return description;

  try {
    const data = JSON.parse(description);
    const parts: string[] = [];
    const gameName = (id: number) => games[id]?.name ?? `#${id}`;
    if (data.added_collections?.length > 0) parts.push(`Added: ${data.added_collections.join(", ")}`);
    if (data.removed_collections?.length > 0) parts.push(`Removed: ${data.removed_collections.join(", ")}`);

    for (const change of data.game_changes ?? []) {
      const items: string[] = [];
      for (const id of (change.added ?? []).slice(0, 5)) items.push(`+${gameName(id)}`);
      if ((change.added?.length ?? 0) > 5) items.push(`+${change.added.length - 5} more`);
      for (const id of (change.removed ?? []).slice(0, 5)) items.push(`-${gameName(id)}`);
      if ((change.removed?.length ?? 0) > 5) items.push(`-${change.removed.length - 5} more`);
      if (items.length > 0) parts.push(`${change.collection}: ${items.join(", ")}`);
    }
    return parts.join(" | ") || "No changes";
  } catch {
    return description;
  }
}
