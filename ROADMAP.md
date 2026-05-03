# Repressurizer Roadmap

## Release Prep

- Publish Windows installer and portable builds through GitHub Actions. [done]
- Auto-create version tags from `package.json`; tags trigger GitHub Releases with generated changelog notes. [done]
- Add a public README with screenshots, safety notes, and a clear relationship to Depressurizer.
- Verify collection save/restore behavior against a real Steam install before public release.
- Reduce broad filesystem permissions before release where practical.
- Add screenshots or a short demo GIF before making the repository public.
- Verify updater install path on a tagged Windows build.

## Safety And Maintenance

- Pre-save preview for collection changes. [done]
- Automatic backup before saving and pre-restore backup before restoring. [done]
- Manual backup creation and backup restore/delete UI. [done]
- First-run setup with safety notes before writing Steam data. [done]
- Export redacted diagnostics for support. [done]
- In-app update check/install backed by GitHub Releases. [done]
- Steam Family library probe, cache, smart list, and shared-game badges. [done]
- Unit tests and Playwright browser smoke tests for release safety. [done]

## Future Features

- Integrate GG.deals after the first public release.
  - Match Steam app IDs to deals where possible.
  - Show price history, current best deal, and wait/buy hints.
  - Keep it optional and cache results to avoid slow library loading.
- Smart backlog ranking using playtime, wishlist, HLTB, achievements, recency, and hidden/excluded state.
- Better dry-run reporting for auto-categorizer batches, including exportable diffs.
- Optional Steam Store session helper for Steam Family tokens without asking the user to paste one manually.

## Nice To Have

- Linux/macOS Steam detection.
- Code-splitting for heavy modal pages.
- Native crash report import and richer diagnostics.
- Release channels (`stable`/`beta`) once there are public users.
