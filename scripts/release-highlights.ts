const RELEASE_HIGHLIGHTS: Record<string, string> = {
  "0.8.0":
    "This is a major planning and safety update with Session Planner, Tonight Queue, Library Changes Inbox, Rule Inspector, Collection Time Machine, conflict resolution, portable profiles and folder sync, storage planning, Deck packs, Community Rule Packs, and metadata health.",
  "0.7.0":
    "This is a big update with a complete Diary workspace, richer AutoCat rules, local API and MCP integrations, local installation detection, and more convenient settings and export tools.",
};

export function releaseHighlight(versionOrTag: string): string | null {
  const version = versionOrTag.replace(/^v/, "");
  return RELEASE_HIGHLIGHTS[version] ?? null;
}
