# Changelog

All notable user-facing changes are generated from release tags and Conventional Commit subjects.

Run `bun run changelog:write` after changing release tags or commit history.

## 0.7.0 - 2026-08-20

### Added

- Settings: collapsible appearance sections and leaner MCP panel ([47d3f4e](https://github.com/Crimsab/Repressurizer/commit/47d3f4e))
- Diary: organized backups and robust export writers ([c0bec2f](https://github.com/Crimsab/Repressurizer/commit/c0bec2f))
- Diary: Timeline with three layouts and achievements ([9ccbe63](https://github.com/Crimsab/Repressurizer/commit/9ccbe63))
- Diary: Kanban board with custom columns and drag & drop ([d8c0fd2](https://github.com/Crimsab/Repressurizer/commit/d8c0fd2))
- Diary: Diary workspace with notebook, pages, journal and ratings ([c1f38ec](https://github.com/Crimsab/Repressurizer/commit/c1f38ec))
- AutoCat: Diary conditions to custom rules ([7118208](https://github.com/Crimsab/Repressurizer/commit/7118208))
- Steam: detect locally installed games and add installation filters ([1ceede6](https://github.com/Crimsab/Repressurizer/commit/1ceede6))
- Integrations: local API and MCP adapter ([64b6df9](https://github.com/Crimsab/Repressurizer/commit/64b6df9))

### Fixed

- Release: pass release tag to workflow dispatch ([1415843](https://github.com/Crimsab/Repressurizer/commit/1415843))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.7.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.6.4...v0.7.0)

## 0.6.4 - 2026-08-16

### Added

- Settings: integration panels and update changelog ([34b151c](https://github.com/Crimsab/Repressurizer/commit/34b151c))

### Fixed

- Gg Deals: accept string price responses ([c454e83](https://github.com/Crimsab/Repressurizer/commit/c454e83))
- Preview: build MSI-compatible Windows previews ([4d500d1](https://github.com/Crimsab/Repressurizer/commit/4d500d1))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.6.4) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.6.3...v0.6.4)

## 0.6.3 - 2026-08-15

### Fixed

- Windows: use MSI installer to avoid NSIS false positives ([0bbb906](https://github.com/Crimsab/Repressurizer/commit/0bbb906))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.6.3) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.6.2...v0.6.3)

## 0.6.2 - 2026-08-15

### Fixed

- Release: wait for VirusTotal analyses before gating ([08b84f2](https://github.com/Crimsab/Repressurizer/commit/08b84f2))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.6.2) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.6.1...v0.6.2)

## 0.6.1 - 2026-08-15

### Added

- Windows: embed SAM sidecar for portable builds ([7001326](https://github.com/Crimsab/Repressurizer/commit/7001326))

### Fixed

- Macos: gate SAM binary behind sidecar feature ([14b81e2](https://github.com/Crimsab/Repressurizer/commit/14b81e2))
- Macos: disable inherited sidecar in universal build ([724d022](https://github.com/Crimsab/Repressurizer/commit/724d022))
- Macos: clear platform sidecar override ([9633372](https://github.com/Crimsab/Repressurizer/commit/9633372))
- Macos: disable Windows SAM sidecar bundling ([6962d1b](https://github.com/Crimsab/Repressurizer/commit/6962d1b))
- Release: keep portable archive executable-only ([933a1b3](https://github.com/Crimsab/Repressurizer/commit/933a1b3))
- Windows: isolate SAM bridge in sidecar ([af0fbb1](https://github.com/Crimsab/Repressurizer/commit/af0fbb1))
- Ci: distinguish unknown VirusTotal hashes ([038bb9d](https://github.com/Crimsab/Repressurizer/commit/038bb9d))
- Windows: align webview2 windows-core version ([e18befe](https://github.com/Crimsab/Repressurizer/commit/e18befe))
- Steam Family: remove native clipboard manager ([9edf81a](https://github.com/Crimsab/Repressurizer/commit/9edf81a))
- Release: validate immutable tag before builds ([05206bb](https://github.com/Crimsab/Repressurizer/commit/05206bb))
- Http: lock reqwest query dependencies ([bfa419a](https://github.com/Crimsab/Repressurizer/commit/bfa419a))
- Http: enable reqwest query support ([5c0e6d7](https://github.com/Crimsab/Repressurizer/commit/5c0e6d7))
- Build: normalize Vite 8 target ([0743d2a](https://github.com/Crimsab/Repressurizer/commit/0743d2a))
- Release: ship ad-hoc signed macOS builds ([1882295](https://github.com/Crimsab/Repressurizer/commit/1882295))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.6.1) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.6.0...v0.6.1)

## 0.6.0 - 2026-08-14

### Added

- Updater: stable and beta release channels ([4247fc1](https://github.com/Crimsab/Repressurizer/commit/4247fc1))
- Family: explicit clipboard token helper ([7dc5fb7](https://github.com/Crimsab/Repressurizer/commit/7dc5fb7))
- Pricing: opt-in GG.deals integration ([d7aff17](https://github.com/Crimsab/Repressurizer/commit/d7aff17))
- Macos: Steam detection and universal packaging ([c5c3926](https://github.com/Crimsab/Repressurizer/commit/c5c3926))
- Recommend: explainable backlog ranking ([49353f3](https://github.com/Crimsab/Repressurizer/commit/49353f3))
- Diagnostics: include redacted native crash summaries ([9ec1abc](https://github.com/Crimsab/Repressurizer/commit/9ec1abc))
- AutoCat: export preview membership diffs ([c2c25f6](https://github.com/Crimsab/Repressurizer/commit/c2c25f6))
- Linux desktop support ([7558f15](https://github.com/Crimsab/Repressurizer/commit/7558f15))

### Fixed

- Macos: verify universal binaries with Xcode lipo syntax ([13d5132](https://github.com/Crimsab/Repressurizer/commit/13d5132))
- Macos: merge universal CLI before bundling ([3caa38c](https://github.com/Crimsab/Repressurizer/commit/3caa38c))
- Macos: make Steam client probe tests platform-neutral ([2c57c7f](https://github.com/Crimsab/Repressurizer/commit/2c57c7f))
- Ci: resolve library dependencies before audit ([fbf161c](https://github.com/Crimsab/Repressurizer/commit/fbf161c))
- Ci: install cargo-audit with locked dependencies ([db5df80](https://github.com/Crimsab/Repressurizer/commit/db5df80))
- Updater: handle portable and package installs ([89d8357](https://github.com/Crimsab/Repressurizer/commit/89d8357))
- Deps: remediate transitive vulnerabilities ([60d328d](https://github.com/Crimsab/Repressurizer/commit/60d328d))
- Steam Tools: isolate schema refresh process ([cc6e194](https://github.com/Crimsab/Repressurizer/commit/cc6e194))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.6.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.6...v0.6.0)

## 0.5.6 - 2026-07-25

### Added

- Steam Tools: harden schema refresh workflow ([22a1b64](https://github.com/Crimsab/Repressurizer/commit/22a1b64))

### Fixed

- Steam Tools: handle incomplete achievement schemas ([a143ac3](https://github.com/Crimsab/Repressurizer/commit/a143ac3))
- Ignore preview tags in release notes ([dcca7c6](https://github.com/Crimsab/Repressurizer/commit/dcca7c6))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.6) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.5...v0.5.6)

## 0.5.5 - 2026-07-18

### Fixed

- Tolerate isolated antivirus false positives ([8653b62](https://github.com/Crimsab/Repressurizer/commit/8653b62))
- Ignore uninitialized Steam LevelDB directories ([7e379ac](https://github.com/Crimsab/Repressurizer/commit/7e379ac))
- Publish clean releases automatically ([4386d7c](https://github.com/Crimsab/Repressurizer/commit/4386d7c))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.5) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.4...v0.5.5)

## 0.5.4 - 2026-07-18

### Fixed

- Wait for CI before releasing tags ([bf9a682](https://github.com/Crimsab/Repressurizer/commit/bf9a682))
- Queue overlapping metadata refreshes ([a21e39c](https://github.com/Crimsab/Repressurizer/commit/a21e39c))
- Queue original dates after direct detail fetches ([95b548c](https://github.com/Crimsab/Repressurizer/commit/95b548c))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.4) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.3...v0.5.4)

## 0.5.3 - 2026-07-17

### Fixed

- Queue metadata refreshes during active scans ([538047e](https://github.com/Crimsab/Repressurizer/commit/538047e))
- Polish documentation rendering and accessibility ([beb7d4d](https://github.com/Crimsab/Repressurizer/commit/beb7d4d))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.3) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.2...v0.5.3)

## 0.5.2 - 2026-07-13

### Fixed

- Separate tag and flag metadata ([0702966](https://github.com/Crimsab/Repressurizer/commit/0702966))
- Invalidate v2 AutoCat previews ([72929f3](https://github.com/Crimsab/Repressurizer/commit/72929f3))
- Require real metadata for tag autocats ([a8e80fa](https://github.com/Crimsab/Repressurizer/commit/a8e80fa))
- Preserve uncertain metadata memberships ([2452ed0](https://github.com/Crimsab/Repressurizer/commit/2452ed0))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.2) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.1...v0.5.2)

## 0.5.1 - 2026-07-11

### Fixed

- Invalidate unsafe AutoCat previews ([3d4f280](https://github.com/Crimsab/Repressurizer/commit/3d4f280))
- Resolve cached names in save preview ([cd255b0](https://github.com/Crimsab/Repressurizer/commit/cd255b0))
- Isolate AutoCat preset apply scopes ([dab4e0a](https://github.com/Crimsab/Repressurizer/commit/dab4e0a))
- Exclude orphaned AutoCat metadata ([6000655](https://github.com/Crimsab/Repressurizer/commit/6000655))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.1) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.5.0...v0.5.1)

## 0.5.0 - 2026-07-10

### Added

- Resize complex workspace dialogs ([dcf2274](https://github.com/Crimsab/Repressurizer/commit/dcf2274))
- Make AutoCat workspace resizable ([646ab31](https://github.com/Crimsab/Repressurizer/commit/646ab31))
- Persistent resizable dialog panels ([97d97e8](https://github.com/Crimsab/Repressurizer/commit/97d97e8))
- Accessible toolbar tooltips ([9f81cce](https://github.com/Crimsab/Repressurizer/commit/9f81cce))
- Make advanced category filters searchable ([77a39b7](https://github.com/Crimsab/Repressurizer/commit/77a39b7))
- Reveal truncated category names ([44c623b](https://github.com/Crimsab/Repressurizer/commit/44c623b))
- Reveal all save preview changes ([ce102f2](https://github.com/Crimsab/Repressurizer/commit/ce102f2))
- AutoCat: custom rule builder ([27277eb](https://github.com/Crimsab/Repressurizer/commit/27277eb))
- Library refresh cache controls ([e92c45a](https://github.com/Crimsab/Repressurizer/commit/e92c45a))
- Preview channel and category chip settings ([85a0729](https://github.com/Crimsab/Repressurizer/commit/85a0729))
- Improve compare collection navigation ([4d7e4a4](https://github.com/Crimsab/Repressurizer/commit/4d7e4a4))

### Fixed

- Polish resizable dialog focus and layout ([3caf0da](https://github.com/Crimsab/Repressurizer/commit/3caf0da))
- Keep dirty header within minimum width ([75d82a7](https://github.com/Crimsab/Repressurizer/commit/75d82a7))
- Dismiss tooltips when actions open ([d434069](https://github.com/Crimsab/Repressurizer/commit/d434069))
- Clarify AutoCat metadata requirements ([1d97d19](https://github.com/Crimsab/Repressurizer/commit/1d97d19))
- Raise secondary text contrast across themes ([a4507ce](https://github.com/Crimsab/Repressurizer/commit/a4507ce))
- Open save preview at the summary ([76bd5d9](https://github.com/Crimsab/Repressurizer/commit/76bd5d9))
- Keep header actions reachable at minimum width ([2fc43e1](https://github.com/Crimsab/Repressurizer/commit/2fc43e1))
- Let AutoCat Run all skip ignored details ([bfd428f](https://github.com/Crimsab/Repressurizer/commit/bfd428f))
- Harden categorization and fetch lifecycles ([aa97c43](https://github.com/Crimsab/Repressurizer/commit/aa97c43))
- Satisfy latest clippy ([c8c6e8a](https://github.com/Crimsab/Repressurizer/commit/c8c6e8a))
- Harden backups automation and UI ([253254e](https://github.com/Crimsab/Repressurizer/commit/253254e))
- AutoCat: polish custom rule preview ([1e8e382](https://github.com/Crimsab/Repressurizer/commit/1e8e382))

### Changed

- Organize frontend feature modules ([184b913](https://github.com/Crimsab/Repressurizer/commit/184b913))
- Optimize category lookups and note lifecycle ([18b86e0](https://github.com/Crimsab/Repressurizer/commit/18b86e0))
- Decompose Steam collections storage ([c0cca52](https://github.com/Crimsab/Repressurizer/commit/c0cca52))
- Extract automation snapshot builder ([53094af](https://github.com/Crimsab/Repressurizer/commit/53094af))
- Decompose Tauri runtime modules ([d822b0c](https://github.com/Crimsab/Repressurizer/commit/d822b0c))
- Decompose SAM integration ([78807da](https://github.com/Crimsab/Repressurizer/commit/78807da))
- Decompose sidebar architecture ([69d718b](https://github.com/Crimsab/Repressurizer/commit/69d718b))
- Decompose game detail page ([75b3091](https://github.com/Crimsab/Repressurizer/commit/75b3091))
- Decompose auto categorization dialog ([c3c0578](https://github.com/Crimsab/Repressurizer/commit/c3c0578))
- Decompose settings architecture ([11b0da1](https://github.com/Crimsab/Repressurizer/commit/11b0da1))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.5.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.11...v0.5.0)

## 0.4.11 - 2026-07-03

### Added

- Compare collections and HLTB unknown ([072b31e](https://github.com/Crimsab/Repressurizer/commit/072b31e))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.11) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.10...v0.4.11)

## 0.4.10 - 2026-07-02

### Added

- Refresh collection metadata cache ([a7be1dc](https://github.com/Crimsab/Repressurizer/commit/a7be1dc))

### Fixed

- Search game metadata from simple queries ([ab82884](https://github.com/Crimsab/Repressurizer/commit/ab82884))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.10) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.9...v0.4.10)

## 0.4.9 - 2026-07-01

### Fixed

- Use original store dates for year AutoCat ([50f8f68](https://github.com/Crimsab/Repressurizer/commit/50f8f68))
- Remove category reorder drag affordance ([87c9529](https://github.com/Crimsab/Repressurizer/commit/87c9529))

### Changed

- Split Steam API module ([be2c775](https://github.com/Crimsab/Repressurizer/commit/be2c775))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.9) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.8...v0.4.9)

## 0.4.8 - 2026-07-01

### Added

- Import Depressurizer database metadata ([5775fe1](https://github.com/Crimsab/Repressurizer/commit/5775fe1))
- Category colors ([d29a271](https://github.com/Crimsab/Repressurizer/commit/d29a271))
- Filter automation snapshots ([0902fec](https://github.com/Crimsab/Repressurizer/commit/0902fec))
- Improve game exports ([4222e71](https://github.com/Crimsab/Repressurizer/commit/4222e71))

### Fixed

- Dismiss settings messages ([85475af](https://github.com/Crimsab/Repressurizer/commit/85475af))
- Refine export category selection ([14889d8](https://github.com/Crimsab/Repressurizer/commit/14889d8))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.8) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.7...v0.4.8)

## 0.4.7 - 2026-06-30

### Added

- Generated changelog and docs ([3e62cb2](https://github.com/Crimsab/Repressurizer/commit/3e62cb2))

### Fixed

- Handle new issue batch ([4df56c3](https://github.com/Crimsab/Repressurizer/commit/4df56c3))
- Rank settings search matches ([2aa5bfa](https://github.com/Crimsab/Repressurizer/commit/2aa5bfa))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.7) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.6...v0.4.7)

## 0.4.6 - 2026-06-29

### Added

- Batch Steam price refreshes ([de9c86c](https://github.com/Crimsab/Repressurizer/commit/de9c86c))
- Cache regional Steam prices ([8daecf2](https://github.com/Crimsab/Repressurizer/commit/8daecf2))

### Fixed

- Simplify AutoCat cache controls ([034d1f2](https://github.com/Crimsab/Repressurizer/commit/034d1f2))
- Migrate usable details cache ([8091203](https://github.com/Crimsab/Repressurizer/commit/8091203))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.6) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.5...v0.4.6)

## 0.4.5 - 2026-06-29

### Fixed

- Stabilize AutoCat cache and currency refresh ([2687bc8](https://github.com/Crimsab/Repressurizer/commit/2687bc8))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.5) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.4...v0.4.5)

## 0.4.4 - 2026-06-29

### Added

- Cache preparation and library sorting ([5f398a0](https://github.com/Crimsab/Repressurizer/commit/5f398a0))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.4) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.3...v0.4.4)

## 0.4.3 - 2026-06-29

### Added

- Proxy routing and fetch controls ([cab2844](https://github.com/Crimsab/Repressurizer/commit/cab2844))

### Fixed

- Allow cached-only Steam rating autocats ([fe4b4bd](https://github.com/Crimsab/Repressurizer/commit/fe4b4bd))
- Resolve imported placeholder game names ([320af45](https://github.com/Crimsab/Repressurizer/commit/320af45))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.3) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.2...v0.4.3)

## 0.4.2 - 2026-06-29

### Added

- AutoCat: handle Steam review rate limits ([0a959e7](https://github.com/Crimsab/Repressurizer/commit/0a959e7))
- Configurable refresh and update settings ([83800ca](https://github.com/Crimsab/Repressurizer/commit/83800ca))
- AutoCat: refine Steam review defaults controls ([dffde4a](https://github.com/Crimsab/Repressurizer/commit/dffde4a))
- Steam review rule labels ([3e5a417](https://github.com/Crimsab/Repressurizer/commit/3e5a417))
- AutoCat: improve Steam review fetch and rules ([debeb1b](https://github.com/Crimsab/Repressurizer/commit/debeb1b))

### Fixed

- Harden app data storage ([d51b9d8](https://github.com/Crimsab/Repressurizer/commit/d51b9d8))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.2) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.1...v0.4.2)

## 0.4.1 - 2026-06-29

### Added

- AutoCat: compact and reorder AutoCat chooser ([46c2e04](https://github.com/Crimsab/Repressurizer/commit/46c2e04))
- AutoCat rating and preset labels ([15dc2a0](https://github.com/Crimsab/Repressurizer/commit/15dc2a0))
- AutoCat: Steam review rating support ([f10a24e](https://github.com/Crimsab/Repressurizer/commit/f10a24e))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.1) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.4.0...v0.4.1)

## 0.4.0 - 2026-06-26

### Added

- AutoCat: improve metadata selection and preview sorting ([8b70a81](https://github.com/Crimsab/Repressurizer/commit/8b70a81))
- UI: standardize custom select menus ([1b97bd3](https://github.com/Crimsab/Repressurizer/commit/1b97bd3))
- Steam: export shortcut tags on save ([cf7db23](https://github.com/Crimsab/Repressurizer/commit/cf7db23))
- Steam: import local license library ([c788d3d](https://github.com/Crimsab/Repressurizer/commit/c788d3d))
- AutoCat: language categorizer ([5bee4fd](https://github.com/Crimsab/Repressurizer/commit/5bee4fd))
- Import: convert Depressurizer filters ([0cee9a9](https://github.com/Crimsab/Repressurizer/commit/0cee9a9))
- Import: convert Depressurizer autocats to presets ([3c3bb00](https://github.com/Crimsab/Repressurizer/commit/3c3bb00))
- AutoCat: run saved preset sequence ([f6a5cce](https://github.com/Crimsab/Repressurizer/commit/f6a5cce))
- Legacy: import sharedconfig categories ([aa40991](https://github.com/Crimsab/Repressurizer/commit/aa40991))
- Shortcuts: import non-Steam shortcuts ([24adb7f](https://github.com/Crimsab/Repressurizer/commit/24adb7f))
- Filters: saved advanced category filters ([f3e6867](https://github.com/Crimsab/Repressurizer/commit/f3e6867))
- AutoCat: save reusable presets ([4c532bb](https://github.com/Crimsab/Repressurizer/commit/4c532bb))
- AutoCat: metadata categorizer types ([7a8ed33](https://github.com/Crimsab/Repressurizer/commit/7a8ed33))
- Import: Depressurizer profile import ([50d2d41](https://github.com/Crimsab/Repressurizer/commit/50d2d41))

### Fixed

- Settings: keep dialog size stable ([3a47c43](https://github.com/Crimsab/Repressurizer/commit/3a47c43))
- Filters: stabilize advanced filter collections selector ([bfa5cc2](https://github.com/Crimsab/Repressurizer/commit/bfa5cc2))
- AutoCat: replace generated category contents ([b442aa5](https://github.com/Crimsab/Repressurizer/commit/b442aa5))
- Steam: block collection saves while Steam runs ([3e68d47](https://github.com/Crimsab/Repressurizer/commit/3e68d47))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.4.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.3.4...v0.4.0)

## 0.3.4 - 2026-06-23

### Added

- CLI: help and validation commands ([d0f2a22](https://github.com/Crimsab/Repressurizer/commit/d0f2a22))
- CLI: short SAM achievement commands ([4880a35](https://github.com/Crimsab/Repressurizer/commit/4880a35))
- CLI: expose guarded SAM actions ([164902e](https://github.com/Crimsab/Repressurizer/commit/164902e))
- CLI: snapshot and diagnostics commands ([ba8ad0b](https://github.com/Crimsab/Repressurizer/commit/ba8ad0b))
- Snapshot: export library enrichment data ([9b3d406](https://github.com/Crimsab/Repressurizer/commit/9b3d406))
- Integration: release snapshot helpers v0.3.0 ([c3bee29](https://github.com/Crimsab/Repressurizer/commit/c3bee29))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.3.4) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.3.3...v0.3.4)

## 0.3.3 - 2026-06-23

### Added

- Split heavy frontend chunks ([6c2a29f](https://github.com/Crimsab/Repressurizer/commit/6c2a29f))
- Improve tray commands ([1eec0c4](https://github.com/Crimsab/Repressurizer/commit/1eec0c4))
- Run automation export in rust ([48af7b6](https://github.com/Crimsab/Repressurizer/commit/48af7b6))

### Fixed

- Remove Steam tools toolbar shortcut ([d91c691](https://github.com/Crimsab/Repressurizer/commit/d91c691))
- Use generic Steam tools icon ([8e20081](https://github.com/Crimsab/Repressurizer/commit/8e20081))
- Run tray backups natively ([10d7066](https://github.com/Crimsab/Repressurizer/commit/10d7066))
- Lower webview memory when hidden ([e70f038](https://github.com/Crimsab/Repressurizer/commit/e70f038))
- Create main webview on demand ([d4b8a11](https://github.com/Crimsab/Repressurizer/commit/d4b8a11))
- Defer hidden tray startup work ([ecb65d4](https://github.com/Crimsab/Repressurizer/commit/ecb65d4))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.3.3) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.3.0...v0.3.3)

## 0.3.0 - 2026-06-21

### Added

- Steam Tools: improve SAM backup browser ([48e82b8](https://github.com/Crimsab/Repressurizer/commit/48e82b8))
- Steam Tools: achievement multi-select ([e23f062](https://github.com/Crimsab/Repressurizer/commit/e23f062))
- Steam Tools: SAM achievement actions ([4f8c02e](https://github.com/Crimsab/Repressurizer/commit/4f8c02e))
- Steam Tools: bundle SAM bridge sidecar ([a6107a1](https://github.com/Crimsab/Repressurizer/commit/a6107a1))
- Steam Tools: SAM bridge preflight ([53c4a87](https://github.com/Crimsab/Repressurizer/commit/53c4a87))
- Steam Tools: lab surface ([111a740](https://github.com/Crimsab/Repressurizer/commit/111a740))
- Settings: empty sidebar lists toggle ([526f498](https://github.com/Crimsab/Repressurizer/commit/526f498))

### Fixed

- Achievements: prevent checkbox focus scroll jumps ([02e875c](https://github.com/Crimsab/Repressurizer/commit/02e875c))
- Steam Tools: show SAM backup picker ([597f20f](https://github.com/Crimsab/Repressurizer/commit/597f20f))
- Steam Tools: open and restore SAM backups ([73f0a32](https://github.com/Crimsab/Repressurizer/commit/73f0a32))
- Achievements: remove nested SAM selection scroll panel ([c9ad109](https://github.com/Crimsab/Repressurizer/commit/c9ad109))
- Steam Tools: use Tauri confirm for SAM actions ([30de3d9](https://github.com/Crimsab/Repressurizer/commit/30de3d9))
- Steam Tools: keep SAM controls stable while running ([ff9b960](https://github.com/Crimsab/Repressurizer/commit/ff9b960))
- Steam Tools: respect protected SAM achievements ([dc13751](https://github.com/Crimsab/Repressurizer/commit/dc13751))
- Settings: collapse SAM toggles ([8273bc5](https://github.com/Crimsab/Repressurizer/commit/8273bc5))
- Steam Tools: isolate SAM runner process ([10b9e4c](https://github.com/Crimsab/Repressurizer/commit/10b9e4c))
- Steam Tools: harden SAM lock diagnostics ([98d140d](https://github.com/Crimsab/Repressurizer/commit/98d140d))
- Steam Tools: add SAM action diagnostics ([8340c7a](https://github.com/Crimsab/Repressurizer/commit/8340c7a))
- Steam Tools: stabilize SAM lock and achievement layout ([ce0e976](https://github.com/Crimsab/Repressurizer/commit/ce0e976))
- Settings: clarify Steam Tools hierarchy ([332a177](https://github.com/Crimsab/Repressurizer/commit/332a177))
- Steam Tools: refine SAM achievement controls ([de9976f](https://github.com/Crimsab/Repressurizer/commit/de9976f))
- Steam Tools: run SAM actions in-process ([06b94e5](https://github.com/Crimsab/Repressurizer/commit/06b94e5))
- Steam Tools: gate SAM probe behind setting ([49ba6df](https://github.com/Crimsab/Repressurizer/commit/49ba6df))
- Steam Tools: clean up SAM UX and lazy checks ([4e0c6b6](https://github.com/Crimsab/Repressurizer/commit/4e0c6b6))
- Sidebar: hide empty uncategorized smart list ([d7a8c89](https://github.com/Crimsab/Repressurizer/commit/d7a8c89))

### Changed

- Steam Tools: embed SAM bridge in app exe ([0f6fdec](https://github.com/Crimsab/Repressurizer/commit/0f6fdec))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.3.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.2.0...v0.3.0)

## 0.2.0 - 2026-06-19

### Added

- Settings: automation guide ([d6beab3](https://github.com/Crimsab/Repressurizer/commit/d6beab3))
- Tauri: desktop integrations ([70492cf](https://github.com/Crimsab/Repressurizer/commit/70492cf))
- Settings: startup behavior controls ([f9c5fe2](https://github.com/Crimsab/Repressurizer/commit/f9c5fe2))
- Integration: rust snapshot crate ([ae5b355](https://github.com/Crimsab/Repressurizer/commit/ae5b355))
- Integration: schema-first snapshot kit ([3085da9](https://github.com/Crimsab/Repressurizer/commit/3085da9))
- Tray: quick actions ([f82ff2f](https://github.com/Crimsab/Repressurizer/commit/f82ff2f))
- Settings: improve automation export UX ([04dea45](https://github.com/Crimsab/Repressurizer/commit/04dea45))
- Export: automation publisher targets ([3b2b1e0](https://github.com/Crimsab/Repressurizer/commit/3b2b1e0))
- Export: automation snapshot export ([eb2ebce](https://github.com/Crimsab/Repressurizer/commit/eb2ebce))

### Fixed

- Tray: simplify settings selection and menu actions ([e9bc49f](https://github.com/Crimsab/Repressurizer/commit/e9bc49f))
- Settings: reorganize settings automation UI ([b9a9051](https://github.com/Crimsab/Repressurizer/commit/b9a9051))
- Tray: improve close behavior ([cbf0ba6](https://github.com/Crimsab/Repressurizer/commit/cbf0ba6))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.2.0) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.10...v0.2.0)

## 0.1.10 - 2026-06-14

### Added

- Categories: batch category deletion (closes #3) ([10b7999](https://github.com/Crimsab/Repressurizer/commit/10b7999))

### Fixed

- Steam: remove unused wishlist API structs ([b8da26e](https://github.com/Crimsab/Repressurizer/commit/b8da26e))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.10) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.9...v0.1.10)

## 0.1.9 - 2026-06-04

### Added

- CLI: collection management commands ([2e18ff5](https://github.com/Crimsab/Repressurizer/commit/2e18ff5))
- Friends: import Steam friends into cache ([47efa51](https://github.com/Crimsab/Repressurizer/commit/47efa51))
- Pricing: show discounts and price filters ([3bfb43b](https://github.com/Crimsab/Repressurizer/commit/3bfb43b))
- Recommend: filters and recommendation variety ([6cad399](https://github.com/Crimsab/Repressurizer/commit/6cad399))
- Updater: check for releases on startup ([0e6f12b](https://github.com/Crimsab/Repressurizer/commit/0e6f12b))
- Settings: compact appearance controls ([95ac707](https://github.com/Crimsab/Repressurizer/commit/95ac707))
- Steam: sync collections with Steam LevelDB ([8cbcda5](https://github.com/Crimsab/Repressurizer/commit/8cbcda5))

### Fixed

- UI: keep selected states legible in light theme ([5c9705b](https://github.com/Crimsab/Repressurizer/commit/5c9705b))
- Stats: align value and shame sections ([f4178c3](https://github.com/Crimsab/Repressurizer/commit/f4178c3))
- Recommend: contain genre filter dropdown ([40e4aba](https://github.com/Crimsab/Repressurizer/commit/40e4aba))
- Settings: avoid persisting color picker drags ([a0b69b1](https://github.com/Crimsab/Repressurizer/commit/a0b69b1))
- Stats: tighten library stats layout ([e75667f](https://github.com/Crimsab/Repressurizer/commit/e75667f))
- Pricing: ignore implausible Steam prices ([34a40b9](https://github.com/Crimsab/Repressurizer/commit/34a40b9))
- Recommend: use app styled filter dropdowns ([a42d0e8](https://github.com/Crimsab/Repressurizer/commit/a42d0e8))
- Wishlist: keep sale filter on one line ([97f4ed7](https://github.com/Crimsab/Repressurizer/commit/97f4ed7))
- UI: make category picker open on click ([1cdf79e](https://github.com/Crimsab/Repressurizer/commit/1cdf79e))
- Friends: collapse imported friend list ([1bbf28a](https://github.com/Crimsab/Repressurizer/commit/1bbf28a))
- Settings: make custom accent picker behave predictably ([d35b04d](https://github.com/Crimsab/Repressurizer/commit/d35b04d))
- Build: bundle app binary when CLI is present ([7546bfa](https://github.com/Crimsab/Repressurizer/commit/7546bfa))
- UI: keep context menu within viewport ([5fda714](https://github.com/Crimsab/Repressurizer/commit/5fda714))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.9) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.8...v0.1.9)

## 0.1.8 - 2026-06-03

### Added

- Improve locale selection and catalogs ([b340d6b](https://github.com/Crimsab/Repressurizer/commit/b340d6b))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.8) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.7...v0.1.8)

## 0.1.7 - 2026-06-03

### Fixed

- Support Windows catalog checks ([3eaec0b](https://github.com/Crimsab/Repressurizer/commit/3eaec0b))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.7) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.6...v0.1.7)

## 0.1.6 - 2026-06-03

### Added

- Localize remaining app surfaces ([49cae70](https://github.com/Crimsab/Repressurizer/commit/49cae70))
- Localize core library dialogs ([514ff39](https://github.com/Crimsab/Repressurizer/commit/514ff39))
- Discover JSON locale catalogs ([71335f4](https://github.com/Crimsab/Repressurizer/commit/71335f4))

### Fixed

- Handle singular family onboarding message ([56d758e](https://github.com/Crimsab/Repressurizer/commit/56d758e))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.6) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.5...v0.1.6)

## 0.1.5 - 2026-05-24

### Added

- Steam: cache app index for names ([4fe94b7](https://github.com/Crimsab/Repressurizer/commit/4fe94b7))

### Fixed

- Play History: track incremental playtime ([aa0bdad](https://github.com/Crimsab/Repressurizer/commit/aa0bdad))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.5) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.4...v0.1.5)

## 0.1.4 - 2026-05-06

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.4) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.3...v0.1.4)

## 0.1.3 - 2026-05-06

### Fixed

- Details: retry regional Steam metadata fallbacks ([a738b46](https://github.com/Crimsab/Repressurizer/commit/a738b46))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.3) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.2...v0.1.3)

## 0.1.2 - 2026-05-06

### Added

- Integrations: improve family setup and HLTB lookup ([084eb27](https://github.com/Crimsab/Repressurizer/commit/084eb27))
- Filters: expand search and library visibility ([cd83fd9](https://github.com/Crimsab/Repressurizer/commit/cd83fd9))
- Steam Family: persist store token and filter tools ([a2a68b6](https://github.com/Crimsab/Repressurizer/commit/a2a68b6))

### Fixed

- Search: match dotted game acronyms ([b9a723a](https://github.com/Crimsab/Repressurizer/commit/b9a723a))
- HLTB: normalize dotted game acronyms ([593e8b4](https://github.com/Crimsab/Repressurizer/commit/593e8b4))
- Steam: improve images and hide transient apps ([f9f4fdf](https://github.com/Crimsab/Repressurizer/commit/f9f4fdf))
- Steam Family: resolve family group before loading apps ([d9a153f](https://github.com/Crimsab/Repressurizer/commit/d9a153f))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.2) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.1...v0.1.2)

## 0.1.1 - 2026-05-03

### Added

- Release: safety tools and updater pipeline ([fce8885](https://github.com/Crimsab/Repressurizer/commit/fce8885))

### Fixed

- Ci: allow release workflow dispatch ([804a32a](https://github.com/Crimsab/Repressurizer/commit/804a32a))
- Ci: install actionlint directly ([797babc](https://github.com/Crimsab/Repressurizer/commit/797babc))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.1) · [Compare](https://github.com/Crimsab/Repressurizer/compare/v0.1.0...v0.1.1)

## 0.1.0 - 2026-05-03

### Added

- Initial Repressurizer release ([982ec0d](https://github.com/Crimsab/Repressurizer/commit/982ec0d))

### Fixed

- Ci: dispatch release after tagging ([332aabd](https://github.com/Crimsab/Repressurizer/commit/332aabd))
- Ci: parse Cargo version for release tags ([1f97d7c](https://github.com/Crimsab/Repressurizer/commit/1f97d7c))
- Ci: include Tauri CLI ([d66c094](https://github.com/Crimsab/Repressurizer/commit/d66c094))

[Release](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.0) · [Compare](https://github.com/Crimsab/Repressurizer/releases/tag/v0.1.0)
