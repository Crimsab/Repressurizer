# Integrations

Open **Settings → Integrations** to configure optional connections without mixing their credentials and safety controls into the normal Steam settings. The page contains two accordion sections:

- **SAM** enables local achievement changes on Windows. These operations run close to local Steam state, require explicit confirmation, and create safety backups.
- **GG.deals** enables current-price and historical-low data in game details using the user's own API key. See [GG.deals pricing](../integrations/gg-deals.md).

## Before using SAM

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

The live Steamworks check runs in a short-lived hidden helper process. Steam may
briefly show the selected AppID as running while the check is active, but the
helper exits as soon as the schema is returned so Repressurizer does not keep
that game presence attached to its long-running desktop process.

Repressurizer does not modify
`appcache/stats/UserGameStatsSchema_<appId>.bin`. Steam owns that file. A
runtime-only achievement still requires a second explicit confirmation before
Repressurizer attempts a write, and every target must expose a readable current
state after `RequestUserStats`.
