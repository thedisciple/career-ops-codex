#!/usr/bin/env node
// Contact evidence is a duplicate warning, never proof of application delivery.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeUrl } from '../url-key.mjs';
import { normalizeCompany } from '../tracker-utils.mjs';
import { getCareerOpsRoot } from '../path-resolver.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';

export function priorContact(card, threads, aliases = {}) {
  const key=normalizeCompany(card.company), rule=Object.entries(aliases).find(([name,r])=>normalizeCompany(name)===key || (r.names||[]).some(n=>normalizeCompany(n)===key))?.[1];
  const matches=[];
  for(const thread of threads){
    for(const message of thread.messages||[]){
      if(!message.sent)continue;
      const urls=(message.text||'').match(/https?:\/\/[^\s<>"')]+/g)||[];
      const exact=urls.some(url=>{try{return normalizeUrl(url.replace(/[.,;]+$/,''))===normalizeUrl(card.url)}catch{return false}});
      const addresses=(message.to||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9.-]+)/g)||[];
      const company=(rule?.domains||[]).some(domain=>addresses.some(address=>{const host=address.split('@').at(-1);return host===domain || host.endsWith('.'+domain)}));
      if(exact||company)matches.push({message_id:message.message_id,thread_id:thread.thread_id,date:message.date,subject:message.subject,match:exact?'same_posting':'company_contact'});
    }
  }
  return {level:matches.some(m=>m.match==='same_posting')?'same_posting':matches.length?'company_contact':'no_match',matches:[...new Map(matches.map(m=>[m.message_id,m])).values()]};
}
export function checkPriorContact(root,id){
  if(!/^[a-f0-9]{20}$/.test(id||''))throw new Error('Invalid card id');
  const evidence=join(root,'data','mail-history-threads.json'),rules=join(root,'config','company-contact-aliases.json');
  if(!existsSync(evidence))return {level:'history_missing',matches:[]};
  const card=JSON.parse(readFileSync(join(root,'data','codex-queue',id+'.result.json'),'utf8'));
  return priorContact(card,JSON.parse(readFileSync(evidence,'utf8')).threads,existsSync(rules)?JSON.parse(readFileSync(rules,'utf8')):{});
}
if(isMainModule(import.meta.url)){
  try{const result=checkPriorContact(getCareerOpsRoot(),process.argv[2]);console.log(JSON.stringify(result));process.exitCode=result.level==='same_posting'?2:0;}
  catch(error){console.error(error.message);process.exitCode=1;}
}
