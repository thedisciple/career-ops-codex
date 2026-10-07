import test from 'node:test';
import assert from 'node:assert/strict';
import { priorContact } from '../scripts/prior-contact.mjs';
const card={company:'Example Robotics',url:'https://jobs.example.org/role/123'};
const rules={'Example Robotics':{names:['Example Robotics Group'],domains:['example.org']}};
test('prior company outreach warns without treating another role as a duplicate',()=>{
 const result=priorContact(card,[{thread_id:'t',messages:[{message_id:'m',sent:true,to:'hr@sub.example.org',text:'Open application https://jobs.example.org/role/456'}]}],rules);
 assert.equal(result.level,'company_contact');assert.equal(result.matches.length,1);
 assert.equal(priorContact(card,[{messages:[{sent:true,to:'hr@fakeexample.org',text:'Hello'}]}],rules).level,'no_match');
});
test('same posting dedups tracking parameters; quoted incoming messages alone cannot prove prior submission',()=>{
 assert.equal(priorContact(card,[{messages:[{message_id:'m',sent:true,to:'hr@other.org',text:'Applying to https://jobs.example.org/role/123?utm_source=mail'}]}]).level,'same_posting');
 assert.equal(priorContact(card,[{messages:[{sent:false,text:card.url}]}],rules).level,'no_match');
});
