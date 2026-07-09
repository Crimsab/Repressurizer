import { useMemo } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import {
  getIgnoredGameName,
  MAX_FAIL_RUNS,
  useFailedGamesStore,
} from "../../stores/failedGamesStore";
import {
  getHltbIgnoredGameName,
  HLTB_MAX_FAILS,
  useHltbIgnoredStore,
} from "../../stores/hltbIgnoredStore";
import { useT } from "../../lib/i18n";

function ignoredIds(fails: Record<number, number>, threshold: number): number[] {
  return Object.entries(fails)
    .filter(([, count]) => count >= threshold)
    .map(([id]) => Number(id));
}

export function useIgnoredSettingsCount(): number {
  const steamCount = useFailedGamesStore((state) =>
    Object.values(state.fails).filter((count) => count >= MAX_FAIL_RUNS).length
  );
  const hltbCount = useHltbIgnoredStore((state) =>
    Object.values(state.fails).filter((count) => count >= HLTB_MAX_FAILS).length
  );
  return steamCount + hltbCount;
}

export function IgnoredSettingsTab() {
  const steamFails = useFailedGamesStore((state) => state.fails);
  const resetSteamFailure = useFailedGamesStore((state) => state.resetFailure);
  const resetAllSteam = useFailedGamesStore((state) => state.resetAll);
  const hltbFails = useHltbIgnoredStore((state) => state.fails);
  const resetHltbGame = useHltbIgnoredStore((state) => state.resetGame);
  const resetAllHltb = useHltbIgnoredStore((state) => state.resetAll);
  const steamIds = useMemo(() => ignoredIds(steamFails, MAX_FAIL_RUNS), [steamFails]);
  const hltbIds = useMemo(() => ignoredIds(hltbFails, HLTB_MAX_FAILS), [hltbFails]);
  const t = useT();

  return (
    <div className="space-y-6">
      <IgnoredGroup
        title={`${t("ignored.steamDetails")} (${steamIds.length})`}
        description={t("ignored.steamDetails.desc", { count: MAX_FAIL_RUNS })}
        ids={steamIds}
        nameForId={getIgnoredGameName}
        failureCount={(id) => t("ignored.failed", { count: steamFails[id] })}
        onRetry={resetSteamFailure}
        onResetAll={resetAllSteam}
      />
      <IgnoredGroup
        className="border-t border-repressurizer-border pt-5"
        title={`${t("ignored.hltb")} (${hltbIds.length})`}
        description={t("ignored.hltb.desc", { count: HLTB_MAX_FAILS })}
        ids={hltbIds}
        nameForId={getHltbIgnoredGameName}
        onRetry={resetHltbGame}
        onResetAll={resetAllHltb}
      />
    </div>
  );
}

function IgnoredGroup({
  title,
  description,
  ids,
  nameForId,
  failureCount,
  onRetry,
  onResetAll,
  className = "",
}: {
  title: string;
  description: string;
  ids: number[];
  nameForId: (id: number) => string;
  failureCount?: (id: number) => string;
  onRetry: (id: number) => void;
  onResetAll: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-xs font-semibold text-repressurizer-text-muted uppercase tracking-wider">{title}</h3>
      <p className="text-xs text-repressurizer-text-faint">{description}</p>
      {ids.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-repressurizer-text-faint">
          <CheckCircle size={16} weight="duotone" className="text-repressurizer-accent/50" />
          <p className="text-xs">{t("ignored.none")}</p>
        </div>
      ) : (
        <>
          <div className="max-h-48 divide-y divide-repressurizer-border-subtle overflow-auto rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg">
            {ids.map((id) => (
              <div key={id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 truncate text-sm text-repressurizer-text">{nameForId(id)}</span>
                {failureCount && (
                  <span className="shrink-0 font-mono text-[10px] text-repressurizer-text-faint">{failureCount(id)}</span>
                )}
                <button onClick={() => onRetry(id)} className="shrink-0 text-xs text-repressurizer-accent hover:underline">
                  {t("ignored.retry")}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={onResetAll}
            className="btn-press text-xs text-repressurizer-danger/70 transition-colors hover:text-repressurizer-danger"
          >
            {t("ignored.resetAll", { count: ids.length })}
          </button>
        </>
      )}
    </div>
  );
}
