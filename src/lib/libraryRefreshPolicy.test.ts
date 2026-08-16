import { describe, expect, it } from "vitest";
import {
  markLibraryWindowHidden,
  requestLibraryRefreshOnResume,
  type LibraryResumeRefreshState,
} from "./libraryRefreshPolicy";

const initial: LibraryResumeRefreshState = { hiddenAt: null, lastRequestedAt: 0 };

describe("library resume refresh policy", () => {
  it("only requests a refresh after a hidden-to-visible transition", () => {
    const hidden = markLibraryWindowHidden(initial, 1_000);
    const resumed = requestLibraryRefreshOnResume(hidden, 2_000, 0);

    expect(resumed).toEqual({ hiddenAt: null, lastRequestedAt: 2_000 });
    expect(requestLibraryRefreshOnResume(resumed!, 3_000, 0)).toBeNull();
  });

  it("enforces a cooldown for repeated tray or focus events", () => {
    const hidden = markLibraryWindowHidden(initial, 1_000);
    const first = requestLibraryRefreshOnResume(hidden, 2_000, 5_000);
    expect(first).not.toBeNull();

    const hiddenAgain = markLibraryWindowHidden(first!, 3_000);
    expect(requestLibraryRefreshOnResume(hiddenAgain, 4_000, 5_000)).toBeNull();
  });

  it("does not accept a clock moving backwards", () => {
    const hidden = markLibraryWindowHidden(initial, 2_000);
    expect(requestLibraryRefreshOnResume(hidden, 1_000, 0)).toBeNull();
  });
});
