import { describe, expect, it } from "vitest";
import {
  channelUpdaterTarget,
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
});
