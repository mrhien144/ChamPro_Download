/**
 * APK v14.6 cross-device sync bridge - staged, never part of camera loop.
 * The installed app stays useful offline; sync starts only when a securely
 * enrolled device can obtain a fresh 10-minute account-scoped token.
 */
import {startSync} from './sync/start.mjs';
import {isSyncRegistered,shortLivedSyncToken} from './sync-device.mjs';
import {getSheetPhoto,putSheetPhoto,listSheetPhotoIds} from './sheet-photo-store.mjs';
const API='https://champro-platform-staging.luckylove1404.workers.dev';
let active=null,starting=false,identity=null;
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
 if(event.kind==='error'||event.kind==='local-error')
  return status('Tạm hoãn: '+String(event.message||'Không có kết nối').slice(0,160));
 if(event.kind==='uploaded'||event.kind==='photo-uploaded')
  return status('Đã cập nhật dữ liệu lên máy chủ.');
}
async function maybeStart(){
 if(starting||active||!navigator.onLine)return;
 identity=window.champroAccountIdentity||identity;
 if(!identity?.wpUserId||!identity?.deviceId)return;
 starting=true;
 try{
  const {wpUserId,deviceId}=identity;
  if(!await isSyncRegistered(deviceId,wpUserId)){
   status('Tài khoản đã lưu offline. Cần liên kết khóa đồng bộ bằng một lần đăng nhập khi có Internet.');
   return;
  }
  const app=window.champroAppData;
  if(!app)return status('Ứng dụng đang khởi tạo kho bài chấm.');
  status('Đang xác minh máy chủ và khóa thiết bị…');
  const token=()=>shortLivedSyncToken(deviceId,wpUserId);
  active=await startSync({
   api:API,owner:'wp:'+wpUserId,getToken:token,getDb:app.getDb,saveDb:app.applySyncDb,
   getPhoto:getSheetPhoto,putPhoto:putSheetPhoto,listPhotoIds:listSheetPhotoIds,
   isBusy:app.isCameraBusy,
   metaKey:'champro-sync-apk-v1',
   consent:async(count)=>confirm('Để đồng bộ an toàn, xác nhận '+count+
    ' bản ghi hiện có trên điện thoại thuộc tài khoản đang đăng nhập. Dữ liệu không bị xóa và được lưu cục bộ ngay cả khi mất mạng. Tiếp tục?'),
   onEvent:eventLabel
  });
  if(active?.started)status('Đã kết nối an toàn. Chấm bài offline; đồng bộ khi máy rảnh và có mạng.');
  else status('Chưa liên kết dữ liệu hiện có; sẽ không tải lên máy chủ khi chưa xác nhận.');
 }catch(e){status(e?.message||'Tạm hoãn: chưa kết nối được máy chủ đồng bộ.');}
 finally{starting=false;}
}
window.addEventListener('champro-account-verified',event=>{
 identity=event.detail||null;
 if(active&&active.owner!=='wp:'+identity?.wpUserId){
  active.stop();active=null;
 }
 void maybeStart();
});
window.addEventListener('champro-account-logout',()=>{
 active?.stop();active=null;identity=null;
 status('Đã ngừng đồng bộ trên thiết bị này; dữ liệu cục bộ được giữ nguyên.');
});
window.addEventListener('online',()=>void maybeStart());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void maybeStart()});
window.addEventListener('load',()=>void maybeStart(),{once:true});
void maybeStart();
