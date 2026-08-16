# Repressurizer CLI

`repressurizer-cli` exposes read-only, backup-oriented, and explicitly guarded
local integration operations for scripts and personal automation.

```text
repressurizer-cli help
repressurizer-cli version
repressurizer-cli detect [steam_path]
repressurizer-cli load <steam_path> <steam_id3>
repressurizer-cli save <steam_path> <steam_id3> <collections.json>
repressurizer-cli backup <steam_path> <steam_id3> [description]
repressurizer-cli list-backups <steam_path> <steam_id3>
repressurizer-cli restore <steam_path> <steam_id3> <backup_filename>
repressurizer-cli delete-backup <steam_path> <steam_id3> <backup_filename>
repressurizer-cli cache-info
repressurizer-cli settings show
repressurizer-cli diagnostics <steam_path> <steam_id3> <steam_id64>
repressurizer-cli snapshot export [output.json]
repressurizer-cli snapshot validate <snapshot.json>
repressurizer-cli automation status
repressurizer-cli automation publish-now
repressurizer-cli api status
repressurizer-cli api token
repressurizer-cli api serve [--port <port>]
repressurizer-cli mcp status
repressurizer-cli mcp config
repressurizer-cli mcp doctor
repressurizer-cli mcp prompt [name]
repressurizer-cli mcp install <client_config.json>
repressurizer-cli mcp stdio
repressurizer-mcp [--self-test]
repressurizer-cli sam help
repressurizer-cli sam probe <steam_path> <app_id>
repressurizer-cli sam schema <steam_path> <app_id>
repressurizer-cli sam achievements <app_id> [filter]
repressurizer-cli sam backups <app_id>
repressurizer-cli sam backup-dir <app_id>
repressurizer-cli sam unlock <app_id> <achievement_id...> --yes
repressurizer-cli sam lock <app_id> <achievement_id...> --yes
repressurizer-cli sam unlock-all <app_id> --yes
repressurizer-cli sam lock-all <app_id> --yes
repressurizer-cli sam restore <app_id> <backup_path> --yes
repressurizer-cli sam action <input.json|-> --yes
```

Most commands print JSON so receivers can pipe the output into validation, dashboards, or local jobs.

`settings show`, `snapshot export`, and `automation publish-now` read Repressurizer's app settings from the normal app data directory. Snapshot export and publish require the desktop app to have completed setup and saved the Steam path, Steam account, and Steam Web API key.

`settings show` prints an operational summary with secrets redacted. It reports whether API keys, publish bearer tokens, and the Steam Family Store token are configured, but never prints those secret values. Steam IDs are tail-redacted.

`snapshot validate` checks a `repressurizer.library-snapshot.v1` file with the same Rust integration package receivers can use. It verifies schema invariants and checksum, prints a compact JSON summary on success, and exits non-zero on invalid snapshots.

`api status` reports the embedded loopback runtime, and `api token` prints the
current per-process bearer token locally. The listener starts automatically
when API or MCP is enabled in Settings; `api serve` remains only as a legacy
fallback for older installations. It binds only to 127.0.0.1 and CORS is
disabled. See the [local API guide](integrations/local-api.md).

The MCP commands follow the user-selected profile in desktop settings.
`mcp status` reports that profile, `mcp config` prints an MCP client fragment
that prefers the bundled `repressurizer-mcp` adapter, and `mcp doctor` checks
the local installation without printing credentials. `mcp stdio` remains a
compatibility adapter when the companion binary is not present. `mcp prompt`
prints copy-ready agent instructions. To merge the generated server entry into
a client JSON file, run `mcp install <path>`; the command preserves other
`mcpServers` entries. Every MCP write still requires `confirm: true`; see the
[MCP integration guide](integrations/mcp.md).

SAM probe, schema, backup listing, and backup directory commands are read-only.

`sam achievements` is also read-only. It uses the Steam path saved during Repressurizer setup, requests current user stats from Steam, and reconciles the local binary schema with achievement API names validated by the live Steamworks runtime. It can filter by achievement API name, flags, or `protected`.

Steamworks does not provide a supported API for rewriting
`appcache/stats/UserGameStatsSchema_<appId>.bin`. Repressurizer therefore leaves
that Steam-managed file untouched and refreshes its effective schema in memory.
Runtime-only entries are reported with `permissionVerified: false`,
`source: "steamRuntime"`, and the `PermissionUnavailable` flag.
The command also reports `schema.localPermissionCount`,
`schema.runtimeOnlyCount`, and `schema.permissionMetadataComplete`. The refresh
is an in-memory reconciliation with Steamworks; `steamManagedFileChanged`
remains `false` because Repressurizer does not rewrite Steam's schema file.
The Steamworks portion runs in an isolated helper process that exits after the
result is returned, preventing a long-running Repressurizer process from
retaining the selected game's Steam presence.

`sam action` is the only write-capable SAM command. It requires `--yes`, reads the same JSON shape used by the app's internal SAM action runner, creates before/after backups through the normal Repressurizer SAM backup flow, and still honors the app settings guardrails:

- The SAM integration must be enabled.
- Achievement writes must be enabled in Settings.
- Protected achievements are blocked by the SAM schema when detected.
- Achievement IDs missing local permission metadata remain blocked unless Steamworks validates
  them at runtime and the caller explicitly opts in with `allowUnverifiedPermissions`.

Example action input:

```json
{
  "steamPath": "C:\\Program Files (x86)\\Steam",
  "appId": 632470,
  "action": "unlock_selected",
  "achievementIds": ["ACHIEVEMENT_API_NAME"],
  "backupPath": null,
  "allowUnverifiedPermissions": false
}
```

Use `-` instead of a file path to read the action JSON from stdin.

The short commands use the Steam path saved during Repressurizer setup:

```powershell
.\repressurizer-cli.exe settings show
.\repressurizer-cli.exe snapshot validate .\repressurizer-library-snapshot.json
.\repressurizer-cli.exe sam achievements 632470 story
.\repressurizer-cli.exe sam unlock 632470 ACHIEVEMENT_API_NAME --yes
.\repressurizer-cli.exe sam lock 632470 ACHIEVEMENT_API_NAME --yes
.\repressurizer-cli.exe sam unlock-all 632470 --yes
.\repressurizer-cli.exe sam restore 632470 "C:\Users\you\AppData\Roaming\Repressurizer\sam_backups\632470\backup.json" --yes
```

When `sam achievements` reports an ID as `RuntimeVerified` with unavailable
permissions, an explicit guarded attempt can be made with:

```powershell
.\repressurizer-cli.exe sam unlock 1623730 Pal_Achievement_67 --allow-unverified --yes
```

`--allow-unverified` does not accept arbitrary API names and does not bypass
achievements marked `Protected` by the local schema. The ID must be returned by
Steamworks and have a readable current state after `RequestUserStats`.
