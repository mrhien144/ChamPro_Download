import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import worker from '../sync-worker/src/index.js';
import {SyncTransport} from '../sync/client.mjs';

// Synthetic data only. Model browser CORS header visibility, which Node's
// fetch does not enforce. No deployed Worker, D1, R2 or real accounts are used.
const origin='https://champro.mrhien.com';
const api='https://sync.example.invalid';
const jpeg=new Uint8Array([255,216,1,2,3,255,217]);
const metadata={markers:[[1,2],[3,4],[5,6],[7,8]],form:'three',digits:4,
 examId:'test-exam',examCode:'0101',angle:0,createdAt:'2026-11-16T00:00:00Z'};
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

async function fixture(){
 const secret=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);
 const message=b64({alg:'HS256',typ:'JWT'})+'.'+b64({iss:'https://mrhien.com',
  aud:'champro-sync',scope:'sync',sub:'101',deviceId:'web',iat:now,exp:now+300});
 const token=message+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(message))).toString('base64url');
 const photos=new Map(),objects=new Map();
 const env={CHAMPRO_SYNC_ENABLED:'1',CHAMPRO_SYNC_HMAC_SECRET:secret,
  ALLOWED_ORIGINS:origin,DB:{prepare(sql){return {bind(...args){return {
   async first(){
    if(sql.includes('FROM accounts'))return args[0]==='wp:101'?{id:args[0]}:null;
    if(sql.includes('FROM sync_records'))return {record_id:args[1]};
    return photos.get(args[0]+':'+args[1])||null;
   },
   async run(){
    assert.ok(sql.includes('INSERT INTO sync_photos'));
    const [owner,id,object_key,sha256,metadata_json,byte_size,base]=args;
    const key=owner+':'+id;
    if((photos.get(key)?.sha256||'')!==base)return {meta:{changes:0}};
    photos.set(key,{object_key,sha256,metadata_json,byte_size});
    return {meta:{changes:1}};
   }
  };}}}},BUCKET:{
   async put(key,bytes){objects.set(key,new Uint8Array(bytes));},
   async get(key){return objects.has(key)?{body:objects.get(key)}:null;}
  }};
 const call=async(path,method='GET',body=null,headers={})=>worker.fetch(
  new Request(api+path,{method,body,headers:{Origin:origin,
   Authorization:'Bearer '+token,...headers}}),env);
 const uploaded=await call('/api/sync/photo?resultId=test-result','POST',jpeg,
  {'Content-Type':'image/jpeg','X-Photo-Metadata':Buffer.from(JSON.stringify(metadata)).toString('base64')});
 assert.equal(uploaded.status,200);
 return {env,call,token};
}

test('cross-origin web client receives photo geometry and original JPEG',async t=>{
 const {env,token}=await fixture();
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const response=await worker.fetch(new Request(url,{...options,
   headers:{...options.headers,Origin:origin}}),env);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  const exposed=(response.headers.get('Access-Control-Expose-Headers')||'')
   .toLowerCase().split(',').map(x=>x.trim());
  assert.ok(exposed.includes('x-champro-photo-meta'),'Worker must expose the header read by the browser');
  const visible=new Headers();
  for(const [key,value] of response.headers)
   if(['content-type','cache-control','content-length',...exposed].includes(key))visible.set(key,value);
  return new Response(response.body,{status:response.status,headers:visible});
 });
 const saved=[];
 const client=new SyncTransport({api,getToken:async()=>token,getLocal:async()=>null,
  applyRemote:async()=>{},getPhoto:async()=>null,putPhoto:async(id,photo)=>saved.push({id,photo})});
 await client.downloadPhotos(new Set(['test-result']));
 assert.equal(saved.length,1);
 assert.equal(saved[0].id,'test-result');
 assert.deepEqual(saved[0].photo.markers,metadata.markers);
 assert.equal(saved[0].photo.examCode,'0101');
 assert.deepEqual(new Uint8Array(await saved[0].photo.blob.arrayBuffer()),jpeg);
 assert.equal(saved[0].photo.syncedSha256,await sha(jpeg));
});

test('damaged or missing checksum cannot be acknowledged or saved',async()=>{
 for(const checksum of ['','bad-checksum','0'.repeat(64)]){
  let saved=false;
  const client=new SyncTransport({api,getToken:async()=>'',getLocal:async()=>null,
   applyRemote:async()=>{},getPhoto:async()=>null,putPhoto:async()=>{saved=true;}});
  client.request=async()=>({blob:new Blob([jpeg],{type:'image/jpeg'}),
   metadata:Buffer.from(JSON.stringify(metadata)).toString('base64'),sha256:checksum});
  await assert.rejects(()=>client.downloadPhotos(new Set(['test-result'])),/checksum|toàn vẹn/i);
  assert.equal(saved,false,'preserve local state after an invalid download');
 }
});

test('missing photo stays pending and an existing local photo is preserved',async()=>{
 let reads=0,saved=0;
 const client=new SyncTransport({api,getToken:async()=>'',getLocal:async()=>null,
  applyRemote:async()=>{},getPhoto:async id=>id==='existing'?{blob:new Blob([jpeg])}:null,
  putPhoto:async()=>{saved++;}});
 client.request=async()=>{reads++;throw Object.assign(Error('not uploaded yet'),{status:404});};
 await client.downloadPhotos(new Set(['existing','pending']));
 assert.equal(reads,1);assert.equal(saved,0);
});

test('web and APK source share the tested sync transport',()=>{
 assert.equal(readFileSync(new URL('../sync/client.mjs',import.meta.url),'utf8'),
  readFileSync(new URL('../../app-preview/sync/client.mjs',import.meta.url),'utf8'));
});
