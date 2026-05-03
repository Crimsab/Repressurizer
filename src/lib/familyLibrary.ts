import type { FamilyLibraryApp } from "./tauri";
import type { OwnedGame } from "./types";

export function isSharedFamilyApp(app: FamilyLibraryApp): boolean {
  return app.is_family_shared && app.exclude_reason === 0;
}

export function familyAppToOwnedGame(app: FamilyLibraryApp): OwnedGame {
  return {
    appid: app.appid,
    name: app.name?.trim() || `App ${app.appid}`,
    playtime_forever: app.playtime_forever ?? 0,
    img_icon_url: app.img_icon_hash ?? null,
    rtime_last_played: app.rtime_last_played ?? 0,
  };
}

export function familyAppsToOwnedGames(apps: FamilyLibraryApp[]): OwnedGame[] {
  return apps.filter(isSharedFamilyApp).map(familyAppToOwnedGame);
}
