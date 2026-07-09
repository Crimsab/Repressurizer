import { useEffect, useState } from "react";
import type { ClipboardEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { familyAppsToOwnedGames } from "../../lib/familyLibrary";
import { useT } from "../../lib/i18n";
import {
  clearSteamFamilyToken,
  extractStoreWebApiToken,
  loadSteamFamilyToken,
  saveSteamFamilyToken,
  type SteamFamilyTokenCache,
} from "../../lib/steamFamilyToken";
import { fetchFamilyLibrary, type FamilyLibraryResult } from "../../lib/tauri";
import { useFamilyStore } from "../../stores/familyStore";
import { useGameStore } from "../../stores/gameStore";
import { useSettingsStore } from "../../stores/settingsStore";

type SetTransientMessage = (message: string, ttlMs?: number) => void;

export interface SteamFamilySettingsController {
  accessToken: string;
  setAccessToken: (value: string) => void;
  tokenSavedAt: number | null;
  tokenValidatedAt: number | null;
  checking: boolean;
  result: FamilyLibraryResult | null;
  lastFetched: number | null;
  hasStoreToken: boolean;
  hasWebApiKey: boolean;
  includeNonGames: boolean;
  setIncludeNonGames: (value: boolean) => void;
  handleTokenPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  openTokenPage: () => Promise<void>;
  saveToken: () => Promise<void>;
  clearToken: () => Promise<void>;
  probe: () => Promise<void>;
}

function redactTail(value: string | null | undefined): string | null {
  if (!value) return null;
  return `***${value.slice(-4)}`;
}

export function useSteamFamilySettings(
  setMessage: SetTransientMessage
): SteamFamilySettingsController {
  const t = useT();
  const apiKey = useSettingsStore((state) => state.apiKey);
  const steamId64 = useSettingsStore((state) => state.steamId64);
  const includeNonGames = useSettingsStore(
    (state) => state.includeSteamFamilyNonGames ?? false
  );
  const setSettings = useSettingsStore((state) => state.setSettings);
  const mergeGames = useGameStore((state) => state.mergeGames);
  const lastFetched = useFamilyStore((state) => state.lastFetched);
  const [accessToken, setAccessToken] = useState("");
  const [tokenSavedAt, setTokenSavedAt] = useState<number | null>(null);
  const [tokenValidatedAt, setTokenValidatedAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FamilyLibraryResult | null>(null);

  const applyTokenCache = (cache: SteamFamilyTokenCache) => {
    setAccessToken(cache.accessToken);
    setTokenSavedAt(cache.savedAt);
    setTokenValidatedAt(cache.lastValidatedAt);
  };

  useEffect(() => {
    let cancelled = false;
    loadSteamFamilyToken()
      .then((cache) => {
        if (cancelled || !cache) return;
        setAccessToken(cache.accessToken);
        setTokenSavedAt(cache.savedAt);
        setTokenValidatedAt(cache.lastValidatedAt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTokenPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const token = extractStoreWebApiToken(pasted);
    if (token && token !== pasted.trim()) {
      event.preventDefault();
      setAccessToken(token);
      setMessage(t("settings.family.tokenExtracted"), 2000);
    }
  };

  const saveToken = async () => {
    const token = extractStoreWebApiToken(accessToken);
    if (!token) {
      setMessage(t("settings.family.tokenRequired"));
      return;
    }
    setAccessToken(token);
    try {
      const cache = await saveSteamFamilyToken(token, false);
      if (cache) {
        applyTokenCache(cache);
        setMessage(t("settings.family.tokenSaved"), 2000);
      }
    } catch (error) {
      setMessage(String(error));
    }
  };

  const clearToken = async () => {
    try {
      await clearSteamFamilyToken();
      setAccessToken("");
      setTokenSavedAt(null);
      setTokenValidatedAt(null);
      setMessage(t("settings.family.tokenCleared"), 2000);
    } catch (error) {
      setMessage(String(error));
    }
  };

  const openTokenPage = async () => {
    try {
      await open("https://store.steampowered.com/pointssummary/ajaxgetasyncconfig");
      setMessage(t("settings.family.tokenPageOpened"), 2000);
    } catch (error) {
      setMessage(t("settings.family.tokenPageFailed", { error: String(error) }));
    }
  };

  const probe = async () => {
    setChecking(true);
    setResult(null);
    setMessage("");
    const normalizedAccessToken = extractStoreWebApiToken(accessToken);
    if (normalizedAccessToken && normalizedAccessToken !== accessToken) {
      setAccessToken(normalizedAccessToken);
    }
    const startedAt = performance.now();
    console.groupCollapsed("[Repressurizer] Steam Family probe");
    console.info("Starting Steam Family probe", {
      hasSavedWebApiKey: Boolean(apiKey),
      hasStoreWebApiToken: Boolean(normalizedAccessToken),
      includeNonGames,
      steamId64: redactTail(steamId64),
    });
    try {
      if (normalizedAccessToken) {
        const cache = await saveSteamFamilyToken(normalizedAccessToken, false);
        if (cache) applyTokenCache(cache);
      }

      const familyResult = await fetchFamilyLibrary(
        apiKey,
        normalizedAccessToken || undefined,
        steamId64 || undefined,
        includeNonGames
      );
      console.info("Steam Family probe result", {
        authUsed: familyResult.auth_used,
        familyGroupId: redactTail(familyResult.family_groupid),
        ownerSteamId: redactTail(familyResult.owner_steamid),
        totalApps: familyResult.total_apps,
        ownedApps: familyResult.owned_apps,
        sharedApps: familyResult.shared_apps,
        excludedApps: familyResult.excluded_apps,
        nonGameApps: familyResult.non_game_apps,
        playtimeEntries: familyResult.playtime_entries,
        playtimeUnavailable: Boolean(familyResult.playtime_unavailable_reason),
        durationMs: Math.round(performance.now() - startedAt),
      });
      setResult(familyResult);
      useFamilyStore.getState().setResult(familyResult);
      mergeGames(familyAppsToOwnedGames(familyResult.apps));
      if (familyResult.auth_used === "access_token" && normalizedAccessToken) {
        const cache = await saveSteamFamilyToken(normalizedAccessToken, true);
        if (cache) applyTokenCache(cache);
      }
      setMessage(t("settings.family.loaded", { auth: familyResult.auth_used }));
    } catch (error) {
      console.error("Steam Family probe failed", {
        error: String(error),
        durationMs: Math.round(performance.now() - startedAt),
      });
      const tokenHint = normalizedAccessToken ? t("settings.family.expiredHint") : "";
      setMessage(t("settings.family.failed", { error: String(error), hint: tokenHint }));
    } finally {
      console.groupEnd();
      setChecking(false);
    }
  };

  return {
    accessToken,
    setAccessToken,
    tokenSavedAt,
    tokenValidatedAt,
    checking,
    result,
    lastFetched,
    hasStoreToken: Boolean(extractStoreWebApiToken(accessToken)),
    hasWebApiKey: Boolean(apiKey),
    includeNonGames,
    setIncludeNonGames: (value) => setSettings({ includeSteamFamilyNonGames: value }),
    handleTokenPaste,
    openTokenPage,
    saveToken,
    clearToken,
    probe,
  };
}
