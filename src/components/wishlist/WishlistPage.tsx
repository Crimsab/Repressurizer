import { useState, useMemo, useEffect, useRef } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useWishlistStore } from "../../stores/wishlistStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { fetchWishlist, fetchGameDetails } from "../../lib/tauri";
import { X, BookmarkSimple, ArrowsClockwise, SortAscending, Export, Bell, BellSlash } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { useT } from "../../lib/i18n";
import { priceSnapshotForCurrency, detailsPriceNeedsCurrencyRefresh } from "../../lib/prices";
import { scheduleOriginalReleaseDateFetch } from "../../lib/releaseDateQueue";
import type { GameDetails } from "../../lib/types";
import { DialogOverlay } from "../ui/DialogOverlay";
import { SelectMenu } from "../ui/SelectMenu";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

interface WishlistPageProps {
  onClose: () => void;
}

type SortMode = "priority" | "date" | "name" | "price" | "discount";

function timeAgo(unixSecs: number, t: ReturnType<typeof useT>): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 86400) return t("time.today");
  const days = Math.floor(diff / 86400);
  if (days < 30) return t("time.daysAgo", { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t("time.monthsAgo", { count: months });
  return t("time.yearsAgo", { count: Math.floor(months / 12) });
}

export function WishlistPage({ onClose }: WishlistPageProps) {
  const t = useT();
  const { steamId64, currency, storeCountryCode, saleNotifyEnabled, saleNotifyThreshold, saleAlertRules, setSettings } = useSettingsStore();
  const [rulePopover, setRulePopover] = useState<{ appId: number; x: number; y: number } | null>(null);
  const details = useGameStore((s) => s.details);
  const items = useWishlistStore((s) => s.items);
  const lastFetched = useWishlistStore((s) => s.lastFetched);
  const setItems = useWishlistStore((s) => s.setItems);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("priority");
  const [search, setSearch] = useState("");
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const fetchingRef = useRef(new Set<string>());

  // Fetch details for wishlist items not in cache
  useEffect(() => {
    if (items.length === 0) return;
    const missing = items
      .map((i) => i.appid)
      .filter((id) => (!details[id] || detailsPriceNeedsCurrencyRefresh(details[id], currency, storeCountryCode)) && !fetchingRef.current.has(`${id}:${storeCountryCode}`));
    if (missing.length === 0) return;

    const setDetails = useGameStore.getState().setDetails;
    for (const appid of missing) {
      const requestKey = `${appid}:${storeCountryCode}`;
      fetchingRef.current.add(requestKey);
      fetchGameDetails(appid, storeCountryCode)
        .then((d) => {
          setDetails(appid, d);
          scheduleOriginalReleaseDateFetch(appid, d.name);
        })
        .catch(() => {});
    }
  }, [items, details, currency, storeCountryCode]);

  const handleExportJson = () => {
    const rows = sortedItems.map((item, idx) => ({
      rank: idx + 1,
      appid: item.appid,
      name: details[item.appid]?.name ?? `App ${item.appid}`,
      priority: item.priority,
      date_added: item.date_added,
      genres: details[item.appid]?.genres ?? [],
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wishlist.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = "Rank,AppID,Name,Priority,Date Added,Genres";
    const rows = sortedItems.map((item, idx) => {
      const name = (details[item.appid]?.name ?? `App ${item.appid}`).replace(/"/g, '""');
      const genres = (details[item.appid]?.genres ?? []).join("; ").replace(/"/g, '""');
      const date = item.date_added ? new Date(item.date_added * 1000).toISOString().slice(0, 10) : "";
      return `${idx + 1},${item.appid},"${name}",${item.priority},"${date}","${genres}"`;
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wishlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = async () => {
    fetchingRef.current.clear();
    if (!steamId64) {
      setError(t("wishlist.setSteamId"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchWishlist(steamId64);
      setItems(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((item) => {
        const d = details[item.appid];
        const name = d?.name ?? String(item.appid);
        return name.toLowerCase().includes(q);
      });
    }
    if (onSaleOnly) {
      list = list.filter((item) => {
        const price = priceSnapshotForCurrency(details[item.appid], currency, storeCountryCode);
        return price?.price_initial != null && price.price_final != null && price.price_initial > price.price_final;
      });
    }
    list.sort((a, b) => {
      if (sortBy === "priority") return a.priority - b.priority;
      if (sortBy === "date") return b.date_added - a.date_added;
      if (sortBy === "price") {
        const pa = priceSnapshotForCurrency(details[a.appid], currency, storeCountryCode)?.price_final ?? Number.POSITIVE_INFINITY;
        const pb = priceSnapshotForCurrency(details[b.appid], currency, storeCountryCode)?.price_final ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      }
      if (sortBy === "discount") {
        const discount = (appid: number) => {
          const price = priceSnapshotForCurrency(details[appid], currency, storeCountryCode);
          if (!price?.price_initial || price.price_final == null || price.price_initial <= price.price_final) return 0;
          return (price.price_initial - price.price_final) / price.price_initial;
        };
        return discount(b.appid) - discount(a.appid);
      }
      if (sortBy === "name") {
        const na = details[a.appid]?.name ?? String(a.appid);
        const nb = details[b.appid]?.name ?? String(b.appid);
        return na.localeCompare(nb);
      }
      return 0;
    });
    return list;
  }, [items, sortBy, search, details, onSaleOnly, currency, storeCountryCode]);

  return (
    <DialogOverlay
      label={t("wishlist.title")}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 pb-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <ResizableDialogPanel
        dialogId="wishlist"
        defaultSize={{ width: 860, height: 680 }}
        minSize={{ width: 560, height: 420 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-fade-in"
      >
        {({ sizeControls }) => (
        <>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <BookmarkSimple size={18} className="text-repressurizer-accent" weight="fill" />
            <h2 className="text-base font-semibold text-white">{t("wishlist.title")}</h2>
            {items.length > 0 && (
              <span className="rounded-full bg-repressurizer-bg px-2 py-0.5 text-[11px] font-mono text-repressurizer-text-faint">
                {t("statusbar.games", { count: items.length })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastFetched && (
              <span className="text-[10px] text-repressurizer-text-faint">
                {t("wishlist.updated", { time: timeAgo(Math.floor(lastFetched / 1000), t) })}
              </span>
            )}
            {items.length > 0 && (
              <>
                <button
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-white"
                >
                  <Export size={12} />
                  JSON
                </button>
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-white"
                >
                  <Export size={12} />
                  CSV
                </button>
              </>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-2.5 py-1 text-[11px] font-medium text-repressurizer-text-muted transition-colors hover:text-white disabled:opacity-40"
            >
              <ArrowsClockwise size={12} className={loading ? "animate-spin" : ""} />
              {t("wishlist.refresh")}
            </button>
            <div className="flex items-center gap-1">
              {sizeControls}
              <button
                onClick={onClose}
                aria-label={t("common.close")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        {items.length > 0 && (
          <div className="flex items-center gap-1.5 border-b border-repressurizer-border-subtle px-4 py-2">
            <input
              type="text"
              placeholder={t("wishlist.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[180px] flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1.5 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
            <div className="flex shrink-0 items-center gap-1 text-repressurizer-text-faint">
              <SortAscending size={13} />
            </div>
            {(["priority", "date", "name", "price", "discount"] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium capitalize leading-none transition-colors ${
                  sortBy === s
                    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
                }`}
              >
                {s === "priority" ? t("wishlist.sort.priority") :
                 s === "date" ? t("wishlist.sort.added") :
                 s === "price" ? t("wishlist.sort.price") :
                 s === "discount" ? t("wishlist.sort.discount") :
                 t("wishlist.sort.name")}
              </button>
            ))}
            <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-medium leading-none transition-colors ${
              onSaleOnly
                ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
            }`}>
              <input
                type="checkbox"
                checked={onSaleOnly}
                onChange={(e) => setOnSaleOnly(e.target.checked)}
                className="h-3 w-3 accent-[var(--color-repressurizer-accent)]"
              />
              {t("wishlist.onSale")}
            </label>
            <label className={`flex items-center gap-1.5 text-[11px] ${saleNotifyEnabled ? "text-repressurizer-text" : "text-repressurizer-text-faint"}`}>
              <input
                type="checkbox"
                data-testid="wishlist-notify-toggle"
                checked={saleNotifyEnabled}
                onChange={(e) => setSettings({ saleNotifyEnabled: e.target.checked })}
                className="h-3 w-3 accent-[var(--color-repressurizer-accent)]"
              />
              {t("wishlist.notify.enable")}
            </label>
            {saleNotifyEnabled && (
              <select
                data-testid="wishlist-notify-threshold"
                value={saleNotifyThreshold}
                onChange={(e) => setSettings({ saleNotifyThreshold: Number(e.target.value) })}
                aria-label={t("wishlist.notify.threshold")}
                className="rounded-md border border-repressurizer-border-subtle bg-repressurizer-bg px-1.5 py-0.5 text-[11px] text-repressurizer-text outline-none"
              >
                {[30, 40, 50, 60, 70, 80].map((value) => (
                  <option key={value} value={value}>-{value}%</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="m-4 rounded-xl border border-repressurizer-warning/20 bg-repressurizer-warning/5 p-4">
              <p className="mb-1 text-sm font-medium text-repressurizer-warning">{t("wishlist.unavailable")}</p>
              <p className="text-xs text-repressurizer-text-muted leading-relaxed">{error}</p>
              <a
                href={`https://store.steampowered.com/wishlist/profiles/${steamId64}/`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-repressurizer-accent hover:underline"
              >
                {t("wishlist.viewSteam")}
              </a>
            </div>
          )}
          {!loading && items.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-repressurizer-text-faint">
              <BookmarkSimple size={40} weight="duotone" className="opacity-30" />
              <p className="text-sm">{t("wishlist.empty")}</p>
            </div>
          )}
          {sortedItems.length > 0 && (
            <div className="divide-y divide-repressurizer-border-subtle">
              {sortedItems.map((item, idx) => {
                const d = details[item.appid];
                const name = d?.name ?? `App ${item.appid}`;
                return (
                  <div
                    key={item.appid}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    {/* Priority badge */}
                    <span className="w-6 shrink-0 text-center font-mono text-[11px] text-repressurizer-text-faint tabular-nums">
                      {idx + 1}
                    </span>

                    {/* Banner */}
                    <div className="h-8 w-14 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg">
                      <SteamImage
                        appId={item.appid}
                        alt=""
                        kind="header"
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {/* Name */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{name}</p>
                      {d?.genres && d.genres.length > 0 && (
                        <p className="truncate text-[11px] text-repressurizer-text-faint">{d.genres.slice(0, 3).join(", ")}</p>
                      )}
                    </div>

                    {/* Added date */}
                    {d && <WishlistPrice details={d} currency={currency} storeCountryCode={storeCountryCode} />}
                    {saleNotifyEnabled && (
                      <button
                        type="button"
                        data-testid={`wishlist-notify-rule-${item.appid}`}
                        aria-label={`${t("wishlist.notify.rule")}: ${name}`}
                        title={t("wishlist.notify.rule")}
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setRulePopover({ appId: item.appid, x: Math.min(rect.left, window.innerWidth - 260), y: Math.min(rect.bottom + 6, window.innerHeight - 190) });
                        }}
                        className={`focus-ring shrink-0 rounded-md p-1 transition-colors hover:bg-repressurizer-surface-hover ${saleAlertRules[item.appid]?.mode === "off" ? "text-repressurizer-text-faint" : saleAlertRules[item.appid] ? "text-repressurizer-accent" : "text-repressurizer-text-muted"}`}
                      >
                        {saleAlertRules[item.appid]?.mode === "off" ? <BellSlash size={13} /> : <Bell size={13} />}
                      </button>
                    )}
                    {item.date_added > 0 && (
                      <span className="shrink-0 text-[11px] text-repressurizer-text-faint">
                        {timeAgo(item.date_added, t)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
        )}
      </ResizableDialogPanel>
      {rulePopover && (
        <SaleRulePopover
          appId={rulePopover.appId}
          x={rulePopover.x}
          y={rulePopover.y}
          onClose={() => setRulePopover(null)}
        />
      )}
    </DialogOverlay>
  );
}

function SaleRulePopover({ appId, x, y, onClose }: { appId: number; x: number; y: number; onClose: () => void }) {
  const t = useT();
  const { saleAlertRules, setSettings } = useSettingsStore();
  const rule = saleAlertRules[appId];
  const mode = rule?.mode ?? "default";
  const value = rule?.value ?? 0;
  const setRule = (next: { mode: "off" | "percent" | "price"; value: number } | null) => {
    const rules = { ...saleAlertRules };
    if (next) rules[appId] = next;
    else delete rules[appId];
    setSettings({ saleAlertRules: rules });
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-sale-rule-popover]") && !target.closest('[role="listbox"]') && !target.closest('[role="option"]')) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      data-sale-rule-popover
      data-testid="wishlist-rule-popover"
      className="animate-fade-in fixed z-[70] w-60 rounded-xl border border-repressurizer-border bg-repressurizer-surface-raised/95 p-3 shadow-dialog backdrop-blur-md"
      style={{ left: x, top: y }}
    >
      <div className="min-w-0 flex-1">
        <SelectMenu<"default" | "off" | "percent" | "price">
          value={mode}
          options={[
            { value: "default", label: t("wishlist.notify.rule.default") },
            { value: "off", label: t("wishlist.notify.rule.off") },
            { value: "percent", label: t("wishlist.notify.rule.percent") },
            { value: "price", label: t("wishlist.notify.rule.price") },
          ]}
          onChange={(next) => {
            if (next === "default") setRule(null);
            else setRule({ mode: next, value: value || (next === "percent" ? 50 : 10) });
          }}
          ariaLabel={t("wishlist.notify.rule")}
          size="sm"
          buttonClassName="border-repressurizer-border-subtle bg-repressurizer-bg text-[11px]"
        />
      </div>
      {(mode === "percent" || mode === "price") && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-repressurizer-text-muted">
          <span className="shrink-0">{mode === "percent" ? t("wishlist.notify.rule.percent") : t("wishlist.notify.rule.price")}</span>
          <input
            type="number"
            min={0}
            max={mode === "percent" ? 90 : 1000}
            value={value}
            data-testid="wishlist-rule-value"
            onChange={(event) => setRule({ mode, value: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
            className="w-20 rounded-md border border-repressurizer-border bg-repressurizer-bg px-2 py-1 text-[11px] text-repressurizer-text outline-none"
          />
          {mode === "percent" ? "%" : ""}
        </label>
      )}
    </div>
  );
}

function WishlistPrice({ details, currency, storeCountryCode }: { details: GameDetails; currency: string; storeCountryCode: string }) {
  const t = useT();
  const price = priceSnapshotForCurrency(details, currency, storeCountryCode);
  if (!price) return null;
  if (price.is_free) {
    return <span className="shrink-0 text-[11px] font-mono text-repressurizer-text-muted">{t("detail.freeToPlay")}</span>;
  }
  const final = price.price_final ?? price.price_initial;
  if (final == null) return null;
  const initial = price.price_initial;
  const discounted = initial != null && initial > final;
  const discountPercent = discounted ? Math.round(((initial - final) / initial) * 100) : 0;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {discounted && (
        <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
          -{discountPercent}%
        </span>
      )}
      <span className="font-mono text-[11px] tabular-nums text-repressurizer-text-muted">
        {`${(final / 100).toFixed(2)} ${price.price_currency ?? ""}`.trim()}
      </span>
    </div>
  );
}
