import test from 'node:test';
import assert from 'node:assert/strict';
import {issueOfflineLicense} from '../platform/worker/src/offline-license.js';
const DEVICE='cp-12345678-1234-4234-8234-123456789abc';
const from64=s=>Uint8Array.from(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64'));
const parsed=s=>JSON.parse(Buffer.from(s,'base64url').toString('utf8'));
async function createEnv(account){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const priv=await crypto.subtle.exportKey('jwk',pair.privateKey);
 return {env:{
   LICENSE_PRIVATE_JWK:JSON.stringify(priv),
   DB:{prepare:()=>({bind:()=>({first:async()=>account})})}
  },publicKey:pair.publicKey};
}
async function issue(env,id=42,device=DEVICE){
 const response=await issueOfflineLicense(env,id,device);
 return {status:response.status,json:await response.json()};
}
test('lifetime license is signed, device-bound and valid offline',async()=>{
 const {env,publicKey}=await createEnv({status:'active',plan:'lifetime'});
 const r=await issue(env);
 assert.equal(r.status,200);assert.equal(r.json.plan,'lifetime');
 const chunks=r.json.license.split('.');
 assert.equal(chunks.length,3);
 assert.equal(parsed(chunks[0]).alg,'ES256');
 const claim=parsed(chunks[1]);
 assert.equal(claim.deviceId,DEVICE);assert.equal(claim.sub,'wp:42');
 assert.equal(claim.aud,'com.champro.nativepreview.v14');
 assert.equal(claim.plan,'lifetime');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},
    publicKey,from64(chunks[2]),new TextEncoder().encode(chunks[0]+'.'+chunks[1])),true);
 const parts=chunks[1].split('');parts[20]=parts[20]==='A'?'B':'A';
 const tampered=chunks[0]+'.'+parts.join('');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},
    publicKey,from64(chunks[2]),new TextEncoder().encode(tampered)),false);
});
test('free trial is never renewed on later license issuance',async()=>{
 const started=new Date(Date.now()-2*86400_000).toISOString().slice(0,19).replace('T',' ');
 const {env}=await createEnv({status:'active',plan:'free',created_at:started});
 const r=await issue(env);assert.equal(r.status,200);
 const claim=parsed(r.json.license.split('.')[1]);
 assert.ok(claim.exp-claim.iat<6*86400);
 assert.ok(claim.exp-claim.iat>4*86400);
});
test('expired trial cannot be issued even after reinstall',async()=>{
 const started=new Date(Date.now()-9*86400_000).toISOString().slice(0,19).replace('T',' ');
 const {env}=await createEnv({status:'active',plan:'free',created_at:started});
 assert.equal((await issue(env)).status,402);
});
test('suspended, unconfigured and invalid device are denied',async()=>{
 const x=await createEnv({status:'suspended',plan:'lifetime'});
 assert.equal((await issue(x.env)).status,403);
 const y=await createEnv({status:'active',plan:'lifetime'});
 assert.equal((await issue(y.env,42,'evil-device')).status,400);
 delete y.env.LICENSE_PRIVATE_JWK;
 assert.equal((await issue(y.env)).status,503);
});
