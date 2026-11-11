/**
 * ChấmPro staged WordPress sign-in and read-only cloud connection probe.
 *
 * Intentionally independent of camera / grader / IndexedDB.
 * Token exists only in JS memory and expires with the WordPress session JWT.
 * No scan, student, answer, result or photo data is uploaded from this module.
 */
const WP_ORIGIN='https://mrhien.com';
const WORKER='https://champro-platform-staging.luckylove1404.workers.dev';
let popup=null,token=null,account=null;
const byId=id=>document.getElementById(id);
const status=text=>{const el=byId('cpAccountStatus');if(el)el.textContent=text;};
function safeClose(){
 try{if(popup&&!popup.closed)popup.close();}catch{}
 popup=null;
}
async function query(path,activeToken){
 const response=await fetch(WORKER+path,{
  method:'GET',
  mode:'cors',
  credentials:'omit',
  cache:'no-store',
  headers:{Authorization:'Bearer '+activeToken,'Accept':'application/json'}
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok)throw Error(result?.error||'Máy chủ ChấmPro chưa xác nhận tài khoản');
 return result;
}
export function initAccountBridge(){
 const connect=byId('cpConnectAccount'),disconnect=byId('cpDisconnectAccount'),
  statusButton=byId('cpCheckCloud');
 if(!connect||!disconnect||!statusButton)return;
 const setConnected=connected=>{
  disconnect.hidden=!connected;statusButton.hidden=!connected;
  connect.hidden=connected;
 };
 setConnected(false);
 connect.addEventListener('click',()=>{
  safeClose();token=null;account=null;setConnected(false);
  // Call window.open directly in this user gesture to support mobile browsers.
  popup=window.open(WP_ORIGIN+'/champro-connect/','champro-wordpress-login',
   'popup=yes,width=620,height=710');
  if(!popup){status('Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép mở cửa sổ từ ChấmPro.');return;}
  status('Trong cửa sổ WordPress vừa mở, bấm “Kết nối ChấmPro”.');
 });
 window.addEventListener('message',async event=>{
  // A token can only be accepted from the exact popup this app opened.
  if(!popup||event.source!==popup||event.origin!==WP_ORIGIN||
   event.data?.type!=='champro-session'||typeof event.data?.token!=='string')return;
  const candidate=event.data.token;
  // Do not persist, log, print, expose in URL, or broadcast this credential.
  if(candidate.length>4096||candidate.split('.').length!==3){
   status('Phiên đăng nhập không hợp lệ.');safeClose();return;
  }
  status('Đang xác minh tài khoản với ChấmPro staging…');
  try{
   const result=await query('/api/me',candidate);
   token=candidate;account=result.account;
   status('Đã kết nối tài khoản: '+(account?.name||'WordPress')+'. Không có dữ liệu học sinh nào được tải lên.');
   setConnected(true);
  }catch(error){
   token=null;account=null;setConnected(false);
   status('Chưa kết nối được: '+error.message);
  }finally{safeClose();}
 });
 disconnect.addEventListener('click',()=>{
  token=null;account=null;safeClose();setConnected(false);
  status('Đã ngắt kết nối trong phiên làm việc này. Dữ liệu trên thiết bị được giữ nguyên.');
 });
 statusButton.addEventListener('click',async()=>{
  if(!token)return;
  status('Đang kiểm tra D1/R2…');
  try{
   const result=await query('/api/sync/status',token);
   status('Kết nối API thành công. Chế độ đồng bộ: '+result.mode+
    '. Chưa tải dữ liệu hoặc ảnh phiếu lên máy chủ.');
  }catch(error){
   token=null;account=null;setConnected(false);
   status('Không thể kiểm tra kết nối: '+error.message+'. Hãy đăng nhập lại.');
  }
 });
}
initAccountBridge();
