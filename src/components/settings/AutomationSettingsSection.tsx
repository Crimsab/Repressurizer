import { CloudArrowDown, Info } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { AutomationPayloadSettings } from "./AutomationPayloadSettings";
import { ToggleRow } from "./SettingsControls";

interface AutomationSettingsSectionProps {
  gameCount: number;
  publishing: boolean;
  onPublish: () => void;
  onShowGuide: () => void;
  onShowLogs: () => void;
}

export function AutomationSettingsSection({
  gameCount,
  publishing,
  onPublish,
  onShowGuide,
  onShowLogs,
}: AutomationSettingsSectionProps) {
  const settings = useSettingsStore();
  const t = useT();
  const statusTone =
    settings.automationPublishLastStatus === "success"
      ? "success"
      : settings.automationPublishLastStatus === "failed"
        ? "danger"
        : settings.automationPublishLastStatus === "skipped"
          ? "muted"
          : "default";
  const statusLabel = settings.automationPublishLastStatus
    ? t(
        `settings.automationExport.status.${settings.automationPublishLastStatus}` as Parameters<
          typeof t
        >[0]
      )
    : t("settings.automationExport.status.idle");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
          {t("settings.automationExport")}
        </h3>
        <button
          type="button"
          onClick={onShowGuide}
          className="btn-press inline-flex h-8 items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:border-repressurizer-accent/50 hover:text-repressurizer-text"
          aria-label={t("settings.automationExport.guideButton")}
          title={t("settings.automationExport.guideButton")}
        >
          <Info size={14} weight="bold" />
          {t("settings.automationExport.guideButton")}
        </button>
      </div>
      <ToggleRow
        icon={<CloudArrowDown size={15} weight="duotone" />}
        label={t("settings.automationExport.enabled")}
        description={t("settings.automationExport.enabled.desc")}
        checked={settings.automationPublishEnabled}
        onChange={(value) => settings.setSettings({ automationPublishEnabled: value })}
      />
      <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
            {t("settings.automationExport.url")}
          </label>
          <input
            type="url"
            value={settings.automationPublishUrl}
            onChange={(event) =>
              settings.setSettings({ automationPublishUrl: event.target.value })
            }
            placeholder={t("settings.automationExport.url.placeholder")}
            className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text transition-colors placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
              {t("settings.automationExport.token")}
            </label>
            <input
              type="password"
              value={settings.automationPublishBearerToken}
              onChange={(event) =>
                settings.setSettings({ automationPublishBearerToken: event.target.value })
              }
              placeholder={t("settings.automationExport.token.placeholder")}
              className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text transition-colors placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-repressurizer-text-muted">
              {t("settings.automationExport.interval")}
            </label>
            <input
              type="number"
              min={1}
              max={720}
              value={settings.automationPublishIntervalHours}
              onChange={(event) =>
                settings.setSettings({
                  automationPublishIntervalHours: Number(event.target.value) || 24,
                })
              }
              className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
            />
          </div>
        </div>
        <AutomationPayloadSettings />
        <div className="flex flex-col gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-repressurizer-text-muted">
              {settings.automationPublishLastPublishedAt
                ? t("settings.automationExport.lastPublished", {
                    date: new Date(
                      settings.automationPublishLastPublishedAt
                    ).toLocaleString(),
                  })
                : t("settings.automationExport.never")}
            </p>
            <p className="mt-0.5 break-words text-[11px] leading-relaxed text-repressurizer-text-faint">
              {t("settings.automationExport.lastResult")}:{" "}
              <span
                className={
                  statusTone === "success"
                    ? "text-repressurizer-success"
                    : statusTone === "danger"
                      ? "text-repressurizer-danger"
                      : "text-repressurizer-text-muted"
                }
              >
                {statusLabel}
              </span>
              {settings.automationPublishLastAttemptedAt
                ? ` · ${new Date(
                    settings.automationPublishLastAttemptedAt
                  ).toLocaleString()}`
                : ""}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onShowLogs}
              className="btn-press flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text sm:flex-none"
            >
              {t("settings.automationExport.viewLogs")}
            </button>
            <button
              onClick={onPublish}
              disabled={publishing || !settings.automationPublishUrl.trim() || gameCount === 0}
              className="btn-press flex-1 rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40 sm:flex-none"
            >
              {publishing
                ? t("settings.automationExport.publishing")
                : t("settings.automationExport.publishNow")}
            </button>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-repressurizer-text-faint">
          {t("settings.automationExport.desc")}
        </p>
      </div>
    </div>
  );
}
