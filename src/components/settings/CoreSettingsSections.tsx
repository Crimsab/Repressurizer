import { useMemo } from "react";
import { STORE_REGIONS } from "../../lib/steamRegions";
import { Eye, Heart } from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import { useCategoryStore } from "../../stores/categoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { CountryFlag } from "../ui/CountryFlag";
import { SelectMenu } from "../ui/SelectMenu";
import { ToggleRow } from "./SettingsControls";

interface CoreSettingsSectionsProps {
  gameCount: number;
  section: "overview" | "display" | "currency";
}

export function CoreSettingsSection({
  gameCount,
  section,
}: CoreSettingsSectionsProps) {
  const settings = useSettingsStore();
  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames([settings.language || "en"], { type: "region" });
    return STORE_REGIONS.map((region) => ({
      value: region.countryCode,
      icon: <CountryFlag countryCode={region.countryCode} />,
      label: `${names.of(region.countryCode) ?? region.name} · ${region.currency}`,
      description: region.group?.startsWith("usd_") ? region.group.replace("usd_", "USD · ").toUpperCase() : undefined,
    }))
      .sort((a, b) => a.label.localeCompare(b.label, settings.language));
  }, [settings.language]);
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
            {t("settings.storeCountry")}
          </h3>
          <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-4">
            <p className="max-w-xl text-xs leading-relaxed text-repressurizer-text-muted">
              {t("settings.storeCountry.desc")}
            </p>
            <div className="mt-3">
              <SelectMenu
                ariaLabel={t("settings.storeCountry")}
                value={settings.storeCountryCode}
                onChange={(storeCountryCode) => settings.setSettings({ storeCountryCode })}
                align="right"
                size="sm"
                className="min-w-0"
                buttonClassName="bg-repressurizer-surface"
                searchLabel={t("settings.storeCountry.search")}
                emptyLabel={t("common.noResults")}
                options={countryOptions}
              />
            </div>
            <p className="mt-3 text-xs font-medium text-repressurizer-text">
              {t("settings.storeCurrency", { currency: settings.currency })}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
