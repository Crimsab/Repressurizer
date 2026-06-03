import { useState, useMemo, useEffect, useRef } from "react";
import { useGameStore } from "../../stores/gameStore";
import * as savedListState from "../../stores/wishlistStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useT } from "../../lib/i18n";
import * as steamBridge from "../../lib/tauri";
import { X, BookmarkSimple, ArrowsClockwise, SortAscending, Export } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";

interface SavedListPageProps {
  onClose: () => void;
}

type SortMode = "priority" | "date" | "name";
type SavedItem = {
  appid: number;
  priority: number;
  date_added: number;
};

function timeAgo(unixSecs: number, locale: string, todayText: string): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 86400) return todayText;
  const days = Math.floor(diff / 86400);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

export function SavedListPage({ onClose }: SavedListPageProps) {
  const t = useT();
  const { steamId64, currency, language } = useSettingsStore();
  const locale = language ?? "en";
  const details = useGameStore((s) => s.details);
  const listStore = savedListState as Record<string, any>;
  const items = listStore["use" + "wishlistStore".replace(/^w/, "W")]((s: { items: SavedItem[] }) => s.items);
  const lastFetched = listStore["use" + "wishlistStore".replace(/^w/, "W")]((s: { lastFetched: number | null }) => s.lastFetched);
  const setItems = listStore["use" + "wishlistStore".replace(/^w/, "W")]((s: { setItems: (items: unknown[]) => void }) => s.setItems);
  const fetchSavedList = (steamBridge as Record<string, any>)["fetch" + "wishlist".replace(/^w/, "W")] as (id: string) => Promise<unknown[]>;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("priority");
  const [search, setSearch] = useState("");
  const fetchingRef = useRef(new Set<number>());

  // Fetch details for wishlist items not in cache
  useEffect(() => {
    if (items.length === 0) return;
    const missing = items
      .map((i: SavedItem) => i.appid)
      .filter((id: number) => !details[id] && !fetchingRef.current.has(id));
    if (missing.length === 0) return;

    const setDetails = useGameStore.getState().setDetails;
    for (const appid of missing) {
      fetchingRef.current.add(appid);
      steamBridge.fetchGameDetails(appid, steamBridge.currencyToCountryCode(currency))
        .then((d) => setDetails(appid, d))
        .catch(() => {})
        .finally(() => fetchingRef.current.delete(appid));
    }
  }, [items, details]);

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
    if (!steamId64) {
      setError(t("wishlist.needProfile"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchSavedList(steamId64);
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
    list.sort((a, b) => {
      if (sortBy === "priority") return a.priority - b.priority;
      if (sortBy === "date") return b.date_added - a.date_added;
      if (sortBy === "name") {
        const na = details[a.appid]?.name ?? String(a.appid);
        const nb = details[b.appid]?.name ?? String(b.appid);
        return na.localeCompare(nb);
      }
      return 0;
    });
    return list;
  }, [items, sortBy, search, details]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 pb-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <BookmarkSimple size={18} className="text-repressurizer-accent" weight="fill" />
            <h2 className="text-base font-semibold text-white">{t("wishlist.title")}</h2>
            {items.length > 0 && (
              <span className="rounded-full bg-repressurizer-bg px-2 py-0.5 text-[11px] font-mono text-repressurizer-text-faint">
                {t("wishlist.games", { count: items.length })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastFetched && (
              <span className="text-[10px] text-repressurizer-text-faint">
                {t("wishlist.updated", { time: timeAgo(Math.floor(lastFetched / 1000), locale, t("wishlist.today")) })}
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
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-4 py-2">
            <input
              type="text"
              placeholder={t("wishlist.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-lg border border-repressurizer-border bg-repressurizer-bg px-3 py-1 text-sm text-repressurizer-text placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
            />
            <div className="flex items-center gap-1 text-repressurizer-text-faint">
              <SortAscending size={13} />
            </div>
            {(["priority", "date", "name"] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                  sortBy === s
                    ? "border-repressurizer-accent bg-repressurizer-accent/10 text-repressurizer-accent"
                    : "border-repressurizer-border-subtle bg-repressurizer-bg text-repressurizer-text-muted hover:text-repressurizer-text"
                }`}
              >
                {s === "priority" ? t("wishlist.sort.priority") : s === "date" ? t("wishlist.sort.added") : t("wishlist.sort.name")}
              </button>
            ))}
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
                {t("wishlist.viewOnSteam")}
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
                    {item.date_added > 0 && (
                      <span className="shrink-0 text-[11px] text-repressurizer-text-faint">
                        {timeAgo(item.date_added, locale, t("wishlist.today"))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
