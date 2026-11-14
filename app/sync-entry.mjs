/** ChấmPro browser sync bridge. No effect on existing local grader if
 * the dedicated server is not enabled or the user is logged out.
 */
import {startSync} from '../platform/sync/start.mjs';
import {platformOwner,getWebSyncToken,clearWebSyncToken} from '../platform/sync/web-token.mjs';
import {getSheetPhoto,putSheetPhoto,listSheetPhotoIds} from './sheet-photo-store.mjs';
const API='https://champro-sync-staging.luckylove1404.workers.dev';
let active=null,starting=false;
function status(message){
 let node=document.getElementById('cpCloudSyncStatus');
 if(!node){
  const area=document.getElementById('page-backup');
  if(!area)return;
  node=document.createElement('p');node.className='hint';node.id='cpCloudSyncStatus';
  area.prepend(node);
 }
 node.textContent='Đồng bộ ChấmPro: '+message;
}
async function tryStart(){
 if(active||starting||!navigator.onLine)return;
 const owner=platformOwner(),app=window.champroAppData;
 if(!owner||!app)return;
 starting=true;
 try{
  status('Đang xác minh tài khoản với máy chủ đồng bộ…');
  const started=await startSync({
   api:API,owner,getToken:getWebSyncToken,getDb:app.getDb,saveDb:app.applySyncDb,
   getPhoto:getSheetPhoto,putPhoto:putSheetPhoto,listPhotoIds:listSheetPhotoIds,
   isBusy:app.isCameraBusy,metaKey:'champro-sync-web-v1',
   consent:async(count,who)=>confirm('Dữ liệu hiện có trên trình duyệt gồm '+count+
    ' bản ghi. Xác nhận toàn bộ thuộc tài khoản '+who+
    ' để đồng bộ với ChấmPro trên điện thoại? Bạn có thể sao lưu JSON trước.'),
   onEvent:event=>{
    if(event.kind==='synced')status('Đã đồng bộ với điện thoại (khi thiết bị có mạng).');
    else if(event.kind==='conflict'||event.kind==='photo-conflict')
     status('Có bản ghi được sửa ở hai nơi. Đã giữ bản cục bộ; cần xử lý xung đột.');
    else if(event.kind==='error'||event.kind==='local-error')status('Tạm hoãn: '+String(event.message||'').slice(0,160));
   }
  });
  if(started?.started){active=started;status('Đã kết nối. Bản ghi lưu cục bộ, tự đồng bộ khi có mạng và máy rảnh.');}
  else status('Bạn chưa xác nhận liên kết dữ liệu; không tải lên máy chủ.');
 }catch(e){status(e.message||'Máy chủ đồng bộ chưa kích hoạt. Dữ liệu vẫn được lưu cục bộ.');}
 finally{starting=false;}
}
function logout(){
 active?.stop();active=null;clearWebSyncToken();
 status('Đã ngắt đồng bộ. Dữ liệu trên trình duyệt được giữ nguyên.');
}
window.addEventListener('champro-auth-logout',logout);
window.addEventListener('champro-auth-updated',()=>{
 if(active&&active.owner!==platformOwner())logout();
 void tryStart();
});
window.addEventListener('online',()=>void tryStart());
window.addEventListener('focus',()=>void tryStart());
window.addEventListener('load',()=>void tryStart(),{once:true});
void tryStart();
