import { describe, expect, it } from "vitest";
import { createRepressurizerProfile, diffProfileSections, parseRepressurizerProfile, sanitizeProfileSettings, selectProfileSections } from "./repressurizerProfile";

describe("Repressurizer profile", () => {
  it("creates a verifiable manifest and detects corruption", () => {
    const profile = createRepressurizerProfile({ profileId: "p1", name: "Main", deviceId: "d1", steamAccountId: "s1", exportedAt: 10, sections: { diary: { entries: { 1: "next" } }, settings: { theme: "dark" } } });
    expect(parseRepressurizerProfile(profile).document?.manifest.includedSections).toEqual(["diary", "settings"]);
    const corrupted = structuredClone(profile); (corrupted.sections.diary as { entries: Record<number, string> }).entries[2] = "changed";
    expect(parseRepressurizerProfile(corrupted).error).toBe("checksum");
  });
  it("rejects future schemas and supports selective documents", () => {
    expect(parseRepressurizerProfile({ manifest: { schemaVersion: 99 }, sections: {} }).error).toBe("newer-schema");
    const profile = createRepressurizerProfile({ profileId: "p", name: "P", deviceId: "d", steamAccountId: null, sections: { diary: {}, settings: {}, history: {} } });
    expect(selectProfileSections(profile, new Set(["diary"]), 20).manifest.includedSections).toEqual(["diary"]);
  });
  it("never exports secrets, endpoints, or absolute Steam paths as settings", () => {
    expect(sanitizeProfileSettings({ theme: "dark", apiKey: "secret", steamPath: "C:\\Steam", automationPublishUrl: "https://private", proxySettings: { password: "x" } })).toEqual({ theme: "dark" });
  });
  it("builds a section-level import preview", () => {
    expect(diffProfileSections({ diary: { a: 1 }, settings: {} }, { diary: { a: 2 }, planner: [] }).filter((item) => item.status !== "unchanged").map((item) => item.section)).toEqual(["diary", "planner", "settings"]);
  });
});
