/**
 * Native ChấmPro device credentials for background sync.
 * Private ECDSA P-256 key is NON-EXTRACTABLE in IndexedDB, NEVER in WordPress,
 * localStorage, a URL, an image, or the offline license.
 * Short-lived bearer stays in memory only. Lost key requires explicit login.
 */
const DB='champro-device-sync-key-v1',STORE='credentials',KEY='device';
const WP='https://mrhien.com/wp-json/champro/sync/v1';
const enc=new TextEncoder();let dbPromise=null,cached=null;
function base64url(bytes){
 const bin=String.fromCharCode(...bytes);
 return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function id(){return localStorage.getItem('cp-v14-install-id');}
function openDb(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 }).catch(e=>{dbPromise=null;throw e;});
 return dbPromise;
}
async function storedKey(){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).get(KEY);
  rq.onsuccess=()=>resolve(rq.result||null);rq.onerror=()=>reject(rq.error);
 });
}
async function createKey(){
 let existing=await storedKey();if(existing)return existing;
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const db=await openDb();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put(pair,KEY);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
 return pair;
}
export async function getSyncPublicKey(){
 const pair=await createKey();
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
}
async function json(path,data){
 const response=await fetch(WP+path,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||body.ok!==true)throw Object.assign(Error(body.message||'Không cấp được phiên đồng bộ'),{status:response.status});
 return body;
}
/** @param {() => Promise<{sub:string}|null>} getIdentity */
export function createDeviceSyncSession(getIdentity){
 let pending=null;
 return {
  clear(){cached=null;pending=null;},
  async getToken(){
   if(cached&&cached.expires>Date.now()/1000+50&&cached.device===id())return cached.token;
   if(pending)return pending;
   pending=(async()=>{
    if(!navigator.onLine)throw Error('Đồng bộ tạm dừng vì điện thoại đang offline');
    const identity=await getIdentity();
    if(!identity||!/^wp:[1-9]\d*$/.test(identity.sub||''))throw Error('Chưa có tài khoản đã xác minh');
    const device=id();
    if(!/^cp-[0-9a-f-]{36}$/i.test(device||''))throw Error('Thiết bị chưa đăng nhập');
    const pair=await storedKey();
    if(!pair?.privateKey)throw Error('Cần mở phần Tài khoản và đăng nhập lại một lần để bật đồng bộ an toàn');
    const wpUserId=Number(identity.sub.slice(3));
    const challenge=await json('/challenge',{wpUserId,deviceId:device});
    if(!/^[a-f0-9]{48}$/.test(challenge.nonce||''))throw Error('Yêu cầu bảo mật không hợp lệ');
    const message='champro-sync-v1\n'+wpUserId+'\n'+device+'\n'+challenge.nonce;
    const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,enc.encode(message)));
    const authorized=await json('/authorize',{wpUserId,deviceId:device,nonce:challenge.nonce,signature:base64url(sig)});
    const token=authorized.token;
    if(typeof token!=='string'||token.split('.').length!==3)throw Error('Máy chủ cấp phiên không hợp lệ');
    cached={device,token,expires:Date.now()/1000+Math.min(600,Number(authorized.expiresIn)||600)};
    return token;
   })();
   try{return await pending;}finally{pending=null;}
  }
 };
}
