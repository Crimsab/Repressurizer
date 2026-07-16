# Install Repressurizer

Download builds from the [latest GitHub release](https://github.com/Crimsab/Repressurizer/releases/latest).

| Asset | Choose it when |
| --- | --- |
| `Repressurizer_..._x64-setup.exe` | You want the normal Windows installation and built-in updates. |
| `Repressurizer-portable-windows-x64.zip` | You want to run the app without installing it. |
| `Repressurizer-cli-windows-x64.zip` | You need scriptable diagnostics, snapshots, backups, or guarded Steam tooling. |

## Installer

1. Download the setup executable.
2. Close Steam before the first collection save, but it can remain open during installation.
3. Run the installer and launch Repressurizer.
4. If Windows SmartScreen appears, confirm that the file came from the official GitHub release before continuing.

Repressurizer's early releases are not code-signed with a commercial Windows certificate, so SmartScreen may show an unfamiliar publisher warning. See [Install and SmartScreen troubleshooting](../troubleshooting/installation.md).

## Portable build

Extract the ZIP to a writable folder and run `Repressurizer-portable.exe`. Do not run it directly from inside the ZIP archive.

The portable package changes how the executable is delivered, not where all application data is stored. Repressurizer still uses the Windows application data directory for settings and caches.
