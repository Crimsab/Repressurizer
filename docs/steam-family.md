# Steam Family Setup

Repressurizer can try to load Steam Family shared games from Valve's
`IFamilyGroupsService` endpoints.

## Two Different Tokens

### Steam Web API Key

This is the normal key you enter during first setup. Repressurizer saves it and
uses it automatically.

You do not need to paste this key again in Settings > Steam Family.

### Steam Store `webapi_token`

This is a temporary token from your logged-in Steam Store browser session. It is
not the same thing as your Steam Web API key.

Steam Family endpoints can reject a normal Steam Web API key. When that happens,
Repressurizer can use the Store `webapi_token` as an `access_token`.

Repressurizer does not save this token permanently. Treat it like a session
secret: do not share it, paste it into chats, commit it, or put it in screenshots.

## How To Get The Store `webapi_token`

Use this only if the normal Steam Web API key fails in Steam Family.

1. Open Chrome, Edge, or another browser.
2. Go to `https://store.steampowered.com/` and log into Steam.
3. Open this URL in the same browser:

   `https://store.steampowered.com/pointssummary/ajaxgetasyncconfig`

4. The page should show JSON. Find:

   ```json
   {
     "data": {
       "webapi_token": "..."
     }
   }
   ```

5. Copy only the value inside `webapi_token`.
6. In Repressurizer, open Settings > Steam Family.
7. Paste it into the optional `Steam Store webapi_token` field.
8. Click `Probe`.

If the page does not show JSON, or `webapi_token` is missing, make sure you are
logged into the real Steam Store domain and refresh the page.

## What Repressurizer Does With It

The Steam Family flow is:

1. Resolve your real `family_groupid` with
   `IFamilyGroupsService/GetFamilyGroupForUser`.
2. Load shared apps with
   `IFamilyGroupsService/GetSharedLibraryApps`.
3. Mark apps as owned, shared, or excluded based on the returned owners and
   exclusion flags.

The app masks Steam IDs and family group IDs in console logs and never prints the
token.

## Sources

- Steam Family endpoints reference:
  `https://steamapi.xpaw.me/IFamilyGroupsService`
- Lutris Steam Family integration uses the same Store endpoint and reads
  `data.webapi_token`:
  `https://gemfury.com/jackenmen/deb%3Alutris/lutris-0.5.22-all/content/usr/lib/python3/dist-packages/lutris/services/steamfamily.py`
- Chrome DevTools local storage reference, useful for understanding browser
  storage but not required for the flow above:
  `https://developer.chrome.com/docs/devtools/storage/localstorage`
