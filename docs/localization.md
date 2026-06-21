# Localization

English (`en.json`) is the canonical source catalog. Every other locale must keep
the same keys and placeholders so Repressurizer can fall back safely.

## Files

Translation catalogs live in:

```text
src/lib/translations/
```

Add a locale by creating a new JSON file named with its BCP 47 locale code, for
example:

```text
src/lib/translations/de.json
src/lib/translations/zh-CN.json
```

The app discovers supported locales from these JSON files at build time. Do not
add a separate hardcoded locale list.

## Rules

- Keep `en.json` as the source of truth for keys.
- Translate values only. Do not rename keys.
- Preserve placeholders exactly: `{count}`, `{name}`, `{error}`, etc.
- Keep technical search examples such as `genre:rpg` and `hours:>10` unchanged
  until localized parser aliases exist.
- Do not edit generated build output in `dist/`.

## Checks

Before opening a PR, run:

```bash
bun run i18n:check
bun run i18n:status
bun run check
```

`i18n:check` fails on missing keys, extra keys, or placeholder mismatches. It
also prints likely hardcoded UI strings that should be moved into the catalog.

`i18n:status` prints a compact translation coverage table, including values
that still match English and probably need translation. Add `--details` to list
the affected keys per locale.

## Localization Status

Run `bun run i18n:status` to print the current table, or `bun run i18n:status:write` to refresh this generated block.

<!-- localization-status:start -->
Canonical locale: `en`. Total canonical keys: 854.

| Locale | Key coverage | Translated coverage | English fallback | Missing | Extra | Placeholder issues |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `en` | 100.0% | 100.0% | 0 | 0 | 0 | 0 |
| `de` | 100.0% | 77.2% | 195 | 0 | 0 | 0 |
| `es` | 100.0% | 78.7% | 182 | 0 | 0 | 0 |
| `fr` | 100.0% | 77.9% | 189 | 0 | 0 | 0 |
| `it` | 100.0% | 97.4% | 22 | 0 | 0 | 0 |
| `pl` | 100.0% | 78.5% | 184 | 0 | 0 | 0 |
| `tr` | 100.0% | 79.0% | 179 | 0 | 0 | 0 |
| `zh-CN` | 100.0% | 79.6% | 174 | 0 | 0 | 0 |
<!-- localization-status:end -->

## Current Locales

The current catalog set includes:

- `en` - English, canonical/default
- `it` - Italian
- `de` - German
- `es` - Spanish
- `fr` - French
- `pl` - Polish
- `tr` - Turkish
- `zh-CN` - Simplified Chinese
