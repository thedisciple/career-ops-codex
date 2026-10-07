import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareEmail,claimEmail,recordReceipt} from '../scripts/application-outbox.mjs';

test('canonical tracker sync is idempotent and excludes ready or ambiguous sends',()=>{
 const root=mkdtempSync(join(tmpdir(),'outbox-tracker-'));
 try{
  mkdirSync(join(root,'data'));writeFileSync(join(root,'cv.pdf'),'%PDF-fixture');
  writeFileSync(join(root,'data','mail-history-threads.json'),'{"threads":[]}');
  const tracker=join(root,'data','applications.md');
  writeFileSync(tracker,'# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
  const checked_at=new Date().toISOString();
  const ids=['Confirmed','Ready','Unknown'].map(company=>prepareEmail(root,{company,role:'Engineer',kind:'open_application',url:'https://'+company.toLowerCase()+'.example/careers',to:'jobs@'+company.toLowerCase()+'.example',subject:'Application',html:'<p>Source-backed</p>',pdf:'cv.pdf',route:{source_url:'https://'+company.toLowerCase()+'.example/careers',email:'jobs@'+company.toLowerCase()+'.example',accepts_applications:true,evidence:'Applications welcome',checked_at},history:{searched_all_sent:true,matches:0,checked_at},review:{facts_checked:true,pdf_visual_checked:true,blacklist_checked:true}}).id);
  const authorization={automatic_send:true,user_instruction:'Send fixture applications'};
  claimEmail(root,ids[0],authorization);recordReceipt(root,ids[0],{id:'gmail-fixture',label_ids:['SENT']});
  claimEmail(root,ids[2],authorization);
  const script=fileURLToPath(new URL('../scripts/sync-outbox-tracker.mjs',import.meta.url));
  const env={...process.env,CAREER_OPS_ROOT:root,CAREER_OPS_DATA_DIR:root,CAREER_OPS_TRACKER:tracker,CAREER_OPS_ADDITIONS:join(root,'batch','tracker-additions')};
  execFileSync(process.execPath,[script],{env,stdio:'pipe'});
  const before=readFileSync(tracker,'utf8');assert.match(before,/Confirmed/);assert.match(before,/Applied/);assert.match(before,/Gmail SENT gmail-fixture/);assert.doesNotMatch(before,/Ready|Unknown/);
  execFileSync(process.execPath,[script],{env,stdio:'pipe'});
  assert.equal(readFileSync(tracker,'utf8'),before);assert.equal(before.split('outbox:'+ids[0]).length-1,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
