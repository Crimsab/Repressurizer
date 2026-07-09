import {
  Bug,
  ClockCounterClockwise,
  Database,
  Stack,
  UploadSimple,
} from "@phosphor-icons/react";
import { useT } from "../../lib/i18n";
import type {
  DepressurizerDatabaseImport,
  DepressurizerProfileImport,
} from "../../lib/types";

interface MaintenanceSettingsSectionProps {
  diagnosticsExporting: boolean;
  importingDepressurizer: boolean;
  importingDepressurizerDatabase: boolean;
  importingShortcuts: boolean;
  importingLegacyConfig: boolean;
  importingLocalLibrary: boolean;
  lastDepressurizerImport: DepressurizerProfileImport | null;
  lastDepressurizerDatabaseImport: DepressurizerDatabaseImport | null;
  onImportDepressurizerProfile: () => void;
  onShowDepressurizerDatabaseImport: () => void;
  onImportShortcuts: () => void;
  onImportLegacyConfig: () => void;
  onImportLocalLibrary: () => void;
  onExportDiagnostics: () => void;
}

export function MaintenanceSettingsSection({
  diagnosticsExporting,
  importingDepressurizer,
  importingDepressurizerDatabase,
  importingShortcuts,
  importingLegacyConfig,
  importingLocalLibrary,
  lastDepressurizerImport,
  lastDepressurizerDatabaseImport,
  onImportDepressurizerProfile,
  onShowDepressurizerDatabaseImport,
  onImportShortcuts,
  onImportLegacyConfig,
  onImportLocalLibrary,
  onExportDiagnostics,
}: MaintenanceSettingsSectionProps) {
  const t = useT();

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-repressurizer-text-faint">
        {t("settings.maintenance")}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        <MaintenanceAction
          icon={
            <UploadSimple
              size={16}
              weight="duotone"
              className="mt-0.5 text-repressurizer-accent"
            />
          }
          label={
            importingDepressurizer
              ? "Importing Depressurizer profile"
              : "Import Depressurizer profile"
          }
          description="Merge categories, favorites, hidden games, filters and AutoCat metadata from a .profile file."
          disabled={importingDepressurizer}
          onClick={onImportDepressurizerProfile}
        />
        <MaintenanceAction
          icon={
            <Database
              size={16}
              weight="duotone"
              className="mt-0.5 text-repressurizer-accent"
            />
          }
          label={
            importingDepressurizerDatabase
              ? "Importing Depressurizer database"
              : "Import Depressurizer database"
          }
          description="Fill missing metadata from database.json or zip, with optional overwrite and extra App ID controls."
          disabled={importingDepressurizerDatabase}
          onClick={onShowDepressurizerDatabaseImport}
        />
        <MaintenanceAction
          icon={
            <Stack size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
          }
          label={
            importingShortcuts
              ? "Importing non-Steam shortcuts"
              : "Import non-Steam shortcuts"
          }
          description="Load shortcuts.vdf entries as local games and merge their Steam shortcut tags into collections."
          disabled={importingShortcuts}
          onClick={onImportShortcuts}
        />
        <MaintenanceAction
          icon={
            <ClockCounterClockwise
              size={16}
              weight="duotone"
              className="mt-0.5 text-repressurizer-accent"
            />
          }
          label={
            importingLegacyConfig
              ? "Importing legacy sharedconfig"
              : "Import legacy sharedconfig"
          }
          description="Merge old Steam sharedconfig.vdf tags and hidden state into modern collections."
          disabled={importingLegacyConfig}
          onClick={onImportLegacyConfig}
        />
        <MaintenanceAction
          icon={
            <Database
              size={16}
              weight="duotone"
              className="mt-0.5 text-repressurizer-accent"
            />
          }
          label={
            importingLocalLibrary
              ? "Importing local license library"
              : "Import local license library"
          }
          description="Load installed Steam licensecache and packageinfo.vdf ownership data without the Web API."
          disabled={importingLocalLibrary}
          onClick={onImportLocalLibrary}
        />
        <MaintenanceAction
          icon={
            <Bug size={16} weight="duotone" className="mt-0.5 text-repressurizer-accent" />
          }
          label={
            diagnosticsExporting
              ? t("settings.diagnostics.exporting")
              : t("settings.diagnostics.export")
          }
          description={t("settings.diagnostics.desc")}
          disabled={diagnosticsExporting}
          onClick={onExportDiagnostics}
        />

        {lastDepressurizerImport && (
          <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 md:col-span-2">
            <p className="text-xs font-medium text-repressurizer-text">
              Last Depressurizer import: {lastDepressurizerImport.stats.categories} categories,{" "}
              {lastDepressurizerImport.stats.steamGames} Steam games,{" "}
              {lastDepressurizerImport.stats.nonSteamGames} non-Steam games,{" "}
              {lastDepressurizerImport.stats.supportedAutoCats}/
              {lastDepressurizerImport.stats.autoCats} AutoCats currently executable.
            </p>
            {lastDepressurizerImport.stats.nonSteamGames > 0 && (
              <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
                Non-Steam shortcut entries were preserved in the import metadata and will become
                active when shortcut support lands.
              </p>
            )}
          </div>
        )}

        {lastDepressurizerDatabaseImport && (
          <div className="rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 md:col-span-2">
            <p className="text-xs font-medium text-repressurizer-text">
              Last Depressurizer database import:{" "}
              {lastDepressurizerDatabaseImport.stats.matchedEntries}/
              {lastDepressurizerDatabaseImport.stats.requestedAppIds} library apps matched,{" "}
              {lastDepressurizerDatabaseImport.stats.details} detail records,{" "}
              {lastDepressurizerDatabaseImport.stats.hltb} HLTB entries,{" "}
              {lastDepressurizerDatabaseImport.stats.steamReviews} Steam review summaries.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-repressurizer-text-faint">
              Existing live Steam metadata is kept; imported database values fill empty cache
              fields.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface MaintenanceActionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}

function MaintenanceAction({
  icon,
  label,
  description,
  disabled,
  onClick,
}: MaintenanceActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-press flex items-start gap-3 rounded-xl border border-repressurizer-border-subtle bg-repressurizer-bg px-4 py-3 text-left transition-colors hover:border-repressurizer-border disabled:opacity-50"
    >
      {icon}
      <span>
        <span className="block text-sm text-repressurizer-text">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-repressurizer-text-faint">
          {description}
        </span>
      </span>
    </button>
  );
}
