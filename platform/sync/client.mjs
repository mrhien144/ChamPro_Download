/**
 * ChấmPro offline-first synchronization transport (feature-flagged).
 * The grader NEVER awaits this code. This module is not automatically loaded.
 * Caller must supply a valid, fresh first-party session and safe application
 * adapters; it must never persist access tokens or overwrite dirty records.
 */
import {validRecord,resolveRecord,planUpload,syncDecision} from './reconcile.mjs';
const MAX_ATTEMPTS=5,MAX_RECORDS_PER_POLL=100,PHOTO_LIMIT=2*1024*1024;
export class SyncTransport {
 constructor({api,getToken,getLocal,applyRemote,getPhoto,onStatus=()=>{},enabled=false}){
  if(!api?.startsWith('https://'))throw Error('Đồng bộ yêu cầu HTTPS');
  if(typeof getToken!=='function'||typeof getLocal!=='function'||typeof applyRemote!=='function')
   throw Error('Thiếu kết nối dữ liệu an toàn');
  this.api=api.replace(/\/$/,'');this.getToken=getToken;this.getLocal=getLocal;
  this.applyRemote=applyRemote;this.getPhoto=getPhoto;this.onStatus=onStatus;
  this.enabled=Boolean(enabled);this.dirty=new Map();this.photos=new Set();
  this.running=false;this.lastError=null;this.account=null;this.retry=0;
  this.scheduleId=null;
 }
 key(kind,id){return kind+':'+id;}
 setAccount(account){
  if(this.account===account)return;
  // Never allow a queued mutation to be uploaded to the newly logged-in
  // account. A sign-out/sign-in switch needs explicit user reconciliation.
  this.account=account;this.dirty.clear();this.photos.clear();
  this.lastError=null;this.retry=0;
 }
 enqueueRecord(record){
  if(!this.enabled||!validRecord(record))return false;
  this.dirty.set(this.key(record.kind,record.id),{...record});
  this.schedule();return true;
 }
 enqueuePhoto(id){
  if(!this.enabled||typeof id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(id))return false;
  this.photos.add(id);this.schedule();return true;
 }
 schedule(delay=2000){
  if(!this.enabled||this.scheduleId!==null||this.running)return;
  this.scheduleId=setTimeout(()=>{this.scheduleId=null;void this.flush();},delay);
 }
 async request(path,method='GET',body=null,type='application/json'){
  const token=await this.getToken();
  if(!token)throw Object.assign(Error('Cần xác thực lại để đồng bộ'),{status:401});
  const res=await fetch(this.api+path,{method,mode:'cors',credentials:'omit',
   cache:'no-store',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':type}:{})},body});
  let payload=null;
  if(type==='image/jpeg'&&method==='GET')return {res,payload:await res.blob()};
  payload=await res.json().catch(()=>null);
  if(!res.ok||!payload?.ok)throw Object.assign(Error(payload?.error||'Lỗi đồng bộ'),{status:res.status,data:payload});
  return payload;
 }
 async uploadRecords(){
  for(const [key,record] of [...this.dirty]){
   // A remote edit is never overwritten; a conflict stays pending.
   const plan=planUpload({record,baseRevision:record.revision});
   try{
    const answer=await this.request('/api/sync/records','POST',JSON.stringify(plan));
    if(this.dirty.get(key)!==record)continue;
    this.dirty.delete(key);
    this.onStatus({kind:'uploaded',record:key,revision:answer.revision});
   }catch(e){
    if(e.status===409){
     this.onStatus({kind:'conflict',record:key,remote:e.data?.current||null});
     // Stop safely rather than loop/overwrite; retains original dirty data.
     return false;
    }
    throw e;
   }
  }
  return true;
 }
 async downloadRecords(){
  for(let offset=0;offset<500000;offset+=MAX_RECORDS_PER_POLL){
   const page=await this.request('/api/sync/records?limit='+MAX_RECORDS_PER_POLL+'&offset='+offset);
   for(const remote of page.records||[]){
    const local=await this.getLocal(remote.kind,remote.id);
    const dirty=this.dirty.has(this.key(remote.kind,remote.id));
    const decision=resolveRecord({local,remote,dirty});
    if(decision.action==='conflict'){
     this.onStatus({kind:'conflict',record:this.key(remote.kind,remote.id),remote});
     continue;
    }
    if(decision.action==='download')
     await this.applyRemote(remote);
   }
   if(page.nextOffset===null)return true;
  }
  throw Error('Quá nhiều bản ghi; cần phân trang an toàn hơn');
 }
 async uploadPhotos(){
  if(typeof this.getPhoto!=='function')return;
  for(const id of [...this.photos]){
   const file=await this.getPhoto(id);
   if(!(file instanceof Blob)||file.type!=='image/jpeg'||file.size<4||file.size>PHOTO_LIMIT){
    this.onStatus({kind:'photo-rejected',record:id});continue;
   }
   await this.request('/api/sync/photo?resultId='+encodeURIComponent(id),
    'POST',file,'image/jpeg');
   this.photos.delete(id);
   this.onStatus({kind:'photo-uploaded',record:id});
  }
 }
 async flush(){
  if(!this.enabled||this.running||!this.account||!navigator.onLine)return false;
  this.running=true;
  try{
   // Handle uploads and incoming changes outside capture/scoring path.
   const uploaded=await this.uploadRecords();
   if(uploaded===false)return false;
   await this.downloadRecords();
   await this.uploadPhotos();
   this.retry=0;this.lastError=null;this.onStatus({kind:'synced'});
   return true;
  }catch(e){
   this.lastError=String(e.message||e);this.onStatus({kind:'error',status:e.status||0,message:this.lastError});
   if(syncDecision(e.status||503)==='retry-later'&&this.retry<MAX_ATTEMPTS){
    this.retry++;
    const delay=Math.min(60000,2000*2**this.retry);
    this.running=false;
    this.schedule(delay);
   }
   return false;
  }finally{this.running=false;}
 }
 stop(){
  this.enabled=false;
  if(this.scheduleId!==null){clearTimeout(this.scheduleId);this.scheduleId=null;}
 }
}
