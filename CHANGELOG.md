# Changelog

All notable user-facing changes are generated from release tags and Conventional Commit subjects.

Run `bun run changelog:write` after changing release tags or commit history.

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
