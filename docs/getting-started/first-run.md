# First run

The setup wizard establishes the minimum information Repressurizer needs before loading your library.

## Steam Web API key

Create a key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) and paste it into Repressurizer. The key enables owned-game data, achievements, wishlist information, profiles, and related Steam metadata.

Treat the key as sensitive. Do not include it in screenshots, diagnostics, issue reports, or exported settings.

## Load the library

Repressurizer detects local Steam data and combines it with available API and cached metadata. A first load can be useful before preparing the full cache, especially if you want to inspect local collections immediately.

## Prepare metadata

Use cache preparation when you want richer filters, AutoCat sources, prices, reviews, achievements, HLTB times, or Steam Family data ready before browsing.

Large libraries should start with conservative request settings. Repressurizer caches successful responses and can run AutoCat in cached-only mode. See [Cache and network behavior](../cache-and-network.md).
