/* User quota panel; tokens stay in memory, never localStorage or URLs. */
const API='https://champro-platform-staging.luckylove1404.workers.dev';
// The two purchase buttons stay disabled unless the first-party WordPress
// checkout endpoint explicitly confirms the verified backend is ready.
const PURCHASE_READY_API='https://mrhien.com/wp-json/champro/v1/checkout-readiness';
// The WordPress checkout gate enforces all purchase permissions server-side.
// 'unknown' covers cross-origin/network failures on this static frontend.
let purchaseReadiness='unknown';
const PURCHASE_PAGE='https://mrhien.com/champro-mua-goi/';
async function checkPurchaseReadiness(){
 purchaseReadiness='unknown';
 updatePurchaseControls(state.plan||'free');
 try{
  const response=await fetch(PURCHASE_READY_API,{method:'GET',cache:'no-store',credentials:'omit',mode:'cors'});
  const data=await response.json().catch(()=>({}));
  purchaseReadiness=response.ok && data.ok===true && data.ready===true?'open':'closed';
 }catch(e){
  // The endpoint may be inaccessible across origins even while the first-party
  // WordPress checkout is operational. Do not mislabel a network failure "closed".
  purchaseReadiness='unknown';
 }
 updatePurchaseControls(state.plan||'free');
 return purchaseReadiness==='open';
}
function updatePurchaseControls(plan='free'){
 const lifetime=plan==='lifetime',suspended=plan==='suspended';
 const authenticated=Boolean(state.token);
 for(const [id,pkg] of [['buyAnnual','annual'],['buyLifetime','lifetime']]){
  const btn=el(id);if(!btn)continue;
  const planDenied=lifetime||suspended||(pkg==='annual'&&plan==='annual');
  // On unknown readiness allow navigation only: this NEVER creates an order.
  // The first-party WordPress plugin independently denies requests if closed.
  btn.disabled=!authenticated||planDenied||purchaseReadiness==='closed';
  btn.onclick=()=>{if(!btn.disabled)window.location.assign(PURCHASE_PAGE+'?plan='+encodeURIComponent(pkg));};
 }
 for(const id of ['annualStatus','lifetimeStatus']){
  const node=el(id);
  if(node)node.textContent=purchaseReadiness==='open'?'Sẵn sàng thanh toán'
    :purchaseReadiness==='closed'?'Chưa mở thanh toán'
    :'Kiểm tra tại trang thanh toán';
 }
 const note=el('purchaseSafetyNotice');
 if(note)note.textContent=purchaseReadiness==='closed'
  ?'Cổng thanh toán hiện chưa mở. Không chuyển khoản theo thông tin bên ngoài đơn hàng ChấmPro.'
  :'Mọi quyền mua gói, giá tiền và điều kiện cấp quyền đều được WordPress xác minh trước khi tạo đơn hàng. Chỉ thanh toán theo VietQR được hiển thị cho đúng mã đơn.';
}

const el=id=>document.getElementById(id);
const session=window.champroAuthSession;
const state={token:session?.getToken()||null,popup:null,plan:'free'};
const tell=s=>{el('notice').textContent=s};
const fmt=n=>Number(n||0).toLocaleString('vi-VN');
const plans={free:'Miễn phí',annual:'Gói 1 năm',lifetime:'Trọn đời',suspended:'Tạm khóa'};
const funcs=[['scan','Chấm bài'],['mix','Trộn đề'],['qr','Tạo QR']];
async function apiMe(){
 const r=await fetch(API+'/api/me',{headers:{'Authorization':'Bearer '+state.token},cache:'no-store'});
 const o=await r.json().catch(()=>({}));
 if(!r.ok||!o.ok){
  if(r.status===401||r.status===403){session?.clear();state.token=null;}
  throw Error(o.error||'Không lấy được quyền sử dụng');
 }
 return o;
}
function reset(){
 session?.clear();
 state.token=null;state.plan='free';
 el('private').hidden=true;el('refresh').disabled=true;el('logout').disabled=true;
 el('login').textContent='Đăng nhập / Kết nối tài khoản';
 el('login').classList.remove('connected');
 el('login').removeAttribute('title');
 el('upgradeAccountAction').hidden=false;
 updatePurchaseControls('free');
 el('upgradeCurrent').textContent='Chưa kết nối tài khoản ChấmPro. Hãy đăng nhập để xem gói đang dùng.';
 tell('Đã đăng xuất khỏi tài khoản ChấmPro.');
}
function setInfo(o){
 const a=o.account,plan=a.plan;
 state.plan=plan;
 el('login').textContent=a.name||a.email||'Tài khoản';
 el('login').classList.add('connected');
 el('login').title='Đã kết nối tài khoản · Nhấn để làm mới số lượt';
 el('upgradeAccountAction').hidden=true;
 updatePurchaseControls(plan);
 el('name').textContent=a.name||'Giáo viên';
 el('email').textContent=a.email||'';
 el('plan').textContent=plans[plan]||plan;
 el('upgradeCurrent').textContent=plan==='lifetime'?'Tài khoản đã có gói Trọn đời: không cần mua thêm.':plan==='annual'?'Tài khoản đang dùng gói 1 năm. Vui lòng kiểm tra hạn dùng bên trên trước khi gia hạn.':plan==='suspended'?'Tài khoản tạm khóa; liên hệ hỗ trợ trước khi mua gói.' :'Tài khoản đang dùng gói Miễn phí. Hãy chọn gói để xem điều kiện thanh toán tại mrhien.com.';
 el('expiration').textContent=plan==='annual'
  ?'Hết hạn: '+(a.expiresAt||'chưa xác định')
  :plan==='lifetime'?'Quyền trọn đời, không giới hạn số lần sử dụng'
  :plan==='suspended'?'Tài khoản đang bị tạm khóa':'Dùng thử với hạn mức miễn phí một lần';
 el('features').replaceChildren();
 for(const [key,name] of funcs){
  const card=document.createElement('section');card.className='stat';
  const title=document.createElement('h3');title.textContent=name;card.append(title);
  const count=document.createElement('strong');
  const remaining=o.left[key];count.textContent=remaining===null?'∞':fmt(remaining);
  card.append(count);
  const note=document.createElement('small');
  note.textContent=remaining===null?'Không giới hạn':'Lượt còn lại';
  card.append(note);
  const list=document.createElement('dl');
  for(const [label,value] of [
   ['Mặc định',o.limits[key]],['Tặng thêm',o.bonus[key]],['Đã sử dụng',o.used[key]]
  ]){
   const dt=document.createElement('dt'),dd=document.createElement('dd');
   dt.textContent=label;dd.textContent=fmt(value);list.append(dt,dd);
  }
  card.append(list);el('features').append(card);
 }
 el('private').hidden=false;el('refresh').disabled=false;el('logout').disabled=false;
 tell('Đã kết nối tài khoản và tải số lượt từ Cloudflare. Kết quả chỉ để xem; chưa trừ lượt.');
}
async function refresh(){
 try{if(!state.token)throw Error('Bạn chưa đăng nhập');setInfo(await apiMe());}
 catch(e){tell('Không đọc được dữ liệu: '+e.message);if(/hết hạn|phiên|đăng nhập/i.test(e.message))reset();}
}
el('login').onclick=()=>{
 if(state.token){refresh();return;}
 state.popup=window.open('https://mrhien.com/champro-connect/','champro-account-login','popup=yes,width=620,height=760');
 tell(state.popup?'Đăng nhập hoặc đăng ký trên mrhien.com, hệ thống sẽ tự kết nối ChấmPro.':'Trình duyệt chặn cửa sổ. Hãy cho phép pop-up từ champro.mrhien.com.');
};
window.addEventListener('message',async event=>{
 if(event.origin!=='https://mrhien.com'||event.source!==state.popup||
  event.data?.type!=='champro-session'||typeof event.data.token!=='string'||event.data.token.length>4096)return;
 state.token=event.data.token;
 session?.save(event.data.token);
 state.popup?.close();
 await refresh();
});
el('refresh').onclick=refresh;
el('logout').onclick=reset;
window.addEventListener('champro-auth-logout',()=>{
 state.token=null;
 el('private').hidden=true;
 el('refresh').disabled=true;el('logout').disabled=true;
 el('login').textContent='Đăng nhập / Kết nối tài khoản';
 el('login').classList.remove('connected');el('login').removeAttribute('title');
 el('upgradeAccountAction').hidden=false;
 updatePurchaseControls('free');
 el('upgradeCurrent').textContent='Bạn chưa đăng nhập. Hãy kết nối tài khoản để xem gói đang dùng.';
 tell('Đã đăng xuất khỏi tài khoản ChấmPro.');
});
if(state.token)refresh();
window.addEventListener('focus',()=>{if(state.token)refresh();checkPurchaseReadiness();});

updatePurchaseControls();
checkPurchaseReadiness();
