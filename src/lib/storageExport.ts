import type { StorageLibrary } from "./types";
import type { StoragePlannerGame } from "./storagePlanner";

export type StorageExportFormat = "json" | "csv" | "markdown" | "txt";

export interface StorageExportInput {
  generatedAt: number;
  libraries: StorageLibrary[];
  games: StoragePlannerGame[];
  selectedAppIds: ReadonlySet<number>;
  scopeLabel: string;
  goalBytes: number;
  reclaimBytes: number;
}

const csv = (value: string | number | boolean | null) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const gameRecord = (game: StoragePlannerGame, selected: ReadonlySet<number>) => ({
  appId: game.appid,
  name: game.name,
  library: game.install.libraryPath,
  installPath: game.install.installPath,
  totalBytes: game.install.totalBytes,
  gameBytes: game.install.gameBytes,
  workshopBytes: game.install.workshopBytes,
  shaderCacheBytes: game.install.shaderCacheBytes,
  protonBytes: game.install.compatdataBytes,
  selectedForRemoval: selected.has(game.appid),
  protected: game.protection,
  playtimeMinutes: game.playtimeMinutes,
  status: game.status,
  scanTruncated: game.install.scanTruncated,
});

export function storageExportExtension(format: StorageExportFormat): string {
  return format === "markdown" ? "md" : format;
}

export function serializeStorageExport(
  input: StorageExportInput,
  format: StorageExportFormat,
): string {
  const records = input.games
    .map((game) => gameRecord(game, input.selectedAppIds))
    .sort((left, right) => left.library.localeCompare(right.library) || right.totalBytes - left.totalBytes);
  const libraries = input.libraries.map((library) => {
    const steamBytes = records
      .filter((game) => game.library === library.path)
      .reduce((sum, game) => sum + game.totalBytes, 0);
    return {
      drive: library.drive,
      path: library.path,
      capacityBytes: library.totalBytes,
      freeBytes: library.freeBytes,
      steamBytes,
      otherUsedBytes: Math.max(0, library.totalBytes - library.freeBytes - steamBytes),
    };
  });

  if (format === "json") {
    return JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date(input.generatedAt).toISOString(),
      scope: input.scopeLabel,
      goalBytes: input.goalBytes,
      reclaimBytes: input.reclaimBytes,
      libraries,
      games: records,
    }, null, 2);
  }

  if (format === "csv") {
    const header = [
      "app_id", "name", "library", "install_path", "total_bytes", "game_bytes",
      "workshop_bytes", "shader_cache_bytes", "proton_bytes", "selected_for_removal",
      "protection", "playtime_minutes", "status", "scan_truncated",
    ];
    return [
      header.map(csv).join(","),
      ...records.map((game) => [
        game.appId, game.name, game.library, game.installPath, game.totalBytes,
        game.gameBytes, game.workshopBytes, game.shaderCacheBytes, game.protonBytes,
        game.selectedForRemoval, game.protected, game.playtimeMinutes, game.status,
        game.scanTruncated,
      ].map(csv).join(",")),
    ].join("\n");
  }

  const size = (value: number) => `${(value / 1_073_741_824).toFixed(2)} GB`;
  if (format === "markdown") {
    return [
      "# Repressurizer storage report",
      "",
      `Generated: ${new Date(input.generatedAt).toISOString()}`,
      `Scope: ${input.scopeLabel}`,
      `Goal: ${size(input.goalBytes)}`,
      `Selected recovery: ${size(input.reclaimBytes)}`,
      "",
      "## Disks",
      "",
      ...libraries.map((library) =>
        `- **${library.drive}** — ${size(library.steamBytes)} Steam, ${size(library.freeBytes)} free, ${size(library.capacityBytes)} capacity`),
      "",
      "## Games",
      "",
      "| Game | Disk | Total | Game | Workshop | Shader | Proton | Selected |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | :---: |",
      ...records.map((game) =>
        `| ${game.name.replaceAll("|", "\\|")} | ${game.library.replaceAll("|", "\\|")} | ${size(game.totalBytes)} | ${size(game.gameBytes)} | ${size(game.workshopBytes)} | ${size(game.shaderCacheBytes)} | ${size(game.protonBytes)} | ${game.selectedForRemoval ? "Yes" : "No"} |`),
    ].join("\n");
  }

  return [
    "Repressurizer storage report",
    `Generated: ${new Date(input.generatedAt).toISOString()}`,
    `Scope: ${input.scopeLabel}`,
    `Goal: ${size(input.goalBytes)} | Selected recovery: ${size(input.reclaimBytes)}`,
    "",
    ...libraries.map((library) =>
      `${library.drive} | Steam ${size(library.steamBytes)} | Free ${size(library.freeBytes)} | Capacity ${size(library.capacityBytes)}`),
    "",
    ...records.map((game) =>
      `${game.name} | ${game.library} | ${size(game.totalBytes)}${game.selectedForRemoval ? " | SELECTED" : ""}`),
  ].join("\n");
}
