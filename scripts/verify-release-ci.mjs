import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Only a main-branch CI run from this repository can authorize publication. */
export function evaluateCI(runs, repository, sha) {
  if (!Array.isArray(runs)) throw new Error('Expected a workflow run array');
  const candidates = runs.filter(run =>
    run.head_sha === sha &&
    run.head_branch === 'main' &&
    run.head_repository?.full_name === repository &&
    ['push', 'workflow_dispatch'].includes(run.event) &&
    run.path?.split('@')[0] === '.github/workflows/ci.yml'
  );
  // A newer failed or in-progress validation supersedes an older green run.
  candidates.sort((a, b) => Number(b.id) - Number(a.id));
  const run = candidates[0];
  if (!run) return { state: 'missing', message: `No trusted main CI run for ${sha}` };
  if (run.status !== 'completed') return { state: 'running', run: run.id, message: `CI run ${run.id} is ${run.status}` };
  if (run.conclusion === 'success') return { state: 'passed', run: run.id, message: `Trusted main CI run ${run.id} passed for ${sha}` };
  return { state: 'failed', run: run.id, message: `CI run ${run.id} concluded ${run.conclusion}; publication is blocked` };
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--repo', '--sha', '--timeout-seconds'].includes(key) || !args[index + 1] || key in values) {
      throw new Error('Usage: node scripts/verify-release-ci.mjs --repo OWNER/REPO --sha SHA [--timeout-seconds 1200]');
    }
    values[key] = args[index + 1];
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(values['--repo'] ?? '')) throw new Error('Invalid repository');
  if (!/^[a-f0-9]{40}$/.test(values['--sha'] ?? '')) throw new Error('An exact 40-character commit SHA is required');
  const timeout = values['--timeout-seconds'] ?? '0';
  if (!/^\d+$/.test(timeout) || Number(timeout) > 1200) throw new Error('Timeout must be between 0 and 1200 seconds');
  return { repository: values['--repo'], sha: values['--sha'], timeoutSeconds: Number(timeout) };
}

export async function verifyCI({ repository, sha, timeoutSeconds }, readRuns, pause = sleep, now = Date.now) {
  const deadline = now() + timeoutSeconds * 1000;
  while (true) {
    const result = evaluateCI(await readRuns(), repository, sha);
    if (result.state === 'passed') return result;
    if (result.state === 'failed' || now() >= deadline) throw new Error(result.message);
    await pause(Math.min(15_000, deadline - now()));
  }
}

function readWorkflowRuns(repository, sha) {
  const endpoint = `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&per_page=100`;
  const result = spawnSync('gh', ['api', '--paginate', '--slurp', endpoint], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Cannot read CI status: ${result.stderr.trim()}. Check Actions access; this is not proof of an account suspension.`);
  }
  const pages = JSON.parse(result.stdout);
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page.workflow_runs))) {
    throw new Error('Invalid workflow API response');
  }
  return pages.flatMap(page => page.workflow_runs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await verifyCI(options, () => readWorkflowRuns(options.repository, options.sha));
    console.log(result.message);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
