import { loadAppData, saveAppData } from "./tauri";

const STORAGE_KEY = "steam_family_token.json";
export const STEAM_FAMILY_TOKEN_REFRESH_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

export interface SteamFamilyTokenCache {
  accessToken: string;
  savedAt: number;
  lastValidatedAt: number | null;
}

function normalizeToken(value: string): string {
  return value.trim().replace(/^"|"$/g, "").trim();
}

export function extractStoreWebApiToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    const token =
      parsed?.data?.webapi_token ??
      parsed?.webapi_token ??
      parsed?.token ??
      "";
    if (typeof token === "string") return normalizeToken(token);
  } catch {}

  const match = trimmed.match(/"webapi_token"\s*:\s*"([^"]+)"/);
  if (match?.[1]) return normalizeToken(match[1]);

  return normalizeToken(trimmed);
}

/**
 * Clipboard import is intentionally stricter than the manual field: it accepts
 * only a Steam JSON response that names webapi_token. This prevents an
 * unrelated clipboard secret from being treated as a token.
 */
export function extractStoreWebApiTokenFromClipboard(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    const token = parsed?.data?.webapi_token ?? parsed?.webapi_token ?? "";
    return typeof token === "string" ? normalizeToken(token) : "";
  } catch {
    const match = trimmed.match(/"webapi_token"\s*:\s*"([^"]+)"/);
    return match?.[1] ? normalizeToken(match[1]) : "";
  }
}

export function isSteamFamilyTokenRefreshRecommended(
  cache: Pick<SteamFamilyTokenCache, "savedAt" | "lastValidatedAt">,
  now = Date.now()
): boolean {
  const referenceTime = cache.lastValidatedAt ?? cache.savedAt;
  return (
    !Number.isFinite(referenceTime) ||
    referenceTime <= 0 ||
    now - referenceTime >= STEAM_FAMILY_TOKEN_REFRESH_REMINDER_MS
  );
}

export async function loadSteamFamilyToken(): Promise<SteamFamilyTokenCache | null> {
  const raw = await loadAppData(STORAGE_KEY);
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw);
    const accessToken = extractStoreWebApiToken(String(parsed.accessToken ?? ""));
    if (!accessToken) return null;
    return {
      accessToken,
      savedAt: Number(parsed.savedAt ?? Date.now()),
      lastValidatedAt:
        parsed.lastValidatedAt == null ? null : Number(parsed.lastValidatedAt),
    };
  } catch {
    const accessToken = extractStoreWebApiToken(raw);
    return accessToken
      ? { accessToken, savedAt: Date.now(), lastValidatedAt: null }
      : null;
  }
}

export async function saveSteamFamilyToken(
  accessToken: string,
  validated: boolean
): Promise<SteamFamilyTokenCache | null> {
  const token = extractStoreWebApiToken(accessToken);
  if (!token) return null;

  const now = Date.now();
  const cache: SteamFamilyTokenCache = {
    accessToken: token,
    savedAt: now,
    lastValidatedAt: validated ? now : null,
  };
  await saveAppData(STORAGE_KEY, JSON.stringify(cache));
  return cache;
}

export async function clearSteamFamilyToken(): Promise<void> {
  await saveAppData(STORAGE_KEY, "");
}
