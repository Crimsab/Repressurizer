<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Repressurizer app icon">
</p>

<h1 align="center">Repressurizer</h1>

<p align="center">
  A backup-first Windows app for organizing large Steam libraries.
</p>

<p align="center">
  <a href="https://github.com/Crimsab/Repressurizer/actions/workflows/ci.yml"><img src="https://github.com/Crimsab/Repressurizer/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/Crimsab/Repressurizer/releases/latest"><img src="https://img.shields.io/github/v/release/Crimsab/Repressurizer?sort=semver" alt="Latest release"></a>
  <a href="https://github.com/Crimsab/Repressurizer/releases"><img src="https://img.shields.io/github/downloads/Crimsab/Repressurizer/total" alt="Total downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="GPLv3 license"></a>
</p>

<p align="center">
  <a href="https://github.com/Crimsab/Repressurizer/releases/latest"><strong>Download Repressurizer</strong></a>
  &nbsp;·&nbsp;
  <a href="https://crimsab.github.io/Repressurizer/">Documentation</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Crimsab/Repressurizer/issues/new/choose">Report a problem</a>
</p>

<p align="center">
  <img src=".github/assets/repressurizer-demo.gif" alt="Repressurizer library and collection workflow">
</p>

Repressurizer edits local Steam collections, enriches games with cached metadata,
builds AutoCat collections, exports clean library snapshots, and creates backups
before writing anything back to Steam.

It is inspired by Depressurizer, but rebuilt as a separate Tauri application
with a Rust backend and a React interface.

## Why Repressurizer

| Organize | Enrich | Protect |
| --- | --- | --- |
| Create, rename, merge, color, and bulk-edit collections. | Cache Steam details, reviews, prices, achievements, HLTB times, and Steam Family entries. | Preview collection changes and create automatic backups before local writes. |
| Search with text, regex, and structured filters. | Build AutoCat rules from genres, tags, year, playtime, platforms, publishers, and more. | Restore backups and export redacted diagnostics when something goes wrong. |

Repressurizer does not edit your Steam account remotely. Collection saves are
local file writes. Metadata fetches and automation exports are separate network
operations.

## Download

Get the current stable build from the
[latest release](https://github.com/Crimsab/Repressurizer/releases/latest).

| Asset | Use |
| --- | --- |
| `Repressurizer_..._x64-setup.exe` | Normal Windows installation with built-in updates. |
| `Repressurizer-portable-windows-x64.zip` | Portable app without installation. |
| `Repressurizer-cli-windows-x64.zip` | Diagnostics, snapshots, cache checks, backups, and guarded Steam tooling. |

Windows SmartScreen may warn because early releases are not signed with a
commercial Windows certificate. Download only from this repository and read the
[installation guide](https://crimsab.github.io/Repressurizer/getting-started/installation/)
before continuing past an unfamiliar publisher warning.

Want the newest commit instead? The rolling
[`preview` prerelease](https://github.com/Crimsab/Repressurizer/releases/tag/preview)
is rebuilt from every push to `main`. Use it for testing, not as your only
recovery path.

## Quick start

1. Install Repressurizer or extract the portable ZIP.
2. Add a Steam Web API key from <https://steamcommunity.com/dev/apikey>.
3. Load your local Steam library.
4. Prepare the metadata cache needed by your filters and AutoCat rules.
5. Close Steam before saving collection changes.
6. Review the save preview and keep backups enabled.

The full walkthrough covers [first-run setup](https://crimsab.github.io/Repressurizer/getting-started/first-run/)
and your [first safe save](https://crimsab.github.io/Repressurizer/getting-started/safe-first-save/).

## Search a large library

Plain text search ignores common punctuation differences, so `stalker` matches
titles such as `S.T.A.L.K.E.R.`. Regex and structured filters can narrow the
library further:

```
/final.*vii/i
playtime:2..40
hltb:<20
year:2013..2020
genre:rpg
tag:backlog
dev:"Square Enix"
platform:windows
status:playing
metacritic:>85
achievements:50..100
family:true
duplicate:true
missing:true
```

See the [search and filters reference](https://crimsab.github.io/Repressurizer/user-guide/search-and-filters/)
for operators and metadata requirements.

## Build useful AutoCat collections

AutoCat can create or update collections from local playtime, cached Steam
metadata, HLTB data, reviews, achievements, languages, platforms, developers,
publishers, and imported Depressurizer presets.

It prefers cached data, can fetch missing data in the background, and supports
cached-only runs when you want no additional network requests.

![AutoCat preview](docs/assets/autocat.png)

[Read the AutoCat guide](https://crimsab.github.io/Repressurizer/user-guide/autocat/)

## Export and automate

Interactive exports support TXT, Markdown, JSON, and CSV with selectable fields
and filters. Automation export publishes a stable
`repressurizer.library-snapshot.v1` payload to an HTTP receiver.

Consumers can validate snapshots with:

- TypeScript: [`@crimsab/repressurizer-integration`](https://www.npmjs.com/package/@crimsab/repressurizer-integration)
- Rust: [`repressurizer-integration`](https://crates.io/crates/repressurizer-integration)

Start with the [integration overview](https://crimsab.github.io/Repressurizer/integrations/)
or [CLI reference](https://crimsab.github.io/Repressurizer/cli/).

## Safety model

Before saving collection changes:

- Close Steam completely, including its system tray process.
- Keep automatic backups enabled.
- Read the save preview, especially removed memberships.
- Keep a manual backup when testing large AutoCat batches or imports.
- Reopen Steam and verify a small sample before deleting older backups.

Repressurizer stores settings and caches in the operating system app data
directory. Steam collection backups are stored next to the collection file they
protect. Read [Backups and restore](https://crimsab.github.io/Repressurizer/user-guide/backups/)
and [Privacy](https://crimsab.github.io/Repressurizer/privacy/) for details.

## Repressurizer and Depressurizer

Repressurizer is a spiritual successor, not an in-place upgrade or an official
continuation. It can import useful Depressurizer data and presets, but it has its
own storage, interface, release process, and safety model.

Keep your original database and Steam files backed up while migrating. Follow
the [migration recipe](https://crimsab.github.io/Repressurizer/recipes/migrate-from-depressurizer/)
before applying imported rules to a library you care about.

## Requirements

- Windows 10 or Windows 11.
- Steam installed locally.
- WebView2 Runtime, already present on most current Windows systems.
- A Steam Web API key for owned games, achievements, wishlist data, and related metadata.

Linux and macOS are possible future targets, but Windows is the supported
platform today.

## Development

```bash
bun install --frozen-lockfile
bun run check
bun run test:unit
bun run test:e2e
bun run build
```

Rust checks live under `src-tauri/`:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

See the [development guide](https://crimsab.github.io/Repressurizer/development/)
and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Project links

- [Documentation](https://crimsab.github.io/Repressurizer/)
- [Releases](https://github.com/Crimsab/Repressurizer/releases)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)
- [Issue templates](https://github.com/Crimsab/Repressurizer/issues/new/choose)

## Attribution and license

Repressurizer is inspired by Depressurizer, which is licensed under GPLv3. It
is a separate project and is not affiliated with Valve, Steam, or the
Depressurizer maintainers.

Repressurizer is licensed under the GNU General Public License v3.0. See
[LICENSE](LICENSE).
