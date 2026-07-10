import { describe, expect, it } from "vitest";
import type { SteamCollection } from "../../../lib/types";
import {
  mergeImportedCollections,
  parseAppIdList,
  shortcutsToCollections,
  uniqueNumbers,
} from "./settingsImportUtils";

function collection(key: string, name: string, added: number[]): SteamCollection {
  return {
    id: key.replace("user-collections.", ""),
    key,
    name,
    added,
    removed: [],
    timestamp: 1,
    is_deleted: false,
    is_dynamic: false,
  };
}

describe("Settings import utilities", () => {
  it("normalizes and deduplicates app-id input while preserving order", () => {
    expect(parseAppIdList("10, 20\n10; 30")).toEqual([10, 20, 30]);
    expect(uniqueNumbers([5, 5, 0, Number.NaN, 8.9])).toEqual([5, 8]);
  });

  it("merges imported memberships into a matching user collection", () => {
    const current = collection("user-collections.backlog", "Backlog", [1]);
    const incoming = collection("user-collections.other", " backlog ", [2]);

    const result = mergeImportedCollections([current], [incoming]);
    expect(result).toHaveLength(1);
    expect(result[0].added).toEqual([1, 2]);
    expect(current.added).toEqual([1]);
  });

  it("converts shortcut visibility and tags into deterministic collections", () => {
    const result = shortcutsToCollections([
      {
        appid: 10,
        appname: "Tool",
        exe: "tool.exe",
        startDir: "",
        icon: "",
        shortcutPath: "",
        launchOptions: "",
        tags: ["Utilities"],
        hidden: true,
        lastPlayTime: 0,
      },
      {
        appid: 20,
        appname: "Editor",
        exe: "editor.exe",
        startDir: "",
        icon: "",
        shortcutPath: "",
        launchOptions: "",
        tags: ["Utilities"],
        hidden: false,
        lastPlayTime: 0,
      },
    ]);

    expect(result[0]).toMatchObject({ key: "user-collections.hidden", added: [10] });
    expect(result[1]).toMatchObject({ name: "Utilities", added: [10, 20] });
    expect(result[1].key).toMatch(/^user-collections\.uc-shortcut-/);
  });
});
