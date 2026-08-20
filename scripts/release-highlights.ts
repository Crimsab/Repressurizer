const RELEASE_HIGHLIGHTS: Record<string, string> = {
  "0.7.0":
    "This is a big update with a complete Diary workspace, richer AutoCat rules, local API and MCP integrations, local installation detection, and more convenient settings and export tools.",
};

export function releaseHighlight(versionOrTag: string): string | null {
  const version = versionOrTag.replace(/^v/, "");
  return RELEASE_HIGHLIGHTS[version] ?? null;
}
