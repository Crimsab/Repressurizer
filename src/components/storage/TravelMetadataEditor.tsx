import { useMemo, useState } from "react";
import { useT } from "../../lib/i18n";
import type { OwnedGame } from "../../lib/types";
import { useTravelMetadataStore } from "../../stores/travelMetadataStore";
import { SelectMenu } from "../ui/SelectMenu";

const GB = 1_073_741_824;

export function TravelMetadataEditor({ games }: { games: OwnedGame[] }) {
  const t = useT();
  const store = useTravelMetadataStore();
  const [query, setQuery] = useState("");
  const [appId, setAppId] = useState("");
  const [changed, setChanged] = useState(false);
  const choices = useMemo(() => games
    .filter((game) => game.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) || String(game.appid) === appId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((game) => ({ value: String(game.appid), label: game.name })), [games, query, appId]);
  const record = store.records[Number(appId)];
  const fields = [
    ["offline", "deck.travelOffline"],
    ["firstLaunchOnline", "deck.travelFirstLaunch"],
    ["externalLauncher", "deck.travelLauncher"],
  ] as const;

  return (
    <details className="mt-5 rounded-lg border border-repressurizer-border-subtle p-3">
      <summary className="cursor-pointer text-xs font-medium text-repressurizer-text">{t("deck.travelDetails")}</summary>
      <p className="mt-2 text-[11px] leading-relaxed text-repressurizer-text-faint">{t("deck.travelDetails.desc")}</p>
      <input
        aria-label={t("common.search")}
        placeholder={t("common.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-3 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text"
      />
      <SelectMenu
        ariaLabel={t("deck.travelGame")}
        value={appId}
        options={choices}
        placeholder={t("deck.travelGame")}
        onChange={(value) => { setAppId(value); setChanged(false); }}
        className="mt-2 w-full"
        size="sm"
      />
      {store.error && <p role="alert" className="mt-2 text-[11px] text-amber-300">{store.error}</p>}
      {appId && (
        <fieldset disabled={!store.hydrated} className="mt-3 space-y-3 disabled:opacity-50">
          {fields.map(([field, label]) => (
            <SelectMenu
              key={field}
              label={t(label)}
              value={record?.[field] == null ? "unknown" : record[field] ? "yes" : "no"}
              options={[
                { value: "unknown", label: t("common.unknown") },
                { value: "yes", label: t("deck.travelYes") },
                { value: "no", label: t("deck.travelNo") },
              ]}
              disabled={!store.hydrated}
              onChange={(value) => { store.setMetadata(Number(appId), { [field]: value === "unknown" ? null : value === "yes" }); setChanged(true); }}
              size="sm"
            />
          ))}
          <label className="block text-[11px] text-repressurizer-text-muted">
            {t("deck.travelSize")}
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={record?.sizeBytes == null ? "" : Number((record.sizeBytes / GB).toFixed(2))}
              placeholder={t("common.unknown")}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                store.setMetadata(Number(appId), { sizeBytes: Number.isFinite(value) && value > 0 ? Math.round(value * GB) : null });
                setChanged(true);
              }}
              className="mt-1 w-full rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-2 text-xs text-repressurizer-text"
            />
          </label>
          <button type="button" className="text-[11px] text-repressurizer-text-muted underline underline-offset-2" onClick={() => { store.clearMetadata(Number(appId)); setChanged(true); }}>
            {t("deck.travelReset")}
          </button>
          {changed && !store.error && !store.saving && <p role="status" className="text-[11px] text-repressurizer-text-faint">{t("deck.travelSaved")}</p>}
        </fieldset>
      )}
    </details>
  );
}
