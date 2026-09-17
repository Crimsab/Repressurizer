import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'Crimsab/Repressurizer';
// Explicitly approved cleanup inventory. Never infer deletion from name alone.
export const RELEASES = [
  { tag: 'test-9c74226', id: 383958820, sha: '9c742262947a8976f6c6b7842a9cb5e232a36eeb' },
  { tag: 'test-89ce6e5', id: 383968690, sha: '89ce6e5ae19143c1a8a1b0bf04c07601392a87e9' },
  { tag: 'test-c9204b4', id: 384029207, sha: 'c9204b4247b08ab8d001364734775b24726d9200' },
];
export const BRANCHES = [
  { name: 'fix/source-audit-2026-09-06', pr: 93, sha: '5400e5a64a5edde930acbabdc2321bf2972176fc' },
  { name: 'fix/performance-audit-2026-09-06', pr: 94, sha: 'd1350c79b5bf4753c514ffba90f2a71d891f43cd' },
  { name: 'codex/fix-virtual-library-scroll', pr: 104, sha: '479c607adcd90ea015cafcb1ef9fdd366889d66e' },
  { name: 'codex/fix-audit-findings', pr: 105, sha: 'b00ae951097a717141c3378c6311c822b501a92c' },
  { name: 'codex/store-regions-metadata-docs', pr: 106, sha: 'fae23e9df4cb44efbe2ceb9be852ec679ffb0128' },
  { name: 'codex/searchable-country-flags', pr: 107, sha: 'f4be87e960f677306562062b738c9b50019e8bcb' },
  { name: 'codex/release-0.8.6', pr: 108, sha: 'ed981b8c023c10b16926f252c940e2e6c6247d8f' },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateRelease(expected, release, ref) {
  assert(RELEASES.some(item => JSON.stringify(item) === JSON.stringify(expected)), 'Unapproved release');
  if (ref) assert(ref.object?.type === 'commit' && ref.object.sha === expected.sha, `Tag moved: ${expected.tag}`);
  if (!release) return;
  assert(ref, `Release without expected tag: ${expected.tag}`);
  assert(release.id === expected.id && release.tag_name === expected.tag, 'Release identity changed');
  assert(release.prerelease === true && release.draft === false && !release.immutable, 'Not a removable test prerelease');
  assert(Array.isArray(release.assets) && release.assets.length > 0, 'Release has no backup assets');
  const names = new Set();
  for (const asset of release.assets) {
    assert(typeof asset.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset.name), 'Unsafe asset name');
    assert(asset.name !== 'release.json' && !names.has(asset.name), 'Reserved or duplicate asset name');
    names.add(asset.name);
    assert(Number.isSafeInteger(asset.size) && asset.size >= 0, 'Invalid asset size');
    assert(/^sha256:[0-9a-f]{64}$/.test(asset.digest ?? ''), 'Missing asset SHA-256');
  }
}

export function validateBranch(expected, ref, pr, headCommit, mergeCommit) {
  assert(BRANCHES.some(item => JSON.stringify(item) === JSON.stringify(expected)), 'Unapproved branch');
  assert(ref.object?.sha === expected.sha, `Branch moved: ${expected.name}`);
  assert(pr.merged === true && pr.state === 'closed' && pr.base?.ref === 'main', 'PR is not merged into main');
  assert(pr.base.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY, 'PR repository mismatch');
  assert(pr.head.ref === expected.name && pr.head.sha === expected.sha, 'PR no longer matches branch head');
  assert(headCommit.tree?.sha && headCommit.tree.sha === mergeCommit.tree?.sha, 'Branch tree differs from merged tree');
}

function run(command, args, timeout = 120_000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function api(path, { missing = false, method = 'GET' } = {}) {
  try {
    const text = run('gh', ['api', '--method', method, `repos/${REPOSITORY}/${path}`]);
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (missing && method === 'GET' && /\(HTTP 404\)/.test(error.message)) return null;
    throw error;
  }
}

function releaseSnapshot(release, ref) {
  return {
    ref: ref?.object?.sha ?? null,
    release: release ? { id: release.id, tag_name: release.tag_name,
      assets: release.assets.map(({ id, name, size, digest }) => ({ id, name, size, digest })).sort((a, b) => a.name.localeCompare(b.name)) } : null,
  };
}

function inspect() {
  const repo = JSON.parse(run('gh', ['api', `repos/${REPOSITORY}`]));
  assert(repo.full_name === REPOSITORY && repo.default_branch === 'main', 'Unexpected repository/default branch');
  // Establish that versioned releases are readable; an empty list is not proof of absence.
  api('releases/tags/v0.8.5');
  const origin = run('git', ['remote', 'get-url', 'origin']);
  assert([`https://github.com/${REPOSITORY}.git`, `https://github.com/${REPOSITORY}`, `git@github.com:${REPOSITORY}.git`].includes(origin), 'Unexpected git origin');
  run('git', ['fetch', 'origin', 'main']);
  const releases = RELEASES.map(expected => {
    const release = api(`releases/tags/${expected.tag}`, { missing: true });
    const ref = api(`git/ref/tags/${expected.tag}`, { missing: true });
    validateRelease(expected, release, ref);
    return { expected, release, snapshot: releaseSnapshot(release, ref) };
  });
  const branches = [];
  for (const expected of BRANCHES) {
    const ref = api(`git/ref/heads/${expected.name}`, { missing: true });
    if (!ref) continue;
    const pr = api(`pulls/${expected.pr}`);
    assert(pr.merge_commit_sha, `Missing merge commit for PR #${expected.pr}`);
    const head = api(`git/commits/${expected.sha}`);
    const merged = api(`git/commits/${pr.merge_commit_sha}`);
    validateBranch(expected, ref, pr, head, merged);
    run('git', ['merge-base', '--is-ancestor', pr.merge_commit_sha, 'origin/main']);
    branches.push({ ...expected, merge: pr.merge_commit_sha, tree: head.tree.sha });
  }
  return { repository: REPOSITORY, releases, branches };
}

function verifyAssets(entry, directory) {
  for (const asset of entry.release?.assets ?? []) {
    const bytes = readFileSync(join(directory, entry.expected.tag, asset.name));
    assert(bytes.length === asset.size, `Backup size mismatch: ${asset.name}`);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    assert(digest === asset.digest, `Backup checksum mismatch: ${asset.name}`);
  }
}

function deleteRef(kind, name, sha) {
  // The lease atomically prevents deleting a ref another contributor has moved.
  const ref = `refs/${kind}/${name}`;
  run('git', ['push', `--force-with-lease=${ref}:${sha}`, 'origin', `:${ref}`]);
  console.log(`Deleted ${ref}`);
}

export function main(args) {
  assert(args.length === 0 || (args.length === 2 && ['--prepare', '--apply'].includes(args[0])), 'Usage: node scripts/repository-maintenance.mjs [--prepare|--apply BACKUP_DIR]');
  const inventory = inspect();
  if (!args.length) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  const directory = resolve(args[1]);
  if (args[0] === '--prepare') {
    mkdirSync(directory, { recursive: true });
    for (const entry of inventory.releases) {
      if (!entry.release) continue;
      const target = join(directory, entry.expected.tag);
      mkdirSync(target, { recursive: true });
      run('gh', ['release', 'download', entry.expected.tag, '--repo', REPOSITORY, '--dir', target, '--clobber']);
      verifyAssets(entry, directory);
      writeFileSync(join(target, 'release.json'), `${JSON.stringify(entry.release, null, 2)}\n`);
    }
    writeFileSync(join(directory, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`Prepared and verified backup: ${directory}. No remote changes made.`);
    return;
  }
  const saved = JSON.parse(readFileSync(join(directory, 'inventory.json'), 'utf8'));
  assert(saved.repository === REPOSITORY, 'Backup repository mismatch');
  // Validate the entire plan before the first destructive operation.
  for (const entry of inventory.releases) {
    const previous = saved.releases.find(item => item.expected.tag === entry.expected.tag);
    assert(previous && JSON.stringify(previous.snapshot) === JSON.stringify(entry.snapshot), 'Release changed since backup; prepare a new backup');
    verifyAssets(entry, directory);
  }
  assert(JSON.stringify(saved.branches) === JSON.stringify(inventory.branches), 'Branches changed since backup; prepare a new backup');
  for (const entry of inventory.releases) {
    if (entry.release) {
      api(`releases/${entry.release.id}`, { method: 'DELETE' });
      console.log(`Deleted test release ${entry.expected.tag}`);
    }
    if (entry.snapshot.ref) deleteRef('tags', entry.expected.tag, entry.expected.sha);
  }
  for (const branch of inventory.branches) deleteRef('heads', branch.name, branch.sha);
  console.log('Cleanup completed. Versioned releases, preview and updater-manifests were not changed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
