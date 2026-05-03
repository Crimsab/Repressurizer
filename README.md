# Repressurizer

Repressurizer is a desktop Steam library manager for editing Steam collections, organizing backlogs, and deciding what to play next.

It is inspired by Depressurizer, but it is a separate Tauri app with a Rust backend and a React interface.

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
bun run build
```

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

## Data And Backups

Repressurizer stores its own cache/settings under the operating system data directory in a `Repressurizer` folder. Steam collection backups are stored next to the Steam collection file they protect.

Steam collection edits affect local Steam data. Make a backup before testing against a real library.

## License

Repressurizer is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).
