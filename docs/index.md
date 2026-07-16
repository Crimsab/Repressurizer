---
title: Repressurizer
description: A backup-first Steam library manager for Windows.
hide:
  - navigation
  - toc
---

<div class="rp-hero" markdown>

<div class="rp-hero__copy" markdown>

# Organize your library

Repressurizer is a Windows desktop app for collections, metadata, AutoCat rules, exports, and safer local Steam library maintenance.

[Install Repressurizer](getting-started/installation.md){ .md-button .md-button--primary }
[Explore the user guide](user-guide/index.md){ .md-button }

</div>

<div class="rp-hero__media" markdown>

![Repressurizer library dashboard](assets/dashboard.png)

</div>

</div>

## Start with the job you want to do

<div class="grid cards rp-paths" markdown>

-   :material-folder-multiple:{ .lg .middle } **Organize collections**

    Create, rename, merge, color, and bulk-edit Steam collections with a save preview.

    [Collections guide](user-guide/collections.md)

-   :material-filter-cog:{ .lg .middle } **Build AutoCat rules**

    Generate useful collections from genres, tags, playtime, HLTB, reviews, platforms, and more.

    [AutoCat guide](user-guide/autocat.md)

-   :material-shield-check:{ .lg .middle } **Save safely**

    Understand backups, previews, Steam file writes, and the restore path before changing anything.

    [First safe save](getting-started/safe-first-save.md)

-   :material-connection:{ .lg .middle } **Integrate other tools**

    Publish stable library snapshots or consume them from TypeScript and Rust.

    [Integration overview](integrations/index.md)

</div>

## What Repressurizer changes

Repressurizer reads Steam's local collection data and writes collection changes only when you explicitly save. It creates backups before writes and shows a preview of the affected collections.

Metadata preparation and automation publishing are separate network operations. Repressurizer does not remotely modify the collections stored in your Steam account.

!!! warning "Close Steam before saving collections"
    Steam can overwrite its local files while it is running. Close Steam, review the save preview, and keep automatic backups enabled.

## Popular guides

- [Search syntax and structured filters](user-guide/search-and-filters.md)
- [Prepare metadata without hammering upstream services](cache-and-network.md)
- [Restore a collection backup](user-guide/backups.md)
- [Set up Steam Family detection](steam-family.md)
- [Troubleshoot missing or incomplete metadata](troubleshooting/metadata.md)
- [Use the Repressurizer CLI](cli.md)
