import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppIdImportStore } from "./appIdImportStore";
import { loadAppData, saveAppData } from "../lib/tauri";
import type { AppIdImportBatch } from "../lib/appIdImport";

vi.mock("../lib/tauri", () => ({
  loadAppData: vi.fn(async () => null),
  saveAppData: vi.fn(async () => undefined),
}));

const batch = (id = "import-1"): AppIdImportBatch => ({
  id,
  name: "SteamDB filter",
  sourceName: "steamdb.txt",
  sourceHash: "abcd1234",
  appIds: [30, 10, 20],
  targetKey: "user-collections.test",
  targetName: "Test",
  scope: "reference",
  operation: "append",
  metadataPolicy: "none",
  backgroundLimit: 50,
  autoUpdate: true,
  beforeIds: [],
  afterIds: [10],
  createdAt: 100,
  updatedAt: 100,
  active: true,
});

describe("appIdImportStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppIdImportStore.setState({ batches: [], hydrated: false });
  });

  it("hydrates normalized saved imports", async () => {
    vi.mocked(loadAppData).mockResolvedValue(JSON.stringify({ version: 1, batches: [batch()] }));
    await useAppIdImportStore.getState().hydrate();
    expect(useAppIdImportStore.getState().batches[0].appIds).toEqual([10, 20, 30]);
  });

  it("upserts and deactivates a saved import", () => {
    useAppIdImportStore.getState().upsert(batch());
    useAppIdImportStore.getState().deactivate("import-1");
    expect(useAppIdImportStore.getState().batches[0]).toMatchObject({ active: false, autoUpdate: false });
    expect(saveAppData).toHaveBeenCalled();
  });
});
