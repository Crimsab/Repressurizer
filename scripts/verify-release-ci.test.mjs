import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCI, parseArguments, verifyCI } from './verify-release-ci.mjs';
const repository = 'Crimsab/Repressurizer';
const sha = 'a'.repeat(40);
const green = (patch = {}) => ({ id: 10, head_sha: sha, head_branch: 'main', head_repository: { full_name: repository }, event: 'push', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', ...patch });
const evaluate = runs => evaluateCI(runs, repository, sha);
test('accept successful main push CI', () => assert.equal(evaluate([green()]).state, 'passed'));
test('accept successful manual CI', () => assert.equal(evaluate([green({event:'workflow_dispatch'})]).state, 'passed'));
test('accept API path with ref suffix', () => assert.equal(evaluate([green({path:'.github/workflows/ci.yml@refs/heads/main'})]).state, 'passed'));
for (const [name, patch] of [
  ['pull-request run',{event:'pull_request'}], ['fork main run',{head_repository:{full_name:'fork/Repressurizer'}}],
  ['different SHA',{head_sha:'b'.repeat(40)}], ['different branch',{head_branch:'feature'}],
  ['other workflow',{path:'.github/workflows/docs.yml'}], ['missing repository',{head_repository:null}],
]) test(`exclude ${name}`,()=>assert.equal(evaluate([green(patch)]).state,'missing'));
for (const conclusion of ['failure','cancelled','skipped','timed_out','action_required',null]) {
  test(`block ${conclusion}`,()=>assert.equal(evaluate([green({conclusion})]).state,'failed'));
}
test('newer failed run supersedes old success',()=>assert.equal(evaluate([green(),green({id:11,conclusion:'failure'})]).state,'failed'));
test('newer running validation supersedes old success',()=>assert.equal(evaluate([green(),green({id:11,status:'in_progress',conclusion:null})]).state,'running'));
test('newer success supersedes failure',()=>assert.equal(evaluate([green({conclusion:'failure'}),green({id:11})]).state,'passed'));
test('valid CLI with default fail-fast timeout',()=>assert.deepEqual(parseArguments(['--repo',repository,'--sha',sha]),{repository,sha,timeoutSeconds:0}));
for (const args of [[],['--repo','../bad','--sha',sha],['--repo',repository,'--sha','main'],['--repo',repository,'--sha',sha,'--timeout-seconds','1201'],['--repo',repository,'--sha',sha,'--repo',repository]]) {
  test(`reject invalid arguments ${JSON.stringify(args)}`,()=>assert.throws(()=>parseArguments(args)));
}
test('fail fast when missing',async()=>assert.rejects(verifyCI({repository,sha,timeoutSeconds:0},()=>[]),/No trusted/));
test('never suppress API errors',async()=>assert.rejects(verifyCI({repository,sha,timeoutSeconds:10},()=>{throw new Error('HTTP 403');}),/403/));
test('wait for the exact CI to complete',async()=>{
  let clock=0,calls=0;
  const result=await verifyCI({repository,sha,timeoutSeconds:30},()=>++calls===1?[green({status:'queued'})]:[green()],async ms=>{clock+=ms;},()=>clock);
  assert.equal(result.state,'passed');assert.equal(calls,2);
});
test('stop at timeout without real sleeps',async()=>{
  let clock=0;
  await assert.rejects(verifyCI({repository,sha,timeoutSeconds:1},()=>[],async ms=>{clock+=ms;},()=>clock),/No trusted/);
  assert.equal(clock,1000);
});
