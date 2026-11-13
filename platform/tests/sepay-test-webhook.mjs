// SePay Test Mode HMAC and idempotency unit tests. No live network, DB, money, or licensing.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../worker/src/index.js';

const key='CI-test-only-not-a-production-key-32';
const receipts=new Map();
let insertions=0;
const DB = {
  prepare(sql) {
    let args=[];
    return {
      bind(...values) { args=values; return this; },
      async first() {
        assert.match(sql,/^SELECT payload_sha256 FROM sepay_test_receipts /);
        return receipts.get(args[0])??null;
      },
      async run() {
        assert.match(sql,/^INSERT OR IGNORE INTO sepay_test_receipts /);
        if (!receipts.has(args[0])) {
          receipts.set(args[0],{payload_sha256:args[4]});
          insertions++;
        }
        return {success:true};
      }
    };
  }
};
const env={
  DB,AUTH_HMAC_SECRET:'ci-auth',INTERNAL_BRIDGE_SECRET:'ci-bridge',
  ADMIN_WP_USER_IDS:'1',PRODUCT_ANNUAL_ID:'7726',PRODUCT_LIFETIME_ID:'7727',
  SEPAY_TEST_WEBHOOK_SECRET:key,SEPAY_TEST_BANK_ACCOUNT:'0000000001'
};
const valid={
  id:49273,gateway:'VietinBank',accountNumber:'0000000001',
  transferType:'in',transferAmount:99000,code:'DH7734',
  content:'SEVQR DH7734 CHAMPRO TEST'
};
const now=()=>String(Math.floor(Date.now()/1000));
async function call(data=valid, {secret=key, timestamp=now(), omitSignature=false}={}){
  const raw=JSON.stringify(data);
  const signature='sha256='+createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
  const headers={'content-type':'application/json','x-sepay-timestamp':timestamp};
  if(!omitSignature)headers['x-sepay-signature']=signature;
  const req=new Request('https://example.test/webhooks/sepay-test',
    {method:'POST',headers,body:raw});
  const res=await worker.fetch(req,env);
  return {status:res.status,json:await res.json()};
}
let res=await call();
assert.equal(res.status,200);
assert.equal(res.json.received,true);
assert.equal(res.json.duplicate,false);
assert.equal(insertions,1);
res=await call();
assert.equal(res.status,200);
assert.equal(res.json.duplicate,true);
assert.equal(insertions,1);
assert.equal((await call(valid,{secret:'wrong'})).status,401);
assert.equal((await call(valid,{omitSignature:true})).status,401);
assert.equal((await call(valid,{timestamp:String(Number(now())-900)})).status,401);
assert.equal((await call({...valid,id:49274,accountNumber:'9999999999'})).status,422);
assert.equal((await call({...valid,id:49274,transferAmount:0})).status,422);
assert.equal((await call({...valid,id:49274,transferType:'out'})).status,422);
assert.equal((await call({...valid,id:49274,code:'WRONG7734'})).status,422);
assert.equal((await call({...valid,transferAmount:299000})).status,409);
assert.equal(insertions,1,'No unauthorized/mismatched webhook may insert receipts');
console.log('PASS: valid signed webhook, replay/duplicate, invalid signature, stale timestamp, mismatched inputs, transaction conflict');
console.log('PASS: receiver touches only receipt storage; never a payment grant');
