import { Question, X } from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";

interface ShortcutRow {
  keys: string[];
  label: TranslationKey;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["/"], label: "diary.shortcuts.search" },
  { keys: ["W", "A", "S", "D"], label: "diary.shortcuts.moveKanban" },
  { keys: ["J"], label: "diary.shortcuts.nextCard" },
  { keys: ["K"], label: "diary.shortcuts.previousCard" },
  { keys: ["Space"], label: "diary.shortcuts.toggleSelection" },
  { keys: ["Enter"], label: "diary.shortcuts.openCard" },
  { keys: ["Esc"], label: "diary.shortcuts.escape" },
  { keys: ["Ctrl", "A"], label: "diary.shortcuts.selectColumn" },
];

export function DiaryKeyboardShortcutsDialog({ onClose, t }: { onClose: () => void; t: ReturnType<typeof useT> }) {
  return (
    <DialogOverlay
      label={t("diary.shortcuts.title")}
      onClose={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_70px_rgba(0,0,0,0.6)] animate-fade-in">
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border-subtle px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-repressurizer-accent/12 text-repressurizer-accent">
              <Question size={18} weight="bold" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">{t("diary.shortcuts.title")}</h2>
              <p className="mt-1 text-xs text-repressurizer-text-muted">{t("diary.shortcuts.description")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="focus-ring rounded-lg p-1.5 text-repressurizer-text-faint transition-colors hover:bg-repressurizer-surface-hover hover:text-white">
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="space-y-1 px-5 py-4">
          {SHORTCUTS.map(({ keys, label }) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-repressurizer-surface-hover/60">
              <span className="text-repressurizer-text-muted">{t(label)}</span>
              <span className="flex shrink-0 items-center gap-1" aria-label={keys.join("+")}>
                {keys.map((key) => <kbd key={key} className="min-w-7 rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg px-2 py-1 text-center font-mono text-[10px] font-semibold text-repressurizer-text shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">{key}</kbd>)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </DialogOverlay>
  );
}
