import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.getState().dismissAll();
  });

  it("deduplicates repeated messages and records their count", () => {
    useToastStore.getState().warning("Steam is busy");
    useToastStore.getState().warning("Steam is busy");
    expect(useToastStore.getState().toasts).toMatchObject([{ message: "Steam is busy", count: 2 }]);
  });

  it("keeps at most four visible notifications", () => {
    for (let index = 0; index < 20; index += 1) useToastStore.getState().info(`Message ${index}`);
    expect(useToastStore.getState().toasts).toHaveLength(4);
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe("Message 19");
  });
});
