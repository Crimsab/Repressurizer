import { useSettingsStore } from "../stores/settingsStore";
import en from "./translations/en";
import it from "./translations/it";

export type TranslationKey = keyof typeof en;
export type Locale = "en" | "it";

const translations: Record<Locale, Record<string, string>> = { en, it };

/** Get a translated string by key. Supports {placeholder} substitution. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = useSettingsStore.getState().language ?? "en";
  let text = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

/** React hook for translations — triggers re-render on language change */
export function useT() {
  const locale = useSettingsStore((s) => s.language ?? "en");
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[locale]?.[key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
