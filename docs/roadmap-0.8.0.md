# Repressurizer 0.8.0 delivery plan

**Implementation status:** all eight delivery slices are integrated on the
local `agent/repressurizer-0.8.0` branch. The desktop version remains unchanged
until the release gate below is fully green.

This document is the implementation contract for the 0.8.0 release. It turns
the feature backlog into ordered, testable slices and records the shared safety
rules that every slice must satisfy.

## Product direction

- **Visual thesis:** a compact Steam-native operations workspace built from
  quiet dark surfaces, precise typography, and one green action accent.
- **Content plan:** show current state first, then the proposed change, its
  explanation, and the confirm or undo action. No marketing hero or decorative
  dashboard.
- **Interaction thesis:** previews transition into applied results without
  losing context; diffs reveal progressively; undo and history stay close to
  every mutating action.
- **Responsive rule:** dense desktop workspaces may become stacked inspectors
  on narrow viewports, but controls and explanations must remain complete.

## Existing foundations to reuse

The release must extend these paths instead of creating competing data models:

- deterministic recommendation ranking in `src/lib/backlogRanking.ts` and the
  existing What to Play surface;
- Diary entries, Kanban, history, backups, and reversible action snapshots;
- AutoCat's existing evaluator, preview, diff, and apply pipeline;
- collection compare, merge, save preview, undo, and Steam-running gate;
- cached details for installation, HLTB, achievements, ratings, reviews,
  Family Sharing, tags, and play history;
- settings data import/export and versioned automation snapshots;
- Rust app-data helpers and existing integration write lock.

## Cross-cutting acceptance rules

Every feature that proposes or performs a change must:

1. distinguish missing, stale, unavailable, and zero-valued data;
2. show the source and freshness of data used for a decision;
3. provide a deterministic preview before writing;
4. make the write atomic and create a verified backup first;
5. preserve unknown Steam fields and target the selected Steam account;
6. record an event with a stable identifier and support undo or rollback;
7. avoid executable community content and exclude secrets from exports/sync;
8. remain usable when optional providers are offline or rate limited;
9. include unit tests, a representative E2E flow, and inspected desktop/mobile
   screenshots for relevant UI changes.

## Delivery slices

### 1. Safety and data-health foundation

- One atomic write primitive with temp-file validation, replacement, recovery,
  and backup retention for Steam and Repressurizer data.
- Versioned entity envelope, device ID, stable event IDs, checksums, migrations,
  and an append-only journal suitable for snapshots and folder sync.
- Provider health records for success, missing data, private data, transient
  failure, rate limit, staleness, and last refresh.
- Anonymous fixtures for empty/large libraries, multiple accounts and library
  folders, duplicate collection names, corrupt files, unknown fields, and
  offline providers.
- Dependency checks for Rust and frontend lockfiles; `cargo audit` in CI and
  existing dependency automation kept active.

### 2. AutoCat Rule Inspector

- Select a rule and game; evaluate with the production AutoCat engine.
- Display the complete AND/OR tree with PASS, FAIL, MISSING, or NOT APPLICABLE,
  actual input values, decisive branch, allowlist/denylist/manual overrides,
  priority, and final cause.
- Live before/after simulation, match counts, included/excluded samples, and a
  downloadable debug report without saving the rule.
- Detect empty, impossible, redundant, cancelling, overly broad, and duplicate
  rules without silently changing them.
- Cache intermediate results and cover large-library performance.

### 3. Library Changes Inbox

- Deduplicated events for new/removed/installed/uninstalled/uncategorized games,
  Family availability, missing/stale metadata, provider errors, AutoCat
  proposals, Diary inconsistencies, external collection edits, and HLTB drift.
- Each event shows change, time, source, confidence, and recommended action.
- Accept, ignore, snooze, review, and deep-link actions plus bulk preview.
- Filters, unread counter, notification category preferences, action history,
  and reversible mutating actions.
- Temporary API failure must never be interpreted as library removal.

### 4. Session Planner and Tonight Queue

- Duration presets and custom duration; device, input, mode, session intent,
  install/Family/Deck/HLTB/genre/tag/review/Metacritic/last-played/playtime/
  Diary/achievement filters.
- Hard requirements exclude; preferences only change a visible score.
- Stable top three: best fit, shorter option, and outside-the-usual option.
- Explanations include passed requirements, scoring inputs, missing/stale data,
  and game-type handling for endless or run-based games.
- Controlled reroll, daily/permanent suppression, frequency tuning, pinning,
  presets, recommendation history, and guarded Steam launch.
- Temporary queue with manual/planner adds, unique games, drag ordering,
  per-game/total time, over-budget warning, start/skip/complete/defer/remove,
  recent queue resume, conversion to preset/list/collection, and no automatic
  launch of the next game.

### 5. Collection Time Machine and Conflict Resolver

- Before/after snapshots record timestamp, account, device, origin, changed
  collections, and game membership counts.
- Timeline and diff cover create/delete/rename/color/order/membership changes.
- Full or selective restore for collection, game, rename, additions, or removals
  with preview, verified pre-restore backup, export, pinning, retention, and
  cross-device comparison.
- Three-way merge compares loaded base, current Steam state, and proposed state;
  conflicts cover rename, color, deletion, creation, membership, and ordering.
- Per-conflict and bulk decisions support Steam, Repressurizer, union, manual,
  or cancel; final merged preview and undo are mandatory.
- Stable IDs take precedence over names and timestamps never decide conflicts
  by themselves.

### 6. Profiles and folder synchronization

- Versioned profile manifest with checksum, export date, device, Steam account,
  included entities, and optional history.
- Selective export/import for Diary, Kanban, AutoCat rules and overrides,
  planner presets, queues, preferences, settings, and manual collections.
- Preview, diff, backup, schema migration, multiple named profiles, duplication,
  and account association.
- Never export API keys, tokens, credentials, heavy caches, or unusable absolute
  paths by default; normalize Windows/Linux/Steam Deck paths.
- Folder sync supports local/network/NAS and folders managed by common sync
  tools, using entity journals and device IDs rather than active Steam files.
- Manual/automatic/pause controls, selective merge, offline devices, concurrent
  edits, different clocks, atomic shared-folder writes, and a working local copy.

### 7. Storage Planner and Pack My Deck

- Inventory actual installed size, drive/library folder, free space, last play,
  playtime, Diary, Deck compatibility, achievement progress, and estimated time
  remaining with freshness metadata.
- Free-space goals by amount, percentage, or drive; explainable candidates,
  protected games, 30-day suppression, simulation, exportable removal list, and
  Steam-owned uninstall handoff only.
- Account for DLC, Workshop, shader cache, Proton compatdata, external launchers,
  shared files, pending updates, external libraries, and unsynced local saves.
- Deck pack uses capacity, safety margin, target count, categories, Verified/
  Playable/controller/launcher/offline/duration/install filters, mandatory and
  excluded games, diversity constraints, reroll, saved packs, collection
  conversion, and prioritized install plan.

### 8. Community Rule Packs and Metadata Health Center

- Versioned JSON Schema with name, description, author, pack version,
  compatibility, required sources, collections, rules, and changelog.
- Searchable local gallery; preview match counts and collection diffs before
  install; update, disable, rollback, duplicate, detach, and provenance.
- Validate schema, bound regex/condition cost, handle collisions and unavailable
  providers, preserve local edits, and never execute code or auto-apply changes.
- Provider and per-game health show last sync, updated/error/missing/stale counts,
  rate limits, dependent features, freshness thresholds, and plain-language
  errors.
- Full, missing-only, stale-only, game-only, and provider-only refresh actions
  use caching and backoff without blocking unrelated features.

### 9. Release gate

- Version is changed to 0.8.0 only after all slices above are integrated.
- Update changelog, README, user docs, schema docs, and all eight locale catalogs.
- Run frontend typecheck/build/unit/E2E, Rust fmt/clippy/tests/audit, integration
  package checks, docs audit, desktop/mobile visual review, and representative
  Steam round trips against anonymous fixtures.
- Keep commits local until the complete release gate passes; do not push, tag,
  publish, or upload release artifacts.

## Commit policy

Each delivery slice is committed only after its focused checks pass. Follow-up
fixes get their own commit. The branch remains local until the entire 0.8.0
acceptance matrix is green.

## Acceptance matrix

| Slice | Implementation evidence | Focused verification |
| --- | --- | --- |
| Achievement artwork | Legacy Steam CDN URLs are normalized and failed images retry against supported hosts. | URL normalization, fallback, and Palworld-style legacy URL tests. |
| Safety and health foundation | Verified atomic replacement, retained backups, entity journals, checksums, provider observations, and dependency security workflows. | Rust atomic-write tests, journal/provider unit tests, `bun audit`, and `cargo audit`. |
| Rule Inspector | Production AutoCat evaluator drives tri-state condition trees, diagnostics, live previews, and redacted report export. | Evaluator/diagnostic unit tests and desktop/mobile E2E. |
| Library Changes Inbox | Stable deduplicated events, source-success gates, filters, preferences, action history, bulk preview, and reversible Diary fixes. | Inbox unit tests and desktop/mobile E2E. |
| Planner and queue | Hard requirements, scored preferences, explainable stable top-three results, controlled reroll, suppression/tuning, presets/history, and resumable queues. | Planner/queue unit tests and desktop/mobile E2E. |
| Time Machine and conflicts | Before/after snapshots, retention/pinning/export, selective restore, stable-ID three-way merge, manual and bulk choices, preview, backup, and undo. | Snapshot/merge unit and integration tests plus desktop/mobile E2E. |
| Profiles and sync | Checked selective profiles, named local copies, pre-import backups, per-device envelopes, entity merge, pause/automatic sync, and atomic shared-folder writes. | Corruption/secret/selective import and concurrent/offline sync tests plus desktop/mobile E2E. |
| Storage and Deck packs | Multi-library measured inventory, reclaim goals/protection/simulation/export, Steam uninstall handoff, guarded diverse packs, saved results, and staged collection conversion. | Rust filesystem fixture, planner/pack unit tests, and inspected desktop/mobile E2E. |
| Rule packs and metadata health | Closed declarative v1 pack schema, cost bounds, provenance/update/rollback/detach, provider/game states, scoped refresh, cache, and backoff. | Schema/runtime, pack lifecycle, health/backoff unit tests, and inspected desktop/mobile E2E. |
| Documentation and localization | README, user workflow guide, portable-format contract, JSON Schema, release notes, and eight structurally complete locale catalogs. | Strict MkDocs build, docs audit, i18n key/placeholder audit, and generated localization status. |

Steam Deck compatibility is intentionally not inferred from native Linux
support. Valve's Store API response used by Repressurizer does not document the
Deck review category, so strict Verified/Playable filters accept only explicit
metadata and otherwise report the value as unknown. Installed sizes are measured
locally; non-installed estimates are used only when an explicit estimate exists.
