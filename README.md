# Repressurizer

Repressurizer is a modern desktop Steam library manager for editing Steam collections, organizing backlogs, and deciding what to play next.

It is a spiritual successor to Depressurizer: same useful idea, rebuilt as a separate Tauri app with a Rust backend and a React interface.

## Status

Early release build. The app can read and write Steam collection data, but you should keep backups enabled and close Steam before saving collection changes.

## Features

- Detect local Steam installs and Steam users.
- Load and save Steam collections from `cloud-storage-namespace-1.json`.
- Create automatic and manual backups before changing collections.
- Search, sort, filter, and switch between grid/list views.
- Drag games into collections and bulk-edit selected games.
- Auto-categorize by hours, genre, tags, year, and score.
- Show achievements, wishlist, friends comparison, play history, HLTB data, and library stats.
- Probe Steam Family shared games with the saved Web API key or an optional Store `webapi_token`.
- Export games, categories, and library summaries.

## Requirements

- Windows 10/11.
- Steam installed locally.
- WebView2 Runtime. It is already installed on most current Windows systems.
- A Steam Web API key for library details: <https://steamcommunity.com/dev/apikey>

Linux and macOS support are possible, but Windows is the supported target for the first release.

## Development

Use Bun for JavaScript dependencies and scripts.

```bash
bun install
bun run check
bun run test:unit
bun run test:e2e
bun run build
```

`bun run test` runs both unit tests and the Playwright browser smoke checks. Playwright attaches dashboard/settings screenshots under `test-results/` for visual review.

For a local Windows build:

```powershell
bun install
bun tauri build
```

For cross-compiling a Windows portable build from Linux:

```bash
bash build.sh
```

Release builds are produced by GitHub Actions as:

- NSIS installer
- portable Windows zip

Version tags are created from `package.json` (`v0.1.0`, `v0.2.0`, ...). Each tag triggers a GitHub Release with generated changelog notes and Windows artifacts.

For Steam Family setup and the optional Store `webapi_token` fallback, see [docs/steam-family.md](docs/steam-family.md).

## Data And Backups

Repressurizer stores its own cache/settings under the operating system data directory in a `Repressurizer` folder. Steam collection backups are stored next to the Steam collection file they protect.

Steam collection edits affect local Steam data. Make a backup before testing against a real library.

## License

Repressurizer is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).
