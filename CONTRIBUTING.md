# Contributing

Thanks for considering a contribution to Repressurizer.

Repressurizer is a Tauri desktop app with a Rust backend and a React/TypeScript frontend. It is Windows-first for now.

## Setup

Use Bun for JavaScript dependencies:

```bash
bun install
```

Useful commands:

```bash
bun run check
bun run test:unit
bun run test:e2e
bun run build
```

Rust checks live under `src-tauri/`:

```bash
cd src-tauri
cargo test
```

## Pull Requests

Before opening a PR:

- Keep changes focused.
- Add or update tests for behavior changes.
- Include screenshots for visible UI changes.
- Update README/docs when user-facing behavior changes.
- Do not include API keys, Store tokens, full Steam IDs, private paths, or personal library data.

## Translations

English (`src/lib/translations/en.json`) is the canonical source catalog. The app
discovers supported languages from the JSON files in `src/lib/translations/`.

When contributing translations:

- Edit only the relevant locale JSON file unless you are adding or changing source text.
- Keep all keys and placeholders such as `{count}` or `{error}` exactly aligned with `en.json`.
- Run `bun run i18n:check` before opening a PR.

See [docs/localization.md](docs/localization.md) for the full workflow.

## Commit Style

Prefer conventional commits:

```text
feat(search): add release date filter
fix(details): retry regional Steam metadata fallbacks
docs: clarify Steam Family setup
test(hltb): cover dotted acronym titles
```

## Development Notes

- Steam Store and HLTB endpoints can rate-limit or return incomplete data. Treat those as unreliable upstreams.
- Collection writes should stay conservative: preserve backups, keep preview flows clear, and avoid destructive behavior.
- The app is intended to be useful even when some metadata sources fail.
