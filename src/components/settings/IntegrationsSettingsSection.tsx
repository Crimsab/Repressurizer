import { useEffect, useState, type ReactNode } from "react";
import { CaretRight, Tag, Trophy } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { ToggleRow } from "./SettingsControls";
import { GgDealsSettingsSection } from "./GgDealsSettingsSection";

type IntegrationId = "sam" | "ggdeals";

export function IntegrationsSettingsSection({
  showSam,
  showGgDeals,
  onSaved,
}: {
  showSam: boolean;
  showGgDeals: boolean;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const settings = useSettingsStore();
  const onlyVisible = showSam === showGgDeals ? null : showSam ? "sam" : "ggdeals";
  const [openIntegration, setOpenIntegration] = useState<IntegrationId | null>(
    onlyVisible ?? "sam"
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
  open,
  onToggle,
  children,
}: {
  id: IntegrationId;
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
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
        <span className="shrink-0 rounded-full border border-repressurizer-border bg-repressurizer-surface px-2 py-0.5 text-[10px] font-medium text-repressurizer-text-muted">
          {status}
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
