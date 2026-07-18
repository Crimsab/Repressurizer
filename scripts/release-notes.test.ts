import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRepositories: string[] = [];

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

describe("release notes", () => {
  it("uses the previous stable version tag instead of the moving preview tag", () => {
    const repository = mkdtempSync(join(tmpdir(), "repressurizer-release-notes-"));
    temporaryRepositories.push(repository);

    git(repository, "init", "--initial-branch=main");
    git(repository, "config", "user.name", "Crimsab");
    git(repository, "config", "user.email", "121881650+Crimsab@users.noreply.github.com");

    commit(repository, "base.txt", "base", "chore: release 0.5.4");
    git(repository, "tag", "v0.5.4");
    commit(repository, "fix.txt", "fix", "fix: ignore uninitialized Steam LevelDB directories");
    git(repository, "tag", "preview");
    commit(repository, "policy.txt", "policy", "fix: tolerate isolated antivirus false positives");
    git(repository, "tag", "v0.5.5");

    const output = join(repository, "release-notes.md");
    const script = resolve(process.cwd(), "scripts/release-notes.ts");
    const result = spawnSync("bun", [
      script,
      "--repo",
      "Crimsab/Repressurizer",
      "--tag",
      "v0.5.5",
      "--out",
      output,
    ], { cwd: repository, encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
    const notes = readFileSync(output, "utf8");
    expect(notes).toContain("Ignore uninitialized Steam LevelDB directories");
    expect(notes).toContain("Tolerate isolated antivirus false positives");
    expect(notes).toContain("compare/v0.5.4...v0.5.5");
    expect(notes).not.toContain("compare/preview...v0.5.5");
  });
});

function commit(repository: string, filename: string, contents: string, message: string): void {
  writeFileSync(join(repository, filename), contents, "utf8");
  git(repository, "add", filename);
  git(repository, "commit", "-m", message);
}

function git(repository: string, ...args: string[]): void {
  const result = spawnSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
}
