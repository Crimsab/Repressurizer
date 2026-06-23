import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type ContributorConfig = {
  aliases?: Record<string, string>;
};

type Commit = {
  sha: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
};

type CommitContributor = {
  login: string;
  source: "github" | "alias" | "trailer";
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

const repo = args.get("repo") ?? process.env.GITHUB_REPOSITORY;
const tag = args.get("tag") ?? process.env.GITHUB_REF_NAME;
const sha = args.get("sha") ?? process.env.GITHUB_SHA ?? tag;
const out = args.get("out") ?? "release-notes.md";

if (!repo) throw new Error("Missing --repo or GITHUB_REPOSITORY");
if (!tag) throw new Error("Missing --tag or GITHUB_REF_NAME");

const config = readContributorConfig();
const generatedNotes = generateGitHubNotes(repo, tag, sha);
const previousTag = findPreviousTag(generatedNotes, tag);
const compareUrl = previousTag
  ? `https://github.com/${repo}/compare/${previousTag}...${tag}`
  : `https://github.com/${repo}/releases/tag/${tag}`;

const mainNotes = hasGeneratedChanges(generatedNotes)
  ? normalizeGeneratedNotes(generatedNotes)
  : buildCommitFallback(repo, tag, previousTag, compareUrl, config);

const releaseNotes = [
  mainNotes,
  "---",
  "## Downloads",
  "",
  "- `Repressurizer_*_x64-setup.exe`: Windows installer",
  "- `Repressurizer-portable-windows-x64.zip`: portable Windows build",
  "- `Repressurizer-portable.exe`: unpacked portable executable",
  "- `Repressurizer-cli-windows-x64.zip`: command-line tools for scripts and automation",
  "- `Repressurizer-cli.exe`: unpacked command-line executable",
  "- `latest.json`: updater manifest",
  "",
  "## Install Notes",
  "",
  "Use the installer for normal Windows installs. Use the portable ZIP when you want a self-contained executable. Use the CLI ZIP for scriptable diagnostics, snapshot validation/export, automation publishing, and guarded SAM commands.",
  ""
].join("\n");

writeFileSync(out, releaseNotes, "utf8");
console.log(`Wrote ${out}`);

function readContributorConfig(): ContributorConfig {
  const path = resolve(".github/release-contributors.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ContributorConfig;
  } catch {
    return {};
  }
}

function generateGitHubNotes(repository: string, releaseTag: string, targetSha?: string): string {
  const cmd = [
    "gh",
    "api",
    `repos/${repository}/releases/generate-notes`,
    "-f",
    `tag_name=${releaseTag}`,
    "--jq",
    ".body"
  ];

  if (targetSha) {
    cmd.splice(cmd.length - 2, 0, "-f", `target_commitish=${targetSha}`);
  }

  const result = run(cmd, { allowFailure: true });
  return result.trim();
}

function hasGeneratedChanges(notes: string): boolean {
  return /^## What's Changed\s+[*-]\s+/m.test(notes);
}

function normalizeGeneratedNotes(notes: string): string {
  return notes.trim().replace(/\r\n/g, "\n");
}

function findPreviousTag(notes: string, releaseTag: string): string | null {
  const escapedTag = releaseTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compareMatch = notes.match(new RegExp(`/compare/([^\\s]+)\\.\\.\\.${escapedTag}`));
  if (compareMatch?.[1]) return compareMatch[1];

  const previous = run(["git", "describe", "--tags", "--abbrev=0", `${releaseTag}^{}^`], {
    allowFailure: true
  }).trim();

  return previous || null;
}

function buildCommitFallback(
  repository: string,
  releaseTag: string,
  previous: string | null,
  changelogUrl: string,
  contributorConfig: ContributorConfig
): string {
  const range = previous ? `${previous}..${releaseTag}` : releaseTag;
  const commits = readCommits(range).filter(isReleaseNoteCommit);
  const previousContributors = previous
    ? new Set(readCommits(previous).flatMap((commit) => contributorLogins(repository, commit, contributorConfig)))
    : new Set<string>();

  const contributorsByCommit = new Map<string, CommitContributor[]>();
  for (const commit of commits) {
    contributorsByCommit.set(commit.sha, contributorLogins(repository, commit, contributorConfig));
  }

  const lines = ["## What's Changed", ""];

  if (commits.length === 0) {
    lines.push("- Maintenance updates and release packaging.");
  } else {
    for (const commit of commits) {
      const contributors = contributorsByCommit.get(commit.sha) ?? [];
      const byline = formatContributors(contributors);
      const shortSha = commit.sha.slice(0, 7);
      lines.push(`- ${formatCommitSubject(commit.subject)}${byline} in ${commitUrl(repository, shortSha)}`);
    }
  }

  const releaseContributors = unique(
    commits.flatMap((commit) => contributorsByCommit.get(commit.sha) ?? []).map((contributor) => contributor.login)
  );
  const newContributors = releaseContributors.filter((login) => !previousContributors.has(login) && !isOwner(repository, login));

  if (newContributors.length > 0) {
    lines.push("", "## New Contributors", "");
    for (const login of newContributors) {
      lines.push(`- @${login} made their first contribution in this release`);
    }
  }

  lines.push("", `**Full Changelog**: ${changelogUrl}`, "");
  return lines.join("\n");
}

function readCommits(range: string): Commit[] {
  const pretty = "%H%x1f%s%x1f%an%x1f%ae%x1f%B%x1e";
  const output = run(["git", "log", "--pretty=format:" + pretty, range], { allowFailure: true });
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, authorName, authorEmail, ...bodyParts] = record.split("\x1f");
      return {
        sha,
        subject,
        authorName,
        authorEmail,
        body: bodyParts.join("\x1f").trim()
      };
    });
}

function isReleaseNoteCommit(commit: Commit): boolean {
  return !/^chore\(release\):\s*bump version\b/i.test(commit.subject);
}

function contributorLogins(
  repository: string,
  commit: Commit,
  contributorConfig: ContributorConfig
): CommitContributor[] {
  const contributors: CommitContributor[] = [];
  const githubLogin = githubCommitAuthor(repository, commit.sha);
  if (githubLogin) contributors.push({ login: githubLogin, source: "github" });

  const aliasLogin = aliasFor(contributorConfig, commit.authorEmail) ?? aliasFor(contributorConfig, commit.authorName);
  if (aliasLogin) contributors.push({ login: aliasLogin, source: "alias" });

  for (const trailer of coAuthorTrailers(commit.body)) {
    const trailerLogin =
      aliasFor(contributorConfig, trailer.email) ??
      aliasFor(contributorConfig, trailer.name) ??
      githubHandleFromName(trailer.name);
    if (trailerLogin) contributors.push({ login: trailerLogin, source: "trailer" });
  }

  return uniqueBy(contributors, (contributor) => contributor.login);
}

function githubCommitAuthor(repository: string, commitSha: string): string | null {
  const output = run(["gh", "api", `repos/${repository}/commits/${commitSha}`, "--jq", ".author.login // empty"], {
    allowFailure: true
  }).trim();

  return output || null;
}

function coAuthorTrailers(body: string): Array<{ name: string; email: string }> {
  const trailers: Array<{ name: string; email: string }> = [];
  const pattern = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim;
  for (const match of body.matchAll(pattern)) {
    trailers.push({ name: match[1].trim(), email: match[2].trim().toLowerCase() });
  }
  return trailers;
}

function aliasFor(config: ContributorConfig, value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const aliases = config.aliases ?? {};
  return aliases[normalized] ?? aliases[value.trim()] ?? null;
}

function githubHandleFromName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed.startsWith("@")) return null;
  return trimmed.slice(1);
}

function formatCommitSubject(subject: string): string {
  const withoutConventionalPrefix = subject.replace(/^(feat|fix|perf|refactor|docs|test|ci|build|style|chore)(\([^)]+\))?!?:\s*/i, "");
  return withoutConventionalPrefix.charAt(0).toUpperCase() + withoutConventionalPrefix.slice(1);
}

function formatContributors(contributors: CommitContributor[]): string {
  if (contributors.length === 0) return "";
  const mentions = contributors.map((contributor) => `@${contributor.login}`);
  if (mentions.length === 1) return ` by ${mentions[0]}`;
  return ` by ${mentions.slice(0, -1).join(", ")} and ${mentions.at(-1)}`;
}

function commitUrl(repository: string, shortSha: string): string {
  return `https://github.com/${repository}/commit/${shortSha}`;
}

function isOwner(repository: string, login: string): boolean {
  return repository.split("/")[0].toLowerCase() === login.toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function run(cmd: string[], options: { allowFailure?: boolean } = {}): string {
  const result = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env
  });

  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${cmd.join(" ")} failed:\n${result.stderr.toString()}`);
  }

  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}
