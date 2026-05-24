import type { OwnedGame } from "./types";

export interface PlaytimeSnapshot {
  appid: number;
  name: string;
  playtime: number;
  lastPlayed: number;
  observedAt: number;
}

export interface PlaytimeSession {
  id: string;
  appid: number;
  name: string;
  minutes: number;
  playedAt: number;
  observedAt: number;
  previousPlaytime: number;
  currentPlaytime: number;
}

export interface PlayHistoryData {
  version: 1;
  snapshots: Record<number, PlaytimeSnapshot>;
  sessions: PlaytimeSession[];
}

export const EMPTY_PLAY_HISTORY: PlayHistoryData = {
  version: 1,
  snapshots: {},
  sessions: [],
};

const MAX_SESSIONS = 10_000;
const FUTURE_SLOP_SECS = 24 * 60 * 60;

export function parsePlayHistory(raw: string | null): PlayHistoryData {
  if (!raw) return structuredClone(EMPTY_PLAY_HISTORY);
  try {
    const parsed = JSON.parse(raw) as Partial<PlayHistoryData>;
    if (parsed.version !== 1 || !parsed.snapshots || !Array.isArray(parsed.sessions)) {
      return structuredClone(EMPTY_PLAY_HISTORY);
    }
    return {
      version: 1,
      snapshots: parsed.snapshots,
      sessions: parsed.sessions,
    };
  } catch {
    return structuredClone(EMPTY_PLAY_HISTORY);
  }
}

function sessionMonthSource(
  previous: PlaytimeSnapshot,
  game: OwnedGame,
  observedAt: number,
): number {
  const lastPlayed = game.rtime_last_played || 0;
  if (
    lastPlayed > previous.lastPlayed &&
    lastPlayed <= observedAt + FUTURE_SLOP_SECS
  ) {
    return lastPlayed;
  }
  return observedAt;
}

function sessionId(appid: number, observedAt: number, currentPlaytime: number): string {
  return `${appid}-${observedAt}-${currentPlaytime}`;
}

export function recordPlaytimeObservation(
  current: PlayHistoryData,
  games: OwnedGame[],
  observedAt = Math.floor(Date.now() / 1000),
): PlayHistoryData {
  const snapshots: Record<number, PlaytimeSnapshot> = { ...current.snapshots };
  const sessions = [...current.sessions];
  let changed = false;

  for (const game of games) {
    const appid = game.appid;
    const playtime = Math.max(0, Math.floor(game.playtime_forever || 0));
    const lastPlayed = Math.max(0, Math.floor(game.rtime_last_played || 0));
    const name = String(game.name ?? "");
    const previous = snapshots[appid];

    if (!previous) {
      snapshots[appid] = { appid, name, playtime, lastPlayed, observedAt };
      changed = true;
      continue;
    }

    if (playtime > previous.playtime) {
      const minutes = playtime - previous.playtime;
      const playedAt = sessionMonthSource(previous, game, observedAt);
      sessions.push({
        id: sessionId(appid, observedAt, playtime),
        appid,
        name,
        minutes,
        playedAt,
        observedAt,
        previousPlaytime: previous.playtime,
        currentPlaytime: playtime,
      });
      changed = true;
    }

    if (
      playtime !== previous.playtime ||
      lastPlayed !== previous.lastPlayed ||
      name !== previous.name
    ) {
      snapshots[appid] = { appid, name, playtime, lastPlayed, observedAt };
      changed = true;
    }
  }

  if (!changed) return current;

  return {
    version: 1,
    snapshots,
    sessions: sessions.slice(-MAX_SESSIONS),
  };
}
