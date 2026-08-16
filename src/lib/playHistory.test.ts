import { describe, expect, it } from "vitest";
import { EMPTY_PLAY_HISTORY, parsePlayHistory, recordPlaytimeObservation } from "./playHistory";
import type { OwnedGame } from "./types";

function game(partial: Partial<OwnedGame> & Pick<OwnedGame, "appid">): OwnedGame {
  return {
    appid: partial.appid,
    name: partial.name ?? "Dishonored",
    playtime_forever: partial.playtime_forever ?? 0,
    img_icon_url: null,
    rtime_last_played: partial.rtime_last_played ?? 0,
  };
}

describe("play history tracking", () => {
  it("treats the first library observation as a baseline, not played time", () => {
    const next = recordPlaytimeObservation(
      EMPTY_PLAY_HISTORY,
      [game({ appid: 205100, playtime_forever: 150_000, rtime_last_played: 1_800_000_000 })],
      1_800_000_100,
    );

    expect(next.sessions).toHaveLength(0);
    expect(next.snapshots[205100].playtime).toBe(150_000);
    expect(next.snapshots[205100].firstObservedAt).toBe(1_800_000_100);
    expect(next.snapshots[205100].firstPlayedObservedAt).toBeNull();
  });

  it("records only positive playtime deltas after the baseline", () => {
    const baseline = recordPlaytimeObservation(
      EMPTY_PLAY_HISTORY,
      [game({ appid: 205100, playtime_forever: 150_000, rtime_last_played: 1_800_000_000 })],
      1_800_000_100,
    );

    const next = recordPlaytimeObservation(
      baseline,
      [game({ appid: 205100, playtime_forever: 150_065, rtime_last_played: 1_800_003_900 })],
      1_800_004_000,
    );

    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0]).toMatchObject({
      appid: 205100,
      minutes: 65,
      previousPlaytime: 150_000,
      currentPlaytime: 150_065,
      playedAt: 1_800_003_900,
    });
    expect(next.snapshots[205100].firstPlayedObservedAt).toBe(1_800_004_000);
  });

  it("records the first observed activity only after a baseline with zero playtime", () => {
    const baseline = recordPlaytimeObservation(
      EMPTY_PLAY_HISTORY,
      [game({ appid: 205100, playtime_forever: 0 })],
      1_800_000_100,
    );

    const next = recordPlaytimeObservation(
      baseline,
      [game({ appid: 205100, playtime_forever: 45, rtime_last_played: 1_800_003_900 })],
      1_800_004_000,
    );

    expect(next.snapshots[205100].firstObservedAt).toBe(1_800_000_100);
    expect(next.snapshots[205100].firstPlayedObservedAt).toBe(1_800_004_000);
  });

  it("upgrades legacy snapshots without inventing a historical first-play date", () => {
    const legacy = JSON.stringify({
      version: 1,
      snapshots: {
        "205100": {
          appid: 205100,
          name: "Dishonored",
          playtime: 45,
          lastPlayed: 1_800_003_900,
          observedAt: 1_800_004_000,
        },
      },
      sessions: [],
    });

    const parsed = parsePlayHistory(legacy);
    expect(parsed.snapshots[205100].firstObservedAt).toBe(1_800_004_000);
    expect(parsed.snapshots[205100].firstPlayedObservedAt).toBeNull();
  });

  it("does not duplicate a session when the same library data is observed again", () => {
    const baseline = recordPlaytimeObservation(
      EMPTY_PLAY_HISTORY,
      [game({ appid: 205100, playtime_forever: 600, rtime_last_played: 1_800_000_000 })],
      1_800_000_100,
    );
    const withDelta = recordPlaytimeObservation(
      baseline,
      [game({ appid: 205100, playtime_forever: 660, rtime_last_played: 1_800_003_900 })],
      1_800_004_000,
    );

    const repeat = recordPlaytimeObservation(
      withDelta,
      [game({ appid: 205100, playtime_forever: 660, rtime_last_played: 1_800_003_900 })],
      1_800_005_000,
    );

    expect(repeat.sessions).toHaveLength(1);
  });
});
