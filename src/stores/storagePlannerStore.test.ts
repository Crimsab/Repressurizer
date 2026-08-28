import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageInventory } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  loadAppData: vi.fn(async () => null),
  loadInstalledLibrary: vi.fn(async () => []),
  loadStorageInventory: vi.fn(),
  saveAppData: vi.fn(async () => undefined),
}));
vi.mock("./providerHealthStore", () => ({
  useProviderHealthStore: {
    getState: () => ({ recordBatch: vi.fn(), recordError: vi.fn() }),
  },
}));

import {
  loadAppData,
  loadInstalledLibrary,
  loadStorageInventory,
  saveAppData,
} from "../lib/tauri";
import { useStoragePlannerStore } from "./storagePlannerStore";

const inventory: StorageInventory = {
  libraries: [{
    path: "D:\\SteamLibrary",
    drive: "D:",
    totalBytes: 1_000,
    freeBytes: 400,
  }],
  installs: [{
    appid: 1,
    libraryPath: "D:\\SteamLibrary",
    installPath: "D:\\SteamLibrary\\steamapps\\common\\One",
    gameBytes: 100,
    workshopBytes: 0,
    shaderCacheBytes: 0,
    compatdataBytes: 0,
    totalBytes: 100,
    scannedAt: 1,
    scanTruncated: false,
  }],
};

function resetStore() {
  useStoragePlannerStore.setState({
    inventory: null,
    cachedSteamPath: "",
    protections: {},
    uninstallList: [],
    loading: false,
    checking: false,
    error: null,
    hydrated: false,
  });
}

describe("storagePlannerStore cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAppData).mockResolvedValue(null);
    vi.mocked(loadInstalledLibrary).mockResolvedValue([]);
    resetStore();
  });

  it("hydrates the last complete inventory", async () => {
    vi.mocked(loadAppData).mockResolvedValue(JSON.stringify({
      version: 2,
      steamPath: "D:\\SteamLibrary",
      inventory,
      protections: {},
      uninstallList: [],
    }));

    await useStoragePlannerStore.getState().hydrate();

    expect(useStoragePlannerStore.getState().inventory).toEqual(inventory);
    expect(useStoragePlannerStore.getState().cachedSteamPath).toBe("D:\\SteamLibrary");
  });

  it("keeps the cache when the installed app ids are unchanged", async () => {
    useStoragePlannerStore.setState({
      inventory,
      cachedSteamPath: "D:\\SteamLibrary",
      hydrated: true,
    });
    vi.mocked(loadInstalledLibrary).mockResolvedValue([1]);

    const result = await useStoragePlannerStore.getState().refreshIfChanged("d:/steamlibrary/");

    expect(result).toBe("cached");
    expect(loadStorageInventory).not.toHaveBeenCalled();
  });

  it("rescans and persists when Steam contains a new game", async () => {
    const updated: StorageInventory = {
      ...inventory,
      installs: [
        ...inventory.installs,
        { ...inventory.installs[0], appid: 2, totalBytes: 200 },
      ],
    };
    useStoragePlannerStore.setState({
      inventory,
      cachedSteamPath: "D:\\SteamLibrary",
      hydrated: true,
    });
    vi.mocked(loadInstalledLibrary).mockResolvedValue([1, 2]);
    vi.mocked(loadStorageInventory).mockResolvedValue(updated);

    const result = await useStoragePlannerStore.getState().refreshIfChanged("D:\\SteamLibrary");

    expect(result).toBe("refreshed");
    expect(loadStorageInventory).toHaveBeenCalledOnce();
    expect(useStoragePlannerStore.getState().inventory).toEqual(updated);
    expect(saveAppData).toHaveBeenCalledWith(
      "storage-planner.json",
      expect.stringContaining('"version":2'),
    );
  });
});
