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
      steamPersonaName: "DemoUser",
      apiKey: "mock-key",
      setupComplete: true,
      showDynamicCategories: false,
      pinFavorites: true,
      accentColor: "",
      sidebarWidth: 232,
      theme: "dark",
      language: "en",
      showSmartLists: true,
      showEmptyLists: false,
      showNowPlaying: true,
      showFilterBar: true,
      hltbConcurrency: 5,
      achievementsConcurrency: 5,
      steamToolsEnabled: false,
      steamToolsAchievementWritesEnabled: false,
      steamToolsCardFarmingEnabled: false,
      steamToolsMaxConcurrentIdleApps: 8,
      steamToolsMinPlaytimeMinutes: 180,
      currency: "EUR",
      onboardingComplete: true,
      categoryOrder: [],
      minimizeToTray: false,
      trayCloseChoiceMade: false,
      startOnLogin: false,
      startOnLoginMode: "tray",
      desktopNotifications: true,
      checkUpdatesOnStartup: true,
      includeSteamFamilyNonGames: false,
      automationPublishEnabled: true,
      automationPublishUrl: "http://example.local:3045/api/steam/repressurizer/import",
      automationPublishBearerToken: "",
      automationPublishIntervalHours: 24,
      automationPublishLastChecksum: "a32:1fdd332b",
      automationPublishLastPublishedAt: "2026-06-18T21:25:19.000Z",
      automationPublishLastAttemptedAt: "2026-06-18T21:25:19.000Z",
      automationPublishLastStatus: "success",
      automationPublishLastMessage: "Automation export published with HTTP 200.",
      automationPublishLastHttpStatus: 200,
      automationPublishLogs: [
        {
          id: "success-1",
          timestamp: "2026-06-18T21:25:19.000Z",
          status: "success",
          message: "Automation export published with HTTP 200.",
          httpStatus: 200,
        },
        {
          id: "skipped-1",
          timestamp: "2026-06-18T20:25:19.000Z",
          status: "skipped",
          message: "Automation export skipped: snapshot checksum has not changed.",
          httpStatus: 0,
        },
        {
          id: "failed-1",
          timestamp: "2026-06-18T19:25:19.000Z",
          status: "failed",
          message: "Automation export returned HTTP 500: unavailable",
          httpStatus: 500,
        },
      ],
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
    let autostartEnabled = settings.startOnLogin;
    const notifications: Array<{ title: string; body?: string }> = [];
    const readSettings = () => {
      try {
        return {
          ...settings,
          ...JSON.parse(window.localStorage.getItem("repressurizer-settings") ?? "{}"),
        };
      } catch {
        return settings;
      }
    };
    const mockAchievementStates = () => {
      const count = Number(window.localStorage.getItem("repressurizer-achievement-count") ?? 3);
      if (count <= 3) {
        return [
          { apiName: "ACH_START", achieved: true, unlockTime: 1_700_000_000, valid: true },
          { apiName: "ACH_SECRET", achieved: false, unlockTime: 0, valid: true },
          { apiName: "ACH_COMPLETE", achieved: false, unlockTime: 0, valid: true },
        ];
      }
      return Array.from({ length: count }, (_, index) => ({
        apiName: `ACH_CAT_${index + 1}`,
        achieved: index === 0,
        unlockTime: index === 0 ? 1_700_000_000 : 0,
        valid: true,
      }));
    };
    const mockAchievements = () =>
      mockAchievementStates().map((state, index) => ({
        api_name: state.apiName,
        name:
          state.apiName === "ACH_START"
            ? "Begin"
            : state.apiName === "ACH_SECRET"
              ? "Secret route"
              : state.apiName === "ACH_COMPLETE"
                ? "Complete"
                : `Cat ${index + 1}`,
        description:
          state.apiName === "ACH_START"
            ? "Start the game."
            : state.apiName === "ACH_SECRET"
              ? "Find a hidden route."
              : state.apiName === "ACH_COMPLETE"
                ? "Finish the game."
                : "ok",
        achieved: state.achieved,
        unlock_time: state.unlockTime,
        icon: null,
        icon_gray: null,
      }));

    class MockNotification {
      static permission: NotificationPermission = "granted";
      title: string;
      body?: string;

      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        this.body = options?.body;
        notifications.push({ title, body: options?.body });
      }

      static requestPermission(): Promise<NotificationPermission> {
        MockNotification.permission = "granted";
        return Promise.resolve("granted");
      }
    }

    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });

    const tauriInternals = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case "plugin:log|log":
            return null;
          case "plugin:event|listen":
            return 1;
          case "plugin:event|unlisten":
            return null;
          case "plugin:notification|is_permission_granted":
            return true;
          case "plugin:dialog|confirm":
            return true;
          case "plugin:dialog|message":
            return "Ok";
          case "plugin:dialog|open": {
            const options = args?.options as { defaultPath?: string } | undefined;
            const backupPath =
              "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-before.json";
            window.localStorage.setItem(
              "repressurizer-last-dialog-default-path",
              String(options?.defaultPath ?? "")
            );
            return backupPath;
          }
          case "plugin:autostart|is_enabled":
            return autostartEnabled;
          case "plugin:autostart|enable":
            autostartEnabled = true;
            return null;
          case "plugin:autostart|disable":
            autostartEnabled = false;
            return null;
          case "get_startup_context":
            return { launchedFromAutostart: false, mainWindowCreated: true };
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
              categories: appId === 1145360 ? ["Single-player", "Steam Achievements"] : ["Single-player"],
              release_date: years[appId] ?? "Jan 4, 2008",
              metacritic_score: appId === 12100 ? 93 : null,
              developers: ["Demo Studio"],
              publishers: ["Demo Publisher"],
              supported_languages: ["English"],
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
            return window.localStorage.getItem("repressurizer-mock-details-cache");
          case "load_failed_cache":
          case "load_achievements_cache":
          case "load_friends_cache":
          case "load_wishlist_cache":
            return null;
          case "load_hltb_cache":
            return window.localStorage.getItem("repressurizer-mock-hltb-cache") ?? JSON.stringify({
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
          case "run_flags_categorizer": {
            const gameDetails = (args?.gameDetails ?? []) as Array<{
              app_id: number;
              categories?: string[];
            }>;
            const config = (args?.config ?? {}) as {
              prefix?: string;
              max_flags?: number;
              included_flags?: string[];
            };
            const included = new Set((config.included_flags ?? []).map((item) => item.toLowerCase()));
            const assignments: Record<string, number[]> = {};
            let gamesCategorized = 0;
            for (const detail of gameDetails) {
              let added = 0;
              for (const flag of detail.categories ?? []) {
                if (included.size > 0 && !included.has(flag.toLowerCase())) continue;
                if (config.max_flags && added >= config.max_flags) break;
                const name = `${config.prefix ?? ""}${flag}`;
                assignments[name] = [...(assignments[name] ?? []), detail.app_id];
                added += 1;
              }
              if (added > 0) gamesCategorized += 1;
            }
            return {
              assignments,
              games_processed: gameDetails.length,
              games_categorized: gamesCategorized,
            };
          }
          case "run_language_categorizer": {
            const gameDetails = (args?.gameDetails ?? []) as Array<{
              app_id: number;
              supported_languages?: string[];
            }>;
            const config = (args?.config ?? {}) as {
              prefix?: string;
              max_languages?: number;
              included_languages?: string[];
            };
            const included = new Set((config.included_languages ?? []).map((item) => item.toLowerCase()));
            const assignments: Record<string, number[]> = {};
            let gamesCategorized = 0;
            for (const detail of gameDetails) {
              let added = 0;
              for (const language of detail.supported_languages ?? []) {
                if (included.size > 0 && !included.has(language.toLowerCase())) continue;
                if (config.max_languages && added >= config.max_languages) break;
                const name = `${config.prefix ?? ""}${language}`;
                assignments[name] = [...(assignments[name] ?? []), detail.app_id];
                added += 1;
              }
              if (added > 0) gamesCategorized += 1;
            }
            return {
              assignments,
              games_processed: gameDetails.length,
              games_categorized: gamesCategorized,
            };
          }
          case "fetch_achievements":
            return {
              total: mockAchievements().length,
              achieved: mockAchievements().filter((achievement) => achievement.achieved).length,
              achievements: mockAchievements(),
            };
          case "fetch_achievements_summary":
            return [
              mockAchievementStates().length,
              mockAchievementStates().filter((achievement) => achievement.achieved).length,
            ];
          case "load_sam_achievement_schema":
            return mockAchievementStates().map((achievement) => ({
              apiName: achievement.apiName,
              permission: 0,
              protectedAchievement: false,
              flags: ["None"],
            }));
          case "probe_sam_bridge": {
            const currentSettings = readSettings();
            const ready =
              currentSettings.steamToolsEnabled &&
              currentSettings.steamToolsAchievementWritesEnabled;
            return {
              appId: Number(args?.appId ?? 0),
              platform: "windows",
              source: "Repressurizer SAM bridge",
              referenceSource: "Steam Achievement Manager architecture",
              sourceLicense: "zlib-compatible architecture reference",
              dataSource: "samLocalBridge",
              available: ready,
              readiness: ready ? "ready" : "steamNotRunning",
              bridgeInvoked: true,
              steamPathExists: true,
              steamRunning: ready,
              steamClientLibraryFound: true,
              steamClientLibraryPath: "C:\\\\Program Files (x86)\\\\Steam\\\\steamclient64.dll",
              localBridgeFound: true,
              localBridgePath: "C:\\\\Program Files\\\\Repressurizer\\\\Repressurizer.exe",
              writesSteam: ready,
              capabilities: [
                {
                  id: "webApiAchievements",
                  label: "Steam Web API achievement summaries",
                  status: "ready",
                  writesSteam: false,
                  reason: "Already used by Repressurizer for read-only achievement progress.",
                },
                {
                  id: "samProbe",
                  label: "SAM local preflight",
                  status: "ready",
                  writesSteam: false,
                  reason: "Checks Steam install, Steam client library, embedded bridge mode, and Steam process status.",
                },
                {
                  id: "samReadAchievements",
                  label: "SAM local achievement read",
                  status: ready ? "ready" : "blocked",
                  writesSteam: false,
                  reason: ready
                    ? "Steam client is available to the embedded bridge."
                    : "Requires the embedded bridge mode and running Steam before Repressurizer can read via Steamworks.",
                },
                {
                  id: "samWriteAchievements",
                  label: "SAM unlock / lock",
                  status: ready ? "ready" : "locked",
                  writesSteam: true,
                  reason: ready
                    ? "Achievement write actions are enabled and still require per-action confirmation."
                    : "Requires the local bridge plus advanced write settings and per-action confirmation.",
                },
              ],
              notes: ready
                ? ["Embedded Repressurizer SAM bridge was invoked."]
                : ["Steam does not appear to be running; SAM-style local reads require the Steam client and logged-in user."],
            };
          }
          case "sam_backup_dir":
            return "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360";
          case "list_sam_backups":
            return [
              {
                filename: "mock-after.json",
                path: "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-after.json",
                appId: Number(args?.appId ?? 0),
                action: "unlock_selected",
                phase: "after",
                capturedAt: "2026-06-20T12:00:01.000Z",
                achievementCount: mockAchievementStates().length,
                unlockedCount: mockAchievementStates().filter((achievement) => achievement.achieved).length,
                canRestoreUnlockTimes: false,
              },
              {
                filename: "mock-before.json",
                path: "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-before.json",
                appId: Number(args?.appId ?? 0),
                action: "unlock_selected",
                phase: "before",
                capturedAt: "2026-06-20T12:00:00.000Z",
                achievementCount: mockAchievementStates().length,
                unlockedCount: 1,
                canRestoreUnlockTimes: false,
              },
              {
                filename: "mock-lock-after.json",
                path: "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-lock-after.json",
                appId: Number(args?.appId ?? 0),
                action: "lock_selected",
                phase: "after",
                capturedAt: "2026-06-19T10:30:00.000Z",
                achievementCount: mockAchievementStates().length,
                unlockedCount: 0,
                canRestoreUnlockTimes: false,
              },
            ];
          case "open_sam_backup_dir":
            window.localStorage.setItem(
              "repressurizer-open-sam-backup-dir-app-id",
              String(args?.appId ?? 0)
            );
            return null;
          case "sam_achievement_action": {
            const delayMs = Number(window.localStorage.getItem("repressurizer-sam-action-delay-ms") ?? 0);
            if (delayMs > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, delayMs));
            }
            const input = args?.input as {
              appId?: number;
              action?: string;
              achievementIds?: string[];
              backupPath?: string | null;
            };
            const action = input?.action ?? "unlock";
            window.localStorage.setItem("repressurizer-last-sam-action", action);
            window.localStorage.setItem(
              "repressurizer-last-sam-backup-path",
              String(input?.backupPath ?? "")
            );
            const requested = new Set(input?.achievementIds ?? []);
            const after = mockAchievementStates().map((achievement) => {
              const targeted =
                action === "unlock_all" ||
                action === "lock_all" ||
                requested.has(achievement.apiName);
              if (!targeted) return achievement;
              const achieved =
                action === "unlock" ||
                action === "unlock_selected" ||
                action === "unlock_all";
              return {
                ...achievement,
                achieved,
                unlockTime: achieved ? 1_777_777_777 : 0,
              };
            });
            const changed = after.filter((achievement) => {
              const before = mockAchievementStates().find(
                (state) => state.apiName === achievement.apiName
              );
              return before?.achieved !== achievement.achieved;
            }).length;
            return {
              appId: Number(input?.appId ?? 0),
              action,
              changed,
              failed: [],
              diagnostics: [
                `action=${action}`,
                `target_count=${requested.size}`,
                "local_state_after_set=desired",
                "store_stats=true",
                "post_store_target_state=desired",
              ],
              beforeBackupPath: "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-before.json",
              afterBackupPath: "C:\\\\Users\\\\DemoUser\\\\AppData\\\\Roaming\\\\Repressurizer\\\\sam_backups\\\\1145360\\\\mock-after.json",
              before: {
                version: 1,
                appId: Number(input?.appId ?? 0),
                action,
                phase: "before",
                capturedAt: "2026-06-20T12:00:00.000Z",
                canRestoreUnlockTimes: false,
                note: "Mock backup. Steamworks cannot restore original unlock timestamps.",
                achievements: mockAchievementStates(),
              },
              after: {
                version: 1,
                appId: Number(input?.appId ?? 0),
                action,
                phase: "after",
                capturedAt: "2026-06-20T12:00:01.000Z",
                canRestoreUnlockTimes: false,
                note: "Mock backup. Steamworks cannot restore original unlock timestamps.",
                achievements: after,
              },
              storeStats: changed > 0,
              unlockTimesRestorable: false,
              message: "Mock achievement action stored.",
            };
          }
          default:
            return null;
        }
      },
      transformCallback: () => 1,
      unregisterCallback: () => null,
      convertFileSrc: (path: string) => path,
    };

    (window as unknown as { __TAURI_INTERNALS__: typeof tauriInternals }).__TAURI_INTERNALS__ = tauriInternals;
    (
      window as unknown as {
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => void };
      }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
  });
}
