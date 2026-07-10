import { describe, expect, it } from "vitest";
import {
  clampDialogLayout,
  clearDialogLayout,
  readDialogLayout,
  writeDialogLayout,
  type DialogLayoutStorage,
} from "./dialogLayout";

function createStorage(): DialogLayoutStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("clampDialogLayout", () => {
  it("keeps a saved dialog size inside the current viewport", () => {
    expect(
      clampDialogLayout(
        { width: 1200, height: 900, maximized: false },
        { width: 900, height: 600 },
        { minWidth: 640, minHeight: 420, viewportMargin: 24 }
      )
    ).toEqual({ width: 852, height: 552, maximized: false });
  });

  it("persists independent sizes for each workspace dialog", () => {
    const storage = createStorage();
    const autoCat = { width: 940, height: 730, maximized: false };
    const settings = { width: 1080, height: 780, maximized: true };

    writeDialogLayout(storage, "auto-categorize", autoCat);
    writeDialogLayout(storage, "settings", settings);

    expect(readDialogLayout(storage, "auto-categorize", settings)).toEqual(autoCat);
    expect(readDialogLayout(storage, "settings", autoCat)).toEqual(settings);
  });

  it("resets one dialog without discarding the other saved sizes", () => {
    const storage = createStorage();
    const fallback = { width: 900, height: 700, maximized: false };
    const settings = { width: 1040, height: 760, maximized: false };

    writeDialogLayout(storage, "auto-categorize", { width: 980, height: 740, maximized: true });
    writeDialogLayout(storage, "settings", settings);
    clearDialogLayout(storage, "auto-categorize");

    expect(readDialogLayout(storage, "auto-categorize", fallback)).toEqual(fallback);
    expect(readDialogLayout(storage, "settings", fallback)).toEqual(settings);
  });

  it("falls back when persisted geometry is invalid", () => {
    const storage = createStorage();
    const fallback = { width: 900, height: 700, maximized: false };

    writeDialogLayout(storage, "auto-categorize", {
      width: Number.NaN,
      height: -20,
      maximized: false,
    });

    expect(readDialogLayout(storage, "auto-categorize", fallback)).toEqual(fallback);
  });
});
