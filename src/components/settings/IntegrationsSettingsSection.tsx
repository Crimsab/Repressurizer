import { useEffect, useState, type ReactNode } from "react";
import { CaretRight, CheckCircle, MinusCircle, Robot, Tag, Trophy } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { ToggleRow } from "./SettingsControls";
import { GgDealsSettingsSection } from "./GgDealsSettingsSection";
import { McpSettingsSection } from "./McpSettingsSection";

type IntegrationId = "sam" | "ggdeals" | "mcp";

export function IntegrationsSettingsSection({
  showSam,
  showGgDeals,
  showMcp,
  onSaved,
}: {
  showSam: boolean;
  showGgDeals: boolean;
  showMcp: boolean;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const settings = useSettingsStore();
  const visibleIntegrations: IntegrationId[] = [
    ...(showSam ? ["sam" as const] : []),
    ...(showGgDeals ? ["ggdeals" as const] : []),
    ...(showMcp ? ["mcp" as const] : []),
  ];
  const onlyVisible = visibleIntegrations.length === 1 ? visibleIntegrations[0] : null;
  const [openIntegration, setOpenIntegration] = useState<IntegrationId | null>(
    onlyVisible ?? visibleIntegrations[0] ?? null
  );

  useEffect(() => {
    if (onlyVisible) setOpenIntegration(onlyVisible);
  }, [onlyVisible]);

  const samEnabled =
    settings.steamToolsEnabled && settings.steamToolsAchievementWritesEnabled;

  return (
    <section className="space-y-3" aria-labelledby="integrations-heading">
      <div>
        <h3
          id="integrations-heading"
          className="text-sm font-semibold text-repressurizer-text"
        >
          {t("settings.integrations")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
          {t("settings.integrations.desc")}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg">
        {showSam && (
          <IntegrationAccordion
            id="sam"
            icon={<Trophy size={17} weight="duotone" />}
            title={t("settings.integration.sam")}
            description={t("steamTools.sam.desc")}
            status={samEnabled ? t("settings.integration.enabled") : t("settings.integration.disabled")}
            enabled={samEnabled}
            open={openIntegration === "sam"}
            onToggle={() =>
              setOpenIntegration((current) => (current === "sam" ? null : "sam"))
            }
          >
            <ToggleRow
              icon={<Trophy size={15} weight="duotone" />}
              label={t("settings.steamTools.achievementWrites")}
              description={t("settings.steamTools.achievementWrites.desc")}
              checked={samEnabled}
              onChange={(value) =>
                settings.setSettings({
                  steamToolsEnabled: value,
                  steamToolsAchievementWritesEnabled: value,
                })
              }
            />
            <p className="mt-3 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.integrations.sam.note")}
            </p>
          </IntegrationAccordion>
        )}

        {showGgDeals && (
          <IntegrationAccordion
            id="ggdeals"
            icon={<Tag size={17} weight="duotone" />}
            title={t("settings.integration.ggDeals")}
            description={t("settings.ggDeals.enabled.desc")}
            status={
              settings.ggDealsEnabled
                ? t("settings.integration.enabled")
                : t("settings.integration.disabled")
            }
            enabled={settings.ggDealsEnabled}
            open={openIntegration === "ggdeals"}
            onToggle={() =>
              setOpenIntegration((current) =>
                current === "ggdeals" ? null : "ggdeals"
              )
            }
          >
            <GgDealsSettingsSection onSaved={onSaved} showHeading={false} />
          </IntegrationAccordion>
        )}

        {showMcp && (
          <IntegrationAccordion
            id="mcp"
            icon={<Robot size={17} weight="duotone" />}
            title={t("settings.integration.mcp")}
            description={t("settings.mcp.desc")}
            status={
              settings.mcpEnabled || settings.apiEnabled
                ? t("settings.integration.enabled")
                : t("settings.integration.disabled")
            }
            enabled={settings.mcpEnabled || settings.apiEnabled}
            open={openIntegration === "mcp"}
            onToggle={() =>
              setOpenIntegration((current) => (current === "mcp" ? null : "mcp"))
            }
          >
            <McpSettingsSection />
          </IntegrationAccordion>
        )}
      </div>
    </section>
  );
}

function IntegrationAccordion({
  id,
  icon,
  title,
  description,
  status,
  enabled,
  open,
  onToggle,
  children,
}: {
  id: IntegrationId;
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  enabled: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = `integration-${id}-content`;
  return (
    <div className="border-b border-repressurizer-border-subtle last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-repressurizer-surface/45"
      >
        <CaretRight
          size={14}
          weight="bold"
          className={`shrink-0 text-repressurizer-text-faint transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-repressurizer-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-repressurizer-text">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
            {description}
          </span>
        </span>
        <span
          aria-label={`${title}: ${status}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            enabled
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-repressurizer-border bg-repressurizer-surface/80 text-repressurizer-text-muted"
          }`}
        >
          {enabled ? (
            <CheckCircle size={13} weight="fill" aria-hidden="true" />
          ) : (
            <MinusCircle size={13} weight="fill" aria-hidden="true" />
          )}
          <span>{status}</span>
        </span>
      </button>
      {open && (
        <div
          id={contentId}
          className="border-t border-repressurizer-border-subtle bg-repressurizer-surface/25 px-4 py-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
