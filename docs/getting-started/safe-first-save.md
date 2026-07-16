# Make your first safe save

Collection changes are local filesystem writes. Repressurizer is designed around previews and backups, but Steam can still overwrite its own files if both applications write at the same time.

## Before saving

- Close Steam completely, including its system tray process.
- Keep automatic backups enabled.
- Confirm that Repressurizer loaded the expected Steam user and library.
- Review the collection diff in the save preview.
- For your first save, create a manual backup as an additional recovery point.

## What is backed up

Repressurizer backs up the local collection file before writing. When the matching collection catalog value is present in Steam's UI LevelDB cache, Repressurizer backs that up as well.

## After saving

Start Steam and verify a few changed collections. If Steam shows unexpected results, close it again before restoring a backup from Repressurizer.

See [Backups and restore](../user-guide/backups.md) for the recovery workflow.
