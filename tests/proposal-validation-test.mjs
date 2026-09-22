import assert from 'node:assert/strict';
import { AccessGraph } from '../sdk/javascript/agp.js';
import { SpecsActionSession } from '../adapters/specs/index.js';
import { thingDescriptionToAgp } from '../adapters/wot/index.js';

const object = thingDescriptionToAgp({id:'urn:test:room',title:'Test room',actions:{configure:{
 input:{type:'object',required:['settings','steps'],properties:{
 settings:{type:'object',required:['level','mode'],properties:{level:{type:'number',minimum:0,maximum:10},mode:{type:'string',enum:['eco','normal']}}},
 steps:{type:'array',items:{type:'integer',minimum:1,maximum:5}}
 }}
}}});
const graph = new AccessGraph([object]);
const good = () => ({settings:{level:2,mode:'eco'},steps:[1,3]});
let calls = 0;
let clock = 0;
const session = new SpecsActionSession(graph, {}, async (_o,_a,p) => {calls++;return p;}, {proposalTtlMs:100,now:()=>clock});
const request = (parameters) => session.request(object.id,'configure',parameters);
for (const [change, pattern] of [
 [p=>p.settings.level=999,/settings.level/],
 [p=>p.settings.level=-1,/settings.level/],
 [p=>p.settings.mode='invalid',/settings.mode/],
 [p=>p.steps.push(6),/steps\[2\]/],
 [p=>p.steps[0]=1.5,/steps\[0\]/],
 [p=>delete p.settings.mode,/mode/],
 [p=>p.settings.extra='unvalidated',/unknown property/],
 [p=>p.extra='unvalidated',/Unknown parameter/],
 [p=>p.steps[0]=NaN,/steps\[0\]/]
]) {const value=good(); change(value); assert.throws(()=>request(value),pattern);}
assert.throws(()=>request([]),/must be an object/);
const original=good();
const proposal=request(original);
assert.match(proposal.message,/Test room/);
assert.match(proposal.message,/"level":2/);
original.settings.level=9;
assert.equal(session.pending.parameters.settings.level,2);
assert.throws(()=>{session.pending.parameters.settings.level=7;},TypeError);
session.confirm(true); session.provideAuthorization(true);
assert.deepEqual((await session.execute({steps:[1,3],settings:{mode:'eco',level:2}})).result,good());
assert.equal(calls,1);
await assert.rejects(()=>session.execute(),/No pending/);

// Expiry is checked on every advancing transition, with no sleeps.
for (const transition of ['confirm','provideAuthorization','execute']) {
 clock=0;request(good());
 if (transition==='execute') {session.confirm(true);session.provideAuthorization(true);}
 clock=100;
 if(transition==='execute') await assert.rejects(()=>session.execute(),{code:'PROPOSAL_EXPIRED'});
 else assert.throws(()=>session[transition](true),{code:'PROPOSAL_EXPIRED'});
 assert.equal(session.pending,null);
}
assert.equal(calls,1);
clock=0;request(good());clock=200;assert.equal(session.cancel().status,'cancelled');
clock=300;request(good());session.confirm(true);session.provideAuthorization(true);await session.execute();
assert.equal(calls,2);
assert.throws(()=>new SpecsActionSession(graph,{},null,{proposalTtlMs:0}),/TTL/);

// Secret fields can be explicitly suppressed in text and speech previews.
const secretGraph=new AccessGraph([{id:'secret',role:'device',label:'Device',actions:[{id:'set',risk:'medium',confirmation:true,parameters:{pin:{type:'string',required:true,sensitive:true}}}]}]);
const secret=new SpecsActionSession(secretGraph);
const prompt=secret.request('secret','set',{pin:'123456'}).message;
assert.ok(!prompt.includes('123456'));
assert.match(prompt,/hidden/);
console.log('Proposal validation test passed (nested constraints, preview, tamper resistance, expiry, redaction)');
