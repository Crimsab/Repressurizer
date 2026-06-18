import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, AppTheme } from "../lib/types";

interface SettingsState extends AppSettings {
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
  showNowPlaying: true,
  showFilterBar: true,
  showDetailHltb: true,
  showDetailMetacritic: true,
  showDetailPrice: true,
  hltbConcurrency: 5,
  achievementsConcurrency: 5,
  currency: "EUR",
  onboardingComplete: false,
  categoryOrder: [],
  minimizeToTray: false,
  trayCloseChoiceMade: false,
  checkUpdatesOnStartup: true,
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
  includeSteamFamilyNonGames: false,
};

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem("repressurizer-settings");
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function saveToStorage(state: AppSettings) {
  try {
    localStorage.setItem("repressurizer-settings", JSON.stringify(state));
  } catch {}
  // Also persist to Tauri FS
  invoke("save_app_data", { key: "settings.json", data: JSON.stringify(state) }).catch(() => {});
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

export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadFromStorage(),
  setSettings: (settings) =>
    set((state) => {
      const next = { ...state, ...settings };
      saveToStorage(next);
      return next;
    }),
  reset: () => {
    saveToStorage(defaults);
    set(defaults);
  },
}));
