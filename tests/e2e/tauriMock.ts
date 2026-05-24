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

  if (process.env.REPRESSURIZER_REAL_STEAM_IMAGES !== "1") {
    await page.route("https://cdn.akamai.steamstatic.com/steam/apps/*/header.jpg", fulfillSteamHeader);
    await page.route("https://cdn.akamai.steamstatic.com/steam/apps/*/capsule_231x87.jpg", fulfillSteamHeader);
    await page.route("https://steamcdn-a.akamaihd.net/steam/apps/*/header.jpg", fulfillSteamHeader);
    await page.route("https://steamcdn-a.akamaihd.net/steam/apps/*/capsule_231x87.jpg", fulfillSteamHeader);
    await page.route("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/**/header.jpg*", fulfillSteamHeader);
    await page.route("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/**/capsule_231x87.jpg*", fulfillSteamHeader);
  }

  await page.addInitScript(() => {
    const settings = {
      steamPath: "C:\\\\Program Files (x86)\\\\Steam",
      steamId3: "123456",
      steamId64: "76561198000000000",
      steamPersonaName: "Crimsab",
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
      { appid: 632470, name: "Disco Elysium - The Final Cut", playtime_forever: 720, img_icon_url: null, rtime_last_played: 1_775_000_000 },
      { appid: 1145360, name: "Hades", playtime_forever: 1800, img_icon_url: null, rtime_last_played: 1_776_000_000 },
      { appid: 753640, name: "Outer Wilds", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 39140, name: "FINAL FANTASY VII", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 12100, name: "Grand Theft Auto III", playtime_forever: 90, img_icon_url: null, rtime_last_played: 0 },
      { appid: 1546970, name: "Grand Theft Auto III – The Definitive Edition", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 1462040, name: "FINAL FANTASY VII REMAKE INTERGRADE", playtime_forever: 240, img_icon_url: null, rtime_last_played: 0 },
      { appid: 3280350, name: "DEATH STRANDING 2: ON THE BEACH", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 2499860, name: "DRAGON QUEST VII Reimagined", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
      { appid: 1643320, name: "S.T.A.L.K.E.R. 2: Heart of Chornobyl", playtime_forever: 0, img_icon_url: null, rtime_last_played: 0 },
    ];

    const collections = [
      {
        id: "rpg",
        key: "rpg",
        name: "RPG",
        added: [632470, 39140, 1462040, 2499860],
        removed: [],
        timestamp: 1,
        is_deleted: false,
        is_dynamic: false,
      },
      {
        id: "favorites",
        key: "favorite",
        name: "Favorites",
        added: [1145360, 753640],
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
          appid: 1426210,
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

    const appData: Record<string, string> = {
      "play_history.json": JSON.stringify({
        version: 1,
        snapshots: {
          1145360: {
            appid: 1145360,
            name: "Hades",
            playtime: 1800,
            lastPlayed: 1_776_000_000,
            observedAt: 1_776_000_100,
          },
        },
        sessions: [
          {
            id: "1145360-1776000100-1800",
            appid: 1145360,
            name: "Hades",
            minutes: 65,
            playedAt: 1_776_000_000,
            observedAt: 1_776_000_100,
            previousPlaytime: 1735,
            currentPlaytime: 1800,
          },
        ],
      }),
    };

    window.localStorage.setItem("repressurizer-settings", JSON.stringify(settings));

    const tauriInternals = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case "fetch_library":
            return games;
          case "fetch_steam_app_list":
            if (!args?.apiKey) throw new Error("Steam Web API key is required");
            return [
              { appid: 43160, name: "Metro: Last Light Complete Edition" },
              { appid: 632470, name: "Disco Elysium - The Final Cut" },
              { appid: 1145360, name: "Hades" },
            ];
          case "fetch_game_details": {
            const appId = Number(args?.appId ?? args?.app_id ?? 0);
            const names: Record<number, string> = {
              1426210: "It Takes Two",
              632470: "Disco Elysium - The Final Cut",
              753640: "Outer Wilds",
              1145360: "Hades",
              12100: "Grand Theft Auto III",
              39140: "FINAL FANTASY VII",
              1462040: "FINAL FANTASY VII REMAKE INTERGRADE",
              1546970: "Grand Theft Auto III – The Definitive Edition",
              1643320: "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
              2499860: "DRAGON QUEST VII Reimagined",
              3280350: "DEATH STRANDING 2: ON THE BEACH",
            };
            const years: Record<number, string> = {
              39140: "Jul 24, 2013",
              1462040: "Jun 17, 2022",
              1643320: "Nov 20, 2024",
              3280350: "Mar 19, 2026",
              2499860: "Feb 5, 2026",
            };
            const hashedImages: Record<number, { header: string; capsule: string }> = {
              3280350: {
                header: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/6270c77b0729e2df0a17d660286eeddfd9169386/header.jpg",
                capsule: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3280350/6e07f61e2585bae97d2406d45666a7ee70543792/capsule_231x87.jpg",
              },
              2499860: {
                header: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2499860/ea0c655407c078a8994b7e91256c79d90169133a/header.jpg",
                capsule: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2499860/9d1e5917fb47c7af55a5134a6f7eb302fea2fb16/capsule_231x87.jpg",
              },
            };
            return {
              app_id: appId,
              name: names[appId] ?? `App ${appId}`,
              genres: [39140, 1462040, 2499860].includes(appId) ? ["RPG"] : ["Adventure"],
              categories: ["Single-player"],
              release_date: years[appId] ?? "Jan 4, 2008",
              metacritic_score: appId === 12100 ? 93 : null,
              developers: ["Demo Studio"],
              publishers: ["Demo Publisher"],
              platforms: { windows: true, mac: false, linux: false },
              header_image: hashedImages[appId]?.header ?? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
              capsule_image: hashedImages[appId]?.capsule ?? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`,
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
              1426210: { main_story: 14, main_extra: 16, completionist: 20 },
              632470: { main_story: 22, main_extra: 32, completionist: 55 },
              753640: { main_story: 16, main_extra: 22, completionist: 28 },
              1145360: { main_story: 22, main_extra: 50, completionist: 95 },
              1643320: { main_story: 36, main_extra: 60, completionist: 100 },
              3280350: { main_story: 40, main_extra: 60, completionist: 100 },
            });
          case "load_app_data":
            if (args?.key === "steam_family.json") return JSON.stringify(familyCache);
            return appData[String(args?.key ?? "")] ?? null;
          case "save_app_data":
            if (args?.key && typeof args.data === "string") appData[String(args.key)] = args.data;
            return null;
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
