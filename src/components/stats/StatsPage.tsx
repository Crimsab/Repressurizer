import { useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useStatusStore } from "../../stores/statusStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAchievementsStore } from "../../stores/achievementsStore";
import { computeStats } from "../../lib/stats";
import {
  X, GameController, Clock, Trophy, FolderOpen, ChartBar,
  CurrencyEur, Tag, Desktop, Star, CalendarBlank, Buildings,
  CurrencyCircleDollar, Skull, Medal,
} from "@phosphor-icons/react";
import { useT, type TranslationKey } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";
import { ResizableDialogPanel } from "../ui/ResizableDialogPanel";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", JPY: "¥", CAD: "C$",
  AUD: "A$", CHF: "Fr", BRL: "R$", PLN: "zł", RUB: "₽",
};

function formatPrice(cents: number, currency: string, compact = false): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    }).format(cents / 100);
  } catch {
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const value = (cents / 100).toLocaleString(undefined, {
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    });
    return `${symbol}${value}`;
  }
}

interface StatsPageProps {
  onClose: () => void;
}

export function StatsPage({ onClose }: StatsPageProps) {
  const t = useT();
  const games = useGameStore((s) => s.games);
  const details = useGameStore((s) => s.details);
  const collections = useCategoryStore((s) => s.collections);
  const statuses = useStatusStore((s) => s.statuses);
  const currency = useSettingsStore((s) => s.currency) ?? "EUR";
  const achievementSummaries = useAchievementsStore((s) => s.summaries);

  const stats = useMemo(() => computeStats(games, collections, details, currency), [games, collections, details, currency]);

  // Achievement global stats
  const achievementStats = useMemo(() => {
    const entries = Object.values(achievementSummaries);
    if (entries.length === 0) return null;
    let totalAchievements = 0;
    let totalAchieved = 0;
    let perfectGames = 0;
    for (const s of entries) {
      if (s.total === 0) continue;
      totalAchievements += s.total;
      totalAchieved += s.achieved;
      if (s.achieved === s.total) perfectGames++;
    }
    const gamesWithAchievements = entries.filter((s) => s.total > 0).length;
    const completionPercent = totalAchievements > 0 ? Math.round((totalAchieved / totalAchievements) * 1000) / 10 : 0;
    return { totalAchievements, totalAchieved, perfectGames, gamesWithAchievements, completionPercent };
  }, [achievementSummaries]);

  // Status breakdown
  const statusCounts = useMemo(() => {
    const counts = { playing: 0, beaten: 0, completed: 0, abandoned: 0, none: 0 };
    for (const id of Object.keys(games)) {
      const s = (statuses[Number(id)] ?? "none") as keyof typeof counts;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [games, statuses]);

  const maxBucket = Math.max(...stats.playtimeBuckets.map((b) => b.count), 1);
  const maxCat = Math.max(...stats.categoryStats.slice(0, 10).map((c) => c.count), 1);
  const maxGenre = Math.max(...stats.topGenres.map((g) => g.count), 1);
  const maxDecade = Math.max(...stats.releaseDecades.map((d) => d.count), 1);
  const hasDetails = Object.keys(details).length > 0;

  return (
    <DialogOverlay
      label={t("stats.title")}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <ResizableDialogPanel
        dialogId="statistics"
        defaultSize={{ width: 900, height: 740 }}
        minSize={{ width: 640, height: 480 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in"
      >
        {({ sizeControls }) => (
          <>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-repressurizer-border px-6 py-4">
          <div className="flex items-center gap-2">
            <ChartBar size={18} weight="duotone" className="text-repressurizer-accent" />
            <h2 className="text-base font-semibold text-white tracking-tight">{t("stats.title")}</h2>
          </div>
          <div className="flex items-center gap-1">
            {sizeControls}
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="btn-press flex items-center justify-center w-7 h-7 rounded-lg text-repressurizer-text-muted transition-colors hover:text-white hover:bg-repressurizer-surface-hover"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <StatCard
              icon={<GameController size={18} weight="duotone" />}
              label={t("stats.totalGames")}
              value={stats.totalGames.toLocaleString()}
            />
            <StatCard
              icon={<Clock size={18} weight="duotone" />}
              label={t("stats.totalHours")}
              value={stats.totalPlaytimeHours.toLocaleString()}
            />
            <StatCard
              icon={<Trophy size={18} weight="duotone" />}
              label={t("stats.avgHoursGame")}
              value={stats.averageHoursPerGame.toString()}
            />
            <StatCard
              icon={<FolderOpen size={18} weight="duotone" />}
              label={t("stats.unplayed")}
              value={`${stats.unplayedCount} (${stats.unplayedPercent}%)`}
              accent={stats.unplayedPercent > 50 ? "warning" : undefined}
            />
            <StatCard
              icon={<CurrencyEur size={18} weight="duotone" />}
              label={t("stats.libraryValue")}
              value={stats.pricedGamesCount > 0 ? formatPrice(stats.libraryValue, currency, true) : "—"}
              subtitle={stats.pricedGamesCount > 0
                ? t("stats.priceSubtitle", { priced: stats.pricedGamesCount, free: stats.freeGamesCount })
                : t("stats.fetchDetailsFirst")
              }
            />
          </div>

          {/* Status breakdown */}
          {Object.values(statuses).length > 0 && (
            <div>
              <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("stats.statusBreakdown")}</h3>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "playing",   labelKey: "status.playing",   color: "text-sky-400",      bg: "bg-sky-400/15" },
                  { key: "beaten",    labelKey: "status.beaten",    color: "text-violet-400",   bg: "bg-violet-400/15" },
                  { key: "completed", labelKey: "status.completed", color: "text-repressurizer-accent", bg: "bg-repressurizer-accent/15" },
                  { key: "abandoned", labelKey: "status.abandoned", color: "text-repressurizer-text-faint", bg: "bg-repressurizer-surface-hover" },
                ].map(({ key, labelKey, color, bg }) => {
                  const count = statusCounts[key as keyof typeof statusCounts] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={key} className={`flex items-center gap-2 rounded-xl border border-repressurizer-border-subtle px-4 py-2.5 ${bg}`}>
                      <span className={`text-sm font-semibold ${color}`}>{count}</span>
                      <span className={`text-xs ${color}`}>{t(labelKey as TranslationKey)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Playtime distribution */}
            <div>
              <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("stats.playtimeDistribution")}</h3>
              <div className="space-y-2">
                {stats.playtimeBuckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] text-repressurizer-text-muted truncate text-right">{bucket.label}</span>
                    <div className="flex-1 h-5 rounded overflow-hidden bg-repressurizer-bg">
                      <div
                        className="h-full rounded bg-repressurizer-accent/60 transition-all"
                        style={{ width: `${Math.round((bucket.count / maxBucket) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right shrink-0">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 10 most played */}
            <div>
              <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">{t("stats.topPlayed")}</h3>
              <div className="space-y-1.5">
                {stats.topPlayed.map((game, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="truncate text-xs text-repressurizer-text">{game.name}</span>
                      </div>
                      <div className="h-1.5 w-full rounded overflow-hidden bg-repressurizer-bg">
                        <div
                          className="h-full rounded bg-repressurizer-accent transition-all"
                          style={{ width: `${Math.round((game.hours / (stats.topPlayed[0]?.hours || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-repressurizer-text-faint font-mono tabular-nums">{game.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Details-based stats (only if cache has data) */}
          {hasDetails && (
            <>
              <div className="grid grid-cols-2 gap-6">
                {/* Genre distribution */}
                {stats.topGenres.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                      <Tag size={12} weight="duotone" />
                      {t("stats.topGenres")}
                    </h3>
                    <div className="space-y-2">
                      {stats.topGenres.map((genre) => (
                        <div key={genre.name} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[11px] text-repressurizer-text-muted truncate text-right" title={genre.name}>{genre.name}</span>
                          <div className="flex-1 h-4 rounded overflow-hidden bg-repressurizer-bg">
                            <div
                              className="h-full rounded bg-violet-500/50 transition-all"
                              style={{ width: `${Math.round((genre.count / maxGenre) * 100)}%` }}
                            />
                          </div>
                          <span className="w-10 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right shrink-0">{genre.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Release decade */}
                {stats.releaseDecades.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                      <CalendarBlank size={12} weight="duotone" />
                      {t("stats.gamesByDecade")}
                    </h3>
                    <div className="space-y-2">
                      {stats.releaseDecades.map((decade) => (
                        <div key={decade.label} className="flex items-center gap-2">
                          <span className="w-12 shrink-0 text-[11px] text-repressurizer-text-muted text-right">{decade.label}</span>
                          <div className="flex-1 h-4 rounded overflow-hidden bg-repressurizer-bg">
                            <div
                              className="h-full rounded bg-amber-500/50 transition-all"
                              style={{ width: `${Math.round((decade.count / maxDecade) * 100)}%` }}
                            />
                          </div>
                          <span className="w-10 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right shrink-0">{decade.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-6">
                {/* Platform support */}
                <div>
                  <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                    <Desktop size={12} weight="duotone" />
                    {t("stats.platformSupport")}
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: "Windows", count: stats.platformCounts.windows, color: "bg-sky-500/50" },
                      { label: "macOS", count: stats.platformCounts.mac, color: "bg-repressurizer-text-muted/30" },
                      { label: "Linux", count: stats.platformCounts.linux, color: "bg-orange-500/50" },
                    ].map((p) => {
                      const pct = Object.keys(details).length > 0
                        ? Math.round((p.count / Object.keys(details).length) * 100)
                        : 0;
                      return (
                        <div key={p.label} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[11px] text-repressurizer-text-muted text-right">{p.label}</span>
                          <div className="flex-1 h-4 rounded overflow-hidden bg-repressurizer-bg">
                            <div className={`h-full rounded ${p.color} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-16 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right shrink-0">{p.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metacritic */}
                {stats.metacriticCount > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                      <Star size={12} weight="duotone" />
                      Metacritic
                    </h3>
                    <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 text-center">
                      <p className={`text-2xl font-bold font-mono tabular-nums ${
                        stats.averageMetacritic >= 75 ? "text-repressurizer-accent" :
                        stats.averageMetacritic >= 50 ? "text-amber-400" : "text-repressurizer-danger"
                      }`}>
                        {stats.averageMetacritic}
                      </p>
                      <p className="text-[11px] text-repressurizer-text-faint mt-1">{t("stats.averageScore")}</p>
                      <p className="text-[10px] text-repressurizer-text-faint mt-0.5">{t("stats.gamesWithScores", { count: stats.metacriticCount })}</p>
                    </div>
                  </div>
                )}

                {/* Top publishers */}
                {stats.topPublishers.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                      <Buildings size={12} weight="duotone" />
                      {t("stats.topPublishers")}
                    </h3>
                    <div className="space-y-1.5">
                      {stats.topPublishers.slice(0, 8).map((pub_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-[11px] text-repressurizer-text-muted" title={pub_.name}>{pub_.name}</span>
                          <span className="shrink-0 text-[11px] text-repressurizer-text-faint font-mono tabular-nums">{pub_.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Cost per hour + Shame wall (need price data from details) */}
          {hasDetails && stats.pricedGamesCount === 0 && (
            <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-center">
              <p className="text-xs text-repressurizer-text-faint">
                {t("stats.noPriceData")}
              </p>
            </div>
          )}
          {hasDetails && (stats.bestCostPerHour.length > 0 || stats.shameWall.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Best value (cost per hour) */}
              {stats.bestCostPerHour.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                    <CurrencyCircleDollar size={12} weight="duotone" />
                    {t("stats.bestValue")}
                  </h3>
                  <p className="mb-2 text-[10px] text-repressurizer-text-faint">{t("stats.bestValue.desc")}</p>
                  <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/60">
                    {stats.bestCostPerHour.map((g, i) => (
                      <div key={i} className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-3 py-2 last:border-b-0">
                        <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-repressurizer-text-faint">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-repressurizer-text" title={g.name}>{g.name}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-repressurizer-accent">
                          {formatPrice(Math.round(g.costPerHour * 100), currency)}/h
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shame wall */}
              {stats.shameWall.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                    <Skull size={12} weight="duotone" />
                    {t("stats.shameWall")}
                  </h3>
                  <p className="mb-2 text-[10px] text-repressurizer-text-faint">{t("stats.shameWall.desc")}</p>
                  <div className="rounded-xl border border-repressurizer-danger/15 bg-repressurizer-bg/60">
                    {stats.shameWall.map((g, i) => (
                      <div key={i} className="flex items-center gap-2 border-b border-repressurizer-border-subtle px-3 py-2 last:border-b-0">
                        <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-repressurizer-text-faint">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-repressurizer-text" title={g.name}>{g.name}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-repressurizer-danger">
                          {formatPrice(g.price, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-right font-mono text-[10px] tabular-nums text-repressurizer-text-faint">
                    {t("stats.totalWasted")}: <span className="text-repressurizer-danger">{formatPrice(stats.shameWall.reduce((s, g) => s + g.price, 0), currency)}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Achievement stats (independent — uses its own store, not details) */}
          {achievementStats && (
            <div className="max-w-xs">
              <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                <Medal size={12} weight="duotone" />
                {t("stats.achievements")}
              </h3>
              <div className="rounded-xl bg-repressurizer-bg border border-repressurizer-border-subtle px-4 py-3 space-y-3">
                <div className="text-center">
                  <p className="text-2xl font-bold font-mono tabular-nums text-white">
                    {achievementStats.totalAchieved.toLocaleString()}
                    <span className="text-sm text-repressurizer-text-faint font-normal"> / {achievementStats.totalAchievements.toLocaleString()}</span>
                  </p>
                  <p className="text-[11px] text-repressurizer-text-faint mt-0.5">
                    {t("stats.completion", { percent: achievementStats.completionPercent })}
                  </p>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden bg-repressurizer-surface">
                  <div
                    className="h-full rounded-full bg-repressurizer-accent transition-all"
                    style={{ width: `${achievementStats.completionPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-repressurizer-text-faint">
                  <span>{t("stats.gamesTracked", { count: achievementStats.gamesWithAchievements })}</span>
                  <span className="text-amber-400">{t("stats.perfect", { count: achievementStats.perfectGames })}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category sizes */}
          {stats.categoryStats.length > 0 && (
            <div>
              <h3 className="mb-3 text-[11px] uppercase tracking-wider text-repressurizer-text-faint font-medium">
                {t("stats.categoriesBySize")}
              </h3>
              <div className="space-y-2">
                {stats.categoryStats.slice(0, 10).map((cat) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-[11px] text-repressurizer-text-muted truncate text-right" title={cat.name}>{cat.name}</span>
                    <div className="flex-1 h-4 rounded overflow-hidden bg-repressurizer-bg">
                      <div
                        className={`h-full rounded transition-all ${cat.isDynamic ? "bg-sky-500/30" : "bg-repressurizer-accent/40"}`}
                        style={{ width: `${Math.round((cat.count / maxCat) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-[11px] text-repressurizer-text-faint font-mono tabular-nums text-right shrink-0">{cat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hint if no details cached */}
          {!hasDetails && (
            <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-center">
              <p className="text-xs text-repressurizer-text-faint">
                {t("stats.noDetailsHint")}
              </p>
            </div>
          )}
        </div>
          </>
        )}
      </ResizableDialogPanel>
    </DialogOverlay>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  accent?: "warning";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-3 py-2.5">
      <div className={`mb-1 ${accent === "warning" ? "text-repressurizer-warning" : "text-repressurizer-accent"}`}>{icon}</div>
      <p
        className={`truncate font-mono text-lg font-semibold leading-tight tabular-nums ${accent === "warning" ? "text-repressurizer-warning" : "text-white"}`}
        title={value}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-repressurizer-text-faint">{label}</p>
      {subtitle && <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-repressurizer-text-faint">{subtitle}</p>}
    </div>
  );
}
