import { beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));
import { BUILTIN_COMMUNITY_PACKS, createCommunityRulePack } from "../lib/communityRulePack";
import { useAutoCategorizeStore } from "./autoCategorizeStore";
import { useCommunityRulePackStore } from "./communityRulePackStore";

describe("community rule pack store", () => {
  beforeEach(() => { useAutoCategorizeStore.setState({ presets: [] }); useCommunityRulePackStore.setState({ installed: [], imported: [], hydrated: true }); });
  test("installs without applying collections and preserves modified local rules on update", () => {
    const original = BUILTIN_COMMUNITY_PACKS[1]; useCommunityRulePackStore.getState().install(original);
    expect(useAutoCategorizeStore.getState().presets).toHaveLength(1); expect(useAutoCategorizeStore.getState().presets[0].communityPack?.packId).toBe(original.id);
    useAutoCategorizeStore.setState((state) => ({ presets: state.presets.map((preset) => ({ ...preset, config: { ...(preset.config as any), output: { categoryName: "My local name" } } })) }));
    const updated = createCommunityRulePack({ ...original, version: "1.1.0", rules: original.rules.map((rule) => ({ ...rule, name: "Updated rule" })) });
    useCommunityRulePackStore.getState().install(updated);
    expect((useAutoCategorizeStore.getState().presets[0].config as any).output.categoryName).toBe("My local name"); expect(useCommunityRulePackStore.getState().installed[0].skippedModifiedRuleIds).toEqual(["never-played"]);
    useCommunityRulePackStore.getState().detach(original.id, "never-played"); expect(useAutoCategorizeStore.getState().presets[0].communityPack).toBeUndefined();
  });
  test("disables linked presets and can restore them", () => { const pack = BUILTIN_COMMUNITY_PACKS[0]; useCommunityRulePackStore.getState().install(pack); useCommunityRulePackStore.getState().disable(pack.id); expect(useAutoCategorizeStore.getState().presets).toHaveLength(0); useCommunityRulePackStore.getState().enable(pack.id); expect(useAutoCategorizeStore.getState().presets).toHaveLength(2); });
});
