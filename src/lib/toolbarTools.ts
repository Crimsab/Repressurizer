import type { TranslationKey } from "./i18n";

export const TOOLBAR_TOOLS = [
  { id: "inbox", labelKey: "toolbar.inbox" },
  { id: "recommend", labelKey: "toolbar.recommend" },
  { id: "storage", labelKey: "toolbar.storage" },
  { id: "deck-pack", labelKey: "toolbar.deckPack" },
  { id: "time-machine", labelKey: "toolbar.timeMachine" },
  { id: "profiles", labelKey: "toolbar.profiles" },
  { id: "metadata-health", labelKey: "toolbar.metadataHealth" },
  { id: "achievements", labelKey: "toolbar.achievements" },
  { id: "wishlist", labelKey: "toolbar.wishlist" },
  { id: "friends", labelKey: "toolbar.friendCompare" },
  { id: "timeline", labelKey: "toolbar.timeline" },
  { id: "stats", labelKey: "toolbar.stats" },
  { id: "community-packs", labelKey: "toolbar.communityPacks" },
  { id: "export", labelKey: "toolbar.export" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: TranslationKey }>;

export type ToolbarToolId = typeof TOOLBAR_TOOLS[number]["id"];
export const DEFAULT_TOOLBAR_ORDER = TOOLBAR_TOOLS.map((tool) => tool.id);
export const DEFAULT_PINNED_TOOLS: ToolbarToolId[] = [
  "inbox",
  "recommend",
  "storage",
  "achievements",
  "wishlist",
  "export",
];
export const DEFAULT_HIDDEN_TOOLS: ToolbarToolId[] = [
  "friends",
  "timeline",
  "stats",
  "community-packs",
];

export function normalizeToolbarIds(value: unknown, includeMissing: boolean): ToolbarToolId[] {
  const valid = new Set<ToolbarToolId>(DEFAULT_TOOLBAR_ORDER);
  const selected = Array.isArray(value) ? value.filter((id): id is ToolbarToolId => typeof id === "string" && valid.has(id as ToolbarToolId)) : [];
  const unique = [...new Set(selected)];
  return includeMissing ? [...unique, ...DEFAULT_TOOLBAR_ORDER.filter((id) => !unique.includes(id))] : unique;
}
