# Updates and previews

## Stable channel

Stable releases use tags and versions such as `v0.6.0` / `0.6.0`. Stable is
the default channel and receives only normal GitHub Releases. Its updater
manifests are separate from beta manifests, so publishing a prerelease cannot
replace the default stable update.

Use the stable channel for your normal library maintenance.

On Windows, in-app installation is supported by the normal MSI installer. The
portable ZIP can check its delivery mode but does not replace its executable in
place; download a newer portable ZIP from GitHub Releases instead. Settings and
caches remain in the Windows application data directory in either case.

## Beta channel

Beta releases use numbered SemVer prereleases such as `v0.7.0-beta.1`. They are
signed, published as GitHub prereleases, and available on the Windows installer,
Linux AppImage, and macOS app updater paths. Beta is always opt-in:

1. Open Settings > About.
2. Change `Release channel` from `Stable` to `Beta`.
3. Click `Check for updates` and confirm installation if a beta is available.

Changing the selection clears any update previously found from the other
channel. Automatic checks also use the selected channel.

To return, select `Stable` and check again. If the installed beta is newer than
the current stable release, Repressurizer may offer the older stable version as
an explicit downgrade; it never installs it without your confirmation. Back up
your collections before moving between prerelease and stable versions.

Portable Windows ZIPs and Linux system packages keep using manual downloads;
the channel selector is shown only where in-place updates are supported.

## Developer preview channel

The Windows `preview` prerelease is continuously replaced by an MSI build from the newest commit on `main`. It has a separate version number and updater manifest, so it does not replace the stable release record. Linux preview artifacts are not currently published.

Preview is a separately installed developer build, not the versioned beta
channel. It is useful for testing the newest commit and can change frequently.
Use it with backups enabled.

## Verify a download

Download only from the [Repressurizer releases page](https://github.com/Crimsab/Repressurizer/releases). Stable release notes may also include VirusTotal analysis links or verdict summaries when scanning is configured.
