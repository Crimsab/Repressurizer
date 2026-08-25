import { describe, expect, it } from "vitest";
import sessionPlanner from "../recommend/SessionPlanner.tsx?raw";
import collectionTimeMachine from "../collections/CollectionTimeMachine.tsx?raw";
import packMyDeck from "../storage/PackMyDeck.tsx?raw";
import storagePlanner from "../storage/StoragePlanner.tsx?raw";
import profileSync from "../profiles/ProfileSyncPanel.tsx?raw";

const productDialogs = { sessionPlanner, collectionTimeMachine, packMyDeck, storagePlanner, profileSync };

describe("product UI conventions", () => {
  it.each(Object.entries(productDialogs))("uses SelectMenu instead of native selects in %s", (_name, source) => {
    expect(source).not.toMatch(/<select\b/);
  });
});
