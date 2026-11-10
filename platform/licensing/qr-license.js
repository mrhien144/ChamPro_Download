/* ChấmPro QR licensing connector — Cloudflare D1 entitlement and quota.
 * Authentication token remains in memory. No Excel/QR contents leave browser.
 * A pending requestId is retained only in-memory for retry after ambiguous network failure.
 */
(function(){
"use strict";
const API="https://champro-platform-staging.luckylove1404.workers.dev";
const state={token:null,popup:null,pending:null};
const e=id=>document.getElementById(id);
function message(s){e("licenseStatus").textContent=s;}
async function call(path,data){
 if(!state.token)throw Error("Hãy đăng nhập tài khoản ChấmPro trước khi tạo QR.");
 const response=await fetch(API+path,{
   method:data?"POST":"GET",
   headers:{"Authorization":"Bearer "+state.token,...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{}),cache:"no-store"
 });
 const obj=await response.json().catch(()=>({}));
 if(!response.ok||!obj.ok)throw Error(obj.error||"Máy chủ không trả kết quả hợp lệ ("+response.status+").");
 return obj;
}
async function refresh(){
 const p=await call("/api/me");
 const a=p.account;
 const remaining=p.left.qr===null?"không giới hạn":String(p.left.qr);
 message("Đã đăng nhập: "+(a.name||a.email)+" · Gói: "+a.plan+
 " · QR còn "+remaining+" lượt · Tặng thêm "+p.bonus.qr+" · Đã dùng "+p.used.qr);
 return p;
}
e("licenseLogin").onclick=function(){
 state.popup=window.open("https://mrhien.com/champro-connect/","champro-qr-login","popup=yes,width=620,height=760");
 if(!state.popup)message("Trình duyệt chặn cửa sổ đăng nhập, hãy cho phép pop-up.");
 else message("Trong cửa sổ WordPress vừa mở, bấm KẾT NỐI TÀI KHOẢN.");
};
window.addEventListener("message",async ev=>{
 if(ev.origin!=="https://mrhien.com"||ev.source!==state.popup||
  ev.data?.type!=="champro-session"||typeof ev.data?.token!=="string"||
  ev.data.token.length>4096)return;
 state.token=ev.data.token;
 state.popup?.close();
 e("licenseRefresh").disabled=false;e("licenseLogout").disabled=false;
 try{await refresh();}catch(err){message("Không xác thực được: "+err.message);}
});
e("licenseRefresh").onclick=async function(){
 try{await refresh();}catch(err){message("Không đọc được số lượt: "+err.message);}
};
e("licenseLogout").onclick=function(){
 state.token=null;
 e("licenseRefresh").disabled=true;e("licenseLogout").disabled=true;
 message("Đã đăng xuất. Cần đăng nhập để tạo QR. Nếu vừa mất kết nối khi trừ lượt, đăng nhập lại cùng tài khoản để xác nhận lại.");
};
window.champroQRLicense={
 loggedIn:()=>!!state.token,
 async charge(fingerprint){
  if(state.pending&&state.pending.fingerprint!==fingerprint)
   throw Error("Lần tạo QR trước chưa xác nhận do lỗi mạng. Vui lòng tạo lại QR bằng CÙNG tệp và cấu hình trước khi đổi tệp.");
  if(!state.pending)state.pending={fingerprint,requestId:crypto.randomUUID()};
  const id=state.pending.requestId;
  const result=await call("/api/usage/qr",{requestId:id});
  state.pending=null;
  try{await refresh();}catch(e){message("Đã xác nhận sử dụng lượt nhưng không tải được số dư mới.");}
  return result;
 }
};
})();
