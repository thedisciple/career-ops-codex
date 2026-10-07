import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft } from '../scripts/codex-drafts.mjs';
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
