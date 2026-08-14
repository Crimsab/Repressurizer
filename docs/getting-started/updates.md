# Updates and previews

## Stable channel

Stable releases are versioned tags such as `v0.5.2`. The release workflow publishes `latest.json`, which Windows installers and Linux AppImages use to find signed updater artifacts.

Use the stable channel for your normal library maintenance.

## Preview channel

The Windows `preview` prerelease is continuously replaced by a build from the newest commit on `main`. It has a separate version number and updater manifest, so it does not replace the stable release record. Linux preview artifacts are not currently published.

Preview builds are useful for testing fixes before the next stable version. They can change frequently and should be used with backups enabled.

## Verify a download

Download only from the [Repressurizer releases page](https://github.com/Crimsab/Repressurizer/releases). Stable release notes may also include VirusTotal analysis links or verdict summaries when scanning is configured.
