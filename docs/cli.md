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
```

Most commands print JSON so receivers can pipe the output into validation, dashboards, or local jobs.

`snapshot export` and `automation publish-now` read Repressurizer's app settings from the normal app data directory. They require the desktop app to have completed setup and saved the Steam path, Steam account, and Steam Web API key.

SAM commands are read-only in the public CLI surface. Achievement write actions remain app-gated and intentionally are not exposed as casual CLI commands.
