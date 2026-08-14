# GG.deals pricing

Repressurizer can optionally show GG.deals pricing in a game's detail page. The integration uses the official GG.deals API endpoint for Steam App IDs. It does not scrape GG.deals pages and does not run during normal library refreshes.

## Enable it

1. Create or verify a GG.deals account and obtain an API key from [GG.deals API](https://gg.deals/api/).
2. Open **Settings → Steam**.
3. Enable **GG.deals pricing**, paste the GG.deals API key, and save.
4. Open a game detail page.

The panel identifies the title by its Steam App ID and shows:

- the lowest current offer and whether it is an official retailer or keyshop;
- the current official-retailer and keyshop prices when available;
- the historical low for each source category;
- a validated link to that game's GG.deals offers page.

Price data and links are provided by GG.deals. Repressurizer keeps the official-retailer and keyshop labels visible instead of treating the two markets as equivalent.

## Request and cache behavior

- The feature is off by default.
- Opening a detail page is the only automatic trigger.
- A response, including a supported App ID with no result, is cached locally for 24 hours.
- Manual refresh still respects a two-second request interval in both the frontend and native backend.
- Requests have a 12-second timeout and a one-megabyte response limit.
- Failures stay inside the panel and do not block Steam library loading or game details.

Changing the GG.deals key clears the price cache. The selected Repressurizer currency chooses the closest supported GG.deals region.

## Terms and privacy

GG.deals describes its API as free for personal/hobby use with attribution. Check the current API page and terms before using Repressurizer in a commercial context.

The API key is stored with the other local Repressurizer settings and sent directly to `api.gg.deals`. It is never placed in pricing cache records, application logs, automation exports, or diagnostics. Backend errors deliberately omit request URLs because the API authenticates with a query parameter.
