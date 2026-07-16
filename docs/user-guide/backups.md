# Backups and restore

Repressurizer creates automatic backups before collection writes and creates a pre-restore backup before replacing current data.

## Create a manual backup

Use a manual backup before testing a large AutoCat batch, migrating from another tool, or changing a library you cannot easily reconstruct.

## Restore safely

1. Close Steam completely.
2. Open the backup manager in Repressurizer.
3. Select the backup by timestamp and source.
4. Confirm the restore preview.
5. Restore the backup. Repressurizer preserves the current state first.
6. Start Steam and verify the collections.

Do not delete all older backups immediately after a successful save. Keep at least one known-good recovery point until Steam has reopened and synchronized normally.
