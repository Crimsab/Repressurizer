import { describe, expect, it } from "vitest";
import type { OwnedGame } from "../../lib/types";
import { formatSize, renderBackupDescription } from "./SettingsDataPanels";

const games = {
  1: {
    appid: 1,
    name: "Hades",
    playtime_forever: 0,
    img_icon_url: null,
    rtime_last_played: 0,
  },
} satisfies Record<number, OwnedGame>;

describe("Settings data panel formatters", () => {
  it("renders structured backup changes with game names and app-id fallbacks", () => {
    const description = JSON.stringify({
      added_collections: ["Favorites"],
      removed_collections: ["Old"],
      game_changes: [{ collection: "Backlog", added: [1, 2], removed: [] }],
    });

    expect(renderBackupDescription(description, games)).toBe(
      "Added: Favorites | Removed: Old | Backlog: +Hades, +#2"
    );
  });

  it("preserves plain or malformed descriptions", () => {
    expect(renderBackupDescription("Manual backup", games)).toBe("Manual backup");
    expect(renderBackupDescription("{broken", games)).toBe("{broken");
  });

  it("formats byte sizes without changing unit thresholds", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
