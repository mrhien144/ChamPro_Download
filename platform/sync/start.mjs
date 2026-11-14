/**
 * Shared web/APK background sync orchestrator. Does not patch scoring or OMR.
 * Activation requires a proven server session, an enabled sync backend and
 * one-time explicit ownership confirmation for existing local student data.
 */
import {SyncTransport} from './client.mjs';
import {LegacySyncAdapter} from './legacy-adapter.mjs';
export async function startSync({
 api,owner,getToken,getDb,saveDb,getPhoto,putPhoto,listPhotoIds,
 isBusy=()=>false,onEvent=()=>{},consent=async()=>false,metaKey
}){
 if(!/^wp:[1-9]\d*$/.test(String(owner||'')))throw Error('Chưa xác định tài khoản');
 const adapter=new LegacySyncAdapter({getState:getDb,saveState:saveDb,metaKey});
 // Validate the token against the actual Worker before taking ownership of
 // local private data. Never trust an unauthenticated user name or UI state.
 const token=await getToken();
 if(!token)throw Error('Chưa có phiên bảo mật để đồng bộ');
 const check=await fetch(api+'/api/sync/status',{headers:{Authorization:'Bearer '+token},
  mode:'cors',credentials:'omit',cache:'no-store'});
 const result=await check.json().catch(()=>({}));
 if(!check.ok||!result.ok)throw Error(result.error||'Máy chủ chưa cho phép đồng bộ');
 if(result.owner!==owner||result.enabled!==true)throw Error('Phiên đăng nhập không thuộc tài khoản đang lưu trên thiết bị');
 const approved=await adapter.bindOwner(owner,{consent});
 if(!approved)return {started:false,reason:'consent-rejected'};
 let active=true,scanning=false,scanAgain=false;
 const transport=new SyncTransport({
  api,getToken,getLocal:(kind,id)=>adapter.getLocal(kind,id),
  applyRemote:record=>adapter.applyRemote(owner,record),
  getPhoto:getPhoto?async id=>{
   const photo=await getPhoto(id);
   if(!photo)return null;
   return {...photo,syncedSha256:adapter.meta.photos?.[id]?.sha||''};
  }:null,
  putPhoto:putPhoto?async(id,photo)=>{
   await putPhoto(id,photo);
   adapter.meta.photos[id]={sha:photo.syncedSha256||'',updatedAt:new Date().toISOString()};
   adapter.store();
  }:null,
  isBusy,enabled:true,
  onStatus:async event=>{
   if(event.kind==='uploaded'){
    const i=event.record.indexOf(':'),kind=event.record.slice(0,i),id=event.record.slice(i+1);
    const changedWhileUploading=await adapter.uploaded(owner,kind,id,event.revision,event.hash,event.deleted);
    if(changedWhileUploading)setTimeout(()=>void scan(),0);
   }
   if(event.kind==='photo-uploaded'){
    adapter.meta.photos[event.record]={sha:event.sha256,updatedAt:new Date().toISOString()};
    adapter.store();
   }
   onEvent(event);
  }
 });
 transport.setAccount(owner);
 const scan=async()=>{
  if(!active)return;
  if(scanning){scanAgain=true;return;}
  if(isBusy()){setTimeout(()=>void scan(),5000);return;}
  scanning=true;
  try{
   do{
    scanAgain=false;
    for(const row of await adapter.changed(owner)){
     if(!transport.blocked.has(transport.key(row.kind,row.id)))transport.enqueueRecord(row);
    }
   }while(scanAgain);
  }catch(e){onEvent({kind:'local-error',message:String(e.message||e)});}
  finally{scanning=false;}
 };
 // Never scan the full local database synchronously inside a save handler.
 // The existing local save finishes before any crypto/hash or network work.
 let localTimer=null;
 const onLocal=()=>{
  if(!active||adapter.incoming||localTimer!==null)return;
  localTimer=setTimeout(()=>{localTimer=null;void scan();},650);
 };
 const onPhoto=event=>{
  if(!active||event?.detail?.status!=='saved')return;
  const id=event.detail.id;
  if(typeof id==='string')transport.enqueuePhoto(id);
 };
 window.addEventListener('champro-db-updated',onLocal);
 window.addEventListener('champro-photo-status',onPhoto);
 await scan();
 if(typeof listPhotoIds==='function'){
  try{
   const ids=await listPhotoIds();
   for(const id of ids)if(!adapter.meta.photos?.[id]?.sha)transport.enqueuePhoto(id);
  }catch(e){onEvent({kind:'photo-queue-error',message:e.message});}
 }
 transport.start();
 return {started:true,owner,transport,adapter,stop(){
  active=false;clearTimeout(localTimer);transport.stop();
  window.removeEventListener('champro-db-updated',onLocal);
  window.removeEventListener('champro-photo-status',onPhoto);
 }};
}
