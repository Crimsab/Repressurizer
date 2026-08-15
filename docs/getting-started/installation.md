# Install Repressurizer

Download builds from the [latest GitHub release](https://github.com/Crimsab/Repressurizer/releases/latest).

| Asset | Choose it when |
| --- | --- |
| `Repressurizer_..._x64_en-US.msi` | You want the normal Windows installation and built-in updates. |
| `Repressurizer-portable-windows-x64.zip` | You want to run the app without installing it. |
| `Repressurizer-cli-windows-x64.zip` | You need scriptable diagnostics, snapshots, backups, or guarded Steam tooling. |
| `Repressurizer_..._amd64.AppImage` | You want a portable Linux desktop app with built-in updates. |
| `Repressurizer_..._amd64.deb` | You use Debian, Ubuntu, or a compatible x86_64 distribution. |
| `Repressurizer-cli-linux-x86_64.tar.gz` | You need the Linux CLI without the desktop app. |
| `Repressurizer_..._universal.dmg` | You use an Intel or Apple Silicon Mac running macOS 11 or newer. |

## Windows installer

1. Download the MSI installer.
2. Close Steam before the first collection save, but it can remain open during installation.
3. Run the installer and launch Repressurizer.
4. If Windows SmartScreen appears, confirm that the file came from the official GitHub release before continuing.

Current Windows artifacts are not Authenticode-signed, so SmartScreen may show
an unfamiliar publisher. This is separate from the Tauri updater signature used
to verify downloaded updates. Do not disable Defender to install Repressurizer;
see [installation warnings](../troubleshooting/installation.md).

## Windows portable build

Extract the ZIP to a writable folder and run `Repressurizer-portable.exe`. Do not run it directly from inside the ZIP archive.

The portable package changes how the executable is delivered, not where all application data is stored. Repressurizer still uses the Windows application data directory for settings and caches.

Portable builds do not update themselves in place. The Updates section links to
GitHub Releases when a newer portable ZIP must be downloaded. Use the Windows
installer if you want verified in-app updates that download, install, and restart
Repressurizer automatically.

## Linux AppImage

Download the AppImage, make it executable, and launch it:

```bash
chmod +x Repressurizer_*_amd64.AppImage
./Repressurizer_*_amd64.AppImage
```

The AppImage is the Linux format supported by the in-app updater. A current
x86_64 distribution with WebKitGTK 4.1 is recommended.

## Debian and Ubuntu

Install the downloaded package with your system package manager:

```bash
sudo apt install ./Repressurizer_*_amd64.deb
```

Install future `.deb` releases through the package manager or by downloading a
new package. The in-app updater installs AppImage updates and is not a system
package manager.

## Linux Steam locations

Automatic detection covers the native client plus common Flatpak and Snap
layouts. If Steam lives elsewhere, enter its installation root manually during
setup. Repressurizer needs the directory containing `userdata` and `config`, not
an individual Steam library folder containing only `steamapps`.

Steam Achievement Manager write actions remain Windows-only. Library loading,
collection editing, backups, shortcuts, metadata, and exports are supported on
Linux.

## Steam Deck

Steam Deck is currently an experimental x86_64 Linux target. Use the AppImage
from Desktop Mode; the standard Deck Steam path is included in automatic
detection. Game Mode has not been validated, and Steam must be fully closed
before Repressurizer writes collection changes. Exit Steam in Desktop Mode
before saving, then reopen it after the write completes.

ARM64 Linux devices are not supported by the current release packages.

## macOS

Download the universal DMG, open it, and drag **Repressurizer** to Applications. The same bundle supports Intel and Apple Silicon Macs on macOS 11 or newer. Its updater archive is signed separately so built-in updates can be verified.

Repressurizer is ad-hoc signed and is not notarized by Apple. On the first launch,
macOS may say that it cannot verify the developer. After attempting to open the
app, go to **System Settings > Privacy & Security**, choose **Open Anyway** for
Repressurizer, and confirm the prompt. Only do this for a DMG downloaded from the
official GitHub release and verified against `SHA256SUMS.txt`. Later launches do
not require this approval. See [Apple's Gatekeeper instructions](https://support.apple.com/102445).

Automatic Steam detection uses `~/Library/Application Support/Steam`. Collection files remain under Steam's normal `userdata/<id3>/config/cloudstorage` directory. Repressurizer blocks collection saves and restores while either the native `steam_osx` process or the Steam app process is running, and creates the same pre-write and pre-restore backups used on Windows and Linux.

Steam Achievement Manager reads and writes remain Windows-only. Library loading, collection editing, backups, shortcuts, metadata, exports, and verified app updates are the supported macOS surface.
