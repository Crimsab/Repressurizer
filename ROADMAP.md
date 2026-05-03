# Repressurizer Roadmap

## Release Prep

- Publish Windows installer and portable builds through GitHub Actions.
- Add a public README with screenshots, safety notes, and a clear relationship to Depressurizer.
- Verify collection save/restore behavior against a real Steam install before public release.
- Reduce broad filesystem permissions before release where practical.

## Future Features

- Integrate GG.deals after the first public release.
  - Match Steam app IDs to deals where possible.
  - Show price history, current best deal, and wait/buy hints.
  - Keep it optional and cache results to avoid slow library loading.

## Nice To Have

- Linux/macOS Steam detection.
- Code-splitting for heavy modal pages.
- Safer onboarding around Steam Cloud sync and backups.
- Signed Windows releases.
