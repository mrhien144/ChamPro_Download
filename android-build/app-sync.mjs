/**
 * APK v14.6 cross-device sync bridge - staged, never part of camera loop.
 * The installed app stays useful offline; sync starts only when a securely
 * enrolled device can obtain a fresh 10-minute account-scoped token.
 */
import {startSync} from './sync/start.mjs';
import {accountStore} from './apk-account-storage.mjs';
import {isSyncRegistered,shortLivedSyncToken} from './sync-device.mjs';
import {getSheetPhoto,putSheetPhoto,listSheetPhotoIds} from './sheet-photo-store.mjs';
const API='https://champro-sync-staging.luckylove1404.workers.dev';
let active=null,starting=false,identity=null,epoch=0;
let retryAfter=0;
const CHECK_DELAY_MS=5*60*1000;
function status(message){
 let el=document.getElementById('cpCloudSyncStatus');
 if(!el){
  const area=document.getElementById('page-backup');
  if(!area)return;
  el=document.createElement('p');el.id='cpCloudSyncStatus';el.className='hint';
  area.prepend(el);
 }
 el.textContent='Đồng bộ ChấmPro: '+message;
}
function eventLabel(event){
 if(event.kind==='synced')return status('Đã kiểm tra và đồng bộ dữ liệu.');
 if(event.kind==='conflict'||event.kind==='photo-conflict')
  return status('Có thay đổi ở hai thiết bị. Đã giữ lại dữ liệu cục bộ; cần xử lý xung đột trước khi tiếp tục.');
 if(event.kind==='error'||event.kind==='local-error'){
  if(event.status===503){
   retryAfter=Date.now()+CHECK_DELAY_MS;
   return status('Máy chủ chưa mở đồng bộ. Đây không phải lỗi Internet hay tài khoản; bài chấm vẫn lưu trên điện thoại.');
  }
  return status('Chưa đồng bộ: '+String(event.message||'Không có kết nối').slice(0,160));
 }
 if(event.kind==='uploaded'||event.kind==='photo-uploaded')
  return status('Đã cập nhật dữ liệu lên máy chủ.');
}
async function maybeStart(){
 if(starting||active||!navigator.onLine||Date.now()<retryAfter)return;
 identity=window.champroAccountIdentity||null;
 if(!identity?.wpUserId||!identity?.deviceId||accountStore.owner!=='wp:'+identity.wpUserId)return;
 starting=true;
 const attempt=epoch;
 const assertSession=()=>{const now=window.champroAccountIdentity;if(attempt!==epoch||!now||now.wpUserId!==identity?.wpUserId||now.deviceId!==identity?.deviceId||accountStore.owner!=='wp:'+now.wpUserId)throw Error('Phiên đồng bộ đã thay đổi');};
 try{
  const {wpUserId,deviceId}=identity;
  if(!await isSyncRegistered(deviceId,wpUserId)){
   status('Đăng nhập đã được ghi nhớ. Đồng bộ đám mây chưa liên kết với thiết bị; không ảnh hưởng việc chấm offline.');
   return;
  }
  const app=window.champroAppData;
  if(!app)return status('Ứng dụng đang khởi tạo kho bài chấm.');
  status('Đang xác minh máy chủ và khóa thiết bị…');
  if(app.syncOwner!==accountStore.owner)throw Error('Kho dữ liệu không cùng tài khoản');
  const token=async()=>{assertSession();const t=await shortLivedSyncToken(deviceId,wpUserId);assertSession();return t;};
  const started=await startSync({
   api:API,owner:'wp:'+wpUserId,getToken:token,getDb:()=>{assertSession();return app.getDb();},saveDb:next=>{assertSession();return app.applySyncDb(next);},
   getPhoto:id=>{assertSession();return getSheetPhoto(id);},putPhoto:(id,photo)=>{assertSession();return putSheetPhoto(id,photo);},listPhotoIds:()=>{assertSession();return listSheetPhotoIds();},
   isBusy:()=>attempt!==epoch||app.isCameraBusy(),
   metaKey:accountStore.meta,
   consent:async count=>{assertSession();return app.syncOwner===accountStore.owner;},
   onEvent:e=>{if(attempt===epoch)eventLabel(e);}
  });
  try{assertSession();}catch{started?.stop?.();return;}
  if(started?.started){active=started;status('Đã kết nối an toàn. Chấm bài offline; đồng bộ khi máy rảnh và có mạng.');}
  else status('Chưa liên kết dữ liệu hiện có; sẽ không tải lên máy chủ khi chưa xác nhận.');
 }catch(e){
  const msg=String(e?.message||'');
  if(e?.status===503||/chưa (kích hoạt|cho phép|mở đồng bộ)|đồng bộ chưa/i.test(msg)){
   retryAfter=Date.now()+CHECK_DELAY_MS;
   status('Tính năng đồng bộ đám mây chưa được mở trên máy chủ. Chấm bài và lưu điểm offline vẫn hoạt động; tài khoản không bị đăng xuất.');
  }else if(!navigator.onLine||/network|fetch|load failed/i.test(msg)){
   status('Chưa kết nối được mạng để đồng bộ. Bài chấm đã lưu trên thiết bị và sẽ được giữ nguyên.');
  }else status('Chưa đồng bộ: '+(msg||'Cần xác minh máy chủ.').slice(0,160));
 }
 finally{starting=false;}
}
window.addEventListener('champro-account-verified',event=>{
 const next=event.detail||null;
 if(identity?.wpUserId!==next?.wpUserId||identity?.deviceId!==next?.deviceId)epoch++;
 identity=next;
 if(active&&active.owner!=='wp:'+identity?.wpUserId){
  active.stop();active=null;
 }
 void maybeStart();
});
window.addEventListener('champro-account-logout',()=>{
 epoch++;active?.stop();active=null;identity=null;
 status('Đã ngừng đồng bộ trên thiết bị này; dữ liệu cục bộ được giữ nguyên.');
});
window.addEventListener('online',()=>{retryAfter=0;void maybeStart()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void maybeStart()});
window.addEventListener('load',()=>void maybeStart(),{once:true});
void maybeStart();
