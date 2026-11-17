/**
 * ChấmPro WEB background sync. Loaded separately from the grader.
 * Requires proven WordPress session + enabled Worker; never uploads a legacy
 * local dataset without explicit owner confirmation.
 */
import {startSync} from './sync/start.mjs';
import {platformOwner,getWebSyncToken,clearWebSyncToken} from './sync/web-token.mjs';
import {getSheetPhoto,putSheetPhoto,listSheetPhotoIds} from './sheet-photo-store.mjs';
const API='https://champro-sync-staging.luckylove1404.workers.dev';
import {webAccountStorage} from './account-storage.mjs';
let active=null,starting=false,waiting=false,retryAfter=0,sessionEpoch=0;
const byId=id=>document.getElementById(id);
function status(message){
 const home=byId('cpWebAutoSyncHome');if(home)home.textContent='Đồng bộ web ChấmPro: '+message;
 let target=byId('cpWebAutoSyncStatus');
 if(!target){
  const area=byId('page-backup');if(!area)return;
  target=document.createElement('p');
  target.id='cpWebAutoSyncStatus';target.setAttribute('role','status');
  target.className='hint';area.prepend(target);
 }
 target.textContent='Đồng bộ web ChấmPro: '+message;
}
function stop(){
 sessionEpoch++;
 active?.stop();active=null;waiting=false;
 clearWebSyncToken();
}
function report(event){
 if(event.kind==='synced')status('Dữ liệu đã kiểm tra và đồng bộ an toàn.');
 else if(event.kind==='conflict'||event.kind==='photo-conflict')
  status('CÓ XUNG ĐỘT: giữ cả bản cục bộ và bản máy chủ; cần đối chiếu trước khi sửa tiếp.');
 else if(event.kind==='error'||event.kind==='local-error')
  status('Chưa đồng bộ: '+String(event.message||'Máy chủ chưa phản hồi').slice(0,160));
 else if(event.kind==='photo-uploaded'||event.kind==='uploaded')
  status('Đã tải dữ liệu lên đám mây theo tài khoản.');
}
async function maybeStart(){
 const owner=platformOwner(),auth=window.champroAuthSession;
 if(!owner){if(active||starting)stop();status('Đăng nhập để đồng bộ. Dữ liệu vẫn lưu riêng trên thiết bị.');return;}
 if(active&&active.owner!==owner)stop();
 if(active||starting||!navigator.onLine||Date.now()<retryAfter)return;
 if(!owner||!auth?.getToken?.()){
  if(active){stop();status('Đã ngừng đồng bộ khi phiên đăng nhập thay đổi. Dữ liệu cục bộ vẫn còn.');}
  return;
 }
 // The owner is only a hint parsed from the existing WordPress session.
 // startSync MUST verify a fresh scoped token with Worker and match result.owner.
 if(active&&active.owner!==owner){stop();}
 if(active)return;
 const app=window.champroAppData;
 if(!app||app.syncOwner!==owner){status('Ứng dụng đang chuẩn bị kho dữ liệu tài khoản.');return;}
 starting=true;
 const epoch=sessionEpoch;
 const assertSession=()=>{if(epoch!==sessionEpoch||platformOwner()!==owner||app.syncOwner!==owner)throw Error('Phiên đồng bộ đã thay đổi');};
 const scopedToken=async()=>{assertSession();const token=await getWebSyncToken();assertSession();return token;};
 try{
  status('Đang kiểm tra quyền đồng bộ D1/R2 theo tài khoản…');
  const result=await startSync({
   api:API,owner,getToken:scopedToken,
   getDb:()=>{assertSession();return app.getDb();},saveDb:next=>{assertSession();return app.applySyncDb(next);},
   getPhoto:id=>{assertSession();return getSheetPhoto(id);},putPhoto:(id,photo)=>{assertSession();return putSheetPhoto(id,photo);},listPhotoIds:()=>{assertSession();return listSheetPhotoIds();},
   isBusy:()=>epoch!==sessionEpoch||platformOwner()!==owner||app.isCameraBusy(),metaKey:webAccountStorage(owner).meta,
   consent:async count=>{
    // This namespace was explicitly selected at account login and is not
    // shared with any anonymous or different account's local records.
    assertSession();return app.syncOwner===owner;
   },
   onEvent:event=>{if(epoch===sessionEpoch&&platformOwner()===owner)report(event);}
  });
  if(epoch!==sessionEpoch||platformOwner()!==owner){result?.stop?.();return;}
  if(result?.started){active=result;status('Đã kết nối. Tự đồng bộ khi có mạng và camera rảnh.');}
  else status('Dữ liệu cục bộ chưa được người dùng xác nhận, chưa tải lên đám mây.');
 }catch(e){
  if(e?.status===503||/chưa kích hoạt|chưa (mở|cho phép)|Thiếu cấu hình/.test(String(e.message))){
   retryAfter=Date.now()+300000;
   status('Máy chủ chưa bật đồng bộ. Dữ liệu web vẫn được lưu tại thiết bị.');
  }else status('Chưa kết nối: '+String(e.message||e).slice(0,160));
 }finally{starting=false;waiting=false;if(epoch!==sessionEpoch&&platformOwner())void maybeStart();}
}
// These are the auth events from main/platform/licensing/auth-session.js.
 // Never copy the preview account-bridge: main's quota UI already owns login.
window.addEventListener('champro-auth-updated',()=>{stop();retryAfter=0;void maybeStart();});
window.addEventListener('champro-auth-logout',()=>{
 stop();status('Ngừng đồng bộ. Bài chấm trên thiết bị vẫn được giữ nguyên.');
});
window.addEventListener('focus',()=>void maybeStart());
window.addEventListener('online',()=>{retryAfter=0;void maybeStart();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void maybeStart();});
window.addEventListener('load',()=>void maybeStart(),{once:true});
void maybeStart();
