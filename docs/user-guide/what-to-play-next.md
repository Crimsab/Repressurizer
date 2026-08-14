# What to play next

Open **What to Play Next** from the toolbar to rank unfinished games using data already cached by Repressurizer. Smart ranking is local and deterministic: opening it twice with the same library data and settings produces the same order.

## Ranking signals

The default ranking combines:

- playtime, favoring unplayed and barely started games;
- wishlist membership and priority when a library game is present in the cached wishlist;
- HowLongToBeat estimates, with shorter games receiving a modest boost;
- achievement progress, favoring unfinished progress and lowering completed sets;
- recent play, making an in-progress game easier to resume;
- Metacritic score and genre affinity based on your played library.

Games in Steam's **Hidden** collection are excluded. Games marked beaten, completed, or abandoned are also excluded, as are recent recommendations when **Avoid recent picks** is enabled.

Each result shows its three largest score contributions. A negative contribution is highlighted separately. Missing HLTB, achievement, critic, or genre metadata contributes zero points instead of penalizing the game.

## Tune the ranking

Select **Tune ranking** to set each signal to Off, Low, Normal, High, or Max. These preferences are saved only in local app data and apply immediately. **Reset** restores the defaults.

The Smart, Quick, Quality, and Backlog modes keep deterministic ordering. Quick emphasizes game length, Quality emphasizes critic score, and Backlog emphasizes low playtime. Surprise is the only mode that deliberately varies the order; **Shuffle** also remembers recent picks so the next set can avoid them.

No network request is made to sort the list. Fetching metadata elsewhere in Repressurizer can improve later rankings, but ranking itself only reads the current local caches.
