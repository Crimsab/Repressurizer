import { ArrowRight, Clock, Play, Stack, Target } from "@phosphor-icons/react";
import { SteamImage } from "../games/SteamImage";
import { getHltbHours } from "../../lib/hltb";
import type { HltbData } from "../../lib/tauri";
import type { OwnedGame } from "../../lib/types";
import type { PlaytimeSession } from "../../lib/playHistory";
import type { DiaryEntry, DiaryPriority } from "../../stores/diaryStore";
import type { GameStatus } from "../../stores/statusStore";
import {
  DECISION_RANK,
  formatDate,
  formatHours,
  getDiaryStatus,
  PRIORITY_DOT_STYLES,
  PRIORITY_RANK,
  STATUS_LABELS,
  STATUS_STYLES,
  type DiaryViewStatus,
} from "./diaryShared";
import type { HltbTimeMode } from "../../lib/types";

export function DiaryUpcoming({ games, entries, statuses, sessions, hltbData, hltbTimeMode, language, t, onOpenGame, onApplyStatus }: {
  games: OwnedGame[];
  entries: Record<number, DiaryEntry>;
  statuses: Record<number, GameStatus>;
  sessions: PlaytimeSession[];
  hltbData: Record<number, HltbData>;
  hltbTimeMode: HltbTimeMode;
  language: string;
  t: ReturnType<typeof import("../../lib/i18n").useT>;
  onOpenGame: (appId: number) => void;
  onApplyStatus: (appId: number, status: DiaryViewStatus) => void;
}) {
  const sessionsByAppId = new Map<number, PlaytimeSession[]>();
  for (const session of sessions) {
    const current = sessionsByAppId.get(session.appid);
    if (current) current.push(session);
    else sessionsByAppId.set(session.appid, [session]);
  }
  const upcoming = games
    .filter((game) => {
      const status = getDiaryStatus(game, statuses[game.appid] ?? "none", entries[game.appid]);
      return status === "backlog" || status === "playing";
    })
    .sort((left, right) => {
      const leftEntry = entries[left.appid];
      const rightEntry = entries[right.appid];
      return (
        (DECISION_RANK[leftEntry?.decision ?? "backlog"] ?? 1) - (DECISION_RANK[rightEntry?.decision ?? "backlog"] ?? 1) ||
        PRIORITY_RANK[rightEntry?.priority ?? "normal"] - PRIORITY_RANK[leftEntry?.priority ?? "normal"] ||
        right.rtime_last_played - left.rtime_last_played ||
        left.name.localeCompare(right.name, language)
      );
    });

  return (
    <section data-testid="diary-upcoming" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Target size={17} weight="duotone" className="text-repressurizer-accent" />{t("diary.upcoming.title")}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-repressurizer-text-faint">{t("diary.upcoming.desc")}</p>
          </div>
          <span className="rounded-full border border-repressurizer-border-subtle bg-repressurizer-surface px-2 py-1 font-mono text-[10px] tabular-nums text-repressurizer-text-faint">{upcoming.length}</span>
        </div>

        {upcoming.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-repressurizer-border-subtle bg-repressurizer-surface/20 px-6 text-center text-xs text-repressurizer-text-faint">{t("diary.upcoming.empty")}</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((game, index) => {
              const entry = entries[game.appid];
              const status = getDiaryStatus(game, statuses[game.appid] ?? "none", entry);
              const priority: DiaryPriority = entry?.priority ?? "normal";
              const hltbHours = getHltbHours(hltbData[game.appid], hltbTimeMode);
              const playedHours = game.playtime_forever / 60;
              const remaining = hltbHours == null ? null : Math.max(0, hltbHours - playedHours);
              const gameSessions = sessionsByAppId.get(game.appid) ?? [];
              const lastSession = gameSessions.reduce((latest, session) => Math.max(latest, session.playedAt), 0);
              const lastPlayed = Math.max(game.rtime_last_played || 0, lastSession);
              return (
                <article key={game.appid} data-testid={`diary-upcoming-game-${game.appid}`} className="card-lift grid grid-cols-1 gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-surface/40 p-2.5 shadow-pop-sm transition-[border-color,box-shadow] hover:border-repressurizer-accent/35 hover:bg-repressurizer-surface-hover/60 sm:grid-cols-[minmax(0,1fr)_minmax(230px,auto)] sm:items-center">
                  <button type="button" onClick={() => onOpenGame(game.appid)} className="focus-ring flex min-w-0 items-center gap-3 rounded-lg p-1 text-left">
                    <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-repressurizer-bg ring-1 ring-white/5"><SteamImage appId={game.appid} alt="" kind="capsule" className="h-full w-full object-cover" /><span className="absolute bottom-0 left-0 rounded-tr-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-white">{String(index + 1).padStart(2, "0")}</span></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-repressurizer-text">{game.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-repressurizer-text-faint">
                        <span className={`rounded-full border px-1.5 py-0.5 ${STATUS_STYLES[status]}`}>{t(STATUS_LABELS[status])}</span>
                        <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT_STYLES[priority]}`} />{t(`diary.priority.${priority}`)}</span>
                        {lastPlayed > 0 && <span>{t("diary.lastPlayed")} · {formatDate(lastPlayed, language, t("diary.never"))}</span>}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] text-repressurizer-text-faint sm:justify-end">
                    <span className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border-subtle/70 bg-repressurizer-bg/70 px-2 py-1 font-mono tabular-nums" title={t("diary.hoursPlayed")}><Clock size={12} />{formatHours(game.playtime_forever, language)}h</span>
                    {hltbHours != null && <span className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border-subtle/70 bg-repressurizer-bg/70 px-2 py-1 font-mono tabular-nums" title={t("diary.hltbHours")}><ArrowRight size={12} />{formatHours(Math.round(hltbHours * 60), language)}h {remaining != null && <span className="text-repressurizer-accent">· {formatHours(Math.round(remaining * 60), language)}h {t("diary.upcoming.remaining")}</span>}</span>}
                    <span className="inline-flex items-center gap-1 rounded-md border border-repressurizer-border-subtle/70 bg-repressurizer-bg/70 px-2 py-1 font-mono tabular-nums" title={t("diary.upcoming.sessions")}><Stack size={12} />{gameSessions.length} {t("diary.upcoming.sessions")}</span>
                    <button type="button" onClick={() => onApplyStatus(game.appid, "playing")} className="focus-ring inline-flex items-center gap-1 rounded-md border border-repressurizer-accent/30 bg-repressurizer-accent/10 px-2 py-1.5 font-medium text-repressurizer-accent transition-colors hover:border-repressurizer-accent/60 hover:bg-repressurizer-accent/20"><Play size={11} weight="fill" />{t("diary.upcoming.markNext")}</button>
                    <button type="button" onClick={() => onApplyStatus(game.appid, "backlog")} className="focus-ring rounded-md border border-transparent bg-repressurizer-surface/50 px-2 py-1.5 font-medium text-repressurizer-text-faint transition-colors hover:border-repressurizer-border hover:text-repressurizer-text">{t("diary.upcoming.moveToBacklog")}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
