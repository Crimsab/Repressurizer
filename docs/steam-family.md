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

Repressurizer saves only this token in its local app data after you import, save,
or probe it, then reuses it automatically. It does not import or persist browser
cookies, a Steam password, or the rest of the Store response. If Steam expires
or rejects the saved token, the Family probe will fail and you can import a
fresh one or delete it immediately with `Clear token`.

The file is named `steam_family_token.json` under the operating system's
`Repressurizer` application-data folder (for example `%APPDATA%\Repressurizer`
on Windows, `~/.local/share/Repressurizer` on a typical Linux installation, and
`~/Library/Application Support/Repressurizer` on macOS).

Treat it like a session secret: do not share it, paste it into chats, commit it,
or put it in screenshots.

## Why There Is No Steam Login Button

Steam OpenID identifies an account but does not grant access to private Steam
Family data. Steam's OAuth flow requires a Valve-issued Client ID and its
documented service scopes do not include Steam Family. Repressurizer therefore
does not ask for Steam credentials, embed a Steam login form, or copy browser
session databases.

The supported helper keeps authentication on the official Steam website and
makes the transfer explicit.

## Browser Helper (Recommended)

Use this only if the normal Steam Web API key fails in Steam Family.

1. In Settings > Steam Family, click `Open token page`. This opens the
   [official Steam token page](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig).
2. Sign in on the official Steam website if your browser asks you to.
3. The page should show JSON containing:

   ```json
   {
     "data": {
       "webapi_token": "..."
     }
   }
   ```

4. Copy the entire JSON response.
5. Return to Repressurizer and click `Import from clipboard`.
6. Click `Probe`.

Repressurizer reads clipboard text only when you click the import button. The
clipboard helper accepts only JSON that explicitly contains `webapi_token`,
extracts that one value, and discards the response text. It does not monitor the
clipboard or request clipboard write, clear, image, cookie, or browser-profile
permissions.

## Manual Fallback

If clipboard access is unavailable, paste either the token value or the full
JSON response into the manual password field and click `Save token` or `Probe`.
This preserves the original setup path on every supported desktop platform.

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
4. Hide tools and non-game apps by default. You can enable them with the
   `Include tools and non-game apps` option.
5. Try to load Family playtime with
   `IFamilyGroupsService/GetPlaytimeSummary`. If Steam does not return playtime
   data, Repressurizer keeps the Family apps visible and reports that playtime
   was unavailable.

The app masks Steam IDs and family group IDs in console logs and never prints the
token. A reminder appears when a token has not been validated for a while; this
is a refresh hint, not a claim about Steam's exact expiry time.

## Sources

- [Steam Web API and OpenID documentation](https://steamcommunity.com/dev)
- [Steam OAuth documentation](https://partner.steamgames.com/doc/webapi_overview/OAuth)
- [Steam authentication documentation](https://partner.steamgames.com/doc/features/auth)
- [Tauri clipboard plugin documentation](https://v2.tauri.app/plugin/clipboard/)
- [Steam Family endpoint reference](https://steamapi.xpaw.me/IFamilyGroupsService)
