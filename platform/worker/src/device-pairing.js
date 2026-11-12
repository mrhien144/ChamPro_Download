/* v14 opt-in account pairing. Does not touch camera, OMR, grades or local student data.
   All device credentials are random and stored as SHA256 hashes in D1.
   No endpoints here accept a client-asserted purchase or plan. */
import {issueOfflineLicense} from './offline-license.js';
const TE=new TextEncoder();
const send=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>send({ok:false,error:message},status);
const now=()=>Math.floor(Date.now()/1000);
const deviceOK=v=>typeof v==='string'&&/^cp-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function random(bytes=32){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',TE.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function read(req){let raw=await req.text();if(raw.length>2048)throw Object.assign(Error('Nội dung yêu cầu quá lớn'),{status:413});try{return JSON.parse(raw);}catch{throw Object.assign(Error('JSON không hợp lệ'),{status:400});}}
async function entitlement(env,wpId,deviceId){
 const signed=await issueOfflineLicense(env,wpId,deviceId);
 if(signed.ok){const data=await signed.json();return {license:data.license,plan:data.plan,expiresAt:data.expiresAt};}
 // A user with an expired trial still needs to sign in and purchase a package.
 if(signed.status===402)return {license:null,plan:'expired',expiresAt:null};
 const msg=await signed.json().catch(()=>({}));
 throw Object.assign(Error(msg.error||'Chưa cấp được giấy phép'),{status:signed.status});
}
async function newPair(req,env){
 if(req.method!=='POST')return fail('Phương thức không hợp lệ',405);
 const b=await read(req),deviceId=b.deviceId;
 if(!deviceOK(deviceId))return fail('Thiết bị không hợp lệ');
 const timestamp=now();
 // Per-device throttle: at most 6 pairings/hour and one active unclaimed code.
 const used=await env.DB.prepare('SELECT COUNT(*) AS n FROM device_pairings WHERE device_id=? AND created_at>?').bind(deviceId,timestamp-3600).first();
 if(Number(used?.n||0)>=6)return fail('Quá nhiều lần ghép nối. Hãy thử sau.',429);
 const id=random(16),secret=random(32),secretHash=await digest(secret);
 const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 for(let attempt=0;attempt<5;attempt++){
  const code=Array.from(crypto.getRandomValues(new Uint8Array(9)),x=>letters[x%letters.length]).join('');
  try{
   await env.DB.prepare('INSERT INTO device_pairings(id,code,device_id,poll_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(id,code,deviceId,secretHash,timestamp,timestamp+600).run();
   return send({ok:true,pairId:id,pairCode:code,pollSecret:secret,expiresIn:600});
  }catch(e){if(attempt===4)throw e;}
 }
 return fail('Không tạo được mã ghép nối',503);
}
async function approvePair(env,wpId,b){
 const code=String(b.pairCode||'').trim().toUpperCase();
 if(!/^[A-HJ-NP-Z2-9]{9}$/.test(code))return fail('Mã kết nối không hợp lệ');
 const aid='wp:'+wpId;
 const row=await env.DB.prepare('SELECT id,expires_at,approved_at FROM device_pairings WHERE code=?').bind(code).first();
 if(!row||row.expires_at<=now()||row.approved_at!==null)return fail('Mã kết nối không tồn tại, đã hết hạn hoặc đã dùng',409);
 const user=await env.DB.prepare("SELECT status FROM accounts WHERE id=?").bind(aid).first();
 if(user?.status!=='active')return fail('Tài khoản WordPress chưa được kích hoạt',403);
 const result=await env.DB.prepare('UPDATE device_pairings SET account_id=?,approved_at=? WHERE id=? AND account_id IS NULL AND approved_at IS NULL AND expires_at>?')
  .bind(aid,now(),row.id,now()).run();
 if(result.meta?.changes!==1)return fail('Mã kết nối đã được sử dụng',409);
 return send({ok:true,paired:true});
}
async function pollPair(req,env){
 if(req.method!=='POST')return fail('Phương thức không hợp lệ',405);
 const b=await read(req);
 if(!/^[a-f0-9]{32}$/.test(String(b.pairId||''))||!/^[a-f0-9]{64}$/.test(String(b.pollSecret||''))||!deviceOK(b.deviceId))return fail('Thông tin kết nối không hợp lệ',400);
 const row=await env.DB.prepare('SELECT * FROM device_pairings WHERE id=? AND poll_hash=? AND device_id=?')
  .bind(b.pairId,await digest(b.pollSecret),b.deviceId).first();
 if(!row)return fail('Mã kết nối không hợp lệ',401);
 if(row.expires_at<=now())return fail('Mã kết nối đã hết hạn',410);
 if(!row.approved_at)return send({ok:true,status:'pending'});
 if(row.claimed_at)return fail('Mã đã nhận quyền. Hãy tạo kết nối mới nếu cần.',409);
 const wpId=Number(row.account_id?.slice(3));
 if(!Number.isSafeInteger(wpId)||wpId<=0)return fail('Tài khoản không hợp lệ',403);
 const entitlementData=await entitlement(env,wpId,b.deviceId);
 const refreshSecret=random(32),refreshHash=await digest(refreshSecret),timestamp=now(),claimTag=random(16);
 // D1 batch is atomic; only the winning claimant's random tag may write the refresh credential.
 const operations=await env.DB.batch([
  env.DB.prepare('UPDATE device_pairings SET claimed_at=?,claimed_tag=? WHERE id=? AND claimed_at IS NULL AND expires_at>?')
   .bind(timestamp,claimTag,row.id,timestamp),
  env.DB.prepare('INSERT INTO device_grants(device_id,account_id,refresh_hash,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM device_pairings WHERE id=? AND claimed_tag=?) ON CONFLICT(device_id) DO UPDATE SET account_id=excluded.account_id,refresh_hash=excluded.refresh_hash,updated_at=excluded.updated_at')
   .bind(b.deviceId,row.account_id,refreshHash,timestamp,timestamp,row.id,claimTag)
 ]);
 if(operations[0]?.meta?.changes!==1||operations[1]?.meta?.changes!==1)
  return fail('Phiên kết nối đã được nhận; hãy tạo mã mới nếu cần.',409);
 return send({ok:true,status:'linked',refreshSecret,accountId:row.account_id,...entitlementData});
}
async function refresh(req,env){
 if(req.method!=='POST')return fail('Phương thức không hợp lệ',405);
 const b=await read(req);
 if(!deviceOK(b.deviceId)||!/^[a-f0-9]{64}$/.test(String(b.refreshSecret||'')))return fail('Phiên thiết bị không hợp lệ',401);
 const row=await env.DB.prepare('SELECT account_id FROM device_grants WHERE device_id=? AND refresh_hash=?')
  .bind(b.deviceId,await digest(b.refreshSecret)).first();
 if(!row)return fail('Không nhận diện được thiết bị. Hãy đăng nhập lại.',401);
 const wpId=Number(row.account_id?.slice(3));
 if(!Number.isSafeInteger(wpId)||wpId<=0)return fail('Phiên tài khoản không hợp lệ',401);
 const info=await entitlement(env,wpId,b.deviceId);
 return send({ok:true,status:'linked',accountId:row.account_id,...info});
}
export async function handlePairing(req,env,path){
 try{
  if(path==='/api/device/start')return newPair(req,env);
  if(path==='/api/device/poll')return pollPair(req,env);
  if(path==='/api/device/refresh')return refresh(req,env);
  return fail('Không tìm thấy API',404);
 }catch(e){return fail(e?.status?e.message:'Không xử lý được yêu cầu',e?.status||503);}
}
export {approvePair,deviceOK};
