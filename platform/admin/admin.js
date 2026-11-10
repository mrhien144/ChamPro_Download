/* ChấmPro staging admin. No token or student data stored in browser storage. */
const API_BASE='REPLACE_WITH_STAGING_WORKER_URL';
const byId=id=>document.getElementById(id);
const state={token:null,popup:null,admin:false};
const status=message=>{byId('status').textContent=message;};
const configured=()=>/^https:\/\/[a-z0-9.-]+$/i.test(API_BASE)&&!API_BASE.includes('REPLACE');
const money=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
async function api(path,options={}){
 if(!state.token)throw Error('Bạn chưa đăng nhập.');
 const response=await fetch(API_BASE+path,{
  method:options.method||'GET',
  headers:{Authorization:'Bearer '+state.token,
   ...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  cache:'no-store'
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.ok)throw Error(data.error||'Không kết nối được máy chủ ('+response.status+')');
 return data;
}
function clear(){
 state.token=null;state.admin=false;
 byId('adminPanel').hidden=true;byId('refresh').disabled=true;byId('logout').disabled=true;
 status('Đã đăng xuất khỏi bảng quản trị.');
}
async function loadAll(){
 const [stats,list]=await Promise.all([api('/api/admin/stats'),api('/api/admin/accounts')]);
 const sum=(stats.byPlan||[]).reduce((a,r)=>a+Number(r.count||0),0);
 const used=(stats.used||[]).reduce((a,r)=>a+Number(r.count||0),0);
 byId('accountsTotal').textContent=sum.toLocaleString('vi-VN');
 byId('usageTotal').textContent=used.toLocaleString('vi-VN');
 byId('revenueTotal').textContent=money(stats.revenueVnd);
 byId('breakdown').textContent=(stats.byPlan||[]).map(x=>x.plan+': '+x.count).join(' · ')+
  ' | '+(stats.used||[]).map(x=>x.feature+': '+x.count).join(' · ');
 showAccounts(list.accounts||[]);
}
function showAccounts(accounts){
 const tbody=byId('users');tbody.replaceChildren();
 if(!accounts.length){
  const tr=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=6;td.textContent='Không tìm thấy tài khoản';tr.append(td);tbody.append(tr);return;
 }
 for(const a of accounts){
  const tr=document.createElement('tr');
  for(const value of [a.display_name||a.id,a.email,a.plan,a.status,a.expires_at||'—']){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  const td=document.createElement('td'),btn=document.createElement('button');
  btn.type='button';btn.textContent='Chọn';btn.className='alt';btn.dataset.accountId=a.id;
  td.append(btn);tr.append(td);tbody.append(tr);
 }
}
byId('users').addEventListener('click',event=>{
 const btn=event.target.closest('[data-account-id]');if(!btn)return;
 byId('accountId').value=btn.dataset.accountId;
 byId('accountId').scrollIntoView({behavior:'smooth',block:'center'});
});
byId('login').onclick=()=>{
 if(!configured())return status('Chưa có địa chỉ API Cloudflare thật. Cần tạo D1, triển khai Worker và cấu hình admin.js trước khi đăng nhập.');
 state.popup=window.open('https://mrhien.com/champro-connect/','champro-login','popup=yes,width=620,height=760');
 if(!state.popup)status('Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên cho ChấmPro.');
 else status('Đang mở cửa sổ đăng nhập WordPress. Chỉ bấm “Kết nối ChấmPro” trên mrhien.com.');
};
window.addEventListener('message',async event=>{
 if(event.origin!=='https://mrhien.com'||event.source!==state.popup||
  event.data?.type!=='champro-session'||typeof event.data?.token!=='string')return;
 const token=event.data.token;
 if(token.length>4096)return status('Phiên đăng nhập không hợp lệ.');
 state.token=token;
 try{
  const info=await api('/api/me');
  if(!info.isAdmin)throw Error('Tài khoản chưa được cấp quyền quản trị.');
  state.admin=true;byId('adminPanel').hidden=false;
  byId('refresh').disabled=false;byId('logout').disabled=false;
  status('Đăng nhập quản trị thành công. Phiên làm việc tự hết hạn sau khoảng 15 phút.');
  state.popup?.close();
  await loadAll();
 }catch(e){clear();status('Không truy cập được trang quản trị: '+e.message);}
});
byId('refresh').onclick=async()=>{try{await loadAll();status('Đã làm mới dữ liệu.');}catch(e){status(e.message);}};
byId('logout').onclick=clear;
byId('find').onclick=async()=>{
 try{
  const q=byId('search').value.trim();
  const response=await api('/api/admin/accounts?q='+encodeURIComponent(q));
  showAccounts(response.accounts||[]);
 }catch(e){status('Không tìm được khách hàng: '+e.message);}
};
byId('grant').onclick=async()=>{
 if(!state.admin)return status('Bạn chưa có quyền.');
 const accountId=byId('accountId').value,action=byId('action').value,
  plan=byId('plan').value,reason=byId('reason').value.trim();
 if(!accountId)return status('Hãy chọn tài khoản khách hàng trước.');
 if(!reason)return status('Hãy nhập lý do cấp quyền để lưu nhật ký.');
 const explain=action==='set-plan'?'cấp gói '+plan:action==='suspend'?'tạm khóa':'mở lại tài khoản';
 if(!confirm('Xác nhận '+explain+' cho '+accountId+'?'))return;
 try{
  await api('/api/admin/grant',{method:'POST',body:{accountId,action,plan,reason}});
  status('Đã thực hiện thay đổi quyền.');await loadAll();
 }catch(e){status('Chưa đổi được quyền: '+e.message);}
};
