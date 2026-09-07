import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("@tauri-apps/api/core"); vi.resetModules(); });

describe("history initialization", () => {
  for (const target of ["timeline", "conflicts"] as const) {
    it(`${target} shares pending reads, defers writes and retries read failures without losing old data`, async () => {
      vi.resetModules();
      const key = target === "timeline" ? "collection-time-machine.json" : "conflict-resolver.json";
      const oldDecision = { id: "old", decidedAt: 1, mergeId: "old-merge", identity: "a", kind: "name", choice: "steam" };
      const disk = target === "timeline"
        ? { version: 1, retention: "all", snapshots: [], events: [], pinnedSnapshotIds: [] }
        : { version: 1, defaultPolicy: "steam", kindPolicies: {}, recentDecisions: [oldDecision] };
      let reject!: (error: Error) => void;
      const delayed = new Promise<string>((_resolve, fail) => { reject = fail; });
      const read = vi.fn().mockReturnValueOnce(delayed).mockResolvedValue(JSON.stringify(disk));
      const write = vi.fn();
      vi.doMock("@tauri-apps/api/core", () => ({ invoke: async (command: string, args?: { key: string; data: string }) => {
        if (command === "load_app_data") return args!.key === key ? read() : null;
        if (command === "save_app_data" && args!.key === key) write(JSON.parse(args!.data));
        return null;
      } }));
      const { useCollectionTimeMachineStore: time } = await import("./collectionTimeMachineStore");
      const { useConflictResolverStore: conflict } = await import("./conflictResolverStore");
      const store = target === "timeline" ? time : conflict;
      if (target === "timeline") time.getState().setRetention("30-days");
      else conflict.getState().setKindPolicy("name", "repressurizer");
      const first = store.getState().hydrate();
      const second = store.getState().hydrate();
      expect(first).toBe(second);
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      expect(write).not.toHaveBeenCalled();
      reject(new Error("disk temporarily unavailable"));
      await first;
      expect(store.getState().hydrated).toBe(false);
      expect(write).not.toHaveBeenCalled();
      await store.getState().hydrate();
      expect(store.getState().hydrated).toBe(true);
      expect(read).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenCalledTimes(1);
      if (target === "timeline") expect(time.getState().retention).toBe("30-days");
      else {
        expect(conflict.getState().defaultPolicy).toBe("steam");
        expect(conflict.getState().kindPolicies.name).toBe("repressurizer");
        expect(conflict.getState().recentDecisions).toEqual([oldDecision]);
        expect(conflict.getState().importDecisions([oldDecision, oldDecision])).toBe(0);
      }
      await store.getState().hydrate();
      expect(read).toHaveBeenCalledTimes(2);
    });
  }
});
