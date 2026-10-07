#!/usr/bin/env node
// Import only confirmed sends through the existing locked TSV merger.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {outboxSummary} from './application-outbox.mjs';
import {getCareerOpsRoot} from '../path-resolver.mjs';
import {reserveReportNumbers,releaseReportNumbers} from '../reserve-report-num.mjs';
import {writeFileAtomic} from '../tracker-utils.mjs';
const root=getCareerOpsRoot(),code=dirname(dirname(fileURLToPath(import.meta.url)));
const clean=s=>String(s).replace(/[\t\r\n|]/g,' ');
const additions=join(root,'batch','tracker-additions');mkdirSync(additions,{recursive:true});
const tracker=join(root,'data','applications.md');
for(const row of outboxSummary(root).rows.filter(r=>r.state==='sent')){
  const text=readFileSync(tracker,'utf8');if(text.includes('outbox:'+row.id))continue;
  const dir=join(root,'data','application-outbox',row.id),reservation=join(dir,'tracker-reservation.json');
  let nums=null,num;
  if(existsSync(reservation))num=JSON.parse(readFileSync(reservation,'utf8')).num;
  else{nums=await reserveReportNumbers(1,{rootDir:root});num=nums[0];writeFileAtomic(reservation,JSON.stringify({num}),{mode:0o600});}
  const plan=JSON.parse(readFileSync(join(dir,'plan.json'),'utf8'));
  const notes=`outbox:${row.id}; ${row.kind}; Gmail SENT ${row.receipt.id}; delivery unconfirmed; Via: direct email; ${plan.url}`;
  const columns=['num','date','company','role','score','status','pdf','report','notes'];
  const values=[num,row.sent_at.slice(0,10),row.company,row.role,'N/A','Applied','✅','—',notes];
  writeFileSync(join(additions,'outbox-'+row.id+'.tsv'),columns.join('\t')+'\n'+values.map(clean).join('\t')+'\n',{mode:0o600});
  try{execFileSync(process.execPath,[join(code,'merge-tracker.mjs')],{cwd:code,env:{...process.env,CAREER_OPS_ROOT:root},stdio:'pipe'});
    if(!readFileSync(tracker,'utf8').includes('outbox:'+row.id))throw Error('Tracker merge did not import confirmed receipt');
    if(nums)await releaseReportNumbers(nums,{rootDir:root});
  }catch(error){console.error('Confirmed send needs tracker reconciliation:',row.id,error.message);process.exitCode=1;break;}
}
console.log(JSON.stringify({sent:outboxSummary(root).sent,tracker:tracker}));
