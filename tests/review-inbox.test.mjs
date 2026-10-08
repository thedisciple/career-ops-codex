import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReview, safeWebUrl } from '../scripts/review-inbox.mjs';

test('review links point to actual documents and model text cannot become active HTML', () => {
  const root=mkdtempSync(join(tmpdir(),'review-links-')), id='b'.repeat(20);
  try {
    const dir=join(root,'output','drafts',id);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'cv.pdf'),'fixture');writeFileSync(join(dir,'cover-letter.md'),'letter');
    const result=renderReview({root,cards:[{queue_id:id,company:'<script>steal()</script>',role:'Engineer',fit:3,interest:4,decision:'needs_confirmation',url:'javascript:alert(1)',rationale:'<img src=x onerror=alert(1)>',employment:'Unknown',questions:[]}]});
    assert.match(result.markdown,/\[Резюме PDF\]/);assert.match(result.markdown,/\[Сопроводительное письмо\]/);
    assert.match(result.markdown,/требуют обновления/);assert.doesNotMatch(result.html,/<script>|<img |javascript:/);
    assert.match(result.html,/&lt;script&gt;/);assert.equal(result.readyCount,0);
    assert.throws(()=>renderReview({root,cards:[{queue_id:'../config'}]}),/Invalid queue id/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('only credential-free HTTPS destinations are linked',()=>{
  assert.equal(safeWebUrl('https://user:secret@example.com/jobs'),null);
  assert.equal(safeWebUrl('file:///secret'),null);
  assert.equal(safeWebUrl('https://example.com/jobs'),'https://example.com/jobs');
});
test('sent applications link their original posting or careers source without active unsafe URLs',()=>{
  const rows=[
    {state:'sent',company:'Example',role:'Engineer',kind:'job_application',url:'https://example.org/jobs/123?lang=en&ref=cv',receipt:{id:'m1'}},
    {state:'sent',company:'Other',role:'Open application',kind:'open_application',url:'https://other.example/careers',receipt:{id:'m2'}},
    {state:'sent',company:'Unsafe',role:'Engineer',kind:'job_application',url:'javascript:alert(1)',receipt:{id:'m3'}},
  ];
  const result=renderReview({root:tmpdir(),cards:[],deliveries:{sent:3,ready:0,unknown:0,rows}});
  assert.match(result.markdown,/\[Вакансия\]\(<https:\/\/example.org\/jobs\/123\?lang=en&ref=cv>\)/);
  assert.match(result.html,/href="https:\/\/example.org\/jobs\/123\?lang=en&amp;ref=cv"/);
  assert.match(result.markdown,/\[Карьера \/ открытая заявка\]/);
  assert.match(result.html,/Источник не указан/);assert.doesNotMatch(result.html,/javascript:/);
});
