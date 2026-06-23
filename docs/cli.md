# Repressurizer CLI

`repressurizer-cli` exposes read-only and backup-oriented operations for scripts and personal automation.

```text
repressurizer-cli version
repressurizer-cli detect [steam_path]
repressurizer-cli load <steam_path> <steam_id3>
repressurizer-cli save <steam_path> <steam_id3> <collections.json>
repressurizer-cli backup <steam_path> <steam_id3> [description]
repressurizer-cli list-backups <steam_path> <steam_id3>
repressurizer-cli restore <steam_path> <steam_id3> <backup_filename>
repressurizer-cli delete-backup <steam_path> <steam_id3> <backup_filename>
repressurizer-cli cache-info
repressurizer-cli diagnostics <steam_path> <steam_id3> <steam_id64>
repressurizer-cli snapshot export [output.json]
repressurizer-cli automation status
repressurizer-cli automation publish-now
repressurizer-cli sam probe <steam_path> <app_id>
repressurizer-cli sam schema <steam_path> <app_id>
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

`snapshot export` and `automation publish-now` read Repressurizer's app settings from the normal app data directory. They require the desktop app to have completed setup and saved the Steam path, Steam account, and Steam Web API key.

SAM probe, schema, backup listing, and backup directory commands are read-only.

`sam action` is the only write-capable SAM command. It requires `--yes`, reads the same JSON shape used by the app's internal SAM action runner, creates before/after backups through the normal Repressurizer SAM backup flow, and still honors the app settings guardrails:

- Steam Tools must be enabled.
- Achievement writes must be enabled in Settings.
- Protected achievements are blocked by the SAM schema when detected.

Example action input:

```json
{
  "steamPath": "C:\\Program Files (x86)\\Steam",
  "appId": 632470,
  "action": "unlock_selected",
  "achievementIds": ["ACHIEVEMENT_API_NAME"],
  "backupPath": null
}
```

Use `-` instead of a file path to read the action JSON from stdin.

The short commands use the Steam path saved during Repressurizer setup:

```powershell
.\repressurizer-cli.exe sam unlock 632470 ACHIEVEMENT_API_NAME --yes
.\repressurizer-cli.exe sam lock 632470 ACHIEVEMENT_API_NAME --yes
.\repressurizer-cli.exe sam unlock-all 632470 --yes
.\repressurizer-cli.exe sam restore 632470 "C:\Users\you\AppData\Roaming\Repressurizer\sam_backups\632470\backup.json" --yes
```
