# Privacy

Repressurizer is local-first.

It does not run a hosted backend for your Steam library, collections, playtime, notes, ratings, tags, or diagnostics.

## Data Sources

Depending on which features you use, Repressurizer may contact:

- Steam Web API for owned games, achievements, wishlist, friends, and player summaries.
- Steam Store API for game metadata, regional price data, release dates, genres, platforms, and artwork.
- Steam Family endpoints for shared library data.
- HowLongToBeat for playtime estimates.
- GG.deals for opt-in deal and historical-low data when a game detail page is opened.
- GitHub Releases for update checks.

## Local Data

Repressurizer stores its own settings/cache under the operating system data directory in a `Repressurizer` folder.

Local app data may include:

- Steam install/user selection.
- Steam Web API key.
- Optional Steam Store `webapi_token`.
- Optional GG.deals API key.
- Cached Steam metadata.
- Cached HLTB results.
- Cached GG.deals price responses without API credentials.
- Local notes, ratings, tags, statuses, and ignored-fetch state.
- Family library cache.

The Steam Family browser helper reads plain text from the system clipboard only
after you click `Import from clipboard`. It extracts and stores only the
`webapi_token` field from the copied Steam JSON. Repressurizer does not read or
store Steam browser cookies, passwords, or broader session material.

Steam collection backups are stored next to the Steam collection file they protect. When Steam's local LevelDB catalog cache is present, Repressurizer stores a matching raw LevelDB catalog backup next to the JSON backup so restores keep both catalog copies in sync.

## Diagnostics

Diagnostics exports are intended for bug reports and should be redacted by the app.

When the native Rust process panics, Repressurizer keeps up to five small JSON
crash reports for a maximum of 30 days. Diagnostics exports include a redacted
summary of those reports, not operating-system crash dumps or process memory.
The summary removes credential-shaped values, long account identifiers, and
filesystem paths. Source reports remain local until retention removes them or
you delete the `crash-reports` folder from the application-data directory.

Before sharing diagnostics publicly, quickly check that they do not include:

- Steam Web API keys.
- GG.deals API keys.
- Store `webapi_token` values.
- Full Steam IDs.
- Private paths you do not want public.

## Network Behavior

Repressurizer sends requests directly from your machine to the upstream services listed above. It does not proxy your data through a Repressurizer server.

Some metadata features can fail if Steam, HLTB, GG.deals, or GitHub rate-limit, change endpoints, block a region, or return incomplete responses. GG.deals pricing is disabled by default, cached for 24 hours, and requested only from an open game detail page.
