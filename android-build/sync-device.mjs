/**
 * ChấmPro APK: device-bound background sync credentials.
 * Not a grading license. The private ECDSA key is non-extractable, stored
 * by IndexedDB structured clone and NEVER sent to WordPress, Worker, R2.
 * Only the public JWK is included in a successful one-time login exchange.
 * OFF by default until secure backend + data adapter pass two-device QA.
 */
const DB='champro-sync-private-v1',STORE='credentials';
const WP='https://mrhien.com/wp-json/champro/sync/v1';
const encoder=new TextEncoder();
let opened=null,cachedToken=null;
const keyFor=d=>'device:'+d;
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
function db(){
 if(!globalThis.indexedDB)return Promise.reject(Error('IndexedDB không khả dụng'));
 if(!opened)opened=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{
   const conn=request.result;
   if(!conn.objectStoreNames.contains(STORE))conn.createObjectStore(STORE,{keyPath:'key'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Không mở được khóa thiết bị'));
 }).catch(e=>{opened=null;throw e;});
 return opened;
}
async function entry(device){
 const conn=await db();
 return new Promise((resolve,reject)=>{
  const tx=conn.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(keyFor(device));
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error);
 });
}
async function store(device,value){
 const conn=await db();
 return new Promise((resolve,reject)=>{
  const tx=conn.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put({key:keyFor(device),...value});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export async function publicSyncKey(device){
 if(!/^cp-[0-9a-f-]{36}$/i.test(String(device)))throw Error('Mã thiết bị không hợp lệ');
 let saved=await entry(device);
 if(!saved?.privateKey||!saved?.publicKey){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  saved={privateKey:keys.privateKey,publicKey:keys.publicKey,registeredUid:null};
  await store(device,saved);
 }
 const publicJwk=await crypto.subtle.exportKey('jwk',saved.publicKey);
 return {kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y};
}
export async function markSyncRegistered(device,uid){
 const item=await entry(device);
 if(!item?.privateKey)return false;
 const owner=Number(uid);
 if(!Number.isSafeInteger(owner)||owner<=0)throw Error('Mã tài khoản không hợp lệ');
 await store(device,{...item,registeredUid:owner});
 cachedToken=null;return true;
}
export async function isSyncRegistered(device,uid){
 const item=await entry(device).catch(()=>null);
 return Boolean(item?.privateKey&&item.registeredUid===Number(uid));
}
export function clearSyncToken(){cachedToken=null;}
async function post(path,body){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const res=await fetch(WP+path,{method:'POST',mode:'cors',credentials:'omit',
   cache:'no-store',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok)throw Object.assign(Error(data.message||'Không thể xác minh thiết bị'),{status:res.status});
  return data;
 }finally{clearTimeout(timer);}
}
function expOf(jwt){
 try{
  const p=jwt.split('.')[1],raw=atob(p.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(p.length/4)*4,'='));
  const value=JSON.parse(raw);
  return value.aud==='champro-sync'&&value.scope==='sync'?Number(value.exp)||0:0;
 }catch{return 0;}
}
export async function shortLivedSyncToken(device,uid){
 const userId=Number(uid);
 if(!Number.isSafeInteger(userId)||userId<1||!navigator.onLine)return null;
 if(cachedToken?.uid===userId&&cachedToken?.device===device&&cachedToken.exp>Date.now()/1000+40)
  return cachedToken.token;
 const saved=await entry(device);
 if(!saved?.privateKey||saved.registeredUid!==userId)
  throw Error('Thiết bị chưa liên kết đồng bộ. Cần đăng nhập lại một lần khi có Internet.');
 const challenge=await post('/challenge',{wpUserId:userId,deviceId:device});
 if(!/^[a-f0-9]{48}$/.test(String(challenge.nonce||'')))throw Error('Thử thách không hợp lệ');
 const payload=`champro-sync-v1\n${userId}\n${device}\n${challenge.nonce}`;
 const signed=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},
   saved.privateKey,encoder.encode(payload)));
 if(signed.length!==64)throw Error('Chữ ký thiết bị sai định dạng');
 const response=await post('/authorize',{wpUserId:userId,deviceId:device,
  nonce:challenge.nonce,signature:encode(signed)});
 const expiry=expOf(response.token);
 if(!expiry||expiry<=Date.now()/1000)throw Error('Phiên đồng bộ không hợp lệ');
 cachedToken={device,uid:userId,token:response.token,exp:expiry};
 return cachedToken.token;
}

/** Separate entitlement refresh from document/sheet synchronization.
 * The challenge is signed with the same non-exportable install key, not
 * with the offline license. Refresh never erases the stored offline token.
 */
const REFRESH='https://mrhien.com/wp-json/champro/v2';
export async function markRefreshRegistered(device,uid){
 const item=await entry(device);
 const owner=Number(uid);
 if(!item?.privateKey||!Number.isSafeInteger(owner)||owner<=0)return false;
 await store(device,{...item,refreshRegisteredUid:owner});
 return true;
}
export async function refreshSignedLicense(device,uid){
 const userId=Number(uid);
 if(!Number.isSafeInteger(userId)||userId<1||!navigator.onLine)
  throw Error('Cần Internet để kiểm tra quyền; tài khoản vẫn lưu trên điện thoại.');
 const saved=await entry(device);
 if(!saved?.privateKey||saved.refreshRegisteredUid!==userId)
  throw Error('Cần đăng nhập lại một lần để liên kết thiết bị với cổng quyền D1.');
 const postRefresh=async(path,body)=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const response=await fetch(REFRESH+path,{method:'POST',mode:'cors',credentials:'omit',
    cache:'no-store',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)});
   const parsed=await response.json().catch(()=>({}));
   if(!response.ok||!parsed.ok)
    throw Object.assign(Error(parsed.message||'Không lấy được quyền mới từ máy chủ.'),{status:response.status});
   return parsed;
  }finally{clearTimeout(timer);}
 };
 const challenge=await postRefresh('/refresh-challenge',{wpUserId:userId,deviceId:device});
 if(!/^[a-f0-9]{48}$/.test(String(challenge.nonce||'')))throw Error('Thử thách không hợp lệ.');
 const input=`champro-license-refresh-v1\n${userId}\n${device}\n${challenge.nonce}`;
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},
  saved.privateKey,encoder.encode(input)));
 if(signature.length!==64)throw Error('Chữ ký quyền thiết bị không hợp lệ.');
 const result=await postRefresh('/refresh-license',{wpUserId:userId,deviceId:device,
  nonce:challenge.nonce,signature:encode(signature)});
 if(typeof result.license!=='string'||!result.license)
  throw Error('Máy chủ không trả về giấy phép đã ký.');
 return result;
}
