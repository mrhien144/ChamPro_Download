/* User quota panel; tokens stay in memory, never localStorage or URLs. */
const API='https://champro-platform-staging.luckylove1404.workers.dev';
const el=id=>document.getElementById(id);
const state={token:null,popup:null};
const tell=s=>{el('notice').textContent=s};
const fmt=n=>Number(n||0).toLocaleString('vi-VN');
const plans={free:'Miễn phí',annual:'Gói 1 năm',lifetime:'Trọn đời',suspended:'Tạm khóa'};
const funcs=[['scan','Chấm bài'],['mix','Trộn đề'],['qr','Tạo QR']];
async function apiMe(){
 const r=await fetch(API+'/api/me',{headers:{'Authorization':'Bearer '+state.token},cache:'no-store'});
 const o=await r.json().catch(()=>({}));
 if(!r.ok||!o.ok)throw Error(o.error||'Không lấy được quyền sử dụng');
 return o;
}
function reset(){
 state.token=null;el('private').hidden=true;el('refresh').disabled=true;el('logout').disabled=true;
 el('upgradeCurrent').textContent='Chưa kết nối tài khoản ChấmPro. Hãy đăng nhập để xem gói đang dùng.';
 tell('Đã đăng xuất khỏi tài khoản ChấmPro.');
}
function setInfo(o){
 const a=o.account,plan=a.plan;
 el('name').textContent=a.name||'Giáo viên';
 el('email').textContent=a.email||'';
 el('plan').textContent=plans[plan]||plan;
 el('upgradeCurrent').textContent=plan==='lifetime'?'Tài khoản đã có gói Trọn đời: không cần mua thêm.':plan==='annual'?'Tài khoản đang dùng gói 1 năm. Vui lòng kiểm tra hạn dùng bên trên trước khi gia hạn.':plan==='suspended'?'Tài khoản tạm khóa; liên hệ hỗ trợ trước khi mua gói.':'Tài khoản đang dùng gói Miễn phí. Hiện trang nâng cấp chưa mở thanh toán.';
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
 state.popup=window.open('https://mrhien.com/champro-connect/','champro-account-login','popup=yes,width=620,height=760');
 tell(state.popup?'Đăng nhập hoặc đăng ký trên mrhien.com, hệ thống sẽ tự kết nối ChấmPro.':'Trình duyệt chặn cửa sổ. Hãy cho phép pop-up từ champro.mrhien.com.');
};
window.addEventListener('message',async event=>{
 if(event.origin!=='https://mrhien.com'||event.source!==state.popup||
  event.data?.type!=='champro-session'||typeof event.data.token!=='string'||event.data.token.length>4096)return;
 state.token=event.data.token;
 state.popup?.close();
 await refresh();
});
el('refresh').onclick=refresh;
el('logout').onclick=reset;
