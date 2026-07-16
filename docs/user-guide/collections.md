# Collections

Repressurizer reads Steam's modern collection catalog and, when available, the matching Steam UI LevelDB value.

## Supported operations

- Create, rename, duplicate, merge, delete, and color collections.
- Drag individual games or move them in bulk.
- Sort and filter before selecting games.
- Hide local-only entries from collection workflows.
- Preview every collection that will change before saving.

## Recommended workflow

1. Load the current Steam library before making edits.
2. Narrow the game list with search or filters.
3. Apply collection changes.
4. Inspect the save preview, especially removed memberships.
5. Close Steam and save with backups enabled.
6. Reopen Steam and verify a small sample.

!!! danger "Do not save while Steam is running"
    Steam can rewrite the same local data. Concurrent writes can discard either Steam's changes or Repressurizer's changes.
