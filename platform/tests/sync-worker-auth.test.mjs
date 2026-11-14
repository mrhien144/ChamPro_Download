import assert from 'node:assert/strict';
import worker from '../sync-worker/src/index.js';
const secret='unit-test-only-abcdefghijklmnopqrstuvwxyz-0123456789-abcdef';
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const now=Math.floor(Date.now()/1000);
async function jwt(sub='8',deviceId='web',overrides={}){
 const h=b64({alg:'HS256',typ:'JWT'});
 const p=b64({iss:'https://mrhien.com',aud:'champro-sync',sub,deviceId,scope:'sync',iat:now,exp:now+300,...overrides});
 const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+b64(Buffer.from(sig));
}
const env={CHAMPRO_SYNC_ENABLED:'1',CHAMPRO_SYNC_HMAC_SECRET:secret,
 ALLOWED_ORIGINS:'https://champro.mrhien.com,https://localhost',
 DB:{prepare(){return {bind(v){return {async first(){return v==='wp:8'?{id:v}:null}}}}}},
 BUCKET:{}};
async function call(url,token=null,origin='https://champro.mrhien.com',e=env){
 const req=new Request(url,{headers:{...(token?{Authorization:'Bearer '+token}:{}),Origin:origin}});
 const res=await worker.fetch(req,e);return {status:res.status,json:await res.json()};
}
const url='https://champro-sync-staging.example.com/api/sync/status';
assert.equal((await call('https://champro-sync-staging.example.com/health')).status,200);
assert.equal((await call(url,null)).status,401);
let good=await call(url,await jwt());assert.equal(good.status,200);assert.equal(good.json.owner,'wp:8');
good=await call(url,await jwt('8','cp-12345678-1234-1234-1234-123456789abc'),'https://localhost');
assert.equal(good.status,200);assert.equal(good.json.owner,'wp:8');
assert.equal((await call(url,await jwt('9'))).status,403);
assert.equal((await call(url,await jwt('8','web',{exp:now-2}))).status,401);
assert.equal((await call(url,await jwt('8','web',{aud:'champro-platform'}))).status,401);
assert.equal((await call(url,await jwt(),'https://untrusted.example')).status,403);
assert.equal((await call('https://champro-sync-staging.example.com/api/internal',await jwt())).status,404);
assert.equal((await call(url,await jwt(),'https://champro.mrhien.com',{...env,CHAMPRO_SYNC_ENABLED:'0'})).status,503);
console.log('PASS: dedicated sync Worker only accepts HMAC user-scoped web/device sessions; payment routes absent');
