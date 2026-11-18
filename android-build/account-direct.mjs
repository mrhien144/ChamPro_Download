/* ChấmPro v14.5 - direct WordPress PKCE login, no Cloudflare Worker for sign-in.
   Camera, OMR, scoring, photo review and offline data unchanged.
   After one successful sign-in, validate signed ES256 license locally on each launch. */
import {verifyLicense,pinPublicKey,inspectSignedIdentity} from './offline-license.mjs';
import {accountStore} from './apk-account-storage.mjs';
import {parseAuthReturn} from './auth-return.mjs';
import {publicSyncKey,markSyncRegistered,refreshSignedLicense,markRefreshRegistered,clearSyncToken} from './sync-device.mjs';
const LOGIN='https://mrhien.com/champro-login-app/';
// Google Play build: access existing account entitlements, no external checkout.
const EXCHANGE='https://mrhien.com/wp-json/champro/v2/exchange';
const PUBLIC_KEY='https://mrhien.com/wp-json/champro/v2/public-key';
const INSTALL_KEY='cp-v14-install-id';
const LICENSE_KEY='cp-v14-signed-license';
const PENDING_KEY='cp-v144-pkce-pending';
const $=id=>document.getElementById(id);
let pending=null,verified=null,refreshing=null,lastRefreshAt=0;
// Authentication messages are neutral by default. Only real authentication
// failures are shown in red; offline / previously verified account is NOT an error.
const stamp=(s,level='info')=>{
 const e=$('cpAuthStatus');
 if(!e)return;
 e.textContent=s;
 e.dataset.level=level;
};
const fail=s=>stamp(s,'error');
function deviceId(){
 let x=localStorage.getItem(INSTALL_KEY);
 if(!x){x='cp-'+crypto.randomUUID();localStorage.setItem(INSTALL_KEY,x);}
 return x;
}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
async function digest(str){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str))));}
function setView(name){
 for(const id of ['Login','Waiting','Plans']){const el=$('cpView'+id);if(el)el.hidden=id.toLowerCase()!==name;}
}
function loadPending(){
 try{
  const x=JSON.parse(localStorage.getItem(PENDING_KEY)||'null');
  if(x&&typeof x.state==='string'&&/^[a-f0-9]{32}$/.test(x.state)&&
    /^[a-f0-9]{64}$/.test(x.verifier)&&Number(x.expires)>Date.now()){pending=x;return true;}
 }catch{}
 localStorage.removeItem(PENDING_KEY);pending=null;return false;
}
function clearPending(){pending=null;localStorage.removeItem(PENDING_KEY);}
function planLabel(claim){
 const names={free:'Dùng thử',annual:'Gói 1 năm',lifetime:'Gói trọn đời'};
 return names[claim.plan]+(claim.plan!=='lifetime'?' · Đến '+new Date(claim.exp*1000).toLocaleDateString('vi-VN'):'');
}
function announceIdentity(claim){
 const uid=Number(String(claim.sub||'').replace(/^wp:/,''));
 if(!Number.isSafeInteger(uid)||uid<1)return;
 window.champroAccountIdentity=Object.freeze({wpUserId:uid,deviceId:deviceId()});
 window.dispatchEvent(new CustomEvent('champro-account-verified',{detail:window.champroAccountIdentity}));
}
function unlock(claim,onlineConfirmed=false,{dismissGate=false}={}){
 // The new signed license has already been persisted. Reinitialize the
 // local namespace before exposing or editing the new account's data.
 if(accountStore.owner!==claim.sub){lock();location.reload();return;}
 verified=claim;
 announceIdentity(claim);
 document.documentElement.classList.remove('cp-license-pending');
 // Refreshing an already open account is not a navigation action. Only
 // initial activation or explicit Back may dismiss the account screen.
 if(dismissGate)$('cpAccountGate').hidden=true;
 $('cpAccountClose').disabled=false;
 $('cpAccountLogout').hidden=false;
 $('cpCurrentPlan').textContent=(localStorage.getItem('cp-v14-account-name')||claim.sub||'Tài khoản')+' · '+(onlineConfirmed?planLabel(claim):navigator.onLine?'Đang xác minh gói với máy chủ…':'Gói đã lưu trên máy: '+planLabel(claim));
 setTimeout(addAccountMenu,150);
}
function lock(){
 document.documentElement.classList.add('cp-license-pending');
 $('cpAccountGate').hidden=false;
 $('cpAccountClose').disabled=true;
 $('cpAccountLogout').hidden=true;
 setView('login');
}
async function openFirstParty(url){
 const b=window.Capacitor?.Plugins?.Browser;
 if(b?.open)await b.open({url});
 else window.open(url,'_blank','noopener');
}
function describe(error){
 const m=String(error?.message||'');
 if(error?.name==='AbortError')return 'Trang xác thực mrhien.com chưa phản hồi.';
 if(/fetch|network|load failed/i.test(m))return 'Không liên lạc được dịch vụ đăng nhập trên mrhien.com. Cần cài plugin ChấmPro Direct Login trên website. Bản ChấmPro v13 không bị ảnh hưởng.';
 if(/404|rest_no_route/i.test(m))return 'API đăng nhập ChấmPro trên mrhien.com chưa được cài đặt (404).';
 return m||'Đăng nhập chưa hoàn tất.';
}
async function startLogin(){
 if(!navigator.onLine)return stamp('Đang ngoại tuyến. Chỉ cần Internet để đăng nhập lần đầu; tài khoản đã kích hoạt vẫn dùng được offline.');
 const button=$('cpSignIn');button.disabled=true;
 try{
  // The app owns its PKCE verifier; only the SHA256 challenge goes to WordPress.
  const verifier=hex(crypto.getRandomValues(new Uint8Array(32)));
  const state=hex(crypto.getRandomValues(new Uint8Array(16)));
  const challenge=await digest(verifier);
  const device=deviceId();
  const url=new URL(LOGIN);
  url.searchParams.set('state',state);
  url.searchParams.set('challenge',challenge);
  url.searchParams.set('device',device);
  pending={verifier,state,device,expires:Date.now()+600_000};
  localStorage.setItem(PENDING_KEY,JSON.stringify(pending));
  setView('waiting');
  stamp('Đã mở trang đăng nhập mrhien.com. Sau khi đăng nhập, trình duyệt sẽ tự quay lại ChấmPro.');
  await openFirstParty(url.toString());
 }catch(e){fail(describe(e));}
 finally{button.disabled=false;}
}
async function refreshPlan(force=false){
 // Network failures never delete an offline license or any student data.
 if(!navigator.onLine)return stamp('Ngoại tuyến: tài khoản và dữ liệu chấm vẫn được giữ trên máy.');
 if(refreshing)return refreshing;
 if(!force&&Date.now()-lastRefreshAt<300000)return;
 const saved=localStorage.getItem(LICENSE_KEY);
 if(!saved)return stamp('Cần đăng nhập tài khoản mrhien.com lần đầu.');
 refreshing=(async()=>{
  try{
   const claim=await inspectSignedIdentity(saved);
   if(!claim)throw Error('Giấy phép thiết bị chưa được xác minh. Vui lòng đăng nhập lại một lần.');
   const uid=Number(String(claim.sub).replace(/^wp:/,''));
   if(!uid)throw Error('Không xác định được tài khoản cần cập nhật.');
   stamp('Đang kiểm tra quyền sử dụng trên máy chủ…');
   const fresh=await refreshSignedLicense(deviceId(),uid);
   const checked=await verifyLicense(fresh.license);
   if(checked.sub!==claim.sub||checked.deviceId!==deviceId())
    throw Error('Máy chủ trả giấy phép không đúng tài khoản hoặc thiết bị.');
   if(localStorage.getItem(LICENSE_KEY)!==saved)throw Error('Tài khoản đã thay đổi trong khi cập nhật');
   localStorage.setItem(LICENSE_KEY,fresh.license);
   if(fresh.username)localStorage.setItem('cp-v14-account-name',String(fresh.username).slice(0,80));
   unlock(checked,true);lastRefreshAt=Date.now();
   if(checked.plan==='free'){
    stamp('Máy chủ hiện trả về gói Dùng thử. Nếu tài khoản đã mua gói 1 năm, quyền thanh toán chưa khớp giữa WordPress và Cloudflare D1. Không coi là đã đồng bộ gói.','error');
   }else{
    stamp('Đã xác minh gói sử dụng: '+planLabel(checked)+'.','success');
   }
   return true;
  }catch(e){
   stamp('Chưa cập nhật được gói: '+describe(e)+' Giấy phép và dữ liệu cũ được giữ nguyên.', 'error');
   return false;
  }finally{refreshing=null;}
 })();
 return refreshing;
}
async function exchange(ticket,state){
 if(!pending&&!loadPending())return fail('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
 if(state!==pending.state)return fail('Mã xác thực không khớp, hãy đăng nhập lại.');
 if(!navigator.onLine)return stamp('Cần Internet để hoàn tất xác thực lần đầu.');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
 try{
  stamp('Đang nhận và xác minh khóa bảo mật của mrhien.com…');
  const kr=await fetch(PUBLIC_KEY,{method:'GET',cache:'no-store',credentials:'omit',signal:ctrl.signal,
    headers:{Accept:'application/json'}});
  const keyResponse=await kr.json().catch(()=>({}));
  if(!kr.ok||!keyResponse.ok||!keyResponse.publicKey)
    throw Error(keyResponse.message||'Máy chủ mrhien.com chưa cấu hình khóa công khai (HTTP '+kr.status+').');
  if(keyResponse.issuer!=='champro-platform'||keyResponse.audience!=='com.champro.nativepreview.v145')
    throw Error('Máy chủ cấp khóa chưa đúng phiên bản ứng dụng.');
  await pinPublicKey(keyResponse.publicKey);
  stamp('Đang xác thực tài khoản và nhận quyền sử dụng ChấmPro…');
  // Enrollment is opportunistic and cannot block an otherwise valid login.
  // The public JWK is registered only when the one-use PKCE exchange succeeds.
  let publicKey=null;
  try{publicKey=await publicSyncKey(pending.device);}catch(e){console.warn('Không thể tạo khóa đồng bộ; đăng nhập offline vẫn được hỗ trợ');}
  const res=await fetch(EXCHANGE,{method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'omit',cache:'no-store',signal:ctrl.signal,
    body:JSON.stringify({ticket,state,deviceId:pending.device,verifier:pending.verifier,
      ...(publicKey?{syncPublicKey:publicKey}:{})})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok||!j.ok||!j.license)throw Error(j.message||'Máy chủ chưa cấp quyền (HTTP '+res.status+').');
  const claim=await verifyLicense(j.license);
  if(claim.deviceId!==pending.device)throw Error('Giấy phép không thuộc về thiết bị này.');
  localStorage.setItem(LICENSE_KEY,j.license);
  if(j.syncDeviceRegistered===true){
   try{await markSyncRegistered(pending.device,Number(claim.sub.split(':')[1]));}
   catch(e){console.warn('Chưa lưu được thông tin đăng ký đồng bộ; cần đăng nhập lại để kích hoạt');}
  }
  if(j.refreshDeviceRegistered===true){
   try{await markRefreshRegistered(pending.device,Number(claim.sub.split(':')[1]));}
   catch(e){console.warn('Chưa lưu được khóa làm mới giấy phép');}
  }
  if(j.username)localStorage.setItem('cp-v14-account-name',String(j.username).slice(0,80));
  else localStorage.removeItem('cp-v14-account-name');
  clearPending();
  try{await window.Capacitor?.Plugins?.Browser?.close?.();}catch{}
  unlock(claim,true,{dismissGate:true});lastRefreshAt=Date.now();
 }catch(e){fail(describe(e));}
 finally{clearTimeout(timer);}
}
async function acceptLink(url){
 const flow=pending||(loadPending()?pending:null);
 if(!flow)return;
 const result=parseAuthReturn(url,flow.state);
 if(!result)return;
 await exchange(result.ticket,result.state);
}
async function registerLinks(){
 const app=window.Capacitor?.Plugins?.App;
 if(!app?.addListener)return;
 await app.addListener('appUrlOpen',e=>{if(e?.url)void acceptLink(e.url);});
 const incoming=await app.getLaunchUrl?.();
 if(incoming?.url)void acceptLink(incoming.url);
}
function showAccount(){
 $('cpAccountGate').hidden=false;
 $('cpAccountClose').disabled=!verified;
 $('cpAccountLogout').hidden=!verified;
 setView(verified?'plans':'login');
 if(verified&&navigator.onLine)void refreshPlan(true);
}
// Hardware Back closes account the same way as the visible Back button.
// Never dismiss an unverified first-use license gate or delete local data.
function closeAccount(){
 const gate=$('cpAccountGate');
 if(!gate||gate.hidden)return false;
 if(verified){
  gate.hidden=true;
  return true;
 }
 if(!$('cpViewWaiting')?.hidden){
  setView('login');
  stamp('Bạn có thể thử đăng nhập lại. Dữ liệu chấm vẫn được giữ nguyên.');
  return true;
 }
 return false;
}
function registerAndroidBack(){
 const app=window.Capacitor?.Plugins?.App;
 if(!app?.addListener)return;
 void Promise.resolve(app.addListener('backButton',event=>{
  // Android Back must close an existing native HTML dialog before navigating;
  // never discard an open review/QR dialog by switching the underlying page.
  const dialog=document.querySelector('dialog[open]');
  if(dialog){dialog.close();return;}
  const sheet=$('cpNativeSheet');
  if(sheet&&!sheet.hidden){
   $('cpNativeClose')?.click();
   return;
  }
  if(closeAccount())return;
  if(!$('cpAccountGate')?.hidden)return;
  if(event?.canGoBack){window.history.back();return;}
  if(document.querySelector('.page.shown')?.id!=='page-home'){
   document.querySelector('[data-page="home"]')?.click();
  }else app.exitApp?.();
 })).catch(e=>console.warn('Android Back listener unavailable',e));
}
function addAccountMenu(){
 if($('cpOpenAccount'))return;
 const anchor=$('cpNativeClose');
 if(!anchor)return;
 const b=document.createElement('button');
 b.id='cpOpenAccount';b.type='button';b.textContent='Tài khoản & Gói sử dụng';
 b.onclick=()=>{anchor.click();showAccount();};
 anchor.before(b);
}
function boot(){
 deviceId();
 const saved=localStorage.getItem(LICENSE_KEY);
 if(saved)void verifyLicense(saved).then(claim=>{
  unlock(claim,false,{dismissGate:true});
  if(navigator.onLine)void refreshPlan(false);
 },async()=>{
  // A temporarily unavailable network does not sign the user out. If the
  // signed entitlement has expired, preserve account identity but keep the
  // paywalled functions locked until the server issues an updated license.
  const identity=await inspectSignedIdentity(saved);
  lock();
  if(identity){
   announceIdentity(identity);
   if(navigator.onLine)void refreshPlan(false);
   $('cpCurrentPlan').textContent='Tài khoản '+identity.sub+' vẫn được ghi nhớ trên thiết bị.';
   stamp('Tài khoản vẫn được ghi nhớ. Cần kết nối Internet để gia hạn xác nhận quyền sử dụng. Dữ liệu đã chấm không bị xóa.');
  }else fail('Chưa xác minh được giấy phép đã lưu. Dữ liệu chấm trên thiết bị vẫn được giữ nguyên.');
 });
 else lock();
 loadPending();
 $('cpSignIn').onclick=()=>void startLogin();
 $('cpPairRetry').onclick=()=>void startLogin();
 $('cpReLogin').onclick=()=>void startLogin();
 $('cpOpenWeb').onclick=()=>{if(pending)void startLogin();};
 $('cpPairCheck').onclick=()=>stamp('Chờ trang mrhien.com xác thực. Trình duyệt sẽ tự quay về ChấmPro.');
 $('cpRefreshPlan').onclick=()=>void refreshPlan(true);
 $('cpAccountClose').onclick=()=>{closeAccount();};
 $('cpAccountLogout').onclick=()=>{
  if(!confirm('Đăng xuất trên thiết bị này? Dữ liệu chấm bài vẫn được giữ nguyên.'))return;
  clearSyncToken();delete window.champroAccountIdentity;
  localStorage.removeItem(LICENSE_KEY);localStorage.removeItem('cp-v14-account-name');
  window.dispatchEvent(new Event('champro-account-logout'));
  lock();location.reload();
  verified=null;lastRefreshAt=0;lock();stamp('Đã đăng xuất. Dữ liệu chấm trên máy vẫn còn.');
 };
 registerAndroidBack();
 void registerLinks().catch(e=>fail(describe(e)));
 window.addEventListener('online',()=>void refreshPlan(false));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshPlan(false)});
 setTimeout(addAccountMenu,250);
 if(!saved)stamp('Đăng nhập tài khoản mrhien.com một lần để kích hoạt ChấmPro offline.');
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
