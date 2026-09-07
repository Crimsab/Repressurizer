# Repressurizer Documentation

This folder contains the longer-form docs that do not belong in the project
README.

## User And App Behavior

| Document | Covers |
| --- | --- |
| [cache-and-network.md](cache-and-network.md) | Cache preparation, Store-country price snapshots, Steam tag/Deck enrichment, rate limits, and proxy routing. |
| [steam-family.md](steam-family.md) | Steam Family detection and optional Store token fallback. |
| [privacy.md](privacy.md) | Local data, network behavior, redaction, and sensitive settings. |
| [localization.md](localization.md) | Translation coverage and localization status. |
| [user-guide/planning-and-maintenance.md](user-guide/planning-and-maintenance.md) | Session planning, Inbox, Time Machine, profiles, sync, storage, Deck packs, rule packs, and metadata health. |

## Automation And Integrations

| Document | Covers |
| --- | --- |
| [automation-export.md](automation-export.md) | Configuring automation snapshots and HTTP publishing. |
| [cli.md](cli.md) | `repressurizer-cli` diagnostics, snapshot, cache, backup, and Steam tooling commands. |
| [integrations/repressurizer-snapshot-v1.md](integrations/repressurizer-snapshot-v1.md) | Stable snapshot schema for receivers. |
| [integrations/portable-formats-v1.md](integrations/portable-formats-v1.md) | Profile, folder-sync, and Community Rule Pack v1 contracts. |
| [integrations/mcp.md](integrations/mcp.md) | Optional local MCP access with user-selected permissions. |
| [integrations/local-api.md](integrations/local-api.md) | Authenticated loopback HTTP API for local agents and scripts. |
| [integrations/openapi.yaml](integrations/openapi.yaml) | Versioned v1 API contract. |
| [integrations/mcp-evals.xml](integrations/mcp-evals.xml) | Ten-scenario MCP integration eval set. |
| [integrations/integration-package-release.md](integrations/integration-package-release.md) | TypeScript integration package publishing notes. |
| [integrations/rust-integration-crate.md](integrations/rust-integration-crate.md) | Rust integration crate publishing notes. |

## Visual Assets

The repository keeps only the README-facing images and demo media under
[assets/](assets/). The capture workflow itself stays outside the app source so
it does not become part of releases or developer tooling by accident.

The current product captures live beside the original walkthrough images:

- `assets/screenshots/library.png` - library dashboard and navigation.
- `assets/screenshots/store-region.png` - Store country and returned currency.
- `assets/screenshots/metadata-health.png` - provider and per-game freshness.
- `assets/screenshots/pack-my-deck.png` - travel-pack constraints and local metadata.
