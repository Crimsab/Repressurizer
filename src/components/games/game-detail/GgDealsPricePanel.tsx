import { useEffect } from "react";
import { ArrowSquareOut, ArrowsClockwise, Tag } from "@phosphor-icons/react";
import { open as openPath } from "@tauri-apps/plugin-shell";
import {
  bestCurrentGgDealsPrice,
  formatGgDealsPrice,
  ggDealsRegionForCurrency,
  safeGgDealsUrl,
} from "../../../lib/ggDeals";
import { useT } from "../../../lib/i18n";
import { useGgDealsStore } from "../../../stores/ggDealsStore";
import { useSettingsStore } from "../../../stores/settingsStore";

export function GgDealsPricePanel({ appId }: { appId: number }) {
  const t = useT();
  const enabled = useSettingsStore((state) => state.ggDealsEnabled);
  const apiKey = useSettingsStore((state) => state.ggDealsApiKey);
  const currency = useSettingsStore((state) => state.currency);
  const record = useGgDealsStore((state) => state.records[appId]);
  const loading = useGgDealsStore((state) => state.loading[appId] ?? false);
  const error = useGgDealsStore((state) => state.errors[appId] ?? "");
  const fetchPrice = useGgDealsStore((state) => state.fetchPrice);
  const region = ggDealsRegionForCurrency(currency);

  useEffect(() => {
    if (!enabled || !apiKey.trim()) return;
    void fetchPrice(appId, apiKey, region);
  }, [apiKey, appId, enabled, fetchPrice, region]);

  if (!enabled) return null;
  const data = record?.data ?? null;
  const best = data ? bestCurrentGgDealsPrice(data) : null;
  const offersUrl = safeGgDealsUrl(data?.url);

  return (
    <section className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3" aria-label={t("detail.ggDeals.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag size={15} weight="duotone" className="text-repressurizer-accent" />
          <h3 className="text-sm font-medium text-repressurizer-text">{t("detail.ggDeals.title")}</h3>
          <span className="text-[10px] text-repressurizer-text-faint">{t("detail.ggDeals.attribution")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void fetchPrice(appId, apiKey, region, true)}
            disabled={loading || !apiKey.trim()}
            className="btn-press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white disabled:opacity-40"
          >
            <ArrowsClockwise size={11} className={loading ? "animate-spin" : ""} />
            {t("settings.refresh")}
          </button>
          {offersUrl && (
            <button
              type="button"
              onClick={() => void openPath(offersUrl)}
              className="btn-press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-repressurizer-accent transition-colors hover:bg-repressurizer-accent/10"
            >
              <ArrowSquareOut size={11} />
              {t("detail.ggDeals.offers")}
            </button>
          )}
        </div>
      </div>

      {!apiKey.trim() ? (
        <p className="mt-2 text-xs text-repressurizer-text-faint">{t("detail.ggDeals.keyRequired")}</p>
      ) : loading && !record ? (
        <p className="mt-2 text-xs text-repressurizer-text-faint">{t("detail.ggDeals.loading")}</p>
      ) : data && best ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <PriceMetric
            label={t("detail.ggDeals.best")}
            value={formatGgDealsPrice(best.price, data.currency)}
            note={best.source === "retail" ? t("detail.ggDeals.retail") : t("detail.ggDeals.keyshop")}
            accent
          />
          <PriceMetric
            label={t("detail.ggDeals.retailLow")}
            value={data.historicalRetail == null ? "—" : formatGgDealsPrice(data.historicalRetail, data.currency)}
            note={data.currentRetail == null ? "" : t("detail.ggDeals.now", { price: formatGgDealsPrice(data.currentRetail, data.currency) })}
          />
          <PriceMetric
            label={t("detail.ggDeals.keyshopLow")}
            value={data.historicalKeyshops == null ? "—" : formatGgDealsPrice(data.historicalKeyshops, data.currency)}
            note={data.currentKeyshops == null ? "" : t("detail.ggDeals.now", { price: formatGgDealsPrice(data.currentKeyshops, data.currency) })}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-repressurizer-text-faint">
          {error || t("detail.ggDeals.unavailable")}
        </p>
      )}

      {error && data && <p className="mt-2 text-[11px] text-amber-400">{error}</p>}
      {record && (
        <p className="mt-2 text-[10px] text-repressurizer-text-faint">
          {t("detail.ggDeals.cachedAt", { date: new Date(record.fetchedAt).toLocaleString() })}
        </p>
      )}
    </section>
  );
}

function PriceMetric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${accent ? "text-repressurizer-accent" : "text-repressurizer-text"}`}>
        {value}
      </p>
      {note && <p className="mt-0.5 truncate text-[10px] text-repressurizer-text-faint">{note}</p>}
    </div>
  );
}
