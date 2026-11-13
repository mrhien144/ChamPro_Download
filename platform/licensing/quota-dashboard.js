/* Read-only three-feature entitlement dashboard, no student/sheet data transmitted.
 * Uses the same WP session source as ChấmPro account, QR and Mix.
 */
(function(){
"use strict";
const root=document.getElementById("champroQuotaDashboard");
if(!root)return;
const API="https://champro-platform-staging.luckylove1404.workers.dev";
const session=window.champroAuthSession;
let token=session?.getToken()||null,popup=null,loading=false;
const $=id=>document.getElementById(id);
const counts=[["scan","Chấm bài"],["mix","Trộn đề"],["qr","Tạo QR"]];
const plans={free:"Miễn phí",annual:"Gói 1 năm",lifetime:"Gói trọn đời",suspended:"Tạm khóa"};
const fmt=n=>Number(n||0).toLocaleString("vi-VN");
function status(t){const e=$("champroQuotaMessage");if(e)e.textContent=t;}
function controls(user){
 const login=$("champroQuotaLogin"),logout=$("champroQuotaLogout"),header=$("champroHeaderLogin");
 if(login)login.hidden=Boolean(user);
 if(logout)logout.hidden=!user;
 if(header){header.textContent=user?(user.name||user.email||"Tài khoản"):"Đăng ký và đăng nhập";header.title=user?"Đã đăng nhập · Bấm để cập nhật lượt":"";}
}
function scanBanner(data){
 const node=$("champroScanEntitlementStatus"),logoutBtn=$("champroScanEntitlementLogout");
 if(!node)return;
 const a=data?.account;
 if(!a){
  node.textContent="Chưa đăng nhập. Vui lòng đăng nhập trên menu để xem lượt chấm.";
  if(logoutBtn)logoutBtn.hidden=true;
  return;
 }
 const available=data.left?.scan===null?"không giới hạn":fmt(data.left?.scan);
 const user=a.name||a.email||"Tài khoản";
 const pkg=plans[a.plan]||a.plan||"Không xác định";
 const deadline=a.plan==="annual"&&a.expiresAt?" · Hạn dùng "+a.expiresAt:"";
 node.textContent="Đã đăng nhập: "+user+" · Gói: "+pkg+deadline+" · Chấm còn "+available+" lượt · Tặng thêm "+fmt(data.bonus?.scan)+" · Đã dùng "+fmt(data.used?.scan);
 if(logoutBtn)logoutBtn.hidden=false;
}
function blank(){
 controls(null);
 scanBanner(null);
 const area=$("champroQuotaStats");if(area)area.replaceChildren();
 const plan=$("champroQuotaPlan");if(plan)plan.textContent="Chưa đăng nhập";
 status("Đăng nhập để xem gói và lượt sử dụng được lưu trên Cloudflare.");
}
function formatStats(data){
 const a=data.account;
 scanBanner(data);
 controls(a);
 const p=$("champroQuotaPlan");if(p)p.textContent=(a.name||a.email||"Tài khoản")+" · "+(plans[a.plan]||a.plan)+(a.plan==="annual"&&a.expiresAt?" · Hết hạn "+a.expiresAt:"");
 const target=$("champroQuotaStats");
 if(target){
  target.replaceChildren();
  for(const [key,name] of counts){
   const card=document.createElement("div");card.className="champro-quota-stat";
   const nameEl=document.createElement("strong");nameEl.textContent=name;
   const n=document.createElement("b");n.textContent=data.left[key]===null?"∞":fmt(data.left[key]);
   const sub=document.createElement("span");sub.textContent=data.left[key]===null?"Không giới hạn":"Lượt còn lại";
   const detail=document.createElement("small");detail.textContent="Mặc định "+fmt(data.limits[key])+" · Tặng "+fmt(data.bonus[key])+" · Đã dùng "+fmt(data.used[key]);
   card.append(nameEl,n,sub,detail);target.append(card);
  }
 }
 status("Dữ liệu hạn mức được đọc trực tiếp từ Cloudflare; không trừ lượt khi xem.");
}
async function refresh(){
 if(loading)return;
 token=session?.getToken()||token;
 if(!token){blank();return;}
 loading=true;
 try{
  const res=await fetch(API+"/api/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok){
   if(res.status===401||res.status===403){session?.clear();token=null;blank();}
   throw Error(data.error||"Không tải được thông tin tài khoản");
  }
  formatStats(data);
 }catch(e){status("Không thể cập nhật hạn mức: "+e.message);}
 finally{loading=false;}
}
function login(){
 if(token){refresh();return;}
 popup=window.open("https://mrhien.com/champro-connect/","champro-quota-login","popup=yes,width=620,height=760");
 status(popup?"Đăng nhập trên mrhien.com, sau đó kết nối tài khoản ChấmPro.":"Trình duyệt đang chặn cửa sổ đăng nhập.");
}
function logout(){
 session?.clear();token=null;blank();status("Đã đăng xuất khỏi ChấmPro.");
}
$("champroQuotaLogin")?.addEventListener("click",login);
$("champroQuotaLogout")?.addEventListener("click",logout);
$("champroScanEntitlementLogout")?.addEventListener("click",logout);
$("champroQuotaRefresh")?.addEventListener("click",refresh);
$("champroHeaderLogin")?.addEventListener("click",login);
window.addEventListener("message",event=>{
 if(event.origin!=="https://mrhien.com"||event.source!==popup||
    event.data?.type!=="champro-session"||typeof event.data.token!=="string"||
    event.data.token.length>4096)return;
 if(!session?.save(event.data.token)){status("Không lưu được phiên đăng nhập hợp lệ.");return;}
 token=event.data.token;popup?.close();refresh();
 window.dispatchEvent(new Event("champro-auth-updated"));
});
window.addEventListener("champro-auth-logout",()=>{token=null;blank();});
window.addEventListener("champro-auth-updated",()=>{token=session?.getToken()||null;refresh();});
window.addEventListener("focus",()=>{if(session?.getToken())refresh();});
blank();if(token)refresh();
})();