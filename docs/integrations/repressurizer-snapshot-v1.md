# Repressurizer Library Snapshot v1

Repressurizer can publish a read-only JSON snapshot for external library tools, launchers, and dashboards. The first supported contract is `repressurizer.library-snapshot.v1`.

The app remains the source of the export. Receivers should treat the JSON as an integration artifact, not as a command channel back into Steam or Repressurizer.

For user-facing setup and HTTP automation behavior, see [Automation Export](../automation-export.md).

## Package Layout

- JSON Schema: `packages/integration/schema/repressurizer.library-snapshot.v1.schema.json`
- TypeScript helpers: `packages/integration/src/index.ts`
- TypeScript package: `@crimsab/repressurizer-integration`
- Rust crate: `repressurizer-integration`

The root desktop app stays private. Only the integration libraries should be published when registry setup is enabled.

## Snapshot Shape

Every snapshot contains:

- `schemaVersion`: currently `repressurizer.library-snapshot.v1`
- `generatedAt`: export time, ISO date-time
- `source`: app name and Repressurizer version
- `steam`: privacy-safe Steam metadata, with only the SteamID64 tail
- `summary`: counts for games, collections, and HLTB records
- `collections`: collection keys, labels, dynamic flag, and appIds
- `games`: one row per Steam appId, with playtime, last played, collections, Steam details, and optional HLTB data
- `checksum`: stable `fnv1a32` checksum computed from content, excluding `generatedAt`

Receivers should key records by `appId`. Display `source` and `schemaVersion` near imported data so users can distinguish Repressurizer snapshots from live Steam API data, local app databases, or manual imports.

## HLTB

HLTB values are exported per game when Repressurizer has matched data:

- `mainStory`
- `mainExtra`
- `completionist`
- `hltbGameId`
- `matchedName`
- `confidence`

The value is still third-party matched metadata, not Steam metadata. Receivers should keep the HLTB provenance visible and may apply their own confidence threshold before showing or storing it.

Game Vault currently accepts this snapshot through `POST /api/steam/repressurizer/import` and stores collection/game/HLTB rows in its own database. It should prefer this structured JSON over older ad-hoc exports.

## Receiver Contract

Recommended HTTP receiver behavior:

1. Require HTTPS or local-network trusted HTTP.
2. Require `Authorization: Bearer <token>` when exposed beyond localhost.
3. Validate `schemaVersion`.
4. Validate the JSON Schema or use the TypeScript helper `validateLibrarySnapshot`.
5. Verify the checksum when possible.
6. Upsert by `appId` and snapshot checksum.
7. Return `2xx` only after the snapshot is accepted.

Example TypeScript usage:

```ts
import {
  validateLibrarySnapshot,
  verifyLibrarySnapshotChecksum,
  indexSnapshotByAppId,
} from "@crimsab/repressurizer-integration";

const parsed = JSON.parse(body);
const result = validateLibrarySnapshot(parsed, { verifyChecksum: true });

if (!result.ok) {
  return new Response(JSON.stringify({ errors: result.issues }), { status: 400 });
}

if (!verifyLibrarySnapshotChecksum(result.snapshot)) {
  return new Response("Bad checksum", { status: 400 });
}

const gamesByAppId = indexSnapshotByAppId(result.snapshot);
```

## Versioning

Use `schemaVersion` for breaking wire-format changes. Additive fields should ship in a new minor package version first; receivers should ignore unknown package versions but should not accept unknown schema versions as v1.

## Package Release

The registry workflow is repository release infrastructure, not part of the snapshot schema contract. See `docs/integrations/integration-package-release.md` for the GitHub Actions publishing flow.
