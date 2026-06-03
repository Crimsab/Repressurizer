import { describe, expect, it } from "vitest";
import { getLocaleDisplayName, getLocaleFlag, normalizeLocale } from "./i18n";

describe("i18n locale metadata", () => {
  it("normalizes system locales to supported catalogs", () => {
    expect(normalizeLocale("de-DE")).toBe("de");
    expect(normalizeLocale("it-IT")).toBe("it");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("pt-BR")).toBe("en");
  });

  it("uses contributor-friendly language labels and flags", () => {
    expect(getLocaleDisplayName("zh-CN", "en")).toBe("Simplified Chinese");
    expect(getLocaleDisplayName("zh-CN", "zh-CN")).toBe("简体中文");
    expect(getLocaleFlag("zh-CN")).toBe("🇨🇳");
    expect(getLocaleFlag("de")).toBe("🇩🇪");
  });
});
