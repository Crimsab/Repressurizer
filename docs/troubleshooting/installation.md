# Installation warnings

## Windows SmartScreen or antivirus warning

Current Windows artifacts are not Authenticode-signed, so SmartScreen can show
an unfamiliar publisher even when the file is unchanged. Repressurizer uses an
MSI for normal installation; the separate `.sig` verifies updater downloads but
does not establish a Windows publisher identity.

Verify that the file came from `github.com/Crimsab/Repressurizer/releases`,
compare it with `SHA256SUMS.txt`, and review the VirusTotal links in the release
notes. Do not disable Defender or add an exclusion. If Defender reports a
detection, cancel the install and report the exact version, filename, and hash.

Do not download installers from mirrors or reposting sites.

## macOS cannot verify the developer

The macOS release is ad-hoc signed but not Apple-notarized. Confirm that the DMG
came from the official Repressurizer release and compare its SHA-256 digest with
`SHA256SUMS.txt`. Attempt to open Repressurizer once, then open **System Settings
> Privacy & Security**, choose **Open Anyway**, and confirm. macOS remembers the
approval for later launches.

Do not bypass Gatekeeper for a copy downloaded from a mirror or reposting site.

## App does not start

- Extract the portable ZIP before running the executable.
- Confirm that WebView2 Runtime is installed and current.
- Try the stable MSI if a preview build fails.
- Export or run CLI diagnostics when available.
- Check the issue tracker for the current release before opening a duplicate report.
