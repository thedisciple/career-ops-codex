#!/usr/bin/env node
// The host owns authorization and connector calls. No credentials are stored here.
import {readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs';
import {join, resolve, relative, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {writeFileAtomic, normalizeCompany} from '../tracker-utils.mjs';
import {normalizeUrl} from '../url-key.mjs';
import {getCareerOpsRoot} from '../path-resolver.mjs';
import {isMainModule} from '../lib/is-main-module.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const email=value=>typeof value==='string' && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
function local(root,path){const full=resolve(root,path),rel=relative(resolve(root),full);if(rel==='..'||rel.startsWith('..'+sep))throw Error('Attachment outside private root');return full;}
function secureUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid source URL');return u.href;}
function load(root,id){if(!/^[a-f0-9]{20}$/.test(id))throw Error('Invalid outbox id');const dir=join(root,'data','application-outbox',id);return {dir,plan:JSON.parse(readFileSync(join(dir,'plan.json'),'utf8'))};}
export function outboxKey(plan){return hash(plan.kind==='open_application'?`open:${normalizeCompany(plan.company)}`:`job:${normalizeUrl(plan.url)}`).slice(0,20);}
export function prepareEmail(root,plan){
  if(!['open_application','job_application'].includes(plan.kind)||!plan.company?.trim()||!plan.role?.trim()||!email(plan.to)||/[\r\n]/.test(plan.subject||'')||!plan.subject?.trim()||!plan.html?.trim())throw Error('Invalid email plan');
  secureUrl(plan.url);secureUrl(plan.route.source_url);
  if(plan.route.email!==plan.to||!plan.route.accepts_applications||!plan.route.evidence?.trim())throw Error('Application route is not verified');
  if(!plan.review?.facts_checked||!plan.review?.pdf_visual_checked||!plan.review?.blacklist_checked||!plan.history?.searched_all_sent||plan.history.matches!==0)throw Error('Review/history gate not satisfied');
  const pdf=readFileSync(local(root,plan.pdf));if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid CV attachment');
  const id=outboxKey(plan),dir=join(root,'data','application-outbox',id);mkdirSync(dir,{recursive:true});
  const stored={...plan,id,pdf_hash:hash(pdf),created_at:new Date().toISOString()};
  // Never overwrite a dispatch claim, including a send whose outcome is unknown.
  if(existsSync(join(dir,'dispatch.json')))throw Error('Already dispatched or outcome unknown');
  writeFileAtomic(join(dir,'plan.json'),JSON.stringify(stored,null,2),{mode:0o600});return {id,status:'ready'};
}
export function claimEmail(root,id,authorization,now=Date.now()){
  if(authorization?.automatic_send!==true||!authorization?.user_instruction?.trim())throw Error('Explicit user send authorization required');
  if(authorization.target!==undefined){
    if(!Number.isInteger(authorization.target)||authorization.target<1)throw Error('Invalid authorized batch size');
    const attempts=outboxSummary(root).rows.filter(r=>r.authorization?.authorized_at===authorization.authorized_at&&r.state!=='ready').length;
    if(attempts>=authorization.target)throw Error('Authorized batch limit reached');
  }
  const {dir,plan}=load(root,id);
  for(const value of [plan.route.checked_at,plan.history.checked_at]){const age=now-Date.parse(value);if(!Number.isFinite(age)||age< -60000||age>86400000)throw Error('Source or history evidence expired');}
  const pdf=readFileSync(local(root,plan.pdf));if(hash(pdf)!==plan.pdf_hash)throw Error('CV changed after review');
  const prior=join(root,'data','mail-history-threads.json');if(!existsSync(prior))throw Error('Local mail history unavailable');
  const history=JSON.parse(readFileSync(prior,'utf8'));
  const recipientDomain=plan.to.split('@')[1].toLowerCase();
  const duplicate=(history.threads||[]).some(t=>(t.messages||[]).some(m=>m.sent&&(plan.kind==='open_application'?(m.to||'').toLowerCase().includes('@'+recipientDomain):(m.text||'').includes(plan.url))));
  if(duplicate)throw Error('Prior contact found; hold for reconciliation');
  const claim={id,state:'dispatching',started_at:new Date(now).toISOString(),authorization,pdf_hash:plan.pdf_hash,to:plan.to,subject:plan.subject};
  // O_EXCL gives a durable at-most-once attempt across concurrent/restarted hosts.
  writeFileSync(join(dir,'dispatch.json'),JSON.stringify(claim,null,2),{flag:'wx',mode:0o600});
  return {to:plan.to,subject:plan.subject,payload:{mime_type:'multipart/mixed',parts:[{mime_type:'text/html',charset:'UTF-8',body:{content:plan.html}},{mime_type:'application/pdf',filename:'Candidate_CV.pdf',content_disposition:'attachment',body:{base64_url_content:pdf.toString('base64url')}}]},response_fields:['id','thread_id','label_ids']};
}
export function recordReceipt(root,id,receipt){
  const {dir}=load(root,id),path=join(dir,'dispatch.json'),claim=JSON.parse(readFileSync(path,'utf8'));
  if(!receipt?.id||typeof receipt.id!=='string'||!Array.isArray(receipt.label_ids)||!receipt.label_ids.includes('SENT'))throw Error('Gmail SENT receipt required; outcome remains unknown');
  if(claim.state==='sent'){if(claim.receipt.id!==receipt.id)throw Error('Conflicting receipt');return claim;}
  const result={...claim,state:'sent',sent_at:new Date().toISOString(),receipt:{id:receipt.id,thread_id:receipt.thread_id,label_ids:receipt.label_ids},delivery:'unconfirmed'};
  writeFileAtomic(path,JSON.stringify(result,null,2),{mode:0o600});return result;
}
export function recordDeliveryFailure(root,id,evidence){
  const {dir,plan}=load(root,id),path=join(dir,'dispatch.json'),status=JSON.parse(readFileSync(path,'utf8'));
  if(status.state!=='sent'||evidence?.recipient?.toLowerCase()!==plan.to.toLowerCase()||!evidence.message_id||!evidence.reason)throw Error('Matching confirmed send and delivery failure evidence required');
  writeFileAtomic(path,JSON.stringify({...status,delivery:'failed',delivery_failure:evidence},null,2),{mode:0o600});
}
export function outboxSummary(root){const base=join(root,'data','application-outbox'),rows=[];if(existsSync(base))for(const id of readdirSync(base)){if(!/^[a-f0-9]{20}$/.test(id))continue;const {dir,plan}=load(root,id);const status=existsSync(join(dir,'dispatch.json'))?JSON.parse(readFileSync(join(dir,'dispatch.json'),'utf8')):{state:'ready'};rows.push({id,company:plan.company,role:plan.role,kind:plan.kind,...status});}return {sent:rows.filter(r=>r.state==='sent').length,failed_delivery:rows.filter(r=>r.delivery==='failed').length,ready:rows.filter(r=>r.state==='ready').length,unknown:rows.filter(r=>r.state==='dispatching').length,rows};}
export async function dispatchBatch({root,authorization,transport,limit=100,onReceipt=()=>{}}){
  if(!Number.isInteger(limit)||limit<1||limit>10000||typeof transport!=='function')throw Error('Invalid dispatch options');
  const results=[];
  for(const row of outboxSummary(root).rows.filter(r=>r.state==='ready').slice(0,limit)){
    let payload;
    try{payload=claimEmail(root,row.id,authorization);}catch(error){results.push({id:row.id,state:'held',reason:error.message});continue;}
    try{
      const response=await transport(payload),receipt=response?.structuredContent||response;
      const sent=recordReceipt(root,row.id,receipt);results.push({id:row.id,state:'sent',receipt:sent.receipt});
      // Accounting failure cannot undo the send or cause a repeat attempt.
      try{await onReceipt(sent);}catch(error){results.at(-1).accounting_error=error.message;}
    }catch(error){results.push({id:row.id,state:'unknown',reason:error.message});break;}
  }
  return results;
}
if(isMainModule(import.meta.url)){try{const root=getCareerOpsRoot(),[command,arg,extra]=process.argv.slice(2);let result;if(command==='prepare')result=prepareEmail(root,JSON.parse(readFileSync(arg,'utf8')));else if(command==='claim')result=claimEmail(root,arg,JSON.parse(readFileSync(extra,'utf8')));else if(command==='receipt')result=recordReceipt(root,arg,JSON.parse(readFileSync(extra,'utf8')));else if(command==='summary')result=outboxSummary(root);else throw Error('Usage: prepare PLAN | claim ID AUTHORIZATION | receipt ID RECEIPT | summary');console.log(JSON.stringify(result));}catch(error){console.error(error.message);process.exitCode=1;}}
