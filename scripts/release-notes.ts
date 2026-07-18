import { writeFileSync } from "node:fs";

type Commit = {
  sha: string;
  subject: string;
  authorName: string;
  authorEmail: string;
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
const out = args.get("out") ?? "release-notes.md";

if (!repo) throw new Error("Missing --repo or GITHUB_REPOSITORY");
if (!tag) throw new Error("Missing --tag or GITHUB_REF_NAME");

const previousTag = findPreviousTag(tag);
const compareUrl = previousTag
  ? `https://github.com/${repo}/compare/${previousTag}...${tag}`
  : `https://github.com/${repo}/releases/tag/${tag}`;

const mainNotes = buildCommitNotes(repo, tag, previousTag, compareUrl);

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

function findPreviousTag(releaseTag: string): string | null {
  const releaseParent = run(["git", "rev-parse", `${releaseTag}^{}^`], {
    allowFailure: true
  }).trim();
  if (!releaseParent) return null;

  const tags = run(["git", "tag", "--merged", releaseParent, "--sort=-version:refname"], {
    allowFailure: true
  });
  const previous = tags
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => /^v\d+\.\d+\.\d+$/.test(candidate) && candidate !== releaseTag);

  return previous || null;
}

function buildCommitNotes(repository: string, releaseTag: string, previous: string | null, changelogUrl: string): string {
  const range = previous ? `${previous}..${releaseTag}` : releaseTag;
  const commits = readCommits(range);
  const lines = ["## What's Changed", ""];

  if (commits.length === 0) {
    lines.push("- Maintenance updates and release packaging.");
  } else {
    for (const commit of commits) {
      const shortSha = commit.sha.slice(0, 7);
      const author = formatAuthor(repository, commit);
      const byline = author ? ` by ${author}` : "";
      lines.push(`- ${formatCommitSubject(commit.subject)}${byline} in [${shortSha}](${commitUrl(repository, shortSha)})`);
    }
  }

  lines.push("", `**Full Changelog**: ${changelogUrl}`, "");
  return lines.join("\n");
}

function readCommits(range: string): Commit[] {
  const pretty = "%H%x1f%s%x1f%an%x1f%ae%x1e";
  const output = run(["git", "log", "--pretty=format:" + pretty, range], { allowFailure: true });
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, authorName, authorEmail] = record.split("\x1f");
      return {
        sha,
        subject,
        authorName,
        authorEmail
      };
    });
}

function formatCommitSubject(subject: string): string {
  const withoutConventionalPrefix = subject.replace(/^(feat|fix|perf|refactor|docs|test|ci|build|style|chore)(\([^)]+\))?!?:\s*/i, "");
  return withoutConventionalPrefix.charAt(0).toUpperCase() + withoutConventionalPrefix.slice(1);
}

function formatAuthor(repository: string, commit: Commit): string {
  const owner = repository.split("/")[0];
  const authorName = commit.authorName.trim();
  const authorEmail = commit.authorEmail.trim();

  if (authorName.startsWith("@")) return authorName;
  if (authorName.toLowerCase() === owner.toLowerCase()) return `@${owner}`;

  const noreplyLogin = githubNoreplyLogin(authorEmail);
  if (noreplyLogin) return `@${noreplyLogin}`;

  return authorName;
}

function githubNoreplyLogin(email: string): string | null {
  const match = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
  return match?.[1] ?? null;
}

function commitUrl(repository: string, shortSha: string): string {
  return `https://github.com/${repository}/commit/${shortSha}`;
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
