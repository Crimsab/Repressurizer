# Install Repressurizer

Download builds from the [latest GitHub release](https://github.com/Crimsab/Repressurizer/releases/latest).

| Asset | Choose it when |
| --- | --- |
| `Repressurizer_..._x64-setup.exe` | You want the normal Windows installation and built-in updates. |
| `Repressurizer-portable-windows-x64.zip` | You want to run the app without installing it. |
| `Repressurizer-cli-windows-x64.zip` | You need scriptable diagnostics, snapshots, backups, or guarded Steam tooling. |
| `Repressurizer_..._amd64.AppImage` | You want a portable Linux desktop app with built-in updates. |
| `Repressurizer_..._amd64.deb` | You use Debian, Ubuntu, or a compatible x86_64 distribution. |
| `Repressurizer-cli-linux-x86_64.tar.gz` | You need the Linux CLI without the desktop app. |

## Windows installer

1. Download the setup executable.
2. Close Steam before the first collection save, but it can remain open during installation.
3. Run the installer and launch Repressurizer.
4. If Windows SmartScreen appears, confirm that the file came from the official GitHub release before continuing.

Repressurizer's early releases are not code-signed with a commercial Windows certificate, so SmartScreen may show an unfamiliar publisher warning. See [Install and SmartScreen troubleshooting](../troubleshooting/installation.md).

## Windows portable build

Extract the ZIP to a writable folder and run `Repressurizer-portable.exe`. Do not run it directly from inside the ZIP archive.

The portable package changes how the executable is delivered, not where all application data is stored. Repressurizer still uses the Windows application data directory for settings and caches.

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
