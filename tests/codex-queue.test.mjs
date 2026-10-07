import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runQueue, readJobs, validateResult, validateJd, parseArgs, runProcess } from '../scripts/codex-queue.mjs';

const card = () => ({ company: 'Example', role: 'Robot test engineer', decision: 'prepare', fit: 4, interest: 5,
  employment: 'Work authorization must be verified', rationale: 'Relevant testing experience', evidence: ['CV lists robot testing'], questions: [] });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-queue-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'config')); writeFileSync(join(root, 'cv.md'), 'Example candidate: robot testing');
  writeFileSync(join(root, 'config', 'profile.yml'), 'language:\n  output: en\n');
  const input = join(root, 'jobs.jsonl');
  writeFileSync(input, [1, 2, 3].map(id => JSON.stringify({ url: `https://example.com/jobs/${id}`, jd: 'Example robotics job description with testing and calibration requirements. '.repeat(3) })).join('\n'));
  return { root, input };
}

test('bounded queue resumes without repeating completed jobs or writing tracker', async t => {
  const options = fixture(t); let calls = 0;
  const deps = { worker: async () => { calls++; return card(); } };
  assert.equal(Object.keys((await runQueue({ ...options, limit: 2 }, deps)).jobs).length, 2);
  await runQueue(options, deps); await runQueue(options, deps);
  assert.equal(calls, 3); assert.equal(existsSync(join(options.root, 'data', 'applications.md')), false);
  const state = await runQueue({ ...options, status: true });
  for (const [id, job] of Object.entries(state.jobs)) {
    assert.match(job.cvSha256, /^[a-f0-9]{64}$/); assert.match(job.jdSha256, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(join(options.root, 'data', 'codex-queue', `${id}.jd.txt`)), true);
  }
});
test('dry-run and status neither call worker nor create data files', async t => {
  const options = fixture(t); const deps = { worker: () => { throw new Error('Must not run'); } };
  assert.equal((await runQueue({ ...options, dryRun: true, limit: 100 }, deps)).pending.length, 3);
  assert.deepEqual((await runQueue({ ...options, status: true }, deps)).jobs, {});
  assert.equal(existsSync(join(options.root, 'data')), false);
});
test('invalid model output fails closed and failed jobs need explicit retry', async t => {
  const options = fixture(t);
  let state = await runQueue({ ...options, limit: 1 }, { worker: async () => ({ ...card(), fit: 9 }) });
  const id = Object.keys(state.jobs)[0]; assert.equal(state.jobs[id].status, 'failed');
  state = await runQueue({ ...options, limit: 1 }, { worker: async () => card() });
  assert.equal(state.jobs[id].attempts, 1);
  state = await runQueue({ ...options, limit: 1, retryFailed: true }, { worker: async () => card() });
  assert.equal(state.jobs[id].status, 'prepared'); assert.equal(state.jobs[id].attempts, 2);
});
test('confirmation cards stay held even when retrying failures', async t => {
  const options = fixture(t); let calls = 0;
  const worker = async () => { calls++; return { ...card(), decision: 'needs_confirmation', questions: ['Can the employer hire in the candidate country?'] }; };
  await runQueue(options, { worker }); await runQueue({ ...options, retryFailed: true }, { worker });
  assert.equal(calls, 3);
});
test('stale processing state resumes but another queue lock prevents concurrent writes', async t => {
  const options = fixture(t), dir = join(options.root, 'data', 'codex-queue'); mkdirSync(dir, { recursive: true });
  const id = readJobs(options.input)[0].id;
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ version: 1, jobs: { [id]: { status: 'processing', attempts: 1 } } }));
  writeFileSync(join(dir, 'run.lock'), '123');
  await assert.rejects(runQueue(options, { worker: async () => card() }), /Queue locked/);
  rmSync(join(dir, 'run.lock'));
  assert.equal((await runQueue({ ...options, limit: 1 }, { worker: async () => card() })).jobs[id].attempts, 2);
});
test('posting dedup preserves functional parameters and rejects credential URLs', t => {
  const options = fixture(t);
  writeFileSync(options.input, ['https://example.com/jobs/1', 'https://example.com/jobs/1?utm_source=x', 'https://example.com/jobs/1?gh_jid=2'].map(url => JSON.stringify({ url })).join('\n'));
  assert.equal(readJobs(options.input).length, 2);
  writeFileSync(options.input, JSON.stringify({ url: 'https://user:secret@example.com/jobs/1' }));
  assert.throws(() => readJobs(options.input), /credential-free/);
  for (const value of ['0', '-1', 'Infinity', '1.5', '999999999999999999']) assert.throws(() => parseArgs(['--limit', value]));
  assert.throws(() => parseArgs(['--input'])); assert.throws(() => validateResult({ ...card(), extra: true }));
});
test('hung subprocess is terminated at timeout', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }), /timeout/);
});
test('a lengthy access-denied page fails instead of becoming model evidence', () => {
  assert.throws(() => validateJd('Access Denied\nYou do not have permission to access this website. '.repeat(4)), /Blocked page/);
  assert.throws(() => validateJd('short'), /substantial/);
});
