/**
 * ChấmPro offline-first synchronization transport (feature-flagged).
 * The grader NEVER awaits this code. This module is not automatically loaded.
 * Caller must supply a valid, fresh first-party session and safe application
 * adapters; it must never persist access tokens or overwrite dirty records.
 */
import {validRecord,resolveRecord,planUpload,syncDecision} from './reconcile.mjs';
const MAX_ATTEMPTS=5,MAX_RECORDS_PER_POLL=100,PHOTO_LIMIT=2*1024*1024;
export class SyncTransport {
 constructor({api,getToken,getLocal,applyRemote,getPhoto,putPhoto,onStatus=()=>{},isBusy=()=>false,enabled=false}){
  if(!api?.startsWith('https://'))throw Error('Đồng bộ yêu cầu HTTPS');
  if(typeof getToken!=='function'||typeof getLocal!=='function'||typeof applyRemote!=='function')
   throw Error('Thiếu kết nối dữ liệu an toàn');
  this.api=api.replace(/\/$/,'');this.getToken=getToken;this.getLocal=getLocal;
  this.applyRemote=applyRemote;this.getPhoto=getPhoto;this.putPhoto=putPhoto;this.onStatus=onStatus;this.isBusy=isBusy;
  this.enabled=Boolean(enabled);this.dirty=new Map();this.photos=new Set();this.blocked=new Set();
  this.running=false;this.lastError=null;this.account=null;this.retry=0;
  this.scheduleId=null;
 }
 key(kind,id){return kind+':'+id;}
 setAccount(account){
  if(this.account===account)return;
  // A pending local exam can NEVER be discarded or uploaded under another
  // login. Refuse switch until it has been safely backed up/reconciled.
  if(this.dirty.size||this.photos.size)
   throw Error('Dữ liệu chưa đồng bộ của tài khoản cũ phải được sao lưu hoặc xử lý trước khi đổi tài khoản');
  this.account=account;this.blocked.clear();this.lastError=null;this.retry=0;
 }
 enqueueRecord(record){
  if(!this.enabled||!validRecord(record))return false;
  const key=this.key(record.kind,record.id);
  if(this.blocked.has(key))return false;
  this.dirty.set(key,{...record});
  this.schedule();return true;
 }
 enqueuePhoto(id){
  if(!this.enabled||typeof id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(id))return false;
  this.photos.add(id);this.schedule();return true;
 }
 schedule(delay=2000){
  if(!this.enabled||this.scheduleId!==null||this.running)return;
  // Network work happens only in a browser idle window. The actual OMR
  // scoring path never waits for a network request or image compression.
  this.scheduleId=setTimeout(()=>{
   this.scheduleId=null;
   const run=()=>void this.flush();
   if(typeof requestIdleCallback==='function')
    requestIdleCallback(run,{timeout:20000});
   else run();
  },delay);
 }
 start(){
  if(!this.enabled)return;
  this.onOnline=()=>this.schedule(400);
  this.onVisible=()=>{if(!document.hidden)this.schedule(400);};
  window.addEventListener('online',this.onOnline);
  document.addEventListener('visibilitychange',this.onVisible);
  this.schedule(2000);
 }
 async request(path,method='GET',body=null,type='application/json',extraHeaders={}){
  const token=await this.getToken();
  if(!token)throw Object.assign(Error('Cần xác thực lại để đồng bộ'),{status:401});
  const res=await fetch(this.api+path,{method,mode:'cors',credentials:'omit',
   cache:'no-store',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':type}:{}),...extraHeaders},body});
  if(type==='image/jpeg'&&method==='GET'){
   if(!res.ok)throw Object.assign(Error('Chưa tải được ảnh phiếu'),{status:res.status});
   return {blob:await res.blob(),
    metadata:res.headers.get('x-champro-photo-meta')||'',
    sha256:res.headers.get('x-content-sha256')||''};
  }
  const payload=await res.json().catch(()=>null);
  if(!res.ok||!payload?.ok)throw Object.assign(Error(payload?.error||'Lỗi đồng bộ'),{status:res.status,data:payload});
  return payload;
 }
 async uploadRecords(){
  for(const [key,record] of [...this.dirty]){
   if(this.blocked.has(key))continue;
   // A remote edit is never overwritten; a conflict stays pending.
   const plan=planUpload({record,baseRevision:record.revision});
   try{
    const answer=await this.request('/api/sync/records','POST',JSON.stringify(plan));
    const current=this.dirty.get(key);
    if(current===record)this.dirty.delete(key);
    else if(current)this.dirty.set(key,{...current,revision:answer.revision});
    // Even when a student was edited while HTTP was in flight, acknowledge
    // the confirmed old revision so the next upload uses the right base.
    await this.onStatus({kind:'uploaded',record:key,revision:answer.revision,
      hash:record.hash||null,deleted:record.deleted===true,
      stillDirty:current!==record});
   }catch(e){
    if(e.status===409){
     this.blocked.add(key);
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
  const photoIds=new Set();
  for(let offset=0;offset<500000;offset+=MAX_RECORDS_PER_POLL){
   const page=await this.request('/api/sync/records?limit='+MAX_RECORDS_PER_POLL+'&offset='+offset);
   for(const remote of page.records||[]){
    if(remote.kind==='result'&&!remote.deletedAt)photoIds.add(remote.id);
    const local=await this.getLocal(remote.kind,remote.id);
    const dirty=this.dirty.has(this.key(remote.kind,remote.id));
    const decision=resolveRecord({local,remote,dirty});
    if(decision.action==='conflict'){
     this.blocked.add(this.key(remote.kind,remote.id));
    this.onStatus({kind:'conflict',record:this.key(remote.kind,remote.id),remote});
     continue;
    }
    if(decision.action==='download')
     await this.applyRemote(remote);
   }
   if(page.nextOffset===null){await this.downloadPhotos(photoIds);return true;}
  }
  throw Error('Quá nhiều bản ghi; cần phân trang an toàn hơn');
 }
 // Conflict resolution is deliberately explicit; no implicit last-write-wins.
 clearResolvedConflict(kind,id){
  const key=this.key(kind,id);
  this.blocked.delete(key);
  this.schedule();
 }
 async uploadPhotos(){
  if(typeof this.getPhoto!=='function')return;
  for(const id of [...this.photos]){
   const file=await this.getPhoto(id);
   if(!file?.blob || !(file.blob instanceof Blob)||file.blob.type!=='image/jpeg'||
     file.blob.size<4||file.blob.size>PHOTO_LIMIT){
    this.onStatus({kind:'photo-pending',record:id});continue;
   }
   const metadata={markers:file.markers,form:file.form,digits:file.digits,
    examId:file.examId,examCode:file.examCode,angle:file.angle||0,createdAt:file.createdAt};
   const raw=JSON.stringify(metadata);
   const bytes=new TextEncoder().encode(raw);
   if(bytes.length>2000)throw Error('Ảnh phiếu có siêu dữ liệu quá dài');
   const header=btoa(String.fromCharCode(...bytes));
   try{
    const answer=await this.request('/api/sync/photo?resultId='+encodeURIComponent(id),
     'POST',file.blob,'image/jpeg',{'X-Photo-Metadata':header,
     'X-Photo-Base-Sha256':file.syncedSha256||''});
    this.photos.delete(id);
    await this.onStatus({kind:'photo-uploaded',record:id,sha256:answer.sha256});
   }catch(e){
    if(e.status===409){
     this.photos.delete(id);
     this.onStatus({kind:'photo-conflict',record:id,remote:e.data?.currentSha256||null});
    }else throw e;
   }
  }
 }
 async downloadPhotos(resultIds){
  if(typeof this.getPhoto!=='function'||typeof this.putPhoto!=='function')return;
  for(const id of resultIds){
   if(this.isBusy())return;
   if(await this.getPhoto(id))continue;
   try{
    const response=await this.request('/api/sync/photo?resultId='+encodeURIComponent(id),'GET',null,'image/jpeg');
    const meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(
      atob(response.metadata),c=>c.charCodeAt(0))));
    if(!meta||!Array.isArray(meta.markers)||meta.markers.length!==4||
      response.blob.type!=='image/jpeg'||response.blob.size>PHOTO_LIMIT)
      throw Error('Ảnh phiếu đã tải không hợp lệ');
    await this.putPhoto(id,{...meta,blob:response.blob,syncedSha256:response.sha256});
    await this.onStatus({kind:'photo-downloaded',record:id});
   }catch(e){if(e.status!==404)throw e;}
  }
 }
 async flush(){
  if(!this.enabled||this.running||!this.account||!navigator.onLine)return false;
  if(this.isBusy()){this.schedule(6500);return false;}
  this.running=true;
  try{
   // Handle uploads and incoming changes outside capture/scoring path.
   const uploaded=await this.uploadRecords();
   if(uploaded===false)return false;
   await this.downloadRecords();
   await this.uploadPhotos();
   this.retry=0;this.lastError=null;
   if(this.blocked.size)this.onStatus({kind:'conflict-pending',count:this.blocked.size});
   else this.onStatus({kind:'synced'});
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
  }finally{
   this.running=false;
   if([...this.dirty.keys()].some(key=>!this.blocked.has(key))||this.photos.size)this.schedule(2500);
  }
 }
 stop(){
  this.enabled=false;
  if(this.scheduleId!==null){clearTimeout(this.scheduleId);this.scheduleId=null;}
  if(this.onOnline)window.removeEventListener('online',this.onOnline);
  if(this.onVisible)document.removeEventListener('visibilitychange',this.onVisible);
 }
}
