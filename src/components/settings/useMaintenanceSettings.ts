import { useState } from "react";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { depressurizerAutoCatsToPresets } from "../../lib/depressurizerAutoCats";
import { prepareDepressurizerDatabaseMerge } from "../../lib/depressurizerDatabaseImport";
import { useT } from "../../lib/i18n";
import {
  exportDiagnostics,
  importDepressurizerDatabase,
  importDepressurizerProfile,
  loadLegacySharedConfig,
  loadLocalLicenseLibrary,
  loadShortcuts,
  saveAppData,
} from "../../lib/tauri";
import type {
  AppSettings,
  DepressurizerDatabaseImport,
  DepressurizerProfileImport,
  OwnedGame,
} from "../../lib/types";
import { useAppNameOverrideStore } from "../../stores/appNameOverrideStore";
import { useCategoryStore } from "../../stores/categoryStore";
import { useFailedGamesStore } from "../../stores/failedGamesStore";
import { useGameStore } from "../../stores/gameStore";
import { useHltbIgnoredStore } from "../../stores/hltbIgnoredStore";
import { useHltbStore } from "../../stores/hltbStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSteamRatingsStore } from "../../stores/steamRatingsStore";
import {
  DEFAULT_DEPRESSURIZER_DATABASE_IMPORT_OPTIONS,
  type DepressurizerDatabaseImportOptions,
} from "./DepressurizerDatabaseImportDialog";
import {
  depressurizerDatabaseImportCollection,
  depressurizerDatabaseImportedIds,
  depressurizerDatabaseToOwnedGames,
  depressurizerFiltersToSavedAdvancedFilters,
  depressurizerGamesToOwnedGames,
  fetchDetailsForPlaceholderNames,
  hydrateSteamAppIndexForNames,
  legacySharedConfigToCollections,
  legacySharedConfigToOwnedGames,
  localLicenseAppsToOwnedGames,
  mergeAutoCategorizePresets,
  mergeImportedCollections,
  mergeSavedAdvancedFilters,
  parseAppIdList,
  shortcutsToCollections,
  shortcutsToOwnedGames,
  uniqueNumbers,
} from "./settingsImportUtils";

type SetTransientMessage = (message: string, ttlMs?: number) => void;

export function useMaintenanceSettings(
  setMessage: SetTransientMessage,
  onApiKeyImported: (apiKey: string) => void
) {
  const settings = useSettingsStore();
  const t = useT();
  const mergeGames = useGameStore((state) => state.mergeGames);
  const applyImportedCollections = useCategoryStore(
    (state) => state.applyImportedCollections
  );
  const [showDepressurizerDatabaseImport, setShowDepressurizerDatabaseImport] =
    useState(false);
  const [depressurizerDatabaseOptions, setDepressurizerDatabaseOptions] =
    useState<DepressurizerDatabaseImportOptions>(
      DEFAULT_DEPRESSURIZER_DATABASE_IMPORT_OPTIONS
    );
  const [diagnosticsExporting, setDiagnosticsExporting] = useState(false);
  const [importingDepressurizer, setImportingDepressurizer] = useState(false);
  const [importingDepressurizerDatabase, setImportingDepressurizerDatabase] =
    useState(false);
  const [importingShortcuts, setImportingShortcuts] = useState(false);
  const [importingLegacyConfig, setImportingLegacyConfig] = useState(false);
  const [importingLocalLibrary, setImportingLocalLibrary] = useState(false);
  const [lastDepressurizerImport, setLastDepressurizerImport] =
    useState<DepressurizerProfileImport | null>(null);
  const [lastDepressurizerDatabaseImport, setLastDepressurizerDatabaseImport] =
    useState<DepressurizerDatabaseImport | null>(null);

  const handleExportDiagnostics = async () => {
    setDiagnosticsExporting(true);
    setMessage("");
    try {
      const content = await exportDiagnostics(settings.steamPath, settings.steamId3, settings.steamId64);
      const path = await save({
        defaultPath: `repressurizer-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, content);
      setMessage(t("settings.diagnostics.exported"), 2000);
    } catch (e) {
      setMessage(t("settings.diagnostics.failed", { error: String(e) }));
    } finally {
      setDiagnosticsExporting(false);
    }
  };

  const handleImportDepressurizerProfile = async () => {
    setImportingDepressurizer(true);
    setMessage("");
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Depressurizer Profile", extensions: ["profile", "xml"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;

      const imported = await importDepressurizerProfile(selected);
      await hydrateSteamAppIndexForNames(settings.apiKey || imported.steamWebApiKey || "");
      await useAppNameOverrideStore.getState().hydrate();
      useAppNameOverrideStore.getState().mergeNames(imported.games);
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        imported.collections
      );
      applyImportedCollections(mergedCollections);

      const importedGames = depressurizerGamesToOwnedGames(imported);
      if (importedGames.length > 0) {
        mergeGames(importedGames);
        fetchDetailsForPlaceholderNames(importedGames);
      }

      const importedPresets = depressurizerAutoCatsToPresets(imported);
      const savedPresets = mergeAutoCategorizePresets(importedPresets);
      const importedAdvancedFilters = depressurizerFiltersToSavedAdvancedFilters(
        imported.filters,
        mergedCollections
      );
      const savedAdvancedFilters = mergeSavedAdvancedFilters(importedAdvancedFilters);

      await saveAppData("depressurizer-profile-import.json", JSON.stringify(imported)).catch(() => {});

      const patch: Partial<AppSettings> = {};
      if (!settings.steamId64 && imported.steamId64) patch.steamId64 = imported.steamId64;
      if (!settings.steamId3 && imported.steamId3) patch.steamId3 = imported.steamId3;
      if (!settings.apiKey && imported.steamWebApiKey) {
        patch.apiKey = imported.steamWebApiKey;
        onApiKeyImported(imported.steamWebApiKey);
      }
      if (Object.keys(patch).length > 0) settings.setSettings(patch);

      setLastDepressurizerImport(imported);
      setMessage(
        `Imported ${imported.stats.categories} categories, ${imported.stats.steamGames} Steam games, ` +
          `${imported.stats.filters} filters, ${imported.stats.autoCats} AutoCats, ` +
          `${savedPresets} saved AutoCat presets and ${savedAdvancedFilters} saved advanced filters from Depressurizer.`
      );
    } catch (e) {
      setMessage(`Depressurizer import failed: ${String(e)}`);
    } finally {
      setImportingDepressurizer(false);
    }
  };

  const handleChooseDepressurizerDatabaseFile = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        { name: "Depressurizer Database", extensions: ["json", "zip"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setDepressurizerDatabaseOptions((current) => ({ ...current, sourcePath: selected }));
  };

  const handleImportDepressurizerDatabase = async () => {
    setImportingDepressurizerDatabase(true);
    setMessage("");
    try {
      const options = depressurizerDatabaseOptions;
      const currentGames = useGameStore.getState().games;
      const gameIds = Object.keys(currentGames).map(Number).filter(Number.isFinite);
      const extraAppIds = parseAppIdList(options.extraAppIds);
      const requestedAppIds = uniqueNumbers([...gameIds, ...extraAppIds]);
      if (requestedAppIds.length === 0) {
        setMessage(t("settings.depDbImport.noLibrary"));
        return;
      }
      if (!options.sourcePath) {
        setMessage(t("settings.depDbImport.noSource"));
        return;
      }

      await useSteamRatingsStore.getState().hydrateCache();
      await useAppNameOverrideStore.getState().hydrate();

      const imported = await importDepressurizerDatabase(options.sourcePath, requestedAppIds);
      const merge = prepareDepressurizerDatabaseMerge({
        imported,
        currentDetails: useGameStore.getState().details,
        currentHltb: useHltbStore.getState().data,
        currentSteamReviews: useSteamRatingsStore.getState().ratings,
        options,
      });

      if (options.includeNames) {
        useAppNameOverrideStore.getState().mergeNames(
          Object.entries(imported.names).map(([appid, name]) => ({ appid: Number(appid), name }))
        );
        const namedExistingGames = Object.entries(imported.names)
          .map(([appid, name]) => {
            const id = Number(appid);
            const game = currentGames[id];
            return game ? { ...game, name } : null;
          })
          .filter((game): game is OwnedGame => !!game);
        if (namedExistingGames.length > 0) {
          useGameStore.getState().mergeGames(namedExistingGames);
        }
      }

      let extraGamesAdded = 0;
      if (options.addExtraAsCollectionOnly && extraAppIds.length > 0) {
        const importedIds = depressurizerDatabaseImportedIds(imported);
        const missingExtraIds = extraAppIds.filter((id) => !currentGames[id] && importedIds.has(id));
        const missingGames = depressurizerDatabaseToOwnedGames(imported, missingExtraIds);
        if (missingGames.length > 0) {
          useGameStore.getState().mergeGames(missingGames);
          const mergedCollections = mergeImportedCollections(
            useCategoryStore.getState().collections,
            [depressurizerDatabaseImportCollection(missingGames.map((game) => game.appid))]
          );
          applyImportedCollections(mergedCollections);
          extraGamesAdded = missingGames.length;
        }
      }
      if (merge.details.length > 0) {
        useGameStore.getState().setBulkDetails(merge.details);
        for (const detail of merge.details) {
          useFailedGamesStore.getState().resetFailure(detail.app_id);
        }
      }
      if (Object.keys(merge.hltb).length > 0) {
        useHltbStore.getState().setBulkData(merge.hltb);
        for (const appId of Object.keys(merge.hltb)) {
          useHltbIgnoredStore.getState().resetGame(Number(appId));
        }
      }
      if (merge.steamReviews.length > 0) {
        useSteamRatingsStore.getState().setBulkRatings(merge.steamReviews);
      }

      setLastDepressurizerDatabaseImport(imported);
      await saveAppData(
        "depressurizer-database-import.json",
        JSON.stringify({
          importedAt: new Date().toISOString(),
          sourcePath: imported.sourcePath,
          stats: imported.stats,
          merged: merge.stats,
          options,
          extraGamesAdded,
        })
      ).catch(() => {});

      setMessage(
        `Imported Depressurizer database: ${imported.stats.matchedEntries}/${imported.stats.requestedAppIds} requested app IDs matched; ` +
          `${merge.stats.detailsAdded + merge.stats.detailsMerged} details, ${merge.stats.hltbAdded} HLTB entries, ` +
          `${merge.stats.steamReviewsAdded} Steam review summaries, ${options.includeNames ? merge.stats.namesImported : 0} names merged` +
          `${extraGamesAdded > 0 ? ` and ${extraGamesAdded} extra local-only games added.` : "."}`,
        7000
      );
      setShowDepressurizerDatabaseImport(false);
    } catch (e) {
      setMessage(`Depressurizer database import failed: ${String(e)}`);
    } finally {
      setImportingDepressurizerDatabase(false);
    }
  };

  const handleImportShortcuts = async () => {
    setImportingShortcuts(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
      setMessage(t("settings.import.shortcuts.requireSteam"));
        return;
      }
      const shortcuts = await loadShortcuts(settings.steamPath, settings.steamId3);
      if (shortcuts.length === 0) {
      setMessage(t("settings.import.shortcuts.none"));
        return;
      }

      mergeGames(shortcutsToOwnedGames(shortcuts));
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        shortcutsToCollections(shortcuts)
      );
      applyImportedCollections(mergedCollections);

      setMessage(
        `Imported ${shortcuts.length} non-Steam shortcuts and ${new Set(shortcuts.flatMap((shortcut) => shortcut.tags)).size} shortcut tags.`
      );
    } catch (e) {
      setMessage(`Shortcut import failed: ${String(e)}`);
    } finally {
      setImportingShortcuts(false);
    }
  };

  const handleImportLegacySharedConfig = async () => {
    setImportingLegacyConfig(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
      setMessage(t("settings.import.legacy.requireSteam"));
        return;
      }
      const legacyGames = await loadLegacySharedConfig(settings.steamPath, settings.steamId3);
      if (legacyGames.length === 0) {
      setMessage(t("settings.import.legacy.none"));
        return;
      }

      await hydrateSteamAppIndexForNames(settings.apiKey);
      const importedGames = legacySharedConfigToOwnedGames(legacyGames);
      mergeGames(importedGames);
      fetchDetailsForPlaceholderNames(importedGames);
      const mergedCollections = mergeImportedCollections(
        useCategoryStore.getState().collections,
        legacySharedConfigToCollections(legacyGames)
      );
      applyImportedCollections(mergedCollections);

      setMessage(
        `Imported ${legacyGames.length} legacy sharedconfig entries and ${new Set(legacyGames.flatMap((game) => game.tags)).size} legacy tags.`
      );
    } catch (e) {
      setMessage(`Legacy sharedconfig import failed: ${String(e)}`);
    } finally {
      setImportingLegacyConfig(false);
    }
  };

  const handleImportLocalLicenseLibrary = async () => {
    setImportingLocalLibrary(true);
    setMessage("");
    try {
      if (!settings.steamPath || !settings.steamId3) {
      setMessage(t("settings.import.licenses.requireSteam"));
        return;
      }

      await hydrateSteamAppIndexForNames(settings.apiKey);
      const localApps = await loadLocalLicenseLibrary(settings.steamPath, settings.steamId3);
      if (localApps.length === 0) {
      setMessage(t("settings.import.licenses.none"));
        return;
      }

      const importedGames = localLicenseAppsToOwnedGames(localApps);
      mergeGames(importedGames);
      fetchDetailsForPlaceholderNames(importedGames);
      setMessage(
        `Imported ${localApps.length} local license library apps from licensecache/packageinfo.`
      );
    } catch (e) {
      setMessage(`Local license library import failed: ${String(e)}`);
    } finally {
      setImportingLocalLibrary(false);
    }
  };

  return {
    diagnosticsExporting,
    importingDepressurizer,
    importingDepressurizerDatabase,
    importingShortcuts,
    importingLegacyConfig,
    importingLocalLibrary,
    lastDepressurizerImport,
    lastDepressurizerDatabaseImport,
    showDepressurizerDatabaseImport,
    depressurizerDatabaseOptions,
    openDepressurizerDatabaseImport: () => setShowDepressurizerDatabaseImport(true),
    closeDepressurizerDatabaseImport: () => setShowDepressurizerDatabaseImport(false),
    updateDepressurizerDatabaseOptions: (
      patch: Partial<DepressurizerDatabaseImportOptions>
    ) =>
      setDepressurizerDatabaseOptions((current) => ({ ...current, ...patch })),
    handleChooseDepressurizerDatabaseFile,
    handleImportDepressurizerDatabase,
    handleImportDepressurizerProfile,
    handleImportShortcuts,
    handleImportLegacySharedConfig,
    handleImportLocalLicenseLibrary,
    handleExportDiagnostics,
  };
}
