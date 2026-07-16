# AutoCat

AutoCat creates or updates collections from rules rather than manual game selection.

## Available sources

Rules can use genres, tags, store flags, release year, review rating, Metacritic, HLTB length, local playtime, achievements, languages, platforms, developers, publishers, and saved presets imported from Depressurizer profiles.

## Safe workflow

1. Prepare the metadata sources used by the rule.
2. Select cached-only mode if you do not want background requests.
3. Generate a preview.
4. Inspect games with missing or uncertain metadata.
5. Apply only the intended rule scope.
6. Review the normal collection save preview before writing to Steam.

![AutoCat preview](../assets/autocat.png)

!!! tip "Prefer explicit rule names"
    Name the collection after the rule's meaning, such as `Backlog - Under 20 hours`, rather than the implementation detail that produced it.
