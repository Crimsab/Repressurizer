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
bun run check
```

`i18n:check` fails on missing keys, extra keys, or placeholder mismatches. It
also prints likely hardcoded UI strings that should be moved into the catalog.

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
