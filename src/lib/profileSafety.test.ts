import { describe, expect, it, vi } from "vitest";
import { createRepressurizerProfile, parseRepressurizerProfile } from "./repressurizerProfile";
import { prepareProfileApplication } from "./profileApplication";
import { isBoundedProfileData } from "./profileValidation";
import { enqueuePersistence, flushPersistence, withPersistenceTransaction } from "./persistenceQueue";

const profile = (sections: Parameters<typeof createRepressurizerProfile>[0]["sections"]) =>
  createRepressurizerProfile({ profileId: "p", name: "Profile", deviceId: "d", steamAccountId: null, sections });

describe("profile preflight and persistence staging", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid app ID %s with a valid checksum", (id) => {
    expect(parseRepressurizerProfile(profile({ collections: [{ key: "c", name: "C", added: [id] }] })).error).toBe("invalid");
  });
  it("rejects duplicate collection identities", () => {
    expect(parseRepressurizerProfile(profile({ collections: [
      { key: "c", name: "C", added: [1] }, { key: "c", name: "Other", added: [2] },
    ] })).error).toBe("invalid");
  });
  it("rejects invalid preference values before mutating stores", () => {
    expect(() => prepareProfileApplication(profile({ preferences: { tags: { 1: "not-an-array" } } }),
      new Set(["preferences"]), { preferences: { tags: {} } })).toThrow("Invalid profile");
  });
  it("preflights all selected sections, including a later invalid diary entry", () => {
    expect(() => prepareProfileApplication(profile({ settings: { theme: "dark" }, diary: { entries: { 1: "bad" } } }),
      new Set(["settings", "diary"]), { settings: { theme: "light" }, diary: { entries: {} } })).toThrow("Invalid diary entry");
  });
  it("does not import unknown store methods or settings", () => {
    const prepared = prepareProfileApplication(profile({ settings: { theme: "dark", hydrate: "bad", apiKey: "secret" } }),
      new Set(["settings"]), { settings: { theme: "light" } });
    expect(prepared).toEqual({ settings: { theme: "dark" } });
  });
  it("skips unchanged sections and normalizes legacy collections", () => {
    const prepared = prepareProfileApplication(profile({ settings: { theme: "dark" }, collections: [{ key: "user-collections.c", name: " C ", added: [1, 1] }] }),
      new Set(["settings", "collections"]), { settings: { theme: "dark" }, collections: [] });
    expect(prepared.settings).toBeUndefined();
    expect(prepared.collections).toEqual([{ id: "c", key: "user-collections.c", name: "C", added: [1], removed: [], timestamp: 0, is_dynamic: false, is_deleted: false }]);
  });
  it("rejects cycles, excessive depth and accessors without running the accessor", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(isBoundedProfileData(cyclic)).toBe(false);
    let deep: unknown = {}; for (let i = 0; i < 60; i++) deep = { child: deep };
    expect(isBoundedProfileData(deep)).toBe(false);
    const getter = vi.fn(() => "secret");
    expect(isBoundedProfileData(Object.defineProperty({}, "data", { get: getter }))).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it("discards staged writes on synchronous failure", async () => {
    const write = vi.fn(async () => {});
    expect(() => withPersistenceTransaction(() => {
      void enqueuePersistence("profile-rollback-test", () => "bad", write);
      throw new Error("later section failed");
    })).toThrow("later section failed");
    await flushPersistence("profile-rollback-test");
    expect(write).not.toHaveBeenCalled();
  });
  it("commits staged latest snapshots and exposes durable completion", async () => {
    const write = vi.fn(async (_data: string) => {});
    withPersistenceTransaction(() => {
      void enqueuePersistence("profile-success-test", () => "old", write);
      void enqueuePersistence("profile-success-test", () => "latest", write);
    });
    await flushPersistence("profile-success-test");
    expect(write).toHaveBeenCalledExactlyOnceWith("latest");
  });
});
