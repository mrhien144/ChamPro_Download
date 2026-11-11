/**
 * ChamPro local safety mirror. Existing localStorage remains authoritative.
 * A second, asynchronous IndexedDB snapshot is written only after the UI
 * has completed the original save path. Never blocks OMR or the camera.
 * No uploads, no automatic recovery/overwriting, no automatic deletion.
 */
const DB_NAME='champro-local-mirror-preview-v1',STORE='snapshots',KEY='latest';
let openPromise=null,scheduled=null,idleHandle=null,writing=false,dirty=false,readCurrent=null,lastError=null,lastWritten=null;
export function openLocalMirror(){
 if(!globalThis.indexedDB)return Promise.reject(Error('IndexedDB không khả dụng'));
 if(!openPromise)openPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Không mở được kho dự phòng'));
  request.onblocked=()=>reject(Error('Kho dự phòng đang được sử dụng ở tab khác'));
 }).catch(error=>{openPromise=null;throw error;});
 return openPromise;
}
async function transact(mode,makeRequest){
 const db=await openLocalMirror();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  let value;
  const req=makeRequest(store);
  req.onsuccess=()=>{value=req.result;};
  tx.oncomplete=()=>resolve(value);
  tx.onerror=()=>reject(tx.error||Error('Ghi dữ liệu dự phòng thất bại'));
  tx.onabort=()=>reject(tx.error||Error('Giao dịch dự phòng bị hủy'));
 });
}
export function readLocalMirror(){return transact('readonly',store=>store.get(KEY));}
export function isValidSnapshot(data){
 return Boolean(data&&data.schema===1&&Array.isArray(data.exams)&&Array.isArray(data.students)&&Array.isArray(data.results));
}
export function queueLocalMirror(getter){
 if(typeof getter!=='function')return;
 readCurrent=getter;dirty=true;
 if(scheduled!==null||idleHandle!==null||writing)return;
 scheduled=setTimeout(()=>{
  scheduled=null;
  if(typeof requestIdleCallback==='function'){
   idleHandle=requestIdleCallback(()=>{idleHandle=null;void flushLocalMirror();},{timeout:2500});
  }else void flushLocalMirror();
 },450);
}
export async function flushLocalMirror(){
 if(writing||!dirty||!readCurrent)return;
 if(scheduled!==null){clearTimeout(scheduled);scheduled=null;}
 if(idleHandle!==null&&typeof cancelIdleCallback==='function'){cancelIdleCallback(idleHandle);idleHandle=null;}
 writing=true;
 try{
  while(dirty){
   dirty=false;
   const data=readCurrent();
   if(!isValidSnapshot(data))throw Error('Cấu trúc dữ liệu không hợp lệ');
   const updatedAt=new Date().toISOString();
   await transact('readwrite',store=>store.put({key:KEY,updatedAt,data}));
   lastWritten=updatedAt;lastError=null;
   globalThis.dispatchEvent(new CustomEvent('champro-local-mirror',{detail:{ok:true,updatedAt}}));
  }
 }catch(error){
  lastError=error?.message||String(error);
  globalThis.dispatchEvent(new CustomEvent('champro-local-mirror',{detail:{ok:false,error:lastError}}));
  // Keep localStorage untouched; a later save can retry the mirror.
 }finally{writing=false;}
}
export async function getLocalStorageStatus(){
 const [snapshot,estimate,persisted]=await Promise.all([
  readLocalMirror().catch(()=>null),
  navigator.storage?.estimate?.().catch(()=>null)??null,
  navigator.storage?.persisted?.().catch(()=>false)??false
 ]);
 return {mirrorAt:snapshot?.updatedAt||lastWritten||null,mirrorValid:isValidSnapshot(snapshot?.data),
  used:estimate?.usage??null,quota:estimate?.quota??null,persisted:Boolean(persisted),lastError};
}
export async function requestPersistentLocalStorage(){
 if(!navigator.storage?.persist)throw Error('Trình duyệt không hỗ trợ chế độ bảo vệ lưu trữ');
 return navigator.storage.persist();
}
