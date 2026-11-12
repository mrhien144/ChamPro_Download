/* v14.1 Android account + plans. No changes to existing ChấmPro camera/OMR/grade/storage.
   HTTPS is used only when linking, upgrading, or explicitly checking a plan.
   No background polling while camera or grading screen is active. */
import {verifyLicense} from './offline-license.mjs';
const API='https://champro-platform-staging.luckylove1404.workers.dev';
const WEB='https://mrhien.com/champro-connect-app/';
const LICENSE_KEY='cp-v14-signed-license';
const ID_KEY='cp-v14-install-id';
const REFRESH_KEY='cp-v14-device-refresh';
let linked=false,activePair=null,pairTimer=null,refreshTimer=null,view='login';
let currentPlan='free',expiresAt=null;
const $=id=>document.getElementById(id);
const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
function getId(){
 let id=localStorage.getItem(ID_KEY);
 if(!id){id='cp-'+crypto.randomUUID();localStorage.setItem(ID_KEY,id);}
 if(!/^cp-[a-f\d-]{36}$/i.test(id))throw Error('Mã thiết bị không hợp lệ.');
 return id;
}
function refreshSecret(){return localStorage.getItem(REFRESH_KEY)||'';}
function activeAccountPanel(){return document.documentElement.classList.contains('cp-license-pending')||!$('cpAccountGate')?.hidden;}
function status(s){text('cpAuthStatus',s);}
function setView(next){
 view=next;
 for(const section of ['login','plans','waiting']){$('cpView'+section[0].toUpperCase()+section.slice(1)).hidden=section!==next;}
}
function displayPlan(){
 const names={free:'Dùng thử',expired:'Đã hết hạn dùng thử',annual:'Gói 1 năm',lifetime:'Gói trọn đời'};
 const fmt=expiresAt&&currentPlan!=='lifetime'?' · Đến '+new Date(expiresAt).toLocaleDateString('vi-VN'):'';
 text('cpCurrentPlan',(names[currentPlan]||'Chưa xác định')+fmt);
}
function unlock(){
 document.documentElement.classList.remove('cp-license-pending');
 $('cpAccountGate').hidden=true;
 setTimeout(addAccountMenu,0);
}
function lock(){
 document.documentElement.classList.add('cp-license-pending');
 $('cpAccountGate').hidden=false;
 setView(refreshSecret()?'plans':'login');
}
async function api(path,payload){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(API+path,{method:'POST',mode:'cors',credentials:'omit',
    cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw Error(j.error||'Máy chủ chưa phản hồi ('+r.status+')');
  return j;
 }finally{clearTimeout(timeout);}
}
async function accept(data,hasRefresh=false){
 if(hasRefresh&&data.refreshSecret){
  localStorage.setItem(REFRESH_KEY,data.refreshSecret);
  linked=true;
 }else if(refreshSecret())linked=true;
 const next=data.license||null;
 if(next){
  const verified=await verifyLicense(next);
  // Persist only after cryptographic signature verification and account/device match.
  localStorage.setItem(LICENSE_KEY,next);
  currentPlan=verified.plan;expiresAt=new Date(verified.exp*1000).toISOString();
  displayPlan();
  unlock();
  status('Đã xác minh quyền sử dụng. Chấm bài offline được bật.');
 }else{
  currentPlan=data.plan||'expired';expiresAt=null;displayPlan();
  lock();setView('plans');
  status('Tài khoản đã kết nối. Hãy chọn gói để sử dụng.');
 }
}
async function checkRights(){
 if(!navigator.onLine||!refreshSecret())return;
 const data=await api('/api/device/refresh',{deviceId:getId(),refreshSecret:refreshSecret()});
 await accept(data);
}
function resetPair(){
 if(pairTimer){clearInterval(pairTimer);pairTimer=null;}
 activePair=null;
}
async function pollPair(){
 if(!activePair||!navigator.onLine)return;
 const pair=activePair;
 try{
  const data=await api('/api/device/poll',{
   deviceId:getId(),pairId:pair.pairId,pollSecret:pair.pollSecret
  });
  if(data.status==='pending')return;
  resetPair();
  await accept(data,true);
 }catch(e){
  if(/hết hạn|đã nhận|đã xác nhận|không hợp lệ|không tồn tại/.test(e.message))resetPair();
  status(e.message);
 }
}
async function startLogin(){
 const button=$('cpSignIn');button.disabled=true;
 try{
  if(!navigator.onLine)throw Error('Cần Internet để đăng ký và đăng nhập lần đầu.');
  resetPair();
  const pair=await api('/api/device/start',{deviceId:getId()});
  activePair=pair;
  text('cpPairCode',pair.pairCode);
  setView('waiting');
  status('Đang chờ xác nhận tài khoản trên mrhien.com…');
  pairTimer=setInterval(()=>{if(activeAccountPanel())void pollPair();},4000);
  // User opens the WordPress site with a direct click: Android pop-up blockers do not block it.
  // Only the short-lived pairing code is passed in a URL fragment, never a credential.
 }catch(e){status(e.message);}
 finally{button.disabled=false;}
}
function buy(plan){
 if(!['annual','lifetime'].includes(plan))return;
 if(!navigator.onLine){status('Cần Internet để tạo đơn hàng và thanh toán QR ngân hàng.');return;}
 // WooCommerce handles real QR and payment. No client-side claims of payment success.
 window.open(WEB+'#plan='+encodeURIComponent(plan),'_blank','noopener');
 setView('plans');
 status('Đã mở trang thanh toán WooCommerce/SePay. Sau khi chuyển khoản thành công, quay lại ChấmPro để tự cập nhật gói.');
}
function addAccountMenu(){
 if($('cpOpenAccount'))return;
 const close=$('cpNativeClose');
 if(!close)return;
 const b=document.createElement('button');
 b.id='cpOpenAccount';b.type='button';b.textContent='♙ Tài khoản & Nâng cấp gói';
 b.addEventListener('click',()=>{
  document.getElementById('cpNativeClose')?.click();
  $('cpAccountGate').hidden=false;
  setView('plans');
  if(navigator.onLine&&refreshSecret())void checkRights().catch(e=>status(e.message));
  startRefresh();
 });
 close.before(b);
}
function startRefresh(){
 if(refreshTimer)clearInterval(refreshTimer);
 // Only when account/upgrade modal is visible, never when user is scanning.
 refreshTimer=setInterval(()=>{
  if(navigator.onLine&&refreshSecret()&&activeAccountPanel()&&!activePair)void checkRights().catch(()=>{});
 },12000);
}
async function boot(){
 getId();
 $('cpSignIn').onclick=startLogin;
 $('cpPairRetry').onclick=startLogin;
 $('cpReLogin').onclick=startLogin;
 $('cpOpenWeb').onclick=()=>{if(!activePair)return;window.open(WEB+'#pair='+encodeURIComponent(activePair.pairCode),'_blank','noopener');};
 $('cpPairCheck').onclick=pollPair;
 $('cpBuyAnnual').onclick=()=>buy('annual');
 $('cpBuyLifetime').onclick=()=>buy('lifetime');
 $('cpRefreshPlan').onclick=async()=>{try{await checkRights();status('Đã cập nhật quyền sử dụng từ mrhien.com.');}catch(e){status(e.message);}};
 $('cpAccountClose').onclick=()=>{if(document.documentElement.classList.contains('cp-license-pending'))return;
  $('cpAccountGate').hidden=true;if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}};
 $('cpAccountLogout').onclick=()=>{
  if(!confirm('Ngắt tài khoản trên thiết bị này? Giấy phép offline sẽ được xóa, nhưng đề, điểm và ảnh phiếu vẫn được giữ nguyên.'))return;
  resetPair();localStorage.removeItem(REFRESH_KEY);localStorage.removeItem(LICENSE_KEY);
  currentPlan='free';expiresAt=null;linked=false;
  $('cpAccountGate').hidden=true;lock();status('Đã đăng xuất. Dữ liệu chấm bài trên máy không bị xóa.');
 };
 window.addEventListener('online',()=>{if(activeAccountPanel()&&refreshSecret())void checkRights().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&activePair)void pollPair();
  if(!document.hidden&&activeAccountPanel()&&navigator.onLine&&refreshSecret())void checkRights().catch(()=>{});
 });
 setTimeout(addAccountMenu,150);
 // On boot, signed licenses are verified locally; no network, no delay in camera processing.
 try{
  const saved=localStorage.getItem(LICENSE_KEY);
  if(!saved)throw Error('Chưa kích hoạt');
  const claim=await verifyLicense(saved);
  currentPlan=claim.plan;expiresAt=new Date(claim.exp*1000).toISOString();displayPlan();unlock();
 }catch{
  lock();
  if(refreshSecret()&&navigator.onLine){
   status('Đang cập nhật quyền sử dụng…');
   try{await checkRights();}
   catch(e){status('Không kết nối được máy chủ. '+e.message);}
  }else status(navigator.onLine?'Hãy đăng ký và đăng nhập để kích hoạt offline.':'Cần Internet cho lần đăng nhập/kích hoạt đầu tiên.');
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
