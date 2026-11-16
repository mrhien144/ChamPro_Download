import assert from 'node:assert/strict';
import {handleSync} from '../sync-worker/src/sync.js';
import {SyncTransport} from '../sync/client.mjs';
const read=async res=>({status:res.status,body:await res.json()});
const db={prepare(sql){return {bind(...args){
 return {
  async first(){return sql.includes('FROM accounts')&&args[0]==='wp:8'?{id:'wp:8'}:null;},
  async all(){return {results:[]};},
  async run(){return {meta:{changes:0}};}
 };}}}};
const server={DB:db,CHAMPRO_SYNC_ENABLED:'0'};
let r=await read(await handleSync(new Request('https://example.invalid/api/sync/records'),server,{id:'wp:8'},'/api/sync/records'));
assert.equal(r.status,503,'disabled-by-default must refuse data transmission');
server.CHAMPRO_SYNC_ENABLED='1';
r=await read(await handleSync(new Request('https://example.invalid/api/sync/records'),server,{id:'wp:9'},'/api/sync/records'));
assert.equal(r.status,403,'unregistered accounts must be denied');
r=await read(await handleSync(new Request('https://example.invalid/api/sync/records'),server,{id:'wp:8'},'/api/sync/records'));
assert.equal(r.status,200,'registered owner may list only their data');
assert.deepEqual(r.body.records,[]);
r=await read(await handleSync(new Request('https://example.invalid/api/sync/photo?resultId=r1'),server,{id:'wp:8'},'/api/sync/photo'));
assert.equal(r.status,503,'photo storage needs explicit R2 binding');
const transport=new SyncTransport({api:'https://example.invalid',getToken:async()=>null,
 getLocal:async()=>null,applyRemote:async()=>{},enabled:true});
transport.setAccount('wp:8');
const record={kind:'result',id:'r1',revision:0,payload:{score:8}};
assert.equal(transport.enqueueRecord(record),true);
assert.throws(()=>transport.setAccount('wp:9'),/chưa đồng bộ/,'do not send unsent user A records under B');
assert.equal(transport.account,'wp:8');
assert.equal(transport.dirty.size,1);
transport.stop();
console.log('PASS: disabled-by-default, per-user auth, missing R2, safe account switching.');
