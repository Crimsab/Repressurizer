const RELEASE_HIGHLIGHTS: Record<string, string> = {
  "0.8.8":
    "This security update makes the app install an update only when its signature names the same version the update server announces, so a tampered update list cannot hand over an older release.",
  "0.8.7":
    "This maintenance update opens the app faster, keeps scrolling smooth in large libraries while the cache fills, fixes security issues in zip handling, and updates Tauri, its plugins, React, Vite and the Rust dependencies.",
  "0.8.6":
    "This update fixes library scrolling and concurrent edits, preserves profile history and recovers interrupted collection writes. Steam Store country selection now applies regional pricing and availability, with searchable countries and bundled flags. Steam tags, Deck metadata, travel notes, and documentation are also improved.",
  "0.8.5":
    "This update adds a Ctrl+K command palette with categorized views, tools and games, an Achievement Hunter tab inside the Achievements dialog, Kanban hover priority quick actions with per-column WIP limits, per-game wishlist sale alerts, a standalone HTML library export, a CLI local API client, portable self-update with staged replace, and unified resizable dialog chrome.",
  "0.8.4":
    "This update makes Kanban columns easier to reorder: column drag works again in the desktop app, the columns popover shows a live board order and always fits on screen, Ctrl+A toggles a column selection, and a new view option hides empty columns.",
  "0.8.3":
    "This patch adds scalable, reversible App ID list imports with lightweight linked references, improves Kanban controls and guidance, restores clean AutoCat rule creation, and checks for updates after tray resume.",
  "0.8.2":
    "This patch restores HowLongToBeat lookups, adds smarter cached storage planning with per-disk views, and improves Diary Kanban actions.",
  "0.8.1":
    "This maintenance update fixes Kanban library search, AutoCat Diary moves, progress-status synchronization, and responsive rule layouts.",
  "0.8.0":
    "This is a major planning and safety update with Session Planner, Tonight Queue, Library Changes Inbox, Rule Inspector, Collection Time Machine, conflict resolution, portable profiles and folder sync, storage planning, Deck packs, Community Rule Packs, and metadata health.",
  "0.7.0":
    "This is a big update with a complete Diary workspace, richer AutoCat rules, local API and MCP integrations, local installation detection, and more convenient settings and export tools.",
};

export function releaseHighlight(versionOrTag: string): string | null {
  const version = versionOrTag.replace(/^v/, "");
  return RELEASE_HIGHLIGHTS[version] ?? null;
}
