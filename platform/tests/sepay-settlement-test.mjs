import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const created=Date.parse('2026-11-13T03:52:00Z')/1000;
let account={id:'wp:3',plan:'free',status:'active'},claim=null,payment=null,batches=0;
let receipt={transaction_id:49273,payment_code:'DH7734',amount_vnd:99000,account_number:'0000000001',received_at:'2026-11-13 05:26:26'};
const DB={
 prepare(sql) {
  let args=[];
  return {
   bind(...xs){args=xs;return this;},
   async first(){
    if(sql.startsWith('SELECT id,plan,status FROM accounts'))return account;
    if(sql.startsWith('SELECT * FROM payments'))return payment;
    if(sql.startsWith('SELECT s.transaction_id'))return claim&&payment?{
     transaction_id:claim.transaction_id,processed_at:claim.processed_at,
     plan:account.plan,expires_at:'2027-11-13 00:00:00',product_id:payment.product_id,
     amount_vnd:payment.amount_vnd,paid_at:payment.processed_at}:null;
    throw Error('Unexpected first SQL: '+sql);
   },
   async all(){
    if(sql.startsWith('SELECT transaction_id,payment_code,amount_vnd,account_number,received_at FROM sepay_test_receipts'))
     return {results:receipt && args[0]===receipt.payment_code?[receipt]:[]};
    if(sql.startsWith('SELECT * FROM sepay_test_settlements'))
     return {results:claim && (claim.order_id===args[0]||claim.transaction_id===args[1])?[claim]:[]};
    throw Error('Unexpected all SQL: '+sql);
   }
  };
 },
 async batch(statements){
  assert.equal(statements.length,5);
  batches++;
  if(!claim)claim={order_id:7734,transaction_id:49273,wp_user_id:3,account_id:'wp:3',product_id:7726,plan:'annual',amount_vnd:99000,processed_at:null};
  if(!payment)payment={order_id:7734,wp_user_id:3,account_id:'wp:3',product_id:7726,plan:'annual',amount_vnd:99000,processed_at:null};
  if(!claim.processed_at){
   if(account.plan==='free')account.plan='annual';
   payment.processed_at='2026-11-13 06:00:00';
   claim.processed_at='2026-11-13 06:00:00';
  }
  return [];
 }
};
const env={
 DB,AUTH_HMAC_SECRET:'fake-auth',INTERNAL_BRIDGE_SECRET:'fake-bridge',
 ADMIN_WP_USER_IDS:'1',PRODUCT_ANNUAL_ID:'7726',PRODUCT_LIFETIME_ID:'7727',
 SEPAY_TEST_BANK_ACCOUNT:'0000000001',SEPAY_TEST_WEBHOOK_SECRET:'fake-webhook',
 SEPAY_TEST_SETTLEMENTS_ENABLED:'0'
};
const body={
 action:'settle-sepay-sandbox',wpUserId:3,orderId:7734,
 productId:7726,plan:'annual',amountVnd:99000,
 orderStatus:'pending',paymentMethod:'',orderCreatedUnix:created
};
async function call(changes={}){
 const resp=await worker.fetch(new Request('https://payment.example.test/api/internal',{
  method:'POST',headers:{'content-type':'application/json','X-Bridge-Secret':'fake-bridge'},
  body:JSON.stringify({...body,...changes})
 }),env);
 return {code:resp.status,data:await resp.json()};
}
assert.equal((await call()).code,403,'Default off');
env.SEPAY_TEST_SETTLEMENTS_ENABLED='1';
assert.equal((await call({wpUserId:1})).code,422);
assert.equal((await call({productId:7727})).code,422);
assert.equal((await call({amountVnd:299000})).code,422);
assert.equal((await call({orderId:7730})).code,422);
assert.equal((await call({orderStatus:'processing'})).code,422);
assert.equal((await call({paymentMethod:'bacs'})).code,422);
assert.equal(batches,0);
receipt={...receipt,amount_vnd:1};
assert.equal((await call()).code,422);
receipt={...receipt,amount_vnd:99000};
let result=await call();
assert.equal(result.code,200);assert.equal(result.data.duplicate,false);
assert.equal(result.data.accountId,'wp:3');assert.equal(account.plan,'annual');
assert.equal(batches,1);
result=await call();
assert.equal(result.code,200);assert.equal(result.data.duplicate,true);
assert.equal(result.data.transactionId,49273);
assert.equal(batches,1,'Duplicate must not extend or write again');
console.log('PASS: staging-only settlement locked by default, invalid orders rejected, signed receipt required, idempotent duplicate.');
