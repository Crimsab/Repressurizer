# Build a snapshot receiver

A receiver should validate the schema, authenticate the request according to your deployment, store or process the snapshot idempotently, and return a clear success status.

## Minimal flow

```text
Repressurizer
  -> POST stable JSON snapshot
  -> receiver validates repressurizer.library-snapshot.v1
  -> receiver compares checksum or snapshot identity
  -> receiver stores or processes new content
  -> receiver returns 2xx
```

## Receiver rules

- Reject payloads with an unknown schema version.
- Set a body-size limit appropriate for the expected library.
- Do not log authorization headers or the full payload by default.
- Make repeated delivery of the same snapshot safe.
- Return non-2xx for validation or persistence failure so Repressurizer can report the publish failure.

Use [`@crimsab/repressurizer-integration`](https://www.npmjs.com/package/@crimsab/repressurizer-integration) or [`repressurizer-integration`](https://crates.io/crates/repressurizer-integration) instead of maintaining a second handwritten schema.
