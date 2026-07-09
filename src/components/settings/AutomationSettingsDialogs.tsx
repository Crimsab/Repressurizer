import { open } from "@tauri-apps/plugin-shell";
import { Globe, X } from "@phosphor-icons/react";
import type { AutomationPublishLogEntry } from "../../lib/types";
import { useT } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";
import { SelectMenu } from "../ui/SelectMenu";

export type AutomationLogFilter = "all" | "success" | "failed" | "skipped";
export type AutomationLogSort = "desc" | "asc";

export function AutomationLogsDialog({
  logs,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onClose,
}: {
  logs: AutomationPublishLogEntry[];
  filter: AutomationLogFilter;
  sort: AutomationLogSort;
  onFilterChange: (value: AutomationLogFilter) => void;
  onSortChange: (value: AutomationLogSort) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <DialogOverlay
      label={t("settings.automationExport.logsTitle")}
      onClose={onClose}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-3xl flex-col rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_16px_48px_rgba(0,0,0,0.5)]" style={{ maxHeight: "min(640px, calc(100vh - 96px))" }}>
        <div className="flex items-center justify-between border-b border-repressurizer-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("settings.automationExport.logsTitle")}</h3>
            <p className="mt-0.5 text-[11px] text-repressurizer-text-faint">{t("settings.automationExport.logsDesc")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={15} weight="bold" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-repressurizer-border px-4 py-3">
          <SelectMenu<AutomationLogFilter>
            ariaLabel={t("settings.automationExport.logsTitle")}
            value={filter}
            onChange={onFilterChange}
            size="sm"
            className="w-40"
            options={[
              { value: "all", label: t("settings.automationExport.logs.all") },
              { value: "success", label: t("settings.automationExport.status.success") },
              { value: "failed", label: t("settings.automationExport.status.failed") },
              { value: "skipped", label: t("settings.automationExport.status.skipped") },
            ]}
          />
          <SelectMenu<AutomationLogSort>
            ariaLabel={t("settings.automationExport.logsTitle")}
            value={sort}
            onChange={onSortChange}
            size="sm"
            className="w-40"
            options={[
              { value: "desc", label: t("settings.automationExport.logs.newest") },
              { value: "asc", label: t("settings.automationExport.logs.oldest") },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-repressurizer-text-muted">
              {t("settings.automationExport.logs.empty")}
            </div>
          ) : (
            <div className="divide-y divide-repressurizer-border-subtle">
              {logs.map((entry) => (
                <div key={entry.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_132px_minmax(0,1fr)]">
                  <p className="font-mono text-[11px] text-repressurizer-text-faint tabular-nums sm:whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                  <p className={`whitespace-nowrap text-xs font-medium ${
                    entry.status === "success"
                      ? "text-repressurizer-success"
                      : entry.status === "failed"
                        ? "text-repressurizer-danger"
                        : "text-repressurizer-text-muted"
                  }`}>
                    {t(`settings.automationExport.status.${entry.status}` as Parameters<typeof t>[0])}
                    {entry.httpStatus > 0 && <span className="ml-2 font-mono text-repressurizer-text-muted">HTTP {entry.httpStatus}</span>}
                  </p>
                  <p className="min-w-0 text-xs leading-relaxed text-repressurizer-text-muted">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DialogOverlay>
  );
}

export function AutomationGuideDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const items = [
    [t("settings.automationExport.guide.endpointTitle"), t("settings.automationExport.guide.endpointBody")],
    [t("settings.automationExport.guide.payloadTitle"), t("settings.automationExport.guide.payloadBody")],
    [t("settings.automationExport.guide.changeTitle"), t("settings.automationExport.guide.changeBody")],
    [t("settings.automationExport.guide.receiverTitle"), t("settings.automationExport.guide.receiverBody")],
    [t("settings.automationExport.guide.limitsTitle"), t("settings.automationExport.guide.limitsBody")],
    [t("settings.automationExport.guide.packagesTitle"), t("settings.automationExport.guide.packagesBody")],
  ] as const;
  return (
    <DialogOverlay
      label={t("settings.automationExport.guideTitle")}
      onClose={onClose}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_16px_48px_rgba(0,0,0,0.5)]" style={{ maxHeight: "min(640px, calc(100vh - 96px))" }}>
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("settings.automationExport.guideTitle")}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-repressurizer-text-faint">{t("settings.automationExport.guideDesc")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={15} weight="bold" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map(([title, body]) => (
              <div key={title} className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-3">
                <p className="text-xs font-semibold text-repressurizer-text">{title}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-repressurizer-text-faint">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/60 px-3 py-2 text-[11px] leading-relaxed text-repressurizer-text-muted">
            {t("settings.automationExport.guideFooter")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <GuideLink
              url="https://github.com/Crimsab/Repressurizer/blob/main/docs/automation-export.md"
              label={t("settings.automationExport.guideOpenAutomationDocs")}
            />
            <GuideLink
              url="https://github.com/Crimsab/Repressurizer/blob/main/docs/integrations/repressurizer-snapshot-v1.md"
              label={t("settings.automationExport.guideOpenSchemaDocs")}
            />
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

function GuideLink({ url, label }: { url: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void open(url)}
      className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
    >
      <Globe size={13} weight="duotone" />
      {label}
    </button>
  );
}
