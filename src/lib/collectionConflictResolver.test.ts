import { describe, expect, it } from "vitest";
import { analyzeThreeWayCollectionMerge, resolveThreeWayCollectionMerge } from "./collectionConflictResolver";
import type { SteamCollection } from "./types";

const collection = (key: string, name: string, added: number[], extra: Record<string, unknown> = {}): SteamCollection => ({ id: key, key, name, added, removed: [], timestamp: 1, is_deleted: false, is_dynamic: false, ...extra } as SteamCollection);

describe("collection three-way merge", () => {
  it("automatically combines independent changes", () => {
    const base = [collection("a", "A", [1]), collection("b", "B", [2])];
    const steam = [collection("a", "A", [1, 3]), collection("b", "B", [2])];
    const proposed = [collection("a", "A", [1]), collection("b", "Renamed", [2])];
    const result = analyzeThreeWayCollectionMerge({ base, steam, proposed });
    expect(result.conflicts).toHaveLength(0);
    expect(result.autoMerged.find((item) => item.key === "a")?.added).toContain(3);
    expect(result.autoMerged.find((item) => item.key === "b")?.name).toBe("Renamed");
  });

  it("does not treat timestamps alone as concurrent edits", () => {
    const base = [collection("a", "A", [1])];
    const steam = [{ ...collection("a", "A", [1]), timestamp: 999 }];
    expect(analyzeThreeWayCollectionMerge({ base, steam, proposed: base }).steamChanged).toBe(false);
  });

  it("detects rename and delete-versus-modify conflicts by stable identity", () => {
    const base = [collection("a", "Original", [1]), collection("b", "B", [2])];
    const steam = [collection("a", "Steam name", [1])];
    const proposed = [collection("a", "Local name", [1]), collection("b", "B", [2, 3])];
    const result = analyzeThreeWayCollectionMerge({ base, steam, proposed });
    expect(result.conflicts.map((item) => item.kind)).toEqual(expect.arrayContaining(["name", "deletion"]));
  });

  it("requires explicit choices and resolves Steam, app, merge, and manual values", () => {
    const base = [collection("a", "Original", [1], { future: { base: true } })];
    const steam = [collection("a", "Steam", [1], { future: { steam: true } })];
    const proposed = [collection("a", "Local", [1], { future: { local: true } })];
    const analysis = analyzeThreeWayCollectionMerge({ base, steam, proposed });
    expect(() => resolveThreeWayCollectionMerge(analysis, {})).toThrow(/Unresolved/);
    const resolutions = Object.fromEntries(analysis.conflicts.map((item) => [item.id, item.kind === "name" ? { choice: "manual" as const, manualValue: "Chosen" } : { choice: "merge" as const }]));
    const resolved = resolveThreeWayCollectionMerge(analysis, resolutions);
    expect(resolved[0].name).toBe("Chosen");
    expect((resolved[0] as SteamCollection & { future: Record<string, boolean> }).future).toEqual({ steam: true, local: true });
  });
});
