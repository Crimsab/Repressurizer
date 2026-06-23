# repressurizer-integration

[![crates.io](https://img.shields.io/crates/v/repressurizer-integration)](https://crates.io/crates/repressurizer-integration)
[![crate downloads](https://img.shields.io/crates/d/repressurizer-integration?label=downloads)](https://crates.io/crates/repressurizer-integration)
[![docs.rs](https://img.shields.io/docsrs/repressurizer-integration)](https://docs.rs/repressurizer-integration)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/Crimsab/Repressurizer/blob/main/LICENSE)

Rust types, validation, checksum, and lookup helpers for Repressurizer library snapshots.

Repressurizer exports a read-only JSON contract named `repressurizer.library-snapshot.v1`. This crate is for receivers: dashboards, launchers, import jobs, and local automation that need to accept that snapshot safely.

Registry download badges are approximate. They include automated registry, CI, mirror, and indexer traffic.

## Install

```toml
[dependencies]
repressurizer-integration = "0.3"
```

## Quick Start

```rust
use std::error::Error;
use repressurizer_integration::{
    index_snapshot_by_app_id,
    parse_library_snapshot_str,
    summarize_snapshot,
    verify_library_snapshot_checksum,
};

fn import_snapshot(body: &str) -> Result<(), Box<dyn Error>> {
    let snapshot = parse_library_snapshot_str(body)?;

    if !verify_library_snapshot_checksum(&snapshot) {
        return Err("invalid snapshot checksum".into());
    }

    let games = index_snapshot_by_app_id(&snapshot);
    let summary = summarize_snapshot(&snapshot);

    println!("{:?}", games.get(&632470));
    println!("{summary:?}");
    Ok(())
}
```

Use `parse_library_snapshot_str` when receiving JSON text. It parses the snapshot and validates schema invariants with checksum verification enabled.

## What The Snapshot Contains

Every snapshot has:

- `schemaVersion`: currently `repressurizer.library-snapshot.v1`
- `generatedAt`: export time
- `source`: Repressurizer app name and version
- `steam`: privacy-safe Steam account metadata
- `summary`: high-level counts
- `collections`: Steam collection metadata and app IDs
- `games`: one row per app ID with playtime, collections, details, HLTB data, and optional enrichment blocks
- `checksum`: stable `fnv1a32` checksum for change detection

Optional game enrichment blocks include:

- `achievements`: read-only Steam Web API completion summary
- `wishlist`: wishlist priority and timestamps
- `ownership`: Steam Family ownership state with redacted owner IDs
- `flags`: derived filter booleans such as `familyShared`, `wishlist`, `missingDetails`, and `hasAchievements`

Receivers should ignore unknown additive fields, but should reject unknown `schemaVersion` values.

## Useful Helpers

- `parse_library_snapshot_str(input)`: parses JSON and validates the snapshot with checksum verification.
- `validate_library_snapshot(snapshot, verify_checksum)`: validates an already parsed snapshot.
- `index_snapshot_by_app_id(snapshot)`: builds a `HashMap<u32, &LibrarySnapshotGame>`.
- `get_snapshot_game(snapshot, app_id)`: returns one game by app ID.
- `get_snapshot_hltb`, `get_snapshot_achievements`, `get_snapshot_wishlist`, `get_snapshot_ownership`, `get_snapshot_flags`: read optional enrichment blocks.
- `list_snapshot_collections(snapshot)`: returns collections sorted by name and key.
- `group_snapshot_games_by_collection(snapshot)`: groups games by collection key.
- `summarize_snapshot(snapshot)`: counts games, collections, HLTB, achievements, wishlist, family-shared, collection-only, and missing-details rows.
- `filter_snapshot_games(snapshot, predicate)`: filters and stably sorts games.
- `compute_library_snapshot_checksum(snapshot)`: recomputes the canonical checksum.
- `verify_library_snapshot_checksum(snapshot)`: compares the stored checksum to a recomputed checksum.
- `diff_library_snapshots(previous, next)`: compares snapshots by app ID.

The canonical JSON Schema is embedded as:

```rust
use repressurizer_integration::LIBRARY_SNAPSHOT_SCHEMA_JSON;
```

## Receiver Contract

Recommended receiver behavior:

1. Accept snapshots only over trusted local routes or HTTPS.
2. Require a bearer token for network-exposed receivers.
3. Validate `schemaVersion`.
4. Validate the payload with this crate.
5. Verify the checksum when possible.
6. Upsert data by `appId`.
7. Return success only after the snapshot is stored or queued safely.

Snapshots are read-only integration data. Do not treat them as commands for Steam or Repressurizer.

## Versioning

Breaking wire-format changes use a new `schemaVersion`. Additive optional fields stay in `repressurizer.library-snapshot.v1` and ship in crate minor versions first.

Crate version and app version can differ. Receivers should key compatibility on `schemaVersion`, not on the crate version.

## More Documentation

- Snapshot contract: <https://github.com/Crimsab/Repressurizer/blob/main/docs/integrations/repressurizer-snapshot-v1.md>
- Automation export setup: <https://github.com/Crimsab/Repressurizer/blob/main/docs/automation-export.md>
- TypeScript package: <https://www.npmjs.com/package/@crimsab/repressurizer-integration>
