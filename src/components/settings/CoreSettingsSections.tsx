import { Eye, Heart, Trophy } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { SelectMenu } from "../ui/SelectMenu";
import { ToggleRow } from "./SettingsControls";

interface CoreSettingsSectionsProps {
  gameCount: number;
  section: "overview" | "steamtools" | "display" | "currency";
}

export function CoreSettingsSection({
  gameCount,
  section,
}: CoreSettingsSectionsProps) {
  const settings = useSettingsStore();
  const t = useT();
  const categoryCount = useCategoryStore((state) => state.collections.length);
  const dynamicCount = useCategoryStore(
    (state) => state.collections.filter((collection) => collection.is_dynamic).length
  );

  return (
    <>
      {section === "overview" && (
        <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("settings.steamPath")}
              </span>
              <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">
                {settings.steamPath}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("settings.user")}
              </span>
              <p className="mt-1 truncate font-mono text-xs text-repressurizer-text-muted">
                {settings.steamPersonaName
                  ? `${settings.steamPersonaName} (${settings.steamId3})`
                  : settings.steamId3}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("settings.steamId64")}
              </span>
              <p className="mt-1 font-mono text-xs text-repressurizer-text-muted">
                {settings.steamId64}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
                {t("settings.library")}
              </span>
              <p className="mt-1 text-xs text-repressurizer-text-muted">
                {t("statusbar.games", { count: gameCount })},{" "}
                {t("statusbar.categories", { count: categoryCount })} (
                <span className="font-mono tabular-nums">{dynamicCount}</span> dynamic)
              </p>
            </div>
          </div>
        </div>
      )}

      {section === "steamtools" && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
            {t("settings.steamTools")}
          </h3>
          <div className="space-y-3">
            <ToggleRow
              icon={<Trophy size={15} weight="duotone" />}
              label={t("steamTools.sam.title")}
              description={t("settings.steamTools.achievementWrites.desc")}
              checked={
                settings.steamToolsEnabled && settings.steamToolsAchievementWritesEnabled
              }
              onChange={(value) =>
                settings.setSettings({
                  steamToolsEnabled: value,
                  steamToolsAchievementWritesEnabled: value,
                })
              }
            />
          </div>
        </div>
      )}

      {section === "display" && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
            {t("settings.display")}
          </h3>
          <ToggleRow
            icon={<Eye size={15} weight="duotone" />}
            label={t("settings.showDynamic")}
            description={t("settings.showDynamic.desc")}
            checked={settings.showDynamicCategories}
            onChange={(value) => settings.setSettings({ showDynamicCategories: value })}
          />
          <ToggleRow
            icon={<Heart size={15} weight="duotone" />}
            label={t("settings.pinFavorites")}
            description={t("settings.pinFavorites.desc")}
            checked={settings.pinFavorites}
            onChange={(value) => settings.setSettings({ pinFavorites: value })}
          />
        </div>
      )}

      {section === "currency" && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
            {t("settings.currency")}
          </h3>
          <div className="space-y-2 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-repressurizer-text">
                  {t("settings.defaultCurrency")}
                </p>
                <p className="mt-0.5 text-xs text-repressurizer-text-faint">
                  {t("settings.currency.desc")}
                </p>
              </div>
              <SelectMenu
                ariaLabel={t("settings.defaultCurrency")}
                value={settings.currency ?? "EUR"}
                onChange={(currency) => settings.setSettings({ currency })}
                align="right"
                size="sm"
                className="w-[132px] shrink-0"
                buttonClassName="bg-repressurizer-surface"
                options={[
                  { value: "EUR", label: "EUR (€)" },
                  { value: "USD", label: "USD ($)" },
                  { value: "GBP", label: "GBP (£)" },
                  { value: "JPY", label: "JPY (¥)" },
                  { value: "CAD", label: "CAD (C$)" },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
