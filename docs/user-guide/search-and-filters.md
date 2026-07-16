# Search and filters

Plain text search ignores common punctuation differences, so `stalker` can match `S.T.A.L.K.E.R.` titles. Regex and structured filters are available when a title search is not enough.

## Examples

```text
stalker
/final.*vii/i
hours:>10
playtime:2..40
hltb:<20
year:2013..2020
genre:rpg
category:achievement
tag:backlog
dev:"Square Enix"
platform:windows
status:playing
metacritic:>85
achievements:50..100
family:true
duplicate:true
missing:true
appid:39140
```

## Range operators

| Form | Meaning |
| --- | --- |
| `field:>10` | Greater than 10. |
| `field:<20` | Less than 20. |
| `field:10..30` | Between 10 and 30. |
| `field:true` | Boolean property is enabled. |

Filters that depend on prices, HLTB, reviews, achievements, genres, tags, developers, or publishers require the relevant metadata to be cached first.
