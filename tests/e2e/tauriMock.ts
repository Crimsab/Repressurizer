import type { Page, Route } from "@playwright/test";

export async function installTauriMock(page: Page) {
  const fulfillSteamHeader = async (route: Route) => {
    const appId = route.request().url().match(/\/apps\/(\d+)\//)?.[1] ?? "0";
    const hue = Number(appId) % 360;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="920" height="430" viewBox="0 0 920 430">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="hsl(${hue}, 58%, 28%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 70) % 360}, 42%, 12%)"/>
          </linearGradient>
        </defs>
        <rect width="920" height="430" fill="url(#g)"/>
        <rect x="32" y="32" width="856" height="366" rx="28" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.16)"/>
        <text x="56" y="360" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="42" font-weight="700">APP ${appId}</text>
      </svg>
    `;
    await route.fulfill({ contentType: "image/svg+xml", body: svg });
  };

  await page.route("https://cdn.akamai.steamstatic.com/steam/apps/*/header.jpg", fulfillSteamHeader);
  await page.route("https://steamcdn-a.akamaihd.net/steam/apps/*/header.jpg", fulfillSteamHeader);
  await page.route("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/**/header.jpg*", fulfillSteamHeader);

  await page.addInitScript(() => {
    const settings = {
      steamPath: "C:\\\\Program Files (x86)\\\\Steam",
      steamId3: "123456",
      steamId64: "76561198000000000",
      apiKey: "mock-key",
      setupComplete: true,
      showDynamicCategories: false,
      pinFavorites: true,
      accentColor: "",
      sidebarWidth: 232,
      theme: "dark",
      language: "en",
      showSmartLists: true,
      showNowPlaying: true,
      showFilterBar: true,
      hltbConcurrency: 5,
      achievementsConcurrency: 5,
      currency: "EUR",
      onboardingComplete: true,
      categoryOrder: [],
      minimizeToTray: false,
      includeSteamFamilyNonGames: false,
    };

    const games = [
      { appid: 10, name: "Disco Elysium", playtime_forever: 720, img_icon_url: null, rtime_last_played: 1_775_000_000 },
      { appid: 20, name: "Hades", playtime_forever: 1800, img_icon_url: null, rtime_last_played: 1_776_000_000 },
      { appid: 30, name: "Outer Wilds", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 12100, name: "Grand Theft Auto III", playtime_forever: 90, img_icon_url: null, rtime_last_played: 0 },
      { appid: 1546970, name: "Grand Theft Auto III – The Definitive Edition", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
    ];

    const collections = [
      {
        id: "rpg",
        key: "rpg",
        name: "RPG",
        added: [10, 39140],
        removed: [],
        timestamp: 1,
        is_deleted: false,
        is_dynamic: false,
      },
      {
        id: "favorites",
        key: "favorite",
        name: "Favorites",
        added: [20],
        removed: [],
        timestamp: 1,
        is_deleted: false,
        is_dynamic: false,
      },
    ];

    const familyCache = {
      authUsed: "access_token",
      ownerSteamId: "76561198000000000",
      lastFetched: Date.now(),
      apps: [
        {
          appid: 40,
          name: "It Takes Two",
          owner_steamids: ["76561198111111111"],
          exclude_reason: 0,
          playtime_forever: 120,
          rtime_last_played: 1_777_000_000,
          img_icon_hash: null,
          app_type: 1,
          is_non_game: false,
          is_owned_by_current_user: false,
          is_family_shared: true,
        },
      ],
    };

    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));

    const tauriInternals = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case "fetch_library":
            return games;
          case "fetch_game_details": {
            const appId = Number(args?.appId ?? args?.app_id ?? 0);
            const names: Record<number, string> = {
              10: "Disco Elysium",
              20: "Hades",
              30: "Outer Wilds",
              40: "It Takes Two",
              12100: "Grand Theft Auto III",
              39140: "FINAL FANTASY VII",
              1546970: "Grand Theft Auto III – The Definitive Edition",
            };
            return {
              app_id: appId,
              name: names[appId] ?? `App ${appId}`,
              genres: appId === 39140 ? ["RPG"] : ["Adventure"],
              categories: ["Single-player"],
              release_date: appId === 39140 ? "Jul 24, 2013" : "Jan 4, 2008",
              metacritic_score: appId === 12100 ? 93 : null,
              developers: ["Mock Studio"],
              publishers: ["Mock Publisher"],
              platforms: { windows: true, mac: false, linux: false },
              header_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
              capsule_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`,
              price_initial: null,
              price_final: null,
              price_currency: null,
              is_free: false,
            };
          }
          case "load_collections":
            return collections;
          case "fetch_family_library":
            return {
              auth_used: "access_token",
              family_groupid: "mock-family",
              owner_steamid: "76561198000000000",
              total_apps: 1,
              owned_apps: 0,
              shared_apps: 1,
              excluded_apps: 0,
              non_game_apps: 0,
              playtime_entries: 1,
              playtime_unavailable_reason: null,
              apps: familyCache.apps,
            };
          case "create_manual_backup":
          case "save_app_data":
            return null;
          case "load_details_cache":
          case "load_failed_cache":
          case "load_achievements_cache":
          case "load_friends_cache":
          case "load_wishlist_cache":
            return null;
          case "load_hltb_cache":
            return JSON.stringify({
              10: { main_story: 22, main_extra: 32, completionist: 55 },
              20: { main_story: 22, main_extra: 50, completionist: 95 },
              30: { main_story: 16, main_extra: 22, completionist: 28 },
              40: { main_story: 14, main_extra: 16, completionist: 20 },
            });
          case "load_app_data":
            return args?.key === "steam_family.json" ? JSON.stringify(familyCache) : null;
          case "fetch_hltb":
            return { main_story: 12, main_extra: 18, completionist: 30 };
          default:
            return null;
        }
      },
      transformCallback: () => 1,
      unregisterCallback: () => null,
      convertFileSrc: (path: string) => path,
    };

    (window as unknown as { __TAURI_INTERNALS__: typeof tauriInternals }).__TAURI_INTERNALS__ = tauriInternals;
  });
}
