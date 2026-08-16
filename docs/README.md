# Repressurizer Documentation

This folder contains the longer-form docs that do not belong in the project
README.

## User And App Behavior

| Document | Covers |
| --- | --- |
| [cache-and-network.md](cache-and-network.md) | Cache preparation, Steam request behavior, regional prices, rate limits, and proxy routing. |
| [steam-family.md](steam-family.md) | Steam Family detection and optional Store token fallback. |
| [privacy.md](privacy.md) | Local data, network behavior, redaction, and sensitive settings. |
| [localization.md](localization.md) | Translation coverage and localization status. |

## Automation And Integrations

| Document | Covers |
| --- | --- |
| [automation-export.md](automation-export.md) | Configuring automation snapshots and HTTP publishing. |
| [cli.md](cli.md) | `repressurizer-cli` diagnostics, snapshot, cache, backup, and Steam tooling commands. |
| [integrations/repressurizer-snapshot-v1.md](integrations/repressurizer-snapshot-v1.md) | Stable snapshot schema for receivers. |
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
