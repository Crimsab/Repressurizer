import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type GroupAudience = "user" | "internal";

type Commit = {
  sha: string;
  subject: string;
  type: string;
  scope: string | null;
  description: string;
};

type ChangelogGroup = {
  title: string;
  audience: GroupAudience;
  items: Array<{
    text: string;
    sha: string;
    url: string;
  }>;
};

type ChangelogEntry = {
  version: string;
  date: string;
  releaseUrl: string;
  compareUrl: string;
  groups: ChangelogGroup[];
};

type GeneratedChangelog = {
  schemaVersion: 1;
  source: "git";
  repository: string;
  entries: ChangelogEntry[];
};

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(arg.slice(2), next);
    i += 1;
  } else {
    args.set(arg.slice(2), "true");
  }
}

const repository = args.get("repo") ?? process.env.GITHUB_REPOSITORY ?? "Crimsab/Repressurizer";
const markdownOut = args.get("markdown") ?? "CHANGELOG.md";
const jsonOut = args.get("json") ?? "src/lib/generatedChangelog.json";
const maxAppEntries = Number(args.get("max-app-entries") ?? 8);

const tags = releaseTags();
const entries = tags.map((tag, index) => buildEntry(tag, tags[index - 1])).filter((entry) =>
  entry.groups.some((group) => group.items.length > 0)
);

const changelog: GeneratedChangelog = {
  schemaVersion: 1,
  source: "git",
  repository,
  entries: entries.slice().reverse().slice(0, maxAppEntries),
};

writeGeneratedJson(jsonOut, changelog);
writeFileSync(markdownOut, renderMarkdown(entries.slice().reverse()), "utf8");

console.log(`Wrote ${markdownOut}`);
console.log(`Wrote ${jsonOut}`);

function releaseTags(): string[] {
  return run(["git", "tag", "--list", "v[0-9]*", "--sort=version:refname"])
    .split("\n")
    .map((line) => line.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

function buildEntry(tag: string, previousTag: string | undefined): ChangelogEntry {
  const commits = readCommits(previousTag ? `${previousTag}..${tag}^{}` : `${tag}^{}`);
  const groups = groupCommits(commits);
  return {
    version: tag.replace(/^v/, ""),
    date: tagDate(tag),
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    compareUrl: previousTag
      ? `https://github.com/${repository}/compare/${previousTag}...${tag}`
      : `https://github.com/${repository}/releases/tag/${tag}`,
    groups,
  };
}

function readCommits(range: string): Commit[] {
  const output = run(["git", "log", "--pretty=format:%H%x1f%s%x1e", range], { allowFailure: true });
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject] = record.split("\x1f");
      return parseCommit(sha, subject);
    })
    .filter((commit): commit is Commit => commit !== null && includeCommit(commit));
}

function parseCommit(sha: string, subject: string): Commit | null {
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s+(.+)$/);
  if (!match) {
    return {
      sha,
      subject,
      type: "other",
      scope: null,
      description: subject,
    };
  }

  return {
    sha,
    subject,
    type: match[1].toLowerCase(),
    scope: match[2] ?? null,
    description: match[3],
  };
}

function includeCommit(commit: Commit): boolean {
  if (/^chore\(release\):\s*bump version\b/i.test(commit.subject)) return false;
  if (/^bump (?:app )?version\b/i.test(commit.description)) return false;
  if (/^address \d+\.\d+\.\d+ issue batch$/i.test(commit.description)) return false;
  return true;
}

function groupCommits(commits: Commit[]): ChangelogGroup[] {
  const orderedGroups = [
    group("Added", "user", commits, ["feat"]),
    group("Fixed", "user", commits, ["fix"]),
    group("Changed", "user", commits, ["perf", "refactor"]),
    group("Documentation", "internal", commits, ["docs"]),
    group("Internal", "internal", commits, ["test", "ci", "build", "chore", "style", "other"]),
  ];

  return orderedGroups.filter((entry) => entry.items.length > 0);
}

function group(
  title: string,
  audience: GroupAudience,
  commits: Commit[],
  types: string[]
): ChangelogGroup {
  const allowed = new Set(types);
  return {
    title,
    audience,
    items: commits
      .filter((commit) => allowed.has(commit.type))
      .map((commit) => ({
        text: formatDescription(commit, title),
        sha: commit.sha.slice(0, 7),
        url: `https://github.com/${repository}/commit/${commit.sha.slice(0, 7)}`,
      })),
  };
}

function formatDescription(commit: Commit, groupTitle: string): string {
  const scopePrefix = commit.scope && !["i18n"].includes(commit.scope)
    ? `${formatScope(commit.scope)}: `
    : "";
  let description = commit.description;
  if (groupTitle === "Added") {
    description = description.replace(/^adds?\s+/i, "");
  }
  if (groupTitle === "Fixed") {
    description = description.replace(/^fix(?:es|ed)?\s+/i, "");
  }

  const text = `${scopePrefix}${description}`
    .replace(/\bautocat\b/gi, "AutoCat")
    .replace(/\bhltb\b/gi, "HLTB")
    .replace(/\bsteam\b/gi, "Steam")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bui\b/gi, "UI")
    .replace(/\bcli\b/gi, "CLI")
    .replace(/\bi18n\b/gi, "localization");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatScope(scope: string): string {
  return scope
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAuto Cat\b/g, "AutoCat");
}

function tagDate(tag: string): string {
  const taggerDate = run([
    "git",
    "for-each-ref",
    "--format=%(creatordate:short)",
    `refs/tags/${tag}`,
  ], { allowFailure: true }).trim();
  if (taggerDate) return taggerDate;
  return run(["git", "log", "-1", "--format=%cs", `${tag}^{}`], { allowFailure: true }).trim();
}

function renderMarkdown(entriesDescending: ChangelogEntry[]): string {
  const lines = [
    "# Changelog",
    "",
    "All notable user-facing changes are generated from release tags and Conventional Commit subjects.",
    "",
    "Run `bun run changelog:write` after changing release tags or commit history.",
    "",
  ];

  for (const entry of entriesDescending) {
    lines.push(`## ${entry.version} - ${entry.date}`, "");
    for (const group of entry.groups.filter((item) => item.audience === "user")) {
      lines.push(`### ${group.title}`, "");
      for (const item of group.items) {
        lines.push(`- ${item.text} ([${item.sha}](${item.url}))`);
      }
      lines.push("");
    }
    lines.push(`[Release](${entry.releaseUrl}) · [Compare](${entry.compareUrl})`, "");
  }

  return `${lines.join("\n").trim()}\n`;
}

function writeGeneratedJson(path: string, data: GeneratedChangelog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function run(cmd: string[], options: { allowFailure?: boolean } = {}): string {
  const result = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${cmd.join(" ")} failed:\n${result.stderr.toString()}`);
  }

  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}
