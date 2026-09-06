import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
import { disposeAsyncRegistration } from "./asyncListener";
describe("async listener cleanup", () => {
  it("removes a listener even when registration resolves after unmount", async () => {
    let resolve!: (cleanup: () => void) => void;
    const cleanup = vi.fn();
    const dispose = disposeAsyncRegistration(() => new Promise((done) => { resolve = done; }));
    dispose();
    resolve(cleanup);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it("ignores callbacks while a disposed registration is still completing", async () => {
    let active!: () => boolean;
    const cleanup = vi.fn();
    const dispose = disposeAsyncRegistration((current) => { active = current; return Promise.resolve(cleanup); });
    expect(active()).toBe(true);
    await Promise.resolve();
    dispose();
    expect(active()).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
