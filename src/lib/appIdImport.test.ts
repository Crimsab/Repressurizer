import { describe, expect, it } from "vitest";
import { MAX_STEAM_APP_ID, parseAppIdImportText } from "./appIdImport";

describe("parseAppIdImportText", () => {
  it("parses newline, whitespace, comma and semicolon separated IDs", () => {
    expect(parseAppIdImportText("10\n20, 30;40 50")).toEqual({
      appIds: [10, 20, 30, 40, 50],
      duplicateCount: 0,
      invalidEntries: [],
    });
  });

  it("deduplicates IDs and reports invalid entries without rejecting valid rows", () => {
    expect(parseAppIdImportText(`\uFEFF10\n10\nnope\n0\n${MAX_STEAM_APP_ID + 1}\n20 # exported`)).toEqual({
      appIds: [10, 20],
      duplicateCount: 1,
      invalidEntries: ["nope", "0", String(MAX_STEAM_APP_ID + 1)],
    });
  });

  it("ignores blank and comment-only rows", () => {
    expect(parseAppIdImportText("\n# SteamDB export\n// second note\n632470\n")).toEqual({
      appIds: [632470],
      duplicateCount: 0,
      invalidEntries: [],
    });
  });
});
