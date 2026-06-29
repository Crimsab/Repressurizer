# Cache And Network Behavior

Repressurizer keeps local cache data so library browsing and AutoCat rules do not need to hit Steam or HLTB every time. This page explains what can make network requests, what is cached, and which settings affect request volume.

## What Makes Requests

Repressurizer can contact these sources:

- Steam Web API for owned games, playtime, achievements, player summaries, wishlist, friends, and Steam Family data.
- Steam Store endpoints for game details, genres, categories, release dates, platforms, Metacritic, artwork, review summaries, and regional prices.
- HowLongToBeat for story length matches.
- Automation export targets when background publishing is enabled.

Steam collection reads and writes are local file operations. Saving collections writes local Steam collection data and creates backups; it does not upload collection edits through a Steam web endpoint.

## Cache Preparation

The app footer can show a Prepare cache button when details, Steam reviews, or HLTB data are missing or stale. Running it fills background cache for the current library.

Use it when:

- Sort options such as Metacritic, Steam Reviews, Review Count, HLTB, price, or release date are incomplete.
- AutoCat rules need Steam details, Steam reviews, or HLTB data.
- You want later AutoCat runs to use cached data instead of fetching during the dialog.

The button is hidden when the app believes the cache is already prepared.

## AutoCat And Cached-Only Mode

AutoCat uses cached data whenever possible. Some AutoCat modes can fetch missing data before previewing categories.

For Steam review based AutoCats, cached-only mode skips network refreshes and only categorizes games with review data already present in cache. This is useful when Steam is rate-limiting requests or when you want a quick offline-ish preview.

Cached-only mode may leave some games uncategorized. That is expected when the required metadata has never been fetched.

## Regional Prices And Currency

Steam prices are regional. Repressurizer stores price snapshots by currency/country where possible.

When you change the default currency:

- If a matching cached price snapshot exists, the app can reuse it without a new request.
- If the selected currency is missing, the app refreshes price data for that region.
- Free games and games with unavailable regional pricing may cache explicit empty price snapshots.

The Steam Store does not expose one universal "all regional prices for every app" response suitable for normal app use. Repressurizer therefore fetches the selected region and keeps snapshots as they are discovered.

## Request Rate Settings

Settings include separate controls for:

- Steam details delay.
- Steam reviews delay and cooldown.
- HLTB concurrency and batch delay.
- Achievement request concurrency and batch delay.
- Automatic detail and HLTB refresh during library refresh.

Higher values can fill cache faster but increase the chance of rate limits. Lower values are slower but safer for large libraries.

## Proxy Routing

Proxy routing is available in Settings under Steam/network request controls. It can apply to:

- Steam Web API.
- Steam Store and review endpoints.
- HLTB.
- Automation export.

Supported rotation modes:

- Fixed profile: always use the selected proxy.
- Every request rotates: move through enabled proxies per request.
- Per-profile batches: keep a proxy for its configured batch size, then rotate.
- Random: choose an enabled proxy per request.

Each proxy profile can be added, edited, disabled, removed, and tested. Proxy support is intended for routing control and diagnostics. It is not a guarantee against Steam or HLTB rate limits.

## Ignored Entries

Some apps are delisted, region restricted, unavailable in the Store API, or not found on HLTB. After repeated confirmed failures, Repressurizer can mark them ignored so future cache runs skip them.

Ignored entries are visible in Settings under Ignored. You can retry them if a game becomes available again or if a previous failure was caused by temporary network problems.

## Local-Only Games

Local-only games are apps that exist in local Steam collection data but were not returned by the current Steam library sources. This can happen with old Family Sharing entries, removed licenses, shortcuts, or stale local Steam data.

You can:

- Show them with the Local collection only filter.
- Hide them globally with the Hide local-only games setting in Appearance visibility.
- Keep them visible when you need to clean old collections.

## Troubleshooting

If details or prices look stale, run Prepare cache or use the relevant refresh button in the game details panel.

If a price appears in the wrong currency, check the default currency setting and refresh prices for that game or prepare cache again. Existing snapshots are preserved so switching back to a previously fetched currency should not require a full recache.

If AutoCat creates fewer categories than expected, check whether the selected rule needs metadata that is missing, ignored, or intentionally running cached-only.

If requests repeatedly fail, lower concurrency/delay settings, test without proxies, or check the Ignored tab before assuming the game data is missing from Repressurizer.

