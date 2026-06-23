# @crimsab/repressurizer-integration

[![npm version](https://img.shields.io/npm/v/@crimsab/repressurizer-integration)](https://www.npmjs.com/package/@crimsab/repressurizer-integration)
[![npm downloads](https://img.shields.io/npm/dw/@crimsab/repressurizer-integration?label=downloads)](https://www.npmjs.com/package/@crimsab/repressurizer-integration)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/Crimsab/Repressurizer/blob/main/LICENSE)

TypeScript types, validation, checksum, and lookup helpers for Repressurizer library snapshots.

Repressurizer exports a read-only JSON contract named `repressurizer.library-snapshot.v1`. This package is for receivers: dashboards, launchers, import jobs, and local automation that need to accept that snapshot safely.

Registry download badges are approximate. They include automated registry, CI, mirror, and indexer traffic.

## Install

```sh
bun add @crimsab/repressurizer-integration
```

```sh
npm install @crimsab/repressurizer-integration
```

## Quick Start

```ts
import {
  indexSnapshotByAppId,
  summarizeSnapshot,
  validateLibrarySnapshot,
} from "@crimsab/repressurizer-integration";

const parsed = JSON.parse(body);
const result = validateLibrarySnapshot(parsed, { verifyChecksum: true });

if (!result.ok) {
  return new Response(JSON.stringify({ issues: result.issues }), { status: 400 });
}

const snapshot = result.snapshot;
const games = indexSnapshotByAppId(snapshot);
const summary = summarizeSnapshot(snapshot);

console.log(summary.games, games.get(632470));
```

Use `validateLibrarySnapshot` when receiving untrusted JSON. Use `assertLibrarySnapshot` when you prefer an exception on invalid input.

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

- `validateLibrarySnapshot(value, { verifyChecksum })`: validates shape, invariants, and optionally checksum.
- `assertLibrarySnapshot(value)`: returns a typed snapshot or throws.
- `indexSnapshotByAppId(snapshot)`: builds a `Map<number, LibrarySnapshotGame>`.
- `getSnapshotGame(snapshot, appId)`: returns one game by app ID.
- `getSnapshotHltb`, `getSnapshotAchievements`, `getSnapshotWishlist`, `getSnapshotOwnership`, `getSnapshotFlags`: read optional enrichment blocks.
- `listSnapshotCollections(snapshot)`: returns collections sorted by name and key.
- `groupSnapshotGamesByCollection(snapshot)`: groups games by collection key.
- `summarizeSnapshot(snapshot)`: counts games, collections, HLTB, achievements, wishlist, family-shared, collection-only, and missing-details rows.
- `filterSnapshotGames(snapshot, predicate)`: filters and stably sorts games.
- `computeLibrarySnapshotChecksum(snapshot)`: recomputes the canonical checksum.
- `verifyLibrarySnapshotChecksum(snapshot)`: compares the stored checksum to a recomputed checksum.
- `diffLibrarySnapshots(previous, next)`: compares snapshots by app ID.

The canonical JSON Schema is distributed with the package and exported as:

```ts
import schema from "@crimsab/repressurizer-integration/schema";
```

## Receiver Contract

Recommended receiver behavior:

1. Accept snapshots only over trusted local routes or HTTPS.
2. Require a bearer token for network-exposed receivers.
3. Validate `schemaVersion`.
4. Validate the payload with this package.
5. Verify the checksum when possible.
6. Upsert data by `appId`.
7. Return success only after the snapshot is stored or queued safely.

Snapshots are read-only integration data. Do not treat them as commands for Steam or Repressurizer.

## Versioning

Breaking wire-format changes use a new `schemaVersion`. Additive optional fields stay in `repressurizer.library-snapshot.v1` and ship in package minor versions first.

Package version and app version can differ. Receivers should key compatibility on `schemaVersion`, not on the npm package version.

## More Documentation

- Snapshot contract: <https://github.com/Crimsab/Repressurizer/blob/main/docs/integrations/repressurizer-snapshot-v1.md>
- Automation export setup: <https://github.com/Crimsab/Repressurizer/blob/main/docs/automation-export.md>
- Rust crate: <https://crates.io/crates/repressurizer-integration>
