# CLI and integrations

Repressurizer supports both interactive use and controlled automation.

## CLI

`repressurizer-cli` provides diagnostics, snapshots, cache inspection, backup operations, and guarded Steam tooling. Start with the [CLI reference](../cli.md).

## Stable snapshots

Automation export publishes `repressurizer.library-snapshot.v1` JSON to an HTTP receiver. Consumers can validate the payload with the published TypeScript package or Rust crate.

- [Configure automation export](../automation-export.md)
- [Snapshot v1 schema](repressurizer-snapshot-v1.md)
- [Receiver example](receiver-example.md)
