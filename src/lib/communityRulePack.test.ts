import { describe, expect, test } from "vitest";
import { BUILTIN_COMMUNITY_PACKS, createCommunityRulePack, parseCommunityRulePack, safeCommunityRegex } from "./communityRulePack";
describe("community rule packs", () => {
  test("validates signed declarative packs", () => { expect(parseCommunityRulePack(BUILTIN_COMMUNITY_PACKS[0]).pack?.rules).toHaveLength(2); const corrupted = { ...BUILTIN_COMMUNITY_PACKS[0], author: "Other" }; expect(parseCommunityRulePack(corrupted).error).toBe("Checksum mismatch"); });
  test("rejects executable keys and expensive regex", () => { expect(safeCommunityRegex("(a+)+$")).toBe(false); const pack = createCommunityRulePack({ id: "bad", name: "Bad", description: "", author: "x", version: "1.0.0", compatibleApp: ">=0.8.0", dataSources: [], collections: ["x"], rules: [{ id: "r", name: "r", config: { schema: "repressurizer.customAutoCat", version: 1, output: { categoryName: "x" }, logic: { op: "all", conditions: [{ id: "t", kind: "title", op: "contains", value: "x" }] } } }], changelog: [] }); expect(parseCommunityRulePack({ ...pack, script: "alert(1)" }).pack).toBeNull(); });
});
