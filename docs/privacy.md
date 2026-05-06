# Privacy

Repressurizer is local-first.

It does not run a hosted backend for your Steam library, collections, playtime, notes, ratings, tags, or diagnostics.

## Data Sources

Depending on which features you use, Repressurizer may contact:

- Steam Web API for owned games, achievements, wishlist, friends, and player summaries.
- Steam Store API for game metadata, regional price data, release dates, genres, platforms, and artwork.
- Steam Family endpoints for shared library data.
- HowLongToBeat for playtime estimates.
- GitHub Releases for update checks.

## Local Data

Repressurizer stores its own settings/cache under the operating system data directory in a `Repressurizer` folder.

Local app data may include:

- Steam install/user selection.
- Steam Web API key.
- Optional Steam Store `webapi_token`.
- Cached Steam metadata.
- Cached HLTB results.
- Local notes, ratings, tags, statuses, and ignored-fetch state.
- Family library cache.

Steam collection backups are stored next to the Steam collection file they protect.

## Diagnostics

Diagnostics exports are intended for bug reports and should be redacted by the app.

Before sharing diagnostics publicly, quickly check that they do not include:

- Steam Web API keys.
- Store `webapi_token` values.
- Full Steam IDs.
- Private paths you do not want public.

## Network Behavior

Repressurizer sends requests directly from your machine to the upstream services listed above. It does not proxy your data through a Repressurizer server.

Some metadata features can fail if Steam, HLTB, or GitHub rate-limit, change endpoints, block a region, or return incomplete responses.
