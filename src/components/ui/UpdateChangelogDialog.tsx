import { Sparkle, X } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import type { ChangelogEntry } from "../../lib/changelog";
import { ChangelogPanel } from "../settings/data/SettingsDataPanels";
import { DialogOverlay } from "./DialogOverlay";

export function UpdateChangelogDialog({
  previousVersion,
  currentVersion,
  entries,
  onClose,
}: {
  previousVersion: string;
  currentVersion: string;
  entries: ChangelogEntry[];
  onClose: () => void;
}) {
  const t = useT();
  return (
    <DialogOverlay
      label={t("updates.whatsNew.title", { version: currentVersion })}
      onClose={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-auto bg-black/65 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl animate-fade-in flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_72px_rgba(0,0,0,0.6)]">
        <div className="flex items-start gap-3 border-b border-repressurizer-border px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-repressurizer-accent/30 bg-repressurizer-accent/10 text-repressurizer-accent">
            <Sparkle size={19} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight text-repressurizer-text">
              {t("updates.whatsNew.title", { version: currentVersion })}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("updates.whatsNew.desc", { previousVersion, currentVersion })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          <ChangelogPanel entries={entries} showHeader={false} maxEntries={entries.length} />
        </div>
        <div className="flex justify-end border-t border-repressurizer-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
