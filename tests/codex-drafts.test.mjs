import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, draftFingerprint, isDraftCurrent } from '../scripts/codex-drafts.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const source = { lang: 'en', candidate: { name: 'Example Candidate' }, experience: [
  { company: 'Example Lab', role: 'Robot Operator', dates: '2024 - Present', bullets: ['Tested robots'] },
  { company: 'Example School', role: 'Instructor', dates: '2021 - 2022', bullets: ['Taught Python'] },
], education: [{ title: 'Electromechanical Engineering' }], skills: [{ items: ['ROS2 familiarity'] }] };
const result = () => ({ summary: 'Robot testing and education', competencies: ['Robot testing'], cover_letter: 'A sourced review draft.', questions: [],
  experience_bullets: [{ index: 1, bullets: ['Taught programming'] }, { index: 0, bullets: ['Reproduced robot failures'] }] });
test('host preserves identity, employment titles/dates/order, education and skill qualifiers', () => {
  const before = structuredClone(source), draft = buildDraft(source, result());
  assert.deepEqual(source, before); assert.deepEqual(draft.candidate, source.candidate);
  assert.deepEqual(draft.education, source.education); assert.deepEqual(draft.skills, source.skills);
  draft.experience.forEach((entry, index) => { for (const key of ['company', 'role', 'dates']) assert.equal(entry[key], source.experience[index][key]); });
  assert.equal(draft.experience[0].bullets[0], 'Reproduced robot failures');
});
test('missing, duplicate, out-of-range and fabricated metadata mappings fail closed', () => {
  assert.throws(() => buildDraft(source, { ...result(), experience_bullets: [{ index: 0, bullets: ['a'] }] }));
  assert.throws(() => buildDraft(source, { ...result(), experience_bullets: [{ index: 0, bullets: ['a'] }, { index: 0, bullets: ['b'] }] }));
  assert.throws(() => buildDraft(source, { ...result(), experience_bullets: [{ index: 0, bullets: ['a'] }, { index: 2, bullets: ['b'] }] }));
  assert.throws(() => buildDraft(source, { ...result(), candidate: { name: 'Invented' } }));
});

test('ready packages expire when evidence, fact policy or an output changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'draft-freshness-')), id = 'a'.repeat(20);
  try {
    const config = join(root, 'config'), queue = join(root, 'data', 'codex-queue'), dir = join(root, 'output', 'drafts', id);
    for (const path of [config, queue, dir]) mkdirSync(path, { recursive: true });
    const input = { source, cv: 'Canonical CV', jd: 'Real robotics job description. '.repeat(10), card: { decision: 'prepare' }, facts: '{}' };
    writeFileSync(join(config, 'cv-source.json'), JSON.stringify(source));
    writeFileSync(join(config, 'cv-facts.json'), input.facts);
    writeFileSync(join(root, 'cv.md'), input.cv);
    writeFileSync(join(queue, id+'.jd.txt'), input.jd);
    writeFileSync(join(queue, id+'.result.json'), JSON.stringify(input.card));
    writeFileSync(join(dir, 'ready.json'), JSON.stringify({ fingerprint: draftFingerprint(input) }));
    for (const path of ['cv.pdf', 'cv.html', 'cover-letter.md', 'review.md']) writeFileSync(join(dir, path), 'fixture');
    assert.equal(isDraftCurrent(root, id), true);
    writeFileSync(join(config, 'cv-facts.json'), '{"forbidden":["expert"]}');
    assert.equal(isDraftCurrent(root, id), false);
    writeFileSync(join(config, 'cv-facts.json'), input.facts);
    writeFileSync(join(root, 'cv.md'), 'Updated CV');
    assert.equal(isDraftCurrent(root, id), false);
    writeFileSync(join(root, 'cv.md'), input.cv);
    rmSync(join(dir, 'cv.pdf'));
    assert.equal(isDraftCurrent(root, id), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
