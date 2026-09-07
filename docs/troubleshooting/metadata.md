# Missing metadata

Metadata can be absent because a request has not run, an upstream service rate-limited the app, a title is delisted, a local-only entry has no Steam app ID, or a provider returned incomplete data.

## Checklist

1. Confirm that the game has a valid Steam app ID.
2. Run the relevant cache preparation stage.
3. Review failed or ignored entries.
4. Lower request concurrency or increase delay after a rate-limit response.
5. Retry only the missing provider instead of rebuilding every cache.
6. Use cached-only AutoCat until the upstream service recovers.

See [Cache and network behavior](../cache-and-network.md) for request settings, regional prices, proxies, and ignored entries.

Steam tags and Deck compatibility are fetched by a bounded Store page enrichment
request. A successful app-details response can still have no tags, and Steam may
not expose a Deck category for every app. Repressurizer keeps those values
missing instead of inferring them. External-launcher behavior, offline support,
first-launch requirements, and install size are not authoritative in the Store
responses used by the app; Pack My Deck leaves them unknown until you enter a
local user-provided value.

If only prices are missing or appear to belong to another country, check
**Settings → Currency and region**. Refresh the game after changing the Store
country; old snapshots remain available for previously selected countries.
