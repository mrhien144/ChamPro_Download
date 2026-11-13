import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
// Tests only the authenticated, read-only preflight endpoint; never creates orders.
function environment(){
 const env={
  AUTH_HMAC_SECRET:'test-auth-secret',INTERNAL_BRIDGE_SECRET:'test-bridge-secret',
  ADMIN_WP_USER_IDS:'1',PRODUCT_ANNUAL_ID:'8919',PRODUCT_LIFETIME_ID:'8920',
  DB:{prepare(sql){assert.equal(sql,'SELECT COUNT(*) AS n FROM accounts');return {async first(){return {n:2}}};}}
 };
 return env;
}
async function call(env,secret='test-bridge-secret',payload={action:'checkout-preflight',annualProductId:8919,lifetimeProductId:8920}){
 const response=await worker.fetch(new Request('https://staging.example.test/api/internal',{
  method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Secret':secret},
  body:JSON.stringify(payload)
 }),env);
 return {code:response.status,body:await response.json()};
}
let env=environment();
let r=await call(env);assert.equal(r.code,200);assert.equal(r.body.ready,true);
r=await call(env,'wrong-secret');assert.equal(r.code,401);
r=await call(env,'test-bridge-secret',{action:'checkout-preflight',annualProductId:7726,lifetimeProductId:8920});assert.equal(r.code,409);
env=environment();env.PRODUCT_ANNUAL_ID='7726';r=await call(env);assert.equal(r.code,409);
env=environment();env.DB.prepare=()=>({async first(){throw Error('D1 outage')}});r=await call(env);assert.equal(r.code,503);
env=environment();env.DB.prepare=()=>({async first(){return null}});r=await call(env);assert.equal(r.code,503);
console.log('PASS: authenticated checkout preflight; rejects wrong secret, mismatched products and D1 outages.');
