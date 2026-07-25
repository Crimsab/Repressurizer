# Steam Tools

Steam Tools are optional maintenance and integration features. They operate closer to local Steam state than normal browsing, so each action should be treated as an explicit maintenance operation.

## Before using a tool

- Read the confirmation and affected-path preview.
- Close Steam when the tool changes files Steam also owns.
- Keep or create a backup.
- Export redacted diagnostics if a tool reports an unexpected state.

Scripted equivalents are available through the [Repressurizer CLI](../cli.md). Guarded commands require explicit flags before they perform writes.

## Achievement schema refresh

Opening a game's Achievements tab reconciles Steam's local permission schema
with achievement IDs that the running Steamworks client can read. The SAM panel
shows how many entries have local permission metadata and how many are
runtime-only. Use **Refresh schema** after starting Steam or changing games if
the first check ran while Steam was unavailable.

Repressurizer does not modify
`appcache/stats/UserGameStatsSchema_<appId>.bin`. Steam owns that file. A
runtime-only achievement still requires a second explicit confirmation before
Repressurizer attempts a write, and every target must expose a readable current
state after `RequestUserStats`.
