import { describe, expect, it } from "vitest";
import { depressurizerAutoCatsToPresets } from "./depressurizerAutoCats";
import type { DepressurizerProfileImport } from "./types";

function imported(autoCats: DepressurizerProfileImport["autoCats"]): DepressurizerProfileImport {
  return {
    sourcePath: null,
    steamId64: null,
    steamId3: null,
    steamWebApiKey: null,
    settings: {
      autoUpdate: true,
      autoImport: true,
      localUpdate: true,
      webUpdate: true,
      exportDiscard: true,
      autoIgnore: true,
      includeUnknown: false,
      bypassIgnoreOnImport: false,
      overwriteNames: false,
      includeShortcuts: true,
    },
    games: [],
    collections: [],
    filters: [],
    autoCats,
    ignoredAppIds: [],
    stats: {
      totalGames: 0,
      steamGames: 0,
      nonSteamGames: 0,
      hiddenGames: 0,
      favoriteGames: 0,
      categories: 0,
      filters: 0,
      autoCats: autoCats.length,
      supportedAutoCats: autoCats.length,
    },
  };
}

describe("depressurizerAutoCatsToPresets", () => {
  it("imports every Depressurizer flag from Flags/Flag XML nodes", () => {
    const presets = depressurizerAutoCatsToPresets(imported([
      {
        name: "By Flags",
        typeId: "AutoCatFlags",
        normalizedType: "flags",
        prefix: "(Flags)",
        filter: null,
        supported: true,
        rawConfig: {
          _tag: "AutoCatFlags",
          Flags: {
            _tag: "Flags",
            Flag: [
              { _tag: "Flag", _text: "Captions available" },
              { _tag: "Flag", _text: "Local Co-op" },
              { _tag: "Flag", _text: "Steam Achievements" },
            ],
          },
        },
      },
    ]));

    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({
      name: "By Flags",
      type: "flags",
      config: {
        prefix: "(Flags)",
        included_flags: [
          "Captions available",
          "Local Co-op",
          "Steam Achievements",
        ],
      },
    });
  });

  it("imports every Depressurizer tag from Tags/Tag XML nodes", () => {
    const presets = depressurizerAutoCatsToPresets(imported([
      {
        name: "By Tags",
        typeId: "AutoCatTags",
        normalizedType: "tags",
        prefix: "(Tags)",
        filter: null,
        supported: true,
        rawConfig: {
          _tag: "AutoCatTags",
          MaxTags: { _tag: "MaxTags", _text: "0" },
          Tags: {
            _tag: "Tags",
            Tag: [
              { _tag: "Tag", _text: "Local Co-Op" },
              { _tag: "Tag", _text: "Local Multiplayer" },
            ],
          },
        },
      },
    ]));

    expect(presets[0]).toMatchObject({
      type: "tags",
      config: {
        prefix: "(Tags)",
        max_tags: 0,
        included_tags: ["Local Co-Op", "Local Multiplayer"],
      },
    });
  });

  it("preserves compatible Depressurizer genre options", () => {
    const presets = depressurizerAutoCatsToPresets(imported([
      {
        name: "By Genre",
        typeId: "AutoCatGenre",
        normalizedType: "genre",
        prefix: "(Genre)",
        filter: null,
        supported: true,
        rawConfig: {
          _tag: "AutoCatGenre",
          MaxCategories: { _tag: "MaxCategories", _text: "2" },
          Ignored: {
            _tag: "Ignored",
            Ignore: [
              { _tag: "Ignore", _text: "Free to Play" },
              { _tag: "Ignore", _text: "Utilities" },
            ],
          },
        },
      },
    ]));

    expect(presets[0]).toMatchObject({
      type: "genre",
      config: {
        prefix: "(Genre)",
        max_categories: 2,
        ignored_genres: ["Free to Play", "Utilities"],
      },
    });
  });
});
