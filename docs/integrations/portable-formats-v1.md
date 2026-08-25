# Portable profile and rule-pack formats

Repressurizer 0.8 defines three local JSON formats. They are data exchange
formats, not executable extension APIs. Unknown schema versions are rejected
before any local state changes.

## Repressurizer Profile v1

A profile document has a `manifest` and `sections` object. The manifest includes
`schemaVersion`, stable `profileId`, display `name`, export time, `deviceId`, an
optional Steam account ID, included section names, and a checksum of the
canonical manifest and payload.

Allowed sections are `diary`, `kanban`, `autocat`, `planner`, `preferences`,
`settings`, `collections`, and `history`. Import is selective. Schema v1 is the
migration baseline; newer versions are rejected with a distinct error so an
older app never silently discards fields.

## Folder Sync Envelope v1

The sync envelope contains `schemaVersion`, `deviceId`, monotonic per-device
`sequence`, `writtenAt`, `previousChecksum`, a checked profile, an entity
`journal`, and its own checksum. Filenames are unique to device and sequence.

Merge uses the last common local document as base. Objects merge recursively;
arrays use stable `id`, `key`, `appId`, or `appid` fields. Conflicting leaves are
shown to the user. Neither file modification time nor device clock decides a
conflict.

## Community Rule Pack v1

The canonical JSON Schema is
[`community-rule-pack-v1.schema.json`](schemas/community-rule-pack-v1.schema.json).
A pack declares its identity, author, SemVer version, compatible Repressurizer
range, required data sources, destination collection names, declarative Custom
AutoCat rules, changelog, and checksum.

The runtime adds stricter semantic checks after schema validation:

- at most 100 rules per pack;
- no `script`, `code`, `eval`, `function`, `executable`, `command`, or `url`
  keys at any depth;
- title regex values are limited to 120 characters;
- backreferences, lookarounds, and obvious nested quantifiers are rejected;
- each rule must have a non-empty destination and condition tree;
- checksum verification occurs before installation.

Pack installation creates or updates AutoCat presets only. It never writes
Steam collections automatically.

