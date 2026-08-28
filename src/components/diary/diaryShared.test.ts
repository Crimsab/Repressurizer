import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreferences, PREFERENCES_KEY } from "./diaryShared";

afterEach(() => vi.unstubAllGlobals());

describe("Diary default view", () => {
  it("opens Kanban for a new profile", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });

    expect(loadPreferences().libraryView).toBe("kanban");
  });

  it("preserves an existing view preference", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => key === PREFERENCES_KEY
        ? JSON.stringify({ version: 2, libraryView: "list" })
        : null),
    });

    expect(loadPreferences().libraryView).toBe("list");
  });

  it("migrates the old grid default to Kanban once", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify({ libraryView: "grid" })),
    });

    expect(loadPreferences().libraryView).toBe("kanban");
  });
});
