import { describe, expect, it } from "vitest";
import { familyAppsToOwnedGames, familyAppToOwnedGame, isSharedFamilyApp } from "./familyLibrary";
import type { FamilyLibraryApp } from "./tauri";

function familyApp(overrides: Partial<FamilyLibraryApp>): FamilyLibraryApp {
  return {
    appid: 1,
    name: "Portal 2",
    owner_steamids: [],
    exclude_reason: 0,
    playtime_forever: 0,
    rtime_last_played: 0,
    img_icon_hash: null,
    app_type: 1,
    is_non_game: false,
    is_owned_by_current_user: false,
    is_family_shared: true,
    ...overrides,
  };
}

describe("family library helpers", () => {
  it("keeps only currently available shared family apps", () => {
    const shared = familyApp({
      appid: 620,
      name: "Portal 2",
      playtime_forever: 123,
      rtime_last_played: 456,
      img_icon_hash: "portal-icon",
    });
    const owned = familyApp({ appid: 70, name: "Half-Life", is_owned_by_current_user: true, is_family_shared: false });
    const excluded = familyApp({ appid: 400, name: "Portal", exclude_reason: 3 });

    expect(isSharedFamilyApp(shared)).toBe(true);
    expect(isSharedFamilyApp(owned)).toBe(false);
    expect(isSharedFamilyApp(excluded)).toBe(false);
    expect(familyAppsToOwnedGames([shared, owned, excluded])).toEqual([
      {
        appid: 620,
        name: "Portal 2",
        playtime_forever: 123,
        img_icon_url: "portal-icon",
        rtime_last_played: 456,
      },
    ]);
  });

  it("creates stable placeholder names for unnamed apps", () => {
    expect(familyAppToOwnedGame(familyApp({ appid: 123, name: "  " })).name).toBe("App 123");
  });
});
