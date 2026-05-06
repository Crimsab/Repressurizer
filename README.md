# Repressurizer

[![CI](https://github.com/Crimsab/Repressurizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Crimsab/Repressurizer/actions/workflows/ci.yml)
[![Release](https://github.com/Crimsab/Repressurizer/actions/workflows/release.yml/badge.svg)](https://github.com/Crimsab/Repressurizer/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/Crimsab/Repressurizer?sort=semver)](https://github.com/Crimsab/Repressurizer/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Crimsab/Repressurizer/total)](https://github.com/Crimsab/Repressurizer/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Tauri-Rust%20%2B%20React-24c8db)](https://tauri.app/)

Repressurizer is a modern desktop Steam library manager for editing Steam collections, organizing backlogs, and deciding what to play next.

It is a spiritual successor to Depressurizer: same useful idea, rebuilt as a separate Tauri app with a Rust backend and a React interface.

![Repressurizer library dashboard](docs/assets/dashboard.png)

## Status

Early Windows release. Repressurizer can read and write local Steam collection data, but it is still young software: keep backups enabled, use the preview before saving, and close Steam before applying collection changes.

## Features

### Steam Collection Editing

- Detects local Steam installs and Steam users.
- Reads and writes Steam collections from `cloud-storage-namespace-1.json`.
- Creates automatic backups before saving and supports manual backups/restores.
- Shows a save preview before writing collection changes.
- Lets you drag games into collections, bulk-select games, and edit multiple games at once.
- Keeps hidden games separate from normal library browsing.
- Can merge games that exist only in local Steam collections back into the visible library view.

### Library Browsing

- Grid and list views with Steam header/capsule artwork.
- Search by plain text or regex.
- Sort by name, playtime, last played, App ID, Metacritic, HLTB length, achievements, or local status.
- Right-click games to open details, launch with Steam, open the Steam store page, hide/unhide, set status, and manage collection membership.
- Game detail pages show metadata, categories, platforms, tags, personal notes, personal rating, achievements, HLTB time, and price data when available.

### Filters

- Playtime range and unplayed-only filters.
- HLTB main-story duration range.
- Personal status filters: Playing, Beaten, Completed, Abandoned.
- Local tag filters.
- Release year range.
- Platform filters: Windows, Mac, Linux.
- Metacritic score range.
- Achievement completion percentage range.
- Steam Family shared games.
- Possible duplicate games.
- Local collection-only games.
- Missing metadata.
- Likely delisted/unavailable Steam store entries.

### Search Query Syntax

The search box supports both normal text and structured filters:

```text
stalker
/final.*vii/i
hours:>10
playtime:2..40
hltb:<20
year:2013..2020
released:>=2024-01-01
genre:rpg
category:achievement
tag:backlog
dev:"Square Enix"
pub:capcom
platform:windows
status:playing
rating:>=8
metacritic:>85
achievements:50..100
family:true
duplicate:true
missing:true
delisted:true
appid:39140
```

Plain text search normalizes punctuation and dotted acronyms, so `stalker` matches `S.T.A.L.K.E.R.` titles.

### Auto-Categorizing

Repressurizer can generate Steam collections from your library data:

- By playtime buckets, such as short, medium, long, endless.
- By Steam genres.
- By Steam tags/categories.
- By release year, half-decade, or decade.
- By Metacritic score.
- By HLTB main-story duration.

Auto-categorizing uses cached metadata when possible, fetches missing Steam details in the background, and can create a backup before applying generated collections.

### Integrations And Data Sources

- Steam Web API: owned games, playtime, achievements, player summaries, friends comparison, wishlist, and store metadata.
- Steam Store API: game details, genres, categories, release dates, platforms, Metacritic, price data, and artwork.
- Steam Family: detects Family-shared apps with the Web API key when possible, with an optional Store `webapi_token` fallback for accounts where Steam requires Store-session auth.
- HowLongToBeat: fetches main story, main plus extras, completionist time, and confidence data.
- Local Steam files: reads and writes collection data directly, with backups.

### Planning And Discovery Tools

- What to Play Next recommendations based on status, rating, genre, HLTB length, and metadata.
- Library statistics for playtime, genres, platforms, publishers, Metacritic, value, and completion.
- Play history timeline.
- Wishlist view.
- Achievements overview.
- Friends comparison.
- Diagnostics export with redaction for safer bug reports.

![Repressurizer settings and maintenance](docs/assets/settings.png)

## Requirements

- Windows 10/11.
- Steam installed locally.
- WebView2 Runtime. It is already installed on most current Windows systems.
- A Steam Web API key for library details: <https://steamcommunity.com/dev/apikey>

Linux and macOS support are possible, but Windows is the supported target for the first release.

## Safety

Repressurizer is designed around local files. It needs file access so it can detect Steam installs, read collection data, write collection changes, and create/restore backups. The first-run setup explains this before any save operation.

Before public testing:

- Close Steam before saving collection changes.
- Keep automatic backups enabled.
- Use the save preview to inspect what will change.
- Keep a manual backup if you are testing against a library you care about.

Diagnostics exports are redacted and should not include Steam Web API keys, Store tokens, or full Steam IDs.

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

## Attribution

Repressurizer is inspired by Depressurizer, which is licensed under GPLv3. Repressurizer is a separate project and is not affiliated with Valve, Steam, or the Depressurizer maintainers.

## License

Repressurizer is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).
