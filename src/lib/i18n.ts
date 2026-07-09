import { useSettingsStore } from "../stores/settingsStore";
import en from "./translations/en.json";
import { useEffect, useSyncExternalStore } from "react";

export type TranslationKey = keyof typeof en;
export type Locale = string;
export type TranslationCatalog = Record<TranslationKey, string>;

const modules = import.meta.glob(["./translations/*.json", "!./translations/en.json"], {
  import: "default",
}) as Record<string, () => Promise<Record<string, string>>>;

const catalogs: Record<Locale, Partial<TranslationCatalog>> = { en };
const pendingCatalogs = new Map<Locale, Promise<void>>();
const catalogListeners = new Set<() => void>();
let catalogVersion = 0;

export const DEFAULT_LOCALE = "en";

const LOCALE_LABELS: Record<string, { flag: string; nativeName: string; englishName: string }> = {
  de: { flag: "🇩🇪", nativeName: "Deutsch", englishName: "German" },
  en: { flag: "🇺🇸", nativeName: "English", englishName: "English" },
  es: { flag: "🇪🇸", nativeName: "Español", englishName: "Spanish" },
  fr: { flag: "🇫🇷", nativeName: "Français", englishName: "French" },
  it: { flag: "🇮🇹", nativeName: "Italiano", englishName: "Italian" },
  pl: { flag: "🇵🇱", nativeName: "Polski", englishName: "Polish" },
  tr: { flag: "🇹🇷", nativeName: "Türkçe", englishName: "Turkish" },
  "zh-CN": { flag: "🇨🇳", nativeName: "简体中文", englishName: "Simplified Chinese" },
};

export const SUPPORTED_LOCALES = Object.keys(LOCALE_LABELS).sort((a, b) => {
  if (a === DEFAULT_LOCALE) return -1;
  if (b === DEFAULT_LOCALE) return 1;
  return a.localeCompare(b);
});

function subscribeCatalogs(listener: () => void) {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

function ensureCatalog(locale: Locale): Promise<void> {
  if (catalogs[locale]) return Promise.resolve();
  const pending = pendingCatalogs.get(locale);
  if (pending) return pending;

  const loader = modules[`./translations/${locale}.json`];
  if (!loader) return Promise.resolve();
  const request = loader()
    .then((catalog) => {
      catalogs[locale] = catalog;
      catalogVersion += 1;
      for (const listener of catalogListeners) listener();
    })
    .catch(() => {
      // English remains available if a locale chunk cannot be loaded.
    })
    .finally(() => pendingCatalogs.delete(locale));
  pendingCatalogs.set(locale, request);
  return request;
}

export function isSupportedLocale(locale: string | null | undefined): boolean {
  return !!locale && Object.prototype.hasOwnProperty.call(LOCALE_LABELS, locale);
}

export function normalizeLocale(locale: string | null | undefined): Locale {
  if (!locale) return DEFAULT_LOCALE;
  if (isSupportedLocale(locale)) return locale;

  let canonical = locale;
  try {
    canonical = Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {}
  if (isSupportedLocale(canonical)) return canonical;

  if (/^zh(?:-(cn|hans|sg))?/i.test(canonical)) return isSupportedLocale("zh-CN") ? "zh-CN" : DEFAULT_LOCALE;

  const base = canonical.split("-")[0];
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE;
}

export function getLocaleDisplayName(locale: Locale, displayLocale: Locale = locale): string {
  const known = LOCALE_LABELS[locale];
  if (known) return displayLocale === "en" ? known.englishName : known.nativeName;
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export function getLocaleFlag(locale: Locale): string {
  return LOCALE_LABELS[locale]?.flag ?? "🌐";
}

function translate(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  let text = catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE]?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** Get a translated string by key. Supports {placeholder} substitution. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = normalizeLocale(useSettingsStore.getState().language);
  void ensureCatalog(locale);
  return translate(locale, key, params);
}

/** React hook for translations — triggers re-render on language change */
export function useT() {
  const locale = useSettingsStore((s) => normalizeLocale(s.language));
  useSyncExternalStore(subscribeCatalogs, () => catalogVersion, () => catalogVersion);
  useEffect(() => {
    void ensureCatalog(locale);
  }, [locale]);
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    return translate(locale, key, params);
  };
}
