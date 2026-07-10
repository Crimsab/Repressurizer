import { CheckCircle, X } from "@phosphor-icons/react";
import {
  DEFAULT_DEPRESSURIZER_DATABASE_MERGE_OPTIONS,
  type DepressurizerDatabaseMergeOptions,
} from "../../../lib/depressurizerDatabaseImport";
import { useT } from "../../../lib/i18n";
import { DialogOverlay } from "../../ui/DialogOverlay";
import { parseAppIdList } from "./settingsImportUtils";

export interface DepressurizerDatabaseImportOptions extends DepressurizerDatabaseMergeOptions {
  sourcePath: string;
  extraAppIds: string;
  includeNames: boolean;
  addExtraAsCollectionOnly: boolean;
}

export const DEFAULT_DEPRESSURIZER_DATABASE_IMPORT_OPTIONS: DepressurizerDatabaseImportOptions = {
  ...DEFAULT_DEPRESSURIZER_DATABASE_MERGE_OPTIONS,
  sourcePath: "",
  extraAppIds: "",
  includeNames: true,
  addExtraAsCollectionOnly: true,
};

export function DepressurizerDatabaseImportDialog({
  options,
  gameCount,
  importing,
  onChange,
  onSelectFile,
  onImport,
  onClose,
}: {
  options: DepressurizerDatabaseImportOptions;
  gameCount: number;
  importing: boolean;
  onChange: (patch: Partial<DepressurizerDatabaseImportOptions>) => void;
  onSelectFile: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const extraCount = parseAppIdList(options.extraAppIds).length;
  const canImport = !!options.sourcePath && !importing;

  return (
    <DialogOverlay
      label={t("settings.depDbImport.title")}
      onClose={onClose}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-3xl flex-col rounded-xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_16px_48px_rgba(0,0,0,0.5)]" style={{ maxHeight: "min(720px, calc(100vh - 96px))" }}>
        <div className="flex items-start justify-between gap-4 border-b border-repressurizer-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-repressurizer-text">{t("settings.depDbImport.title")}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
              {t("settings.depDbImport.desc")}
            </p>
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
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.depDbImport.source")}</p>
                <div className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
                    <p className="truncate font-mono text-[11px] text-repressurizer-text-muted">
                      {options.sourcePath || t("settings.depDbImport.source.empty")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSelectFile}
                    className="btn-press shrink-0 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs font-medium text-repressurizer-text transition-colors hover:border-repressurizer-accent/50"
                  >
                    {t("settings.depDbImport.choose")}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-repressurizer-text">{t("settings.depDbImport.scope")}</p>
                  <span className="rounded-full bg-repressurizer-surface px-2 py-0.5 text-[10px] text-repressurizer-text-faint">
                    {extraCount > 0
                      ? t("settings.depDbImport.scope.withExtra", { count: gameCount, extra: extraCount })
                      : t("settings.depDbImport.scope.library", { count: gameCount })}
                  </span>
                </div>
                <label className="mt-3 block text-[11px] uppercase tracking-wider text-repressurizer-text-faint">
                  {t("settings.depDbImport.extraIds")}
                </label>
                <textarea
                  value={options.extraAppIds}
                  onChange={(event) => onChange({ extraAppIds: event.target.value })}
                  placeholder="10, 20, 30"
                  className="mt-1.5 h-20 w-full resize-none rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 font-mono text-xs text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-repressurizer-text-faint">
                  {t("settings.depDbImport.extraIds.desc")}
                </p>
                <ImportOptionToggle
                  className="mt-3"
                  label={t("settings.depDbImport.addExtra")}
                  description={t("settings.depDbImport.addExtra.desc")}
                  checked={options.addExtraAsCollectionOnly}
                  onChange={(checked) => onChange({ addExtraAsCollectionOnly: checked })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.depDbImport.data")}</p>
                <div className="mt-3 space-y-2">
                  <ImportOptionToggle
                    label={t("settings.depDbImport.names")}
                    description={t("settings.depDbImport.names.desc")}
                    checked={options.includeNames}
                    onChange={(checked) => onChange({ includeNames: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.details")}
                    description={t("settings.depDbImport.details.desc")}
                    checked={options.includeDetails}
                    onChange={(checked) => onChange({ includeDetails: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.tags")}
                    description={t("settings.depDbImport.tags.desc")}
                    checked={options.includeTags}
                    onChange={(checked) => onChange({ includeTags: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.hltb")}
                    description={t("settings.depDbImport.hltb.desc")}
                    checked={options.includeHltb}
                    onChange={(checked) => onChange({ includeHltb: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.reviews")}
                    description={t("settings.depDbImport.reviews.desc")}
                    checked={options.includeSteamReviews}
                    onChange={(checked) => onChange({ includeSteamReviews: checked })}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-3">
                <p className="text-xs font-semibold text-repressurizer-text">{t("settings.depDbImport.overwrite")}</p>
                <div className="mt-3 space-y-2">
                  <ImportOptionToggle
                    label={t("settings.depDbImport.overwrite.details")}
                    description={t("settings.depDbImport.overwrite.details.desc")}
                    checked={options.overwriteDetails}
                    disabled={!options.includeDetails}
                    onChange={(checked) => onChange({ overwriteDetails: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.overwrite.tags")}
                    description={t("settings.depDbImport.overwrite.tags.desc")}
                    checked={options.overwriteTags}
                    disabled={!options.includeTags}
                    onChange={(checked) => onChange({ overwriteTags: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.overwrite.hltb")}
                    description={t("settings.depDbImport.overwrite.hltb.desc")}
                    checked={options.overwriteHltb}
                    disabled={!options.includeHltb}
                    onChange={(checked) => onChange({ overwriteHltb: checked })}
                  />
                  <ImportOptionToggle
                    label={t("settings.depDbImport.overwrite.reviews")}
                    description={t("settings.depDbImport.overwrite.reviews.desc")}
                    checked={options.overwriteSteamReviews}
                    disabled={!options.includeSteamReviews}
                    onChange={(checked) => onChange({ overwriteSteamReviews: checked })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-repressurizer-border px-4 py-3">
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_DEPRESSURIZER_DATABASE_IMPORT_OPTIONS, sourcePath: options.sourcePath })}
            className="btn-press rounded-lg px-3 py-2 text-xs text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
          >
            {t("settings.depDbImport.reset")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-press rounded-lg px-4 py-2 text-sm text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onImport}
              disabled={!canImport}
              className="btn-press rounded-lg bg-repressurizer-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? t("settings.depDbImport.importing") : t("settings.depDbImport.import")}
            </button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

function ImportOptionToggle({
  label,
  description,
  checked,
  disabled = false,
  className = "",
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        checked
          ? "border-repressurizer-accent/60 bg-repressurizer-accent/10"
          : "border-repressurizer-border-subtle bg-repressurizer-surface/60 hover:border-repressurizer-border"
      } ${className}`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          checked ? "border-repressurizer-accent bg-repressurizer-accent text-white" : "border-repressurizer-border bg-repressurizer-bg"
        }`}
      >
        {checked && <CheckCircle size={11} weight="fill" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-repressurizer-text">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-repressurizer-text-faint">{description}</span>
      </span>
    </button>
  );
}
