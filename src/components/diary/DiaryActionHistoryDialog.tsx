import { ArrowCounterClockwise, ClockCounterClockwise, Trash, X } from "@phosphor-icons/react";
import { DialogOverlay } from "../ui/DialogOverlay";
import type { DiaryActionHistoryEntry } from "../../stores/diaryActionHistoryStore";

export function DiaryActionHistoryDialog({ entries, t, onClose, onUndo, onRemove, onClear }: {
  entries: DiaryActionHistoryEntry[];
  t: ReturnType<typeof import("../../lib/i18n").useT>;
  onClose: () => void;
  onUndo: (entry: DiaryActionHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <DialogOverlay
      label={t("diary.revisions")}
      onClose={onClose}
      data-testid="diary-action-history-dialog"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface-raised shadow-dialog" style={{ maxHeight: "76vh" }}>
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={17} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-sm font-semibold text-white">{t("diary.revisions")}</h2>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && <button type="button" data-testid="diary-action-history-clear" onClick={onClear} className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={12} />{t("common.delete")}</button>}
            <button type="button" aria-label={t("common.close")} onClick={onClose} className="focus-ring rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white"><X size={15} /></button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          {entries.length === 0 ? (
            <p className="py-10 text-center text-xs text-repressurizer-text-faint">{t("diary.empty")}</p>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/50 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-repressurizer-accent/10 text-repressurizer-accent"><ArrowCounterClockwise size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-repressurizer-text">{entry.label}</p>
                    <p className="mt-0.5 text-[10px] text-repressurizer-text-faint">{entry.count > 0 ? `${entry.count} · ` : ""}{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <button type="button" data-testid={`diary-action-history-undo-${entry.id}`} onClick={() => onUndo(entry)} className="focus-ring shrink-0 rounded-md border border-repressurizer-accent/30 bg-repressurizer-accent/10 px-2 py-1.5 text-[10px] font-medium text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/20">{t("common.undo")}</button>
                  <button type="button" aria-label={t("common.delete")} onClick={() => onRemove(entry.id)} className="focus-ring shrink-0 rounded-md p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-danger/10 hover:text-repressurizer-danger"><Trash size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DialogOverlay>
  );
}
