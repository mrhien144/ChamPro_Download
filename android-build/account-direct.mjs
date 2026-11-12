/* ChấmPro v14.4 - direct WordPress PKCE login, no Cloudflare Worker for sign-in.
   Camera, OMR, scoring, photo review and offline data unchanged.
   After one successful sign-in, validate signed ES256 license locally on each launch. */
import {verifyLicense} from './offline-license.mjs';
import {parseAuthReturn} from './auth-return.mjs';
const LOGIN='https://mrhien.com/champro-login-app/';
const SHOP='https://mrhien.com/champro-connect-app/';
const EXCHANGE='https://mrhien.com/wp-json/champro/v2/exchange';
const INSTALL_KEY='cp-v14-install-id';
const LICENSE_KEY='cp-v14-signed-license';
const PENDING_KEY='cp-v144-pkce-pending';
const PENDING_PAYMENT='cp-v14-payment-pending';
const $=id=>document.getElementById(id);
let pending=null,verified=null;
const stamp=s=>{const e=$('cpAuthStatus');if(e)e.textContent=s;};
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
function unlock(claim){
 verified=claim;
 document.documentElement.classList.remove('cp-license-pending');
 $('cpAccountGate').hidden=true;
 $('cpAccountClose').disabled=false;
 $('cpAccountLogout').hidden=false;
 $('cpCurrentPlan').textContent=planLabel(claim);
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
 if(!navigator.onLine)return stamp('Cần Internet khi đăng nhập lần đầu. Sau kích hoạt, việc chấm bài không cần mạng.');
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
 }catch(e){stamp(describe(e));}
 finally{button.disabled=false;}
}
async function exchange(ticket,state){
 if(!pending&&!loadPending())return stamp('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
 if(state!==pending.state)return stamp('Mã xác thực không khớp, hãy đăng nhập lại.');
 if(!navigator.onLine)return stamp('Cần Internet để hoàn tất xác thực lần đầu.');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
 try{
  stamp('Đang xác thực tài khoản và nhận quyền sử dụng ChấmPro…');
  const res=await fetch(EXCHANGE,{method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'omit',cache:'no-store',signal:ctrl.signal,
    body:JSON.stringify({ticket,state,deviceId:pending.device,verifier:pending.verifier})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok||!j.ok||!j.license)throw Error(j.message||'Máy chủ chưa cấp quyền (HTTP '+res.status+').');
  const claim=await verifyLicense(j.license);
  if(claim.deviceId!==pending.device)throw Error('Giấy phép không thuộc về thiết bị này.');
  localStorage.setItem(LICENSE_KEY,j.license);
  clearPending();
  try{await window.Capacitor?.Plugins?.Browser?.close?.();}catch{}
  unlock(claim);
 }catch(e){stamp(describe(e));}
 finally{clearTimeout(timer);}
}
async function acceptLink(url){
 const flow=pending||loadPending()&&pending;
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
}
function addAccountMenu(){
 if($('cpOpenAccount'))return;
 const anchor=$('cpNativeClose');
 if(!anchor)return;
 const b=document.createElement('button');
 b.id='cpOpenAccount';b.type='button';b.textContent='Tài khoản & Nâng cấp';
 b.onclick=()=>{anchor.click();showAccount();};
 anchor.before(b);
}
function buy(plan){
 if(!navigator.onLine)return stamp('Cần Internet để thanh toán. Việc chấm bài vẫn hoạt động offline.');
 if(plan!=='annual'&&plan!=='lifetime')return;
 localStorage.setItem(PENDING_PAYMENT,plan);
 void openFirstParty(SHOP+'#plan='+plan).catch(e=>stamp(describe(e)));
 stamp('Đã mở trang mua gói. Quyền mới chỉ cập nhật sau khi máy chủ xác minh giao dịch.');
}
function boot(){
 deviceId();
 const saved=localStorage.getItem(LICENSE_KEY);
 if(saved)void verifyLicense(saved).then(unlock,()=>lock());
 else lock();
 loadPending();
 $('cpSignIn').onclick=()=>void startLogin();
 $('cpPairRetry').onclick=()=>void startLogin();
 $('cpReLogin').onclick=()=>void startLogin();
 $('cpLinkAccount').onclick=()=>void startLogin();
 $('cpOpenWeb').onclick=()=>{if(pending)void startLogin();};
 $('cpPairCheck').onclick=()=>stamp('Chờ trang mrhien.com xác thực. Trình duyệt sẽ tự quay về ChấmPro.');
 $('cpBuyAnnual').onclick=()=>buy('annual');
 $('cpBuyLifetime').onclick=()=>buy('lifetime');
 $('cpRefreshPlan').onclick=()=>stamp('Để cập nhật quyền đã thanh toán, hãy đăng nhập lại khi có Internet.');
 $('cpAccountClose').onclick=()=>{if(verified)$('cpAccountGate').hidden=true;};
 $('cpAccountLogout').onclick=()=>{
  if(!confirm('Đăng xuất trên thiết bị này? Dữ liệu chấm bài vẫn được giữ nguyên.'))return;
  localStorage.removeItem(LICENSE_KEY);verified=null;lock();stamp('Đã đăng xuất. Dữ liệu chấm trên máy vẫn còn.');
 };
 void registerLinks().catch(e=>stamp(describe(e)));
 setTimeout(addAccountMenu,250);
 if(!saved)stamp('Đăng nhập tài khoản mrhien.com một lần để kích hoạt ChấmPro offline.');
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
