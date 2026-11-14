import assert from 'node:assert/strict';
import {handleSync} from '../sync-worker/src/sync.js';
const records=new Set(['wp:8:result:r1']),meta=new Map(),files=new Map();
const db={prepare(sql){return {bind(...args){return {
 async first(){
  if(sql.includes('FROM accounts'))return args[0]==='wp:8'?{id:'wp:8'}:null;
  if(sql.includes("FROM sync_records"))return records.has(args[0]+':result:'+args[1])?{record_id:args[1]}:null;
  if(sql.includes('SELECT object_key,sha256'))return meta.get(args[0]+':'+args[1])||null;
  if(sql.includes('SELECT sha256 FROM sync_photos')){
   const x=meta.get(args[0]+':'+args[1]);return x?{sha256:x.sha256}:null;
  }
  return null;
 },
 async run(){
  if(!sql.includes('INSERT INTO sync_photos'))throw Error('Unexpected write');
  const [account,id,key,sha,json,bytes,base]=args;
  const old=meta.get(account+':'+id);
  if((old?.sha256||'')!==base)return {meta:{changes:0}};
  meta.set(account+':'+id,{object_key:key,sha256:sha,metadata_json:json,byte_size:bytes});
  return {meta:{changes:1}};
 }
 };}}}};
const env={CHAMPRO_SYNC_ENABLED:'1',DB:db,BUCKET:{
 async put(key,bytes){files.set(key,new Uint8Array(bytes))},
 async get(key){return files.has(key)?{body:files.get(key)}:null}
}};
const url='https://example.invalid/api/sync/photo?resultId=r1',who={id:'wp:8'};
const jpeg=new Uint8Array([255,216,255,217]);
const info={markers:[[1,2],[3,4],[5,6],[7,8]],form:'three',digits:3,
 examId:'exam1',examCode:'101',angle:0,createdAt:'2026-11-14T00:00:00Z'};
const header=Buffer.from(JSON.stringify(info)).toString('base64');
const upload=async(owner=who,body=jpeg,base='')=>handleSync(new Request(url,{
 method:'POST',headers:{'Content-Type':'image/jpeg','X-Photo-Metadata':header,
 'X-Photo-Base-Sha256':base},body}),env,owner,'/api/sync/photo');
let res=await upload();
assert.equal(res.status,200);
let result=await res.json();
const original=result.sha256;
assert.match(original,/^[a-f0-9]{64}$/);
res=await handleSync(new Request(url,{method:'GET'}),env,who,'/api/sync/photo');
assert.equal(res.status,200);
assert.equal(res.headers.get('x-content-sha256'),original);
assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],[...jpeg]);
assert.equal(JSON.parse(Buffer.from(res.headers.get('x-champro-photo-meta'),'base64').toString()).examCode,'101');
res=await upload();
result=await res.json();
assert.equal(result.duplicate,true,'same JPEG must not be stored twice');
const other=new Uint8Array([255,216,0,255,217]);
res=await upload(who,other);
assert.equal(res.status,409,'another phone cannot replace photo without base hash');
res=await upload({id:'wp:9'},jpeg);
assert.equal(res.status,403,'another account is denied');
assert.equal(meta.size,1,'only one user photo metadata row exists');
console.log('PASS: account-scoped R2 JPEG, geometry, SHA256, idempotency and photo CAS');

