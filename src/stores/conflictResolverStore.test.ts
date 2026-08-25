import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));
import { useConflictResolverStore } from "./conflictResolverStore";

describe("conflictResolverStore", () => {
  beforeEach(() => useConflictResolverStore.setState({ version: 1, defaultPolicy: "ask", kindPolicies: {}, recentDecisions: [], hydrated: true }));
  it("stores similar-conflict policies and bounded recent decisions", () => {
    useConflictResolverStore.getState().setKindPolicy("name", "steam");
    expect(useConflictResolverStore.getState().kindPolicies.name).toBe("steam");
    useConflictResolverStore.getState().recordDecisions("merge-1", [{ identity: "key:a", kind: "name", choice: "steam" }]);
    expect(useConflictResolverStore.getState().recentDecisions[0]).toMatchObject({ mergeId: "merge-1", choice: "steam" });
  });
});
