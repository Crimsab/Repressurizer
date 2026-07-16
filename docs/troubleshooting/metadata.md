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
