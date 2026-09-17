import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPOSITORY, RELEASES, BRANCHES, validateRelease, validateBranch, main } from './repository-maintenance.mjs';
const expected = RELEASES[0];
const ref = () => ({ object: { type: 'commit', sha: expected.sha } });
const release = () => ({ id: expected.id, tag_name: expected.tag, prerelease: true, draft: false,
  assets: [{ id: 1, name: 'test.exe', size: 1, digest: `sha256:${'a'.repeat(64)}` }] });
test('approved prerelease with exact ref is accepted', () => assert.doesNotThrow(() => validateRelease(expected, release(), ref())));
test('already absent release and tag is an idempotent no-op', () => assert.doesNotThrow(() => validateRelease(expected, null, null)));
test('orphan approved test tag is accepted', () => assert.doesNotThrow(() => validateRelease(expected, null, ref())));
for (const [name, patch] of Object.entries({stable:{prerelease:false},draft:{draft:true},immutable:{immutable:true},identity:{id:0},tag:{tag_name:'v0.8.5'},empty:{assets:[]}})) {
  test(`reject ${name} release`, () => assert.throws(() => validateRelease(expected, { ...release(), ...patch }, ref())));
}
test('reject moved tag', () => assert.throws(() => validateRelease(expected, release(), {object:{type:'commit',sha:'b'.repeat(40)}})));
test('reject unapproved tag even with matching release data', () => assert.throws(() => validateRelease({...expected,tag:'preview'}, release(), ref())));
for (const name of ['../escape', '/tmp/escape', 'release.json']) {
  test(`reject asset name ${name}`, () => { const r=release(); r.assets[0].name=name; assert.throws(() => validateRelease(expected,r,ref())); });
}
test('reject missing digest', () => { const r=release(); delete r.assets[0].digest; assert.throws(() => validateRelease(expected,r,ref())); });
function branchFixture() {
  const b=BRANCHES[0];
  return [b,{object:{sha:b.sha}},{merged:true,state:'closed',base:{ref:'main',repo:{full_name:REPOSITORY}},head:{ref:b.name,sha:b.sha,repo:{full_name:REPOSITORY}}},{tree:{sha:'a'.repeat(40)}},{tree:{sha:'a'.repeat(40)}}];
}
test('exact squashed tree match is accepted', () => assert.doesNotThrow(() => validateBranch(...branchFixture())));
for (const [name, mutate] of [
  ['new branch commits', f=>f[1].object.sha='b'.repeat(40)],
  ['closed without merge', f=>f[2].merged=false],
  ['different destination', f=>f[2].base.ref='other'],
  ['different source repository', f=>f[2].head.repo.full_name='attacker/repo'],
  ['different merged tree', f=>f[4].tree.sha='b'.repeat(40)],
]) test(`reject ${name}`, () => {const f=branchFixture();mutate(f);assert.throws(()=>validateBranch(...f));});
test('bad CLI arguments fail before calling external programs', () => assert.throws(() => main(['--force']), /Usage/));
