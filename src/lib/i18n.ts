import { useSettingsStore } from "../stores/settingsStore";
import en from "./translations/en.json";

export type TranslationKey = keyof typeof en;
export type Locale = string;
export type TranslationCatalog = Record<TranslationKey, string>;

const modules = import.meta.glob("./translations/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, string>>;

const catalogs = Object.fromEntries(
  Object.entries(modules)
    .map(([path, catalog]) => {
      const locale = path.match(/\/([^/]+)\.json$/)?.[1];
      return locale ? [locale, catalog] : null;
    })
    .filter((entry): entry is [string, Record<string, string>] => entry !== null)
) as Record<Locale, Partial<TranslationCatalog>>;

export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = Object.keys(catalogs).sort((a, b) => {
  if (a === DEFAULT_LOCALE) return -1;
  if (b === DEFAULT_LOCALE) return 1;
  return a.localeCompare(b);
});

export function isSupportedLocale(locale: string | null | undefined): locale is Locale {
  return !!locale && Object.prototype.hasOwnProperty.call(catalogs, locale);
}

export function normalizeLocale(locale: string | null | undefined): Locale {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocaleDisplayName(locale: Locale, displayLocale: Locale = locale): string {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
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
  return translate(locale, key, params);
}

/** React hook for translations — triggers re-render on language change */
export function useT() {
  const locale = useSettingsStore((s) => normalizeLocale(s.language));
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    return translate(locale, key, params);
  };
}
