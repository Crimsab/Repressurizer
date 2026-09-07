import { describe, expect, it, vi } from "vitest";
import { categoriesForGame, collectionMembershipIndex } from "./collectionIndex";
import { virtualWindow } from "./virtualWindow";
import { createRequestPool } from "./requestPool";
import { enqueuePersistence, flushPersistence } from "./persistenceQueue";
import type { SteamCollection } from "./types";

function collection(key: string, added: number[], dynamic = false): SteamCollection {
  return { id: key, key, name: key, added, removed: [], timestamp: 1, is_deleted: false, is_dynamic: dynamic };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("membership index", () => {
  it("preserves order, excludes dynamic collections and deduplicates membership", () => {
    const input = [collection("b", [10, 10, 20]), collection("a", [10]), collection("d", [10], true)];
    expect(categoriesForGame(input, 10)).toEqual(input.slice(0, 2));
    expect(categoriesForGame(input, 999)).toEqual([]);
    expect(collectionMembershipIndex(input)).toBe(collectionMembershipIndex(input));
  });
  it("keeps unaffected membership references stable", () => {
    const first = [collection("a", [1]), collection("b", [2])];
    const before = categoriesForGame(first, 1);
    const after = [first[0], { ...first[1], name: "renamed" }];
    expect(categoriesForGame(after, 1)).toBe(before);
    expect(categoriesForGame(after, 2)[0].name).toBe("renamed");
  });
  it("matches the original algorithm across a deterministic library", () => {
    const collections = Array.from({ length: 25 }, (_, i) => collection(String(i),
      Array.from({ length: 30 }, (_, j) => ((i * 73 + j * 7) % 100) + 1), i % 7 === 0));
    for (let id = 1; id <= 100; id++) {
      expect(categoriesForGame(collections, id)).toEqual(collections.filter((c) => !c.is_dynamic && c.added.includes(id)));
    }
  });
});

describe("virtual library window", () => {
  it("bounds the mounted range independently of library size", () => {
    for (const count of [1_000, 10_000, 50_000]) {
      const window = virtualWindow(count, 5, 250, 25_000, 900);
      expect(window.end - window.start).toBeLessThanOrEqual(55);
      expect(window.start % 5).toBe(0);
    }
  });
  it("handles empty, filtered and invalid-sized inputs", () => {
    expect(virtualWindow(0, 0, 0, 500, 800)).toEqual({ start: 0, end: 0, paddingTop: 0, paddingBottom: 0 });
    const window = virtualWindow(7, 3, 100, 90_000, 600);
    expect(window.start).toBe(6);
    expect(window.end).toBe(7);
    expect(window.paddingBottom).toBe(0);
  });
  it("retains the complete logical height and covers the viewport", () => {
    for (let top = 0; top < 2_000; top += 37) {
      const window = virtualWindow(200, 4, 100, top, 400);
      const visibleRows = Math.ceil((window.end - window.start) / 4);
      expect(window.paddingTop + visibleRows * 100 + window.paddingBottom).toBe(5_000);
      expect(window.paddingTop).toBeLessThanOrEqual(top);
      expect(window.paddingTop + visibleRows * 100).toBeGreaterThanOrEqual(top + 400);
    }
  });
});

describe("ordered persistence", () => {
  it("serializes only the latest pending snapshot", async () => {
    const write = vi.fn(async (_value: string) => {});
    const first = vi.fn(() => "old");
    const second = vi.fn(() => "new");
    const a = enqueuePersistence("test-latest", first, write, 300);
    const b = enqueuePersistence("test-latest", second, write, 300);
    await flushPersistence("test-latest");
    await Promise.all([a, b]);
    expect(first).not.toHaveBeenCalled();
    expect(write.mock.calls.map(([value]) => value)).toEqual(["new"]);
  });
  it("never lets an older in-flight write replace a newer snapshot", async () => {
    const gate = deferred<void>();
    const calls: string[] = [];
    const write = vi.fn(async (value: string) => { calls.push(value); if (value === "first") await gate.promise; });
    const first = enqueuePersistence("test-order", () => "first", write);
    await Promise.resolve();
    const next = enqueuePersistence("test-order", () => "second", write);
    await Promise.resolve();
    expect(calls).toEqual(["first"]);
    gate.resolve();
    await Promise.all([first, next]);
    expect(calls).toEqual(["first", "second"]);
  });
  it("recovers after a failed write without stranding later writes", async () => {
    const failed = enqueuePersistence("test-error", () => "bad", async () => { throw Error("disk full"); });
    await expect(failed).rejects.toThrow("disk full");
    await expect(enqueuePersistence("test-error", () => "good", async () => {})).resolves.toBeUndefined();
    await flushPersistence();
  });
});

describe("shared request pool", () => {
  it("joins foreground and background requests for the same resource", async () => {
    const pool = createRequestPool(2);
    const gate = deferred<number>();
    const fetch = vi.fn(() => gate.promise);
    const first = pool("game:10:it", fetch);
    const second = pool("game:10:it", fetch);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    gate.resolve(10);
    expect(await second).toBe(10);
  });
  it("bounds concurrency and continues after a rejected request", async () => {
    const pool = createRequestPool(1);
    const gate = deferred<number>();
    const one = pool("one", () => gate.promise);
    const fetch = vi.fn(async () => 2);
    const two = pool("two", fetch);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    gate.reject(Error("offline"));
    await expect(one).rejects.toThrow("offline");
    expect(await two).toBe(2);
  });
});

describe("durable flush errors", () => {
  it("surfaces a failed background write until a newer snapshot repairs it", async () => {
    await enqueuePersistence("test-durable-error", () => "old", async () => { throw Error("disk unavailable"); }).catch(() => {});
    await expect(flushPersistence("test-durable-error")).rejects.toThrow("disk unavailable");
    await enqueuePersistence("test-durable-error", () => "new", async () => {});
    await expect(flushPersistence("test-durable-error")).resolves.toBeUndefined();
  });
});
