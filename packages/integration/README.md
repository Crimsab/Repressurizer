# @crimsab/repressurizer-integration

Schema-first helpers for Repressurizer library snapshot receivers.

This package contains:

- TypeScript types for `repressurizer.library-snapshot.v1`
- runtime validation helpers
- checksum verification
- appId lookup helpers
- snapshot diff helpers
- the canonical JSON Schema

```ts
import {
  validateLibrarySnapshot,
  indexSnapshotByAppId,
} from "@crimsab/repressurizer-integration";

const result = validateLibrarySnapshot(JSON.parse(body), { verifyChecksum: true });

if (!result.ok) {
  console.error(result.issues);
} else {
  const games = indexSnapshotByAppId(result.snapshot);
  console.log(games.get(632470));
}
```

The snapshot is read-only integration data. Receivers should not treat it as a control channel into Steam or Repressurizer.

See `docs/integrations/repressurizer-snapshot-v1.md` in the repository for the receiver contract and GitHub Actions publishing notes.
