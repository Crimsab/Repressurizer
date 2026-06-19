# Automation Export

Repressurizer can publish a read-only JSON snapshot of the current library to another app or server.

The snapshot is meant for tools such as launchers, dashboards, backlog trackers, and personal services like Game Vault. It is not a remote-control API for Steam or Repressurizer.

## What Gets Exported

The HTTP body uses the public `repressurizer.library-snapshot.v1` schema and includes:

- Steam app IDs and names
- playtime and last-played values from the loaded Steam library
- Repressurizer collections
- Steam metadata already known to Repressurizer
- HLTB values when Repressurizer has matched them
- a stable checksum used to detect changed snapshots

Receivers should key game rows by `appId`.

## How Publishing Works

In Settings > Automation, configure:

- `HTTP endpoint`: the URL that receives the snapshot with `POST`
- `Bearer token`: optional `Authorization: Bearer ...` value
- `Hours`: interval used when automatic publishing is enabled

When automatic publishing is enabled, Repressurizer rebuilds the snapshot at the configured interval. It only sends the snapshot when the stable checksum changed.

`Publish now` always attempts a publish, even if the snapshot looks unchanged.

## Security And Limits

Automation export is read-only:

- it does not write to Steam
- it does not import games automatically into another app
- it does not send Steam cookies or browser sessions
- it does not expose a command channel back into Repressurizer

Use a trusted local endpoint for personal setups. If the endpoint is reachable outside your machine or LAN, require a bearer token and HTTPS.

## Recommended Receiver Behavior

Receivers should:

1. Validate `schemaVersion`.
2. Validate the JSON Schema or use an integration library.
3. Verify the checksum when possible.
4. Upsert games by `appId`.
5. Store the snapshot checksum and import time.
6. Show Repressurizer as the data source next to imported rows.
7. Return a `2xx` status only after accepting the snapshot.

For example, Game Vault can accept snapshots at an endpoint such as:

```text
POST /api/steam/repressurizer/import
Authorization: Bearer <optional-token>
Content-Type: application/json
```

## Integration Libraries

TypeScript receivers can use:

```text
@crimsab/repressurizer-integration
```

Rust receivers can use:

```text
repressurizer-integration
```

Both libraries are schema-first helpers for validating snapshots, checking checksums, indexing by `appId`, diffing snapshots, and reading HLTB values.

See also:

- [Snapshot schema v1](integrations/repressurizer-snapshot-v1.md)
- [TypeScript package release](integrations/integration-package-release.md)
- [Rust crate release](integrations/rust-integration-crate.md)
