import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePairing,approvePair} from '../platform/worker/src/device-pairing.js';
const DEVICE='cp-12345678-1234-4234-8234-123456789abc';
const account={id:'wp:42',wp_user_id:42,plan:'lifetime',status:'active',email:'teacher@example.test',display_name:'Test'};
class DB{
 constructor(){this.pairs=new Map();this.grants=new Map();}
 prepare(sql){
  const db=this;
  return {bind(...args){
   return {
    async first(){
     if(sql.includes('COUNT(*) AS n FROM device_pairings'))return {n:[...db.pairs.values()].filter(x=>x.device_id===args[0]&&x.created_at>args[1]).length};
     if(sql.includes('FROM device_pairings WHERE code='))return [...db.pairs.values()].find(x=>x.code===args[0])||null;
     if(sql.includes('FROM device_pairings WHERE id='))return db.pairs.get(args[0])?.poll_hash===args[1]&&db.pairs.get(args[0])?.device_id===args[2]?db.pairs.get(args[0]):null;
     if(sql.includes('SELECT status FROM accounts'))return account;
     if(sql.includes('FROM accounts WHERE wp_user_id='))return account;
     if(sql.includes('FROM device_grants')){const g=db.grants.get(args[0]);return g?.refresh_hash===args[1]?g:null;}
     throw Error('Unexpected SELECT '+sql);
    },
    async run(){
     if(sql.includes('INSERT INTO device_pairings')){
      const [id,code,device_id,poll_hash,created_at,expires_at]=args;
      db.pairs.set(id,{id,code,device_id,poll_hash,created_at,expires_at,approved_at:null,claimed_at:null,account_id:null});
      return {meta:{changes:1}};
     }
     if(sql.includes('UPDATE device_pairings SET account_id=')){
      const [aid,approvedAt,id,timestamp]=args,row=db.pairs.get(id);
      if(!row||row.approved_at!==null||row.expires_at<=timestamp)return {meta:{changes:0}};
      row.account_id=aid;row.approved_at=approvedAt;return {meta:{changes:1}};
     }
     if(sql.includes('UPDATE device_pairings SET claimed_at=')){
      const [timestamp,id]=args,row=db.pairs.get(id);
      if(!row||row.claimed_at!==null||row.expires_at<=timestamp)return {meta:{changes:0}};
      row.claimed_at=timestamp;return {meta:{changes:1}};
     }
     if(sql.includes('INSERT INTO device_grants')){
      const [device_id,account_id,refresh_hash,created_at,updated_at]=args;
      db.grants.set(device_id,{device_id,account_id,refresh_hash,created_at,updated_at});
      return {meta:{changes:1}};
     }
     throw Error('Unexpected INSERT '+sql);
    }
   };
  }};
 }
}
const req=body=>new Request('https://worker.example/api/device',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function parse(response){return {status:response.status,...await response.json()};}
test('pairs WordPress account only with one-time code and refresh credential',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const env={DB:new DB(),LICENSE_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey))};
 const start=await parse(await handlePairing(req({deviceId:DEVICE}),env,'/api/device/start'));
 assert.equal(start.ok,true);assert.match(start.pairCode,/^[A-HJ-NP-Z2-9]{9}$/);
 const pending=await parse(await handlePairing(req({deviceId:DEVICE,pairId:start.pairId,pollSecret:start.pollSecret}),env,'/api/device/poll'));
 assert.equal(pending.status,'pending');
 const wrong=await parse(await approvePair(env,42,{pairCode:'ZZZZZZZZZ'}));
 assert.equal(wrong.ok,false);
 const approved=await parse(await approvePair(env,42,{pairCode:start.pairCode}));
 assert.equal(approved.paired,true);
 const used=await parse(await approvePair(env,42,{pairCode:start.pairCode}));
 assert.equal(used.ok,false);
 const linked=await parse(await handlePairing(req({deviceId:DEVICE,pairId:start.pairId,pollSecret:start.pollSecret}),env,'/api/device/poll'));
 assert.equal(linked.status,'linked');assert.equal(linked.plan,'lifetime');
 assert.match(linked.license,/^[\w-]+\.[\w-]+\.[\w-]+$/);
 assert.match(linked.refreshSecret,/^[a-f0-9]{64}$/);
 const oldPoll=await parse(await handlePairing(req({deviceId:DEVICE,pairId:start.pairId,pollSecret:start.pollSecret}),env,'/api/device/poll'));
 assert.equal(oldPoll.ok,false);
 const refreshed=await parse(await handlePairing(req({deviceId:DEVICE,refreshSecret:linked.refreshSecret}),env,'/api/device/refresh'));
 assert.equal(refreshed.ok,true);assert.equal(refreshed.plan,'lifetime');
 const forged=await parse(await handlePairing(req({deviceId:DEVICE,refreshSecret:'0'.repeat(64)}),env,'/api/device/refresh'));
 assert.equal(forged.status,401);
});
test('rejects forged device ID and caps repeated pairing requests',async()=>{
 const env={DB:new DB()};
 assert.equal((await parse(await handlePairing(req({deviceId:'bad'}),env,'/api/device/start'))).status,400);
 for(let i=0;i<6;i++)assert.equal((await parse(await handlePairing(req({deviceId:DEVICE}),env,'/api/device/start'))).ok,true);
 assert.equal((await parse(await handlePairing(req({deviceId:DEVICE}),env,'/api/device/start'))).status,429);
});
