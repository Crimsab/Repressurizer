import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/tauri", () => ({ loadAppData: vi.fn(async () => null), saveAppData: vi.fn(async () => undefined) }));
vi.mock("./entityJournalStore", () => ({ useEntityJournalStore: { getState: () => ({ append: vi.fn() }) } }));
import { createRepressurizerProfile } from "../lib/repressurizerProfile";
import { useProfileStore } from "./profileStore";

describe("profileStore", () => {
  beforeEach(() => useProfileStore.setState({ version: 1, profiles: [], backups: [], hydrated: true }));
  it("manages multiple named profiles and bounded backups", () => {
    const profile = createRepressurizerProfile({ profileId: "main", name: "Main", deviceId: "d", steamAccountId: "s", sections: { settings: { theme: "dark" } } });
    useProfileStore.getState().upsert(profile);
    useProfileStore.getState().rename("main", "Renamed");
    const copyId = useProfileStore.getState().duplicate("main");
    expect(useProfileStore.getState().profiles.map((item) => item.manifest.name)).toEqual(expect.arrayContaining(["Renamed", "Renamed Copy"]));
    expect(copyId).toContain("main-copy");
    useProfileStore.getState().backup(profile);
    expect(useProfileStore.getState().backups).toHaveLength(1);
  });
});
