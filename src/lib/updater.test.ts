import { describe, expect, it } from "vitest";
import {
  channelUpdaterTarget,
  shouldCheckForAppUpdateAfterResume,
  shouldAllowStableReturn,
} from "./updater";

describe("updater channels", () => {
  it("isolates stable and beta manifest targets", () => {
    expect(channelUpdaterTarget("windows-x86_64", "stable")).toBe(
      "windows-x86_64-stable"
    );
    expect(channelUpdaterTarget("linux-x86_64", "beta")).toBe(
      "linux-x86_64-beta"
    );
    expect(channelUpdaterTarget("darwin-aarch64", "beta")).toBe(
      "darwin-aarch64-beta"
    );
  });

  it("rejects unknown targets instead of falling through to another channel", () => {
    expect(() => channelUpdaterTarget("windows-aarch64", "stable")).toThrow(
      /supported updater target/
    );
  });

  it("allows downgrade checks only when a beta explicitly returns to stable", () => {
    expect(shouldAllowStableReturn("0.6.0-beta.2", "stable")).toBe(true);
    expect(shouldAllowStableReturn("0.6.0-beta.2", "beta")).toBe(false);
    expect(shouldAllowStableReturn("0.6.0", "stable")).toBe(false);
    expect(shouldAllowStableReturn("0.0.0-preview.12", "stable")).toBe(false);
  });

  it("checks for updates on tray resume only when the configured interval is due", () => {
    const hour = 60 * 60 * 1000;

    expect(shouldCheckForAppUpdateAfterResume(0, hour, 12)).toBe(true);
    expect(shouldCheckForAppUpdateAfterResume(hour, 12 * hour, 12)).toBe(false);
    expect(shouldCheckForAppUpdateAfterResume(hour, 13 * hour, 12)).toBe(true);
  });

  it("clamps overly frequent checks and recovers from a backwards clock", () => {
    const hour = 60 * 60 * 1000;

    expect(shouldCheckForAppUpdateAfterResume(hour, 1.5 * hour, 0)).toBe(false);
    expect(shouldCheckForAppUpdateAfterResume(2 * hour, hour, 12)).toBe(true);
  });
});
