import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, AppTheme, ProxyProfile, ProxyRotationMode, ProxyType } from "../lib/types";

interface SettingsState extends AppSettings {
  hydrateFromDisk: () => Promise<void>;
  setSettings: (settings: Partial<AppSettings>) => void;
  reset: () => void;
}

function detectSystemLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.languages?.[0] ?? navigator.language ?? "en";
}

const defaults: AppSettings = {
  steamPath: "",
  steamId3: "",
  steamId64: "",
  steamPersonaName: "",
  apiKey: "",
  setupComplete: false,
  showDynamicCategories: false,
  pinFavorites: true,
  accentColor: "",
  recentAccentColors: [],
  sidebarWidth: 224,
  theme: "dark",
  language: detectSystemLanguage(),
  showSmartLists: true,
  showEmptyLists: false,
  showNowPlaying: true,
  showFilterBar: true,
  showDetailHltb: true,
  showDetailMetacritic: true,
  showDetailPrice: true,
  hltbConcurrency: 5,
  achievementsConcurrency: 5,
  steamDetailsDelayMs: 1200,
  steamRatingsDelayMs: 1200,
  steamRatingsCooldownMinutes: 5,
  hltbBatchDelayMs: 500,
  achievementsBatchDelayMs: 300,
  autoFetchDetailsOnRefresh: true,
  autoFetchHltbOnRefresh: true,
  proxySettings: {
    enabled: false,
    mode: "roundRobin",
    activeProfileId: "",
    scopes: {
      steamApi: true,
      steamStore: true,
      hltb: true,
      automation: false,
    },
    profiles: [],
  },
  steamToolsEnabled: false,
  steamToolsAchievementWritesEnabled: false,
  steamToolsCardFarmingEnabled: false,
  steamToolsMaxConcurrentIdleApps: 8,
  steamToolsMinPlaytimeMinutes: 180,
  currency: "EUR",
  onboardingComplete: false,
  categoryOrder: [],
  minimizeToTray: false,
  trayCloseChoiceMade: false,
  startOnLogin: false,
  startOnLoginMode: "tray",
  desktopNotifications: true,
  checkUpdatesOnStartup: true,
  updateAutoCheckIntervalHours: 12,
  autoRefreshLibraryEnabled: false,
  libraryAutoRefreshIntervalMinutes: 30,
  automationPublishEnabled: false,
  automationPublishUrl: "",
  automationPublishBearerToken: "",
  automationPublishIntervalHours: 24,
  automationPublishLastChecksum: "",
  automationPublishLastPublishedAt: "",
  automationPublishLastAttemptedAt: "",
  automationPublishLastStatus: "",
  automationPublishLastMessage: "",
  automationPublishLastHttpStatus: 0,
  automationPublishLogs: [],
  includeSteamFamilyNonGames: false,
};

const PROXY_TYPES: ProxyType[] = ["http", "https", "socks5"];
const PROXY_MODES: ProxyRotationMode[] = ["fixed", "roundRobin", "batch", "random"];

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeProxyProfile(raw: Partial<ProxyProfile>, index: number): ProxyProfile {
  const type = PROXY_TYPES.includes(raw.type as ProxyType) ? raw.type as ProxyType : "http";
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `proxy-${index + 1}`,
    name: typeof raw.name === "string" ? raw.name : `Proxy ${index + 1}`,
    type,
    host: typeof raw.host === "string" ? raw.host : "",
    port: clampInteger(raw.port, 8080, 1, 65535),
    username: typeof raw.username === "string" ? raw.username : "",
    password: typeof raw.password === "string" ? raw.password : "",
    enabled: raw.enabled !== false,
    batchSize: clampInteger(raw.batchSize, 1, 1, 100),
    lastTestStatus: raw.lastTestStatus === "ok" || raw.lastTestStatus === "failed" ? raw.lastTestStatus : "",
    lastTestMessage: typeof raw.lastTestMessage === "string" ? raw.lastTestMessage : "",
    lastTestLatencyMs: clampInteger(raw.lastTestLatencyMs, 0, 0, Number.MAX_SAFE_INTEGER),
    lastTestAt: clampInteger(raw.lastTestAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem("repressurizer-settings");
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch {}
  return defaults;
}

function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const proxySettings = raw.proxySettings ?? defaults.proxySettings;
  const proxyMode = PROXY_MODES.includes(proxySettings.mode as ProxyRotationMode)
    ? proxySettings.mode as ProxyRotationMode
    : defaults.proxySettings.mode;

  return {
    ...defaults,
    ...raw,
    steamDetailsDelayMs: clampInteger(raw.steamDetailsDelayMs, defaults.steamDetailsDelayMs, 100, 30_000),
    steamRatingsDelayMs: clampInteger(raw.steamRatingsDelayMs, defaults.steamRatingsDelayMs, 100, 30_000),
    steamRatingsCooldownMinutes: clampInteger(raw.steamRatingsCooldownMinutes, defaults.steamRatingsCooldownMinutes, 1, 60),
    hltbBatchDelayMs: clampInteger(raw.hltbBatchDelayMs, defaults.hltbBatchDelayMs, 100, 30_000),
    achievementsBatchDelayMs: clampInteger(raw.achievementsBatchDelayMs, defaults.achievementsBatchDelayMs, 100, 30_000),
    proxySettings: {
      ...defaults.proxySettings,
      ...proxySettings,
      mode: proxyMode,
      scopes: {
        ...defaults.proxySettings.scopes,
        ...(proxySettings.scopes ?? {}),
      },
      profiles: (proxySettings.profiles ?? []).map(normalizeProxyProfile),
    },
  };
}

function syncHttpPolicy(proxySettings: AppSettings["proxySettings"]) {
  try {
    invoke("configure_http_policy", { settings: proxySettings }).catch((error) => {
      console.warn("[Settings] Failed to configure HTTP policy:", error);
    });
  } catch (error) {
    console.warn("[Settings] Failed to configure HTTP policy:", error);
  }
}

function saveToStorage(state: AppSettings) {
  try {
    localStorage.setItem("repressurizer-settings", JSON.stringify(state));
  } catch {}
  // Also persist to Tauri FS
  invoke("save_app_data", { key: "settings.json", data: JSON.stringify(state) }).catch(() => {});
  syncHttpPolicy(state.proxySettings);
}

// Preset accent palettes — each has main, hover, muted
export const ACCENT_PRESETS = [
  { id: "emerald", label: "Emerald", accent: "#10b981", hover: "#34d399", muted: "#065f46" },
  { id: "blue",    label: "Blue",    accent: "#3b82f6", hover: "#60a5fa", muted: "#1e3a5f" },
  { id: "purple",  label: "Purple",  accent: "#8b5cf6", hover: "#a78bfa", muted: "#3b0764" },
  { id: "rose",    label: "Rose",    accent: "#f43f5e", hover: "#fb7185", muted: "#4c0519" },
  { id: "orange",  label: "Orange",  accent: "#f97316", hover: "#fb923c", muted: "#431407" },
  { id: "cyan",    label: "Cyan",    accent: "#06b6d4", hover: "#22d3ee", muted: "#083344" },
  { id: "yellow",  label: "Yellow",  accent: "#eab308", hover: "#facc15", muted: "#422006" },
] as const;

/** Apply an accent hex color to CSS custom properties at runtime */
export function applyAccentColor(hex: string) {
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty("--color-repressurizer-accent");
    root.style.removeProperty("--color-repressurizer-accent-hover");
    root.style.removeProperty("--color-repressurizer-accent-muted");
    return;
  }
  const preset = ACCENT_PRESETS.find((p) => p.accent === hex);
  if (preset) {
    root.style.setProperty("--color-repressurizer-accent", preset.accent);
    root.style.setProperty("--color-repressurizer-accent-hover", preset.hover);
    root.style.setProperty("--color-repressurizer-accent-muted", preset.muted);
  } else {
    root.style.setProperty("--color-repressurizer-accent", hex);
    root.style.setProperty("--color-repressurizer-accent-hover", lightenHex(hex, 0.2));
    root.style.setProperty("--color-repressurizer-accent-muted", darkenHex(hex, 0.6));
  }
}

/** Apply theme class to document root */
export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.classList.remove("theme-dark", "theme-dim", "theme-light");
  root.classList.add(`theme-${theme}`);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

const initialSettings = loadFromStorage();

export const useSettingsStore = create<SettingsState>((set) => ({
  ...initialSettings,
  hydrateFromDisk: async () => {
    try {
      const raw = await invoke<string | null>("load_app_data", { key: "settings.json" });
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      set((state) => {
        const next = normalizeSettings({ ...state, ...parsed });
        saveToStorage(next);
        return next;
      });
    } catch {
      // Disk settings are a best-effort sync source for native background updates.
    }
  },
  setSettings: (settings) =>
    set((state) => {
      const next = normalizeSettings({ ...state, ...settings });
      saveToStorage(next);
      return next;
    }),
  reset: () => {
    saveToStorage(defaults);
    set(defaults);
  },
}));

syncHttpPolicy(initialSettings.proxySettings);
