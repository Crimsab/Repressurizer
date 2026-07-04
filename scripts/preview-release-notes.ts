#!/usr/bin/env bun

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
const label = args.get("label");
const from = resolveRef(args.get("from") ?? "");
const to = resolveRef(args.get("to") ?? process.env.GITHUB_SHA ?? "");
const out = args.get("out") ?? "preview-release-notes.md";

if (!repo) throw new Error("Missing --repo or GITHUB_REPOSITORY");
if (!label) throw new Error("Missing --label");
if (!to) throw new Error("Missing --to or GITHUB_SHA");

const shortTo = to.slice(0, 7);
const hasPrevious = Boolean(from) && from !== to;
const compareUrl = hasPrevious
  ? `https://github.com/${repo}/compare/${from}...${to}`
  : `https://github.com/${repo}/commit/${to}`;
const commits = hasPrevious ? readCommits(`${from}..${to}`) : [];

const lines = [
  "## What's Changed",
  "",
];

if (commits.length === 0) {
  lines.push(`- Preview packaging refresh for [${shortTo}](${commitUrl(repo, shortTo)}).`);
} else {
  for (const commit of commits) {
    const shortSha = commit.sha.slice(0, 7);
    const author = formatAuthor(repo, commit);
    const byline = author ? ` by ${author}` : "";
    lines.push(`- ${formatCommitSubject(commit.subject)}${byline} in [${shortSha}](${commitUrl(repo, shortSha)})`);
  }
}

lines.push(
  "",
  `**Full Changelog**: ${compareUrl}`,
  "",
  "---",
  "## Downloads",
  "",
  `- \`Repressurizer-${label}-windows-x64-setup.exe\`: Windows preview installer`,
  `- \`Repressurizer-${label}-portable-windows-x64.zip\`: portable Windows preview build`,
  `- \`Repressurizer-${label}-portable.exe\`: unpacked portable preview executable`,
  "- `latest-preview.json`: preview updater manifest",
  "",
  "## Preview Notes",
  "",
  "This preview installs separately from stable Repressurizer and uses the preview updater channel.",
  ""
);

writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Wrote ${out}`);

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
        authorEmail,
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

function resolveRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return "";
  return run(["git", "rev-parse", `${trimmed}^{commit}`], { allowFailure: true }).trim() || trimmed;
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
