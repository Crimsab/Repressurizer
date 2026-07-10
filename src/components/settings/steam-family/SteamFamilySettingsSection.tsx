import { Globe, TrashSimple, UsersThree } from "@phosphor-icons/react";
import { useT } from "../../../lib/i18n";
import type { SteamFamilySettingsController } from "./useSteamFamilySettings";

interface SteamFamilySettingsSectionProps {
  controller: SteamFamilySettingsController;
}

export function SteamFamilySettingsSection({
  controller,
}: SteamFamilySettingsSectionProps) {
  const t = useT();
  const {
    accessToken,
    setAccessToken,
    tokenSavedAt,
    tokenValidatedAt,
    checking,
    result,
    lastFetched,
    hasStoreToken,
    hasWebApiKey,
    includeNonGames,
    setIncludeNonGames,
    handleTokenPaste,
    openTokenPage,
    saveToken,
    clearToken,
    probe,
  } = controller;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
        {t("settings.steamFamily")}
      </h3>
      <div className="space-y-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3">
        <div className="flex items-start gap-3">
          <UsersThree
            size={16}
            weight="duotone"
            className="mt-0.5 text-repressurizer-text-faint"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-repressurizer-text">
              {t("settings.family.probeTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.family.probeDesc")}
            </p>
          </div>
        </div>
        <div className="grid gap-2 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/50 px-3 py-2 text-xs text-repressurizer-text-muted sm:grid-cols-2">
          <p>
            {t("settings.family.webApiKey")}:{" "}
            <span className="font-medium text-repressurizer-text">
              {hasWebApiKey
                ? t("settings.family.configured")
                : t("settings.family.missing")}
            </span>
          </p>
          <p>
            {t("settings.family.storeToken")}:{" "}
            <span className="font-medium text-repressurizer-text">
              {tokenSavedAt
                ? t("settings.family.savedDate", {
                    date: new Date(tokenSavedAt).toLocaleDateString(),
                  })
                : t("settings.family.notSaved")}
            </span>
            {tokenValidatedAt && (
              <span className="text-repressurizer-text-faint">
                ,{" "}
                {t("settings.family.validatedDate", {
                  date: new Date(tokenValidatedAt).toLocaleDateString(),
                })}
              </span>
            )}
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-repressurizer-text-muted">
            {t("settings.family.tokenLabel")}
          </label>
          <input
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            onPaste={handleTokenPaste}
            placeholder={t("settings.family.tokenPlaceholder")}
            className="w-full rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-2 text-xs text-repressurizer-text transition-colors placeholder:text-repressurizer-text-faint focus:border-repressurizer-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openTokenPage}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text"
            >
              <Globe size={13} />
              {t("settings.family.openTokenPage")}
            </button>
            <button
              onClick={saveToken}
              disabled={!hasStoreToken}
              className="btn-press rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-text disabled:opacity-40"
            >
              {t("settings.family.saveToken")}
            </button>
            <button
              onClick={clearToken}
              disabled={!tokenSavedAt && !accessToken}
              className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-repressurizer-border bg-repressurizer-surface px-3 py-1.5 text-xs font-medium text-repressurizer-text-muted transition-colors hover:text-repressurizer-danger disabled:opacity-40"
            >
              <TrashSimple size={13} />
              {t("settings.family.clearToken")}
            </button>
            <button
              onClick={probe}
              disabled={checking || (!hasWebApiKey && !hasStoreToken)}
              className="btn-press flex min-w-[150px] flex-1 items-center justify-center rounded-lg bg-repressurizer-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-repressurizer-accent-hover disabled:opacity-40"
            >
              {checking ? t("settings.family.checking") : t("settings.family.probe")}
            </button>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface/40 px-3 py-2.5">
          <input
            type="checkbox"
            checked={includeNonGames}
            onChange={(event) => setIncludeNonGames(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-repressurizer-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-repressurizer-text">
              {t("settings.family.includeNonGames")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
              {t("settings.family.includeNonGames.desc")}
            </span>
          </span>
        </label>
        {result && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <MiniStat label={t("settings.family.total")} value={result.total_apps} />
            <MiniStat label={t("settings.family.owned")} value={result.owned_apps} />
            <MiniStat label={t("settings.family.shared")} value={result.shared_apps} />
            <MiniStat label={t("settings.family.excluded")} value={result.excluded_apps} />
          </div>
        )}
        {result && (
          <p className="text-xs leading-relaxed text-repressurizer-text-faint">
            {result.non_game_apps > 0 && !includeNonGames
              ? `${t("settings.family.hiddenApps", { count: result.non_game_apps })} `
              : ""}
            {result.playtime_entries > 0
              ? t("settings.family.playtimeLoaded", { count: result.playtime_entries })
              : result.playtime_unavailable_reason
                ? t("settings.family.playtimeUnavailable")
                : t("settings.family.noPlaytime")}
          </p>
        )}
        {lastFetched && !result && (
          <p className="text-xs text-repressurizer-text-faint">
            {t("settings.family.cachedData", {
              date: new Date(lastFetched).toLocaleString(),
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-repressurizer-border-subtle bg-repressurizer-surface px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-repressurizer-text-faint">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums text-repressurizer-text">{value}</p>
    </div>
  );
}
