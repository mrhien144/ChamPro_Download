import assert from 'node:assert/strict';
import {SyncTransport} from '../sync/client.mjs';
// Offline-first two-device simulation. No production D1/R2, no student PII.
globalThis.navigator={onLine:true};
const cloud=new Map(),events=[],owner='wp:8';
globalThis.fetch=async (url,init)=>{
 const method=init?.method||'GET',p=new URL(url);
 if(init?.headers?.Authorization!=='Bearer signed-8')
  return Response.json({ok:false,error:'Unauthenticated'},{status:401});
 if(p.pathname==='/api/sync/records'&&method==='GET')
  return Response.json({ok:true,records:[...cloud.values()],nextOffset:null});
 if(p.pathname==='/api/sync/records'&&method==='POST'){
  const body=JSON.parse(init.body),key=body.kind+':'+body.id,old=cloud.get(key);
  if((old?.revision||0)!==body.baseRevision)
   return Response.json({ok:false,error:'Conflict',current:old||null},{status:409});
  const newer={id:body.id,kind:body.kind,revision:body.baseRevision+1,payload:body.payload,
   deletedAt:body.deleted?new Date().toISOString():null,modifiedAt:new Date().toISOString()};
  cloud.set(key,newer);
  return Response.json({ok:true,revision:newer.revision});
 }
 throw Error('Unexpected '+method+' '+p.pathname);
};
function device(name,initial=[]){
 const state=new Map(initial.map(x=>[x.kind+':'+x.id,{...x}]));
 const transport=new SyncTransport({api:'https://sync.test.invalid',
   getToken:async()=> 'signed-8',
   getLocal:async(k,id)=>state.get(k+':'+id)||null,
   applyRemote:async r=>{state.set(r.kind+':'+r.id,{...r});},
   onStatus:e=>{
    events.push({name,...e});
    if(e.kind==='uploaded'){
     const saved=state.get(e.record);
     if(saved)saved.revision=e.revision;
    }
   },enabled:true});
 transport.setAccount(owner);
 function edit(score){
  const key='result:r1',old=state.get(key),next={kind:'result',id:'r1',revision:old?.revision||0,
   payload:{score},modifiedAt:new Date().toISOString()};
  state.set(key,next);transport.enqueueRecord(next);
 }
 return {state,transport,edit,stop:()=>transport.stop()};
}
const a=device('phone'),b=device('web');
a.edit(8);
assert.equal(await a.transport.flush(),true);
assert.equal(cloud.get('result:r1').revision,1);
assert.equal(await b.transport.flush(),true);
assert.equal(b.state.get('result:r1').payload.score,8);
b.edit(9);
assert.equal(await b.transport.flush(),true);
assert.equal(await a.transport.flush(),true);
assert.equal(a.state.get('result:r1').payload.score,9);
assert.equal(a.state.get('result:r1').revision,2);
// Offline change on phone. The other device uploads a newer revision.
navigator.onLine=false;
a.edit(10);
assert.equal(await a.transport.flush(),false);
navigator.onLine=true;
b.edit(11);
assert.equal(await b.transport.flush(),true);
assert.equal(cloud.get('result:r1').payload.score,11);
assert.equal(await a.transport.flush(),false,'CAS conflict must stop upload');
assert.equal(a.state.get('result:r1').payload.score,10,'do not discard offline edits');
assert(a.transport.blocked.has('result:r1'));
assert.equal(cloud.get('result:r1').payload.score,11,'do not overwrite server');
assert(events.some(e=>e.name==='phone'&&e.kind==='conflict'));
a.stop();b.stop();
console.log('PASS: offline phone -> web sync, web -> phone sync, offline conflict preserves both edits.');
