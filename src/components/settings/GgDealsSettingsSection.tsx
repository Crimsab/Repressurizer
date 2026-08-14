import { useEffect, useState } from "react";
import { Key, Tag } from "@phosphor-icons/react";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGgDealsStore } from "../../stores/ggDealsStore";
import { ToggleRow } from "./SettingsControls";

export function GgDealsSettingsSection({ onSaved }: { onSaved: (message: string) => void }) {
  const t = useT();
  const enabled = useSettingsStore((state) => state.ggDealsEnabled);
  const savedApiKey = useSettingsStore((state) => state.ggDealsApiKey);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const [apiKey, setApiKey] = useState(savedApiKey);

  useEffect(() => setApiKey(savedApiKey), [savedApiKey]);

  const saveApiKey = () => {
    const trimmed = apiKey.trim();
    setSettings({ ggDealsApiKey: trimmed });
    useGgDealsStore.getState().clear();
    onSaved(t("settings.ggDeals.saved"));
  };

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
        GG.deals
      </h3>
      <ToggleRow
        icon={<Tag size={15} weight="duotone" />}
        label={t("settings.ggDeals.enabled")}
        description={t("settings.ggDeals.enabled.desc")}
        checked={enabled}
        onChange={(ggDealsEnabled) => setSettings({ ggDealsEnabled })}
      />

      {enabled && (
        <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
          <div>
            <label className="mb-1.5 block text-xs text-repressurizer-text-muted" htmlFor="gg-deals-api-key">
              {t("settings.ggDeals.apiKey")}
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Key size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-repressurizer-text-faint" />
                <input
                  id="gg-deals-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface pl-9 pr-3 text-sm text-repressurizer-text transition-colors focus:border-repressurizer-accent focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={saveApiKey}
                className="btn-press h-10 shrink-0 rounded-lg bg-repressurizer-accent px-4 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
              >
                {t("settings.apiKey.save")}
              </button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-repressurizer-text-faint">
            {t("settings.ggDeals.terms")}
          </p>
          <button
            type="button"
            onClick={() => void openPath("https://gg.deals/api/")}
            className="text-xs font-medium text-repressurizer-accent transition-colors hover:text-repressurizer-accent-hover"
          >
            {t("settings.ggDeals.getKey")}
          </button>
        </div>
      )}
    </div>
  );
}
