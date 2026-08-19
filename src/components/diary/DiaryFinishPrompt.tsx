import { useEffect, useMemo, useState } from "react";
import {
  BellRinging,
  Check,
  CheckCircle,
  Clock,
  GameController,
  SkipForward,
  Timer,
  X,
} from "@phosphor-icons/react";
import { useGameStore } from "../../stores/gameStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useStatusStore } from "../../stores/statusStore";
import { useDiaryStore } from "../../stores/diaryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePlayHistoryStore } from "../../stores/playHistoryStore";
import { useToastStore } from "../../stores/toastStore";
import { getHltbHours } from "../../lib/hltb";
import { useT } from "../../lib/i18n";
import { DialogOverlay } from "../ui/DialogOverlay";
import { SteamImage } from "../games/SteamImage";
import type { OwnedGame } from "../../lib/types";
import { RatingControl } from "./DiaryRating";

interface FinishCandidate {
  game: OwnedGame;
  hltbHours: number;
  playedHours: number;
}

const PROMPT_REPEAT_MINUTES = 60;

function hoursLabel(hours: number, language: string): string {
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(hours)}h`;
}

function isUnfinished(status: string | undefined): boolean {
  return status !== "beaten" && status !== "completed" && status !== "abandoned";
}

function promptHltbHours(
  hltb: Parameters<typeof getHltbHours>[0],
  mode: Parameters<typeof getHltbHours>[1]
): number | null {
  return getHltbHours(hltb, mode) ?? getHltbHours(hltb, "first_available");
}

export function DiaryFinishPrompt() {
  const t = useT();
  const language = useSettingsStore((state) => state.language || "en");
  const hltbTimeMode = useSettingsStore((state) => state.hltbTimeMode);
  const setSettings = useSettingsStore((state) => state.setSettings);
  const games = useGameStore((state) => state.games);
  const hltbData = useHltbStore((state) => state.data);
  const statuses = useStatusStore((state) => state.statuses);
  const setStatus = useStatusStore((state) => state.setStatus);
  const reviews = useReviewStore((state) => state.reviews);
  const setRating = useReviewStore((state) => state.setRating);
  const clearRating = useReviewStore((state) => state.clearRating);
  const diaryRatingEmojis = useSettingsStore((state) => state.diaryRatingEmojis);
  const finishPrompts = useDiaryStore((state) => state.finishPrompts);
  const diaryHydrated = useDiaryStore((state) => state.hydrated);
  const hydrateDiary = useDiaryStore((state) => state.hydrate);
  const markFinishPromptSeen = useDiaryStore((state) => state.markFinishPromptSeen);
  const markAllFinishPromptsSeen = useDiaryStore((state) => state.markAllFinishPromptsSeen);
  const dismissFinishPrompt = useDiaryStore((state) => state.dismissFinishPrompt);
  const [activeAppId, setActiveAppId] = useState<number | null>(null);

  useEffect(() => {
    void hydrateDiary();
  }, [hydrateDiary]);

  const sessions = usePlayHistoryStore((state) => state.data.sessions);

  // A game only qualifies when a play session observed by Repressurizer pushed
  // it across the HLTB estimate: historical playtime from before tracking never
  // triggers a prompt.
  const candidates = useMemo<FinishCandidate[]>(() => {
    if (!diaryHydrated) return [];
    const thresholdByApp = new Map<number, number>();
    for (const session of sessions) {
      const hltbHours = promptHltbHours(hltbData[session.appid], hltbTimeMode);
      if (hltbHours == null || hltbHours <= 0) continue;
      const thresholdMinutes = hltbHours * 60;
      const crossed = session.previousPlaytime < thresholdMinutes && session.currentPlaytime >= thresholdMinutes;
      const known = thresholdByApp.get(session.appid) ?? 0;
      if (crossed || known > 0) thresholdByApp.set(session.appid, thresholdMinutes);
    }

    const eligible = Object.values(games).flatMap((game) => {
      const hltbHours = promptHltbHours(hltbData[game.appid], hltbTimeMode);
      const playedHours = game.playtime_forever / 60;
      const promptState = finishPrompts[game.appid];
      const promptedAtMinutes = promptState?.promptedAtMinutes ?? 0;
      if (
        hltbHours == null ||
        hltbHours <= 0 ||
        playedHours <= hltbHours ||
        !thresholdByApp.has(game.appid) ||
        !isUnfinished(statuses[game.appid]) ||
        promptState?.dismissed ||
        (promptedAtMinutes > 0 && game.playtime_forever < promptedAtMinutes + PROMPT_REPEAT_MINUTES)
      ) {
        return [];
      }
      return [{ game, hltbHours, playedHours }];
    });

    eligible.sort(
      (a, b) =>
        b.game.rtime_last_played - a.game.rtime_last_played ||
        b.playedHours - a.playedHours ||
        a.game.name.localeCompare(b.game.name, language)
    );
    return eligible;
  }, [diaryHydrated, finishPrompts, games, hltbData, hltbTimeMode, language, sessions, statuses]);

  const candidate = candidates[0] ?? null;

  useEffect(() => {
    if (activeAppId === null) {
      if (!candidate) return;
      markFinishPromptSeen(candidate.game.appid, candidate.game.playtime_forever);
      setActiveAppId(candidate.game.appid);
      return;
    }

    const activeGame = games[activeAppId];
    const activeHltbHours = activeGame
      ? promptHltbHours(hltbData[activeAppId], hltbTimeMode)
      : null;
    const activeStillValid =
      !!activeGame &&
      activeHltbHours != null &&
      activeHltbHours > 0 &&
      activeGame.playtime_forever / 60 > activeHltbHours &&
      isUnfinished(statuses[activeAppId]);
    if (!activeStillValid) setActiveAppId(null);
  }, [activeAppId, candidate, games, hltbData, hltbTimeMode, markFinishPromptSeen, statuses]);

  const activeGame = activeAppId === null ? undefined : games[activeAppId];
  const activeHltbHours = activeAppId === null ? null : promptHltbHours(hltbData[activeAppId], hltbTimeMode);
  if (!activeGame || activeHltbHours == null) return null;

  const activePlayedHours = activeGame.playtime_forever / 60;
  const rating = reviews[activeGame.appid]?.rating ?? 0;
  const closePrompt = () => setActiveAppId(null);
  const handleMarkFinished = () => {
    setStatus(activeGame.appid, "completed");
    dismissFinishPrompt(activeGame.appid);
    useToastStore.getState().success(t("diary.finishPrompt.saved"));
    closePrompt();
  };
  const handleDismissGame = () => {
    dismissFinishPrompt(activeGame.appid);
    closePrompt();
  };
  const handleDisablePrompts = () => {
    setSettings({ diaryFinishedPrompts: false });
    closePrompt();
  };
  const handleSkipAll = () => {
    markAllFinishPromptsSeen(candidates.map((entry) => ({ appId: entry.game.appid, playtimeMinutes: entry.game.playtime_forever })));
    setActiveAppId(null);
  };

  return (
    <DialogOverlay
      label={t("diary.finishPrompt.title")}
      onClose={closePrompt}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) closePrompt();
      }}
    >
      <div className="w-full max-w-lg animate-fade-in overflow-hidden rounded-2xl border border-repressurizer-border bg-repressurizer-surface shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-repressurizer-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-repressurizer-accent/12 text-repressurizer-accent">
              <BellRinging size={17} weight="duotone" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-repressurizer-text-faint">{t("diary.title")}</p>
              <h2 className="text-sm font-semibold tracking-tight text-white">{t("diary.finishPrompt.title")}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closePrompt}
            aria-label={t("common.close")}
            className="focus-ring btn-press flex h-7 w-7 items-center justify-center rounded-lg text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-white"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-3.5">
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-repressurizer-border bg-repressurizer-bg">
              <SteamImage appId={activeGame.appid} alt="" kind="header" loading="eager" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-repressurizer-accent">
                <CheckCircle size={16} weight="fill" />
                <span className="text-xs font-medium">{t("diary.finishPrompt.overHltb")}</span>
              </div>
              <p className="mt-1 truncate text-base font-semibold text-white">{activeGame.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-muted">
                {t("diary.finishPrompt.description", {
                  played: hoursLabel(activePlayedHours, language),
                  hltb: hoursLabel(activeHltbHours, language),
                })}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 divide-x divide-repressurizer-border-subtle rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg/70">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <Clock size={16} className="text-repressurizer-accent" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-repressurizer-text-faint">{t("diary.finishPrompt.played")}</p>
                <p className="mt-0.5 font-mono text-sm tabular-nums text-white">{hoursLabel(activePlayedHours, language)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <Timer size={16} className="text-repressurizer-text-muted" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-repressurizer-text-faint">{t("diary.finishPrompt.hltb")}</p>
                <p className="mt-0.5 font-mono text-sm tabular-nums text-repressurizer-text">{hoursLabel(activeHltbHours, language)}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-repressurizer-border-subtle px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-repressurizer-text-muted">{t("diary.finishPrompt.rating")}</span>
              <span className="font-mono text-[11px] tabular-nums text-repressurizer-text-muted">{rating > 0 ? `${rating}/10` : "—"}</span>
            </div>
            <RatingControl rating={rating} emojis={diaryRatingEmojis} onChange={(value) => (value === 0 ? clearRating(activeGame.appid) : setRating(activeGame.appid, value))} t={t} compact />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={handleMarkFinished}
              className="focus-ring btn-press inline-flex items-center justify-center gap-2 rounded-xl bg-repressurizer-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-repressurizer-accent-hover"
            >
              <Check size={17} weight="bold" />
              {t("diary.finishPrompt.markFinished")}
            </button>
            <button
              type="button"
              onClick={closePrompt}
              className="focus-ring btn-press inline-flex items-center justify-center gap-2 rounded-xl border border-repressurizer-border bg-repressurizer-bg px-4 py-2.5 text-sm font-medium text-repressurizer-text-muted transition-colors hover:bg-repressurizer-surface-hover hover:text-repressurizer-text"
            >
              <GameController size={16} />
              {t("diary.finishPrompt.later")}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-repressurizer-border-subtle pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" onClick={handleDismissGame} className="focus-ring text-left text-[11px] text-repressurizer-text-faint transition-colors hover:text-repressurizer-text">
                {t("diary.finishPrompt.dismissGame")}
              </button>
              {candidates.length > 0 && (
                <span data-testid="diary-finishprompt-pending" className="font-mono text-[10px] tabular-nums text-repressurizer-text-faint">
                  {t("diary.finishPrompt.pending", { count: candidates.length })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {candidates.length > 0 && (
                <button type="button" data-testid="diary-finishprompt-skip-all" onClick={handleSkipAll} className="focus-ring inline-flex items-center gap-1 text-[11px] text-repressurizer-text-muted transition-colors hover:text-repressurizer-accent">
                  <SkipForward size={12} />
                  {t("diary.finishPrompt.skipAll")}
                </button>
              )}
              <button type="button" onClick={handleDisablePrompts} className="focus-ring inline-flex items-center gap-1 text-[11px] text-repressurizer-text-faint transition-colors hover:text-repressurizer-text">
                <BellRinging size={12} />
                {t("diary.finishPrompt.disable")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}
