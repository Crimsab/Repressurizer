# Collection save problems

## Changes disappear after Steam starts

Steam was likely still running during the save or rewrote its local state during startup. Close Steam fully, reload the current files, and restore or reapply the intended change.

## Preview contains unexpected removals

Cancel the save. Reload the library and inspect filters, hidden local-only entries, imported presets, and AutoCat rule scope. Do not use the save operation as a way to test an uncertain preview.

## Restore does not look correct

Close Steam before restoring. Verify that the backup belongs to the same Steam user and collection source. Repressurizer creates a pre-restore backup, so preserve both states while investigating.

## Steam database cannot be read

Close Steam completely and retry. Repressurizer reports an unreadable Steam
collection database instead of silently loading a possibly older JSON copy.
If the error persists, preserve the current files and backups before attempting
recovery.

## A save or restore fails partway through

Repressurizer keeps a backup before changing the collection catalogs. If the
LevelDB write fails after the JSON write, it attempts to restore both original
catalogs. The error states whether recovery succeeded. If recovery also fails,
keep the backup and error details; do not assume either catalog contains the
completed change.
